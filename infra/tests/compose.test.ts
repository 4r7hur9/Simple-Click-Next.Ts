import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * Prova de composição do ambiente local (AC-001).
 *
 * Um teste de integração de verdade subiria os contêineres, o que levaria
 * minutos e exigiria Docker na máquina que roda o portão. O que este arquivo
 * prova é a outra metade, a que quebra em silêncio: que a composição declara
 * os serviços certos, que TODOS têm roteiro de verificação de saúde — sem o
 * qual "esperar o ambiente subir" vira adivinhação —, que o banco de teste não
 * pisa no de desenvolvimento, e que nenhum segredo foi parar no arquivo.
 *
 * As três coisas que este arquivo confere já falharam de verdade durante a
 * construção da tarefa: um serviço subindo sem verificação de saúde, um nome de
 * host sem variável correspondente no modelo, e porta repetida entre os dois
 * bancos.
 *
 * A dependência `yaml` entra por isto e só por isto (P-014): asserção sobre
 * estrutura tem de ler estrutura. Conferir composição com expressão regular
 * sobre o texto passa a mão em indentação errada e em chave no nível errado —
 * exatamente os erros que se quer pegar.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../..");

const caminho = {
  compose: resolve(raiz, "infra/compose/docker-compose.yml"),
  composeCi: resolve(raiz, "infra/compose/docker-compose.ci.yml"),
  modeloDeAmbiente: resolve(raiz, "infra/compose/.env.compose.example"),
};

type Servico = {
  image?: string;
  profiles?: string[];
  ports?: string[];
  volumes?: string[];
  tmpfs?: string[];
  labels?: string[];
  healthcheck?: {
    test?: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
  };
};

type Composicao = {
  name?: string;
  services: Record<string, Servico>;
  volumes?: Record<string, unknown>;
};

const texto = (arquivo: string): string => readFileSync(arquivo, "utf8");
const composicao = (arquivo: string): Composicao =>
  parse(texto(arquivo)) as Composicao;

/** Nomes das variáveis interpoladas com ${...} no texto, sem repetição. */
function variaveisInterpoladas(conteudo: string): string[] {
  const encontradas = conteudo.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:?}-]/g);
  return [...new Set([...encontradas].map((m) => m[1] as string))];
}

/** Chaves declaradas em um arquivo no formato CHAVE=valor. */
function chavesDeclaradas(conteudo: string): Set<string> {
  const chaves = conteudo.matchAll(/^([A-Z][A-Z0-9_]*)=/gm);
  return new Set([...chaves].map((m) => m[1] as string));
}

/** Porta publicada no computador, do par "hospedeiro:contêiner". */
function portaNoHospedeiro(mapeamento: string): string {
  return (mapeamento.split(":")[0] as string).replace(/["']/g, "");
}

describe("composição do ambiente local", () => {
  it("@spec:AC-001 declara roteador, banco de desenvolvimento, banco de teste, cache, API e site", () => {
    const { services } = composicao(caminho.compose);

    expect(Object.keys(services).sort()).toEqual(
      expect.arrayContaining([
        "api",
        "postgres-dev",
        "postgres-test",
        "redis",
        "traefik",
        "web",
      ]),
    );
  });

  it("@spec:AC-001 todo serviço declara roteiro de verificação de saúde", () => {
    const { services } = composicao(caminho.compose);

    const semVerificacao = Object.entries(services)
      .filter(([, servico]) => !servico.healthcheck?.test)
      .map(([nome]) => nome);

    expect(semVerificacao).toEqual([]);

    // Verificação sem repetição nem espera desiste no primeiro tropeço de um
    // serviço que ainda está iniciando, e o ambiente parece quebrado sem estar.
    for (const [nome, servico] of Object.entries(services)) {
      expect(
        servico.healthcheck?.interval,
        `intervalo de ${nome}`,
      ).toBeTruthy();
      expect(servico.healthcheck?.timeout, `limite de ${nome}`).toBeTruthy();
      expect(
        servico.healthcheck?.retries,
        `tentativas de ${nome}`,
      ).toBeGreaterThan(0);
    }
  });

  it("@spec:AC-001 os quatro perfis existem e nenhum serviço fica fora de perfil", () => {
    const { services } = composicao(caminho.compose);

    const semPerfil = Object.entries(services)
      .filter(([, servico]) => !servico.profiles?.length)
      .map(([nome]) => nome);
    expect(semPerfil).toEqual([]);

    const perfis = new Set(
      Object.values(services).flatMap((servico) => servico.profiles ?? []),
    );
    expect([...perfis].sort()).toEqual(["app", "core", "print", "test"]);

    // O perfil `core` é o que sobe sozinho: precisa bastar para trabalhar.
    const noCore = Object.entries(services)
      .filter(([, servico]) => servico.profiles?.includes("core"))
      .map(([nome]) => nome)
      .sort();
    expect(noCore).toEqual(["postgres-dev", "redis", "traefik"]);
  });

  it("@spec:AC-001 o banco de teste não divide porta nem volume com o de desenvolvimento", () => {
    // AC-003 depende inteiramente disto: se os dois bancos se cruzarem, rodar a
    // suíte apaga o trabalho do dia.
    const { services, volumes } = composicao(caminho.compose);
    const dev = services["postgres-dev"] as Servico;
    const teste = services["postgres-test"] as Servico;

    const portaDev = (dev.ports ?? []).map(portaNoHospedeiro);
    const portaTeste = (teste.ports ?? []).map(portaNoHospedeiro);
    expect(portaDev).not.toEqual([]);
    expect(portaTeste).not.toEqual([]);
    expect(portaDev).not.toEqual(portaTeste);

    // O de desenvolvimento guarda em volume nomeado; o de teste não guarda nada
    // — vive em tmpfs e morre com o contêiner.
    expect(dev.volumes ?? []).not.toEqual([]);
    expect(teste.volumes ?? []).toEqual([]);
    expect(teste.tmpfs ?? []).not.toEqual([]);

    const declarados = Object.keys(volumes ?? {});
    for (const montagem of dev.volumes ?? []) {
      expect(declarados).toContain(montagem.split(":")[0]);
    }

    // Escrita síncrona desligada é o que torna a suíte rápida, e só é aceitável
    // porque este banco é descartável.
    expect(texto(caminho.compose)).toMatch(/fsync=off/);
  });

  it("@spec:AC-001 os dois nomes locais ficam sob um domínio comum, com TLS", () => {
    const { services } = composicao(caminho.compose);
    const modelo = texto(caminho.modeloDeAmbiente);

    const hostWeb = /^HOST_WEB=(.+)$/m.exec(modelo)?.[1]?.trim();
    const hostApi = /^HOST_API=(.+)$/m.exec(modelo)?.[1]?.trim();
    expect(hostWeb).toBeTruthy();
    expect(hostApi).toBeTruthy();
    expect(hostWeb).not.toBe(hostApi);

    // Dois nomes, um domínio: é isso que reproduz o comportamento do cookie de
    // sessão de produção (decisão "Site e API em domínio próprio compartilhado").
    const dominioDe = (host: string) => host.split(".").slice(1).join(".");
    expect(dominioDe(hostWeb as string)).toBe(dominioDe(hostApi as string));
    expect(dominioDe(hostWeb as string)).not.toBe("");

    for (const [servico, variavel] of [
      ["web", "HOST_WEB"],
      ["api", "HOST_API"],
    ] as const) {
      const rotulos = (services[servico] as Servico).labels ?? [];
      expect(rotulos.join("\n")).toContain(`Host(\`\${${variavel}`);
      expect(rotulos).toContain(`traefik.http.routers.${servico}.tls=true`);
      expect(rotulos).toContain(
        `traefik.http.routers.${servico}.entrypoints=websecure`,
      );
    }
  });

  it("@spec:AC-001 toda variável usada na composição está documentada no modelo de ambiente", () => {
    const declaradas = chavesDeclaradas(texto(caminho.modeloDeAmbiente));

    const naoDocumentadas = [
      ...variaveisInterpoladas(texto(caminho.compose)),
      ...variaveisInterpoladas(texto(caminho.composeCi)),
    ].filter((nome) => !declaradas.has(nome));

    expect(naoDocumentadas).toEqual([]);
  });

  it("@spec:AC-001 nenhum valor sensível está escrito na composição", () => {
    const sensivel =
      /(api[_-]?key|secret|senha|password|token|DATABASE_URL|REDIS_URL)[a-z0-9_]*\s*[:=]\s*["']?[^"'\s][^"'\n]{6,}/i;

    // Referência a variável não é segredo — é o oposto dele. Tirar as
    // interpolações antes de procurar deixa à vista só o que seria valor
    // literal de verdade.
    const semInterpolacao = (linha: string) =>
      linha.replace(/\$\{[^}]*\}/g, "");

    for (const arquivo of [caminho.compose, caminho.composeCi]) {
      const linhasSuspeitas = texto(arquivo)
        .split("\n")
        .filter((linha) => !linha.trim().startsWith("#"))
        .map(semInterpolacao)
        .filter((linha) => sensivel.test(linha));

      expect(linhasSuspeitas, `em ${arquivo}`).toEqual([]);
    }

    // Toda credencial entra por interpolação, e sem valor de reserva: reserva
    // silenciosa é como um segredo de exemplo vira segredo de produção (P-002).
    for (const variavel of [
      "POSTGRES_SENHA_DEV",
      "POSTGRES_SENHA_TEST",
      "REDIS_SENHA",
    ]) {
      expect(texto(caminho.compose)).toContain(`\${${variavel}:?`);
    }
  });

  it("@spec:AC-001 o modelo de ambiente não traz senha preenchida", () => {
    const modelo = texto(caminho.modeloDeAmbiente);

    const preenchidas = [
      ...modelo.matchAll(/^([A-Z0-9_]*SENHA[A-Z0-9_]*)=(.*)$/gm),
    ]
      .filter(([, , valor]) => (valor as string).trim() !== "")
      .map(([, chave]) => chave as string);

    expect(preenchidas).toEqual([]);
  });

  it("@spec:AC-001 a composição do portão de qualidade traz só banco de teste e cache", () => {
    const ci = composicao(caminho.composeCi);

    expect(Object.keys(ci.services).sort()).toEqual(["postgres-test", "redis"]);

    // Nome de projeto próprio: sem ele, subir o portão com o ambiente de
    // trabalho no ar derrubaria os contêineres de mesmo nome.
    expect(ci.name).not.toBe(
      (composicao(caminho.compose).name ?? "").replace(/\$\{.*/, ""),
    );
    expect(ci.name).toBeTruthy();

    for (const [nome, servico] of Object.entries(ci.services)) {
      expect(servico.healthcheck?.test, `verificação de ${nome}`).toBeTruthy();
    }

    // O banco do portão também é descartável, e por isso não declara volume.
    expect((ci.services["postgres-test"] as Servico).volumes ?? []).toEqual([]);
    expect((ci.services["postgres-test"] as Servico).tmpfs ?? []).not.toEqual(
      [],
    );
  });

  it("@spec:AC-001 as imagens são fixadas por versão, nunca em `latest`", () => {
    // `latest` faz a mesma composição subir diferente em dois computadores, e o
    // defeito aparece como "aqui funciona".
    const imagens = [caminho.compose, caminho.composeCi].flatMap((arquivo) =>
      Object.values(composicao(arquivo).services).map(
        (servico) => servico.image ?? "",
      ),
    );

    expect(imagens).not.toContain("");
    for (const imagem of imagens) {
      expect(imagem, imagem).toMatch(/:[^:]+$/);
      expect(imagem, imagem).not.toMatch(/:latest$/);
    }
  });
});

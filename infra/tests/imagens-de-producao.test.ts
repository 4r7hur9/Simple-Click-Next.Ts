import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Prova das imagens de produção da API e do site (T-018).
 *
 * Subir os contêineres aqui levaria minutos e exigiria Docker na máquina que
 * roda o portão — a mesma razão que já separou a prova da composição local
 * (`compose.test.ts`) em duas metades. O que este arquivo prova é a metade que
 * quebra em silêncio: o que a receita da imagem MANDA acontecer. Se ela mandar
 * o processo rodar como administrador, ou copiar o estágio de construção
 * inteiro para a imagem final, nenhum teste de aplicação acusa — a API sobe e
 * responde igual, só que com um compilador dentro e poder de administrador.
 *
 * A outra metade (a imagem construída de verdade, subindo e respondendo) está
 * documentada em `docs/publicacao.md`, com os comandos para conferir à mão.
 *
 * As três garantias verificadas aqui são as do critério: vários estágios,
 * nenhuma dependência de desenvolvimento na imagem final, e processo rodando
 * como usuário sem privilégio.
 */

const RECEITAS = {
  api: fileURLToPath(new URL("../../apps/api/Dockerfile", import.meta.url)),
  web: fileURLToPath(new URL("../../apps/web/Dockerfile", import.meta.url)),
};

/** Uma instrução da receita: o verbo e o resto da linha, já emendada. */
interface Instrucao {
  readonly verbo: string;
  readonly resto: string;
}

/** Um estágio: o nome, de quem ele parte, e o que ele manda fazer. */
interface Estagio {
  readonly nome: string;
  readonly parteDe: string;
  readonly instrucoes: readonly Instrucao[];
}

/**
 * Lê a receita como estrutura, e não como texto.
 *
 * Emendar as linhas continuadas com `\` antes de olhar é o que faz a diferença
 * entre conferir a receita e conferir a formatação dela: `USER` numa linha e o
 * nome na seguinte é a mesma instrução, e uma expressão regular sobre o texto
 * cru diria que não há usuário nenhum.
 */
function lerEstagios(caminho: string): Estagio[] {
  const linhas = readFileSync(caminho, "utf8").split("\n");
  const emendadas: string[] = [];
  let acumulada = "";

  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;

    if (linha.endsWith("\\")) {
      acumulada += `${linha.slice(0, -1).trim()} `;
      continue;
    }
    emendadas.push(`${acumulada}${linha}`.trim());
    acumulada = "";
  }
  if (acumulada !== "") emendadas.push(acumulada.trim());

  const estagios: Estagio[] = [];
  let corrente: {
    nome: string;
    parteDe: string;
    instrucoes: Instrucao[];
  } | null = null;

  for (const linha of emendadas) {
    const espaco = linha.indexOf(" ");
    const verbo = (
      espaco === -1 ? linha : linha.slice(0, espaco)
    ).toUpperCase();
    const resto = espaco === -1 ? "" : linha.slice(espaco + 1).trim();

    if (verbo === "FROM") {
      const partes = resto.split(/\s+/);
      const apelido = partes.findIndex((parte) => parte.toUpperCase() === "AS");
      corrente = {
        nome: apelido === -1 ? (partes[0] ?? "") : (partes[apelido + 1] ?? ""),
        parteDe: partes[0] ?? "",
        instrucoes: [],
      };
      estagios.push(corrente);
      continue;
    }

    corrente?.instrucoes.push({ verbo, resto });
  }

  return estagios;
}

/** O estágio que vira a imagem publicada: o último da receita. */
function estagioFinal(caminho: string): Estagio {
  const estagios = lerEstagios(caminho);
  return estagios[estagios.length - 1] as Estagio;
}

/** Todas as instruções de um verbo, em todos os estágios. */
function instrucoesDe(caminho: string, verbo: string): string[] {
  return lerEstagios(caminho)
    .flatMap((estagio) => estagio.instrucoes)
    .filter((instrucao) => instrucao.verbo === verbo)
    .map((instrucao) => instrucao.resto);
}

describe.each(Object.entries(RECEITAS))(
  "imagem de produção — %s",
  (_qual, caminho) => {
    it("é construída em vários estágios, e o que vai ao ar não parte do que compila", () => {
      const estagios = lerEstagios(caminho);
      const nomes = estagios.map((estagio) => estagio.nome);

      expect(estagios.length).toBeGreaterThan(2);

      // O estágio final não pode partir do estágio que compila: partir dele
      // levaria junto gerenciador de pacotes, compilador e tudo que eles baixaram
      // — a economia de estágios sairia pelo preço de uma imagem inteira.
      const final = estagioFinal(caminho);
      const queCompilam = nomes.filter((nome) =>
        ["dependencias", "construcao"].includes(nome),
      );
      expect(queCompilam.length).toBeGreaterThan(0);
      expect(queCompilam).not.toContain(final.parteDe);
    });

    it("roda como usuário sem privilégio, e a troca acontece antes do comando", () => {
      const final = estagioFinal(caminho);
      const posicaoDoUsuario = final.instrucoes.findIndex(
        (instrucao) => instrucao.verbo === "USER",
      );
      const posicaoDoComando = final.instrucoes.findIndex((instrucao) =>
        ["CMD", "ENTRYPOINT"].includes(instrucao.verbo),
      );

      expect(posicaoDoUsuario).toBeGreaterThan(-1);
      expect(final.instrucoes[posicaoDoUsuario]?.resto).toBe("node");

      // Trocar de usuário DEPOIS do comando não trocaria nada: quem executa é
      // quem estava valendo na hora, e a instrução ficaria de enfeite.
      expect(posicaoDoComando).toBeGreaterThan(posicaoDoUsuario);
    });

    it("não instala nem compila nada no estágio que vai ao ar", () => {
      const final = estagioFinal(caminho);
      const executados = final.instrucoes
        .filter((instrucao) => instrucao.verbo === "RUN")
        .map((instrucao) => instrucao.resto);

      // Ferramenta que não existe na imagem não pode ser usada por quem entrar
      // nela. Instalar aqui traria de volta exatamente o que os estágios
      // anteriores existem para deixar para trás.
      for (const comando of executados) {
        expect(comando).not.toMatch(/\b(pnpm|npm|yarn|corepack|tsc|apt-get)\b/);
      }
    });

    it("não guarda segredo dentro da imagem (P-002)", () => {
      const declaradas = instrucoesDe(caminho, "ENV");

      for (const declaracao of declaradas) {
        expect(declaracao).not.toMatch(
          /\b(SENHA|SECRET|PASSWORD|TOKEN|DATABASE_URL|JWT)\w*\s*=\s*\S/i,
        );
      }
    });

    it("declara como o orquestrador confere se o contêiner está de pé", () => {
      // Sem roteiro de saúde, "esperar o contêiner subir" vira adivinhação — o
      // mesmo defeito que a composição local já não aceita.
      expect(instrucoesDe(caminho, "HEALTHCHECK")).toHaveLength(1);
    });
  },
);

describe("imagem de produção — API", () => {
  it("poda a árvore de dependências até sobrar só o que executa", () => {
    const executados = lerEstagios(RECEITAS.api)
      .flatMap((estagio) => estagio.instrucoes)
      .filter((instrucao) => instrucao.verbo === "RUN")
      .map((instrucao) => instrucao.resto);

    const poda = executados.find((comando) => comando.includes("--prod"));
    expect(poda).toBeDefined();

    // Jogar a árvore fora antes de reinstalar não é exagero: instalar "por
    // cima" refaz as ligações e DEIXA os arquivos no depósito interno do
    // gerenciador, de onde ninguém mais os vê e onde eles continuam
    // executáveis.
    expect(poda).toContain("rm -rf node_modules");
  });

  it("@spec:AC-029 leva as ferramentas da migração para dentro da imagem que vai receber tráfego", () => {
    const copias = estagioFinal(RECEITAS.api)
      .instrucoes.filter((instrucao) => instrucao.verbo === "COPY")
      .map((instrucao) => instrucao.resto);

    // O comando de pré-publicação roda DENTRO desta imagem, antes de ela
    // receber tráfego. Sem estes arquivos aqui, o passo que aplica o esquema
    // não existiria no lugar em que o provedor o executa.
    const juntas = copias.join("\n");
    expect(juntas).toContain("infra/railway");
    expect(juntas).toContain("check-ambientes.sh");
    expect(juntas).toContain("check-migracao-compativel.mjs");

    // E as migrações em si, que moram no pacote de banco.
    expect(juntas).toContain("packages/database");
  });
});

describe("imagem de produção — site", () => {
  it("leva a saída autônoma, e também o que ela deixa de fora", () => {
    const copias = estagioFinal(RECEITAS.web)
      .instrucoes.filter((instrucao) => instrucao.verbo === "COPY")
      .map((instrucao) => instrucao.resto)
      .join("\n");

    expect(copias).toContain(".next/standalone");
    // Os arquivos estáticos ficam FORA da saída autônoma de propósito, porque o
    // normal é servi-los por rede de distribuição. Esquecer esta cópia faz o
    // site subir sem estilo nenhum — a falha mais confusa desta imagem.
    expect(copias).toContain(".next/static");
  });

  it("escuta em endereço alcançável de fora do contêiner", () => {
    const ambiente = instrucoesDe(RECEITAS.web, "ENV").join("\n");

    // Escutando só em `localhost`, o processo sobe e ninguém de fora fala com
    // ele: o contêiner parece saudável e o site parece morto.
    expect(ambiente).toMatch(/HOSTNAME=0\.0\.0\.0/);
  });
});

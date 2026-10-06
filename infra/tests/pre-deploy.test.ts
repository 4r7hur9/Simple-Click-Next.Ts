import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Prova de que a publicação aplica a migração ANTES de trocar a versão, e que
 * falhar ali interrompe tudo sem deixar o sistema em estado misto (AC-029).
 *
 * O que este arquivo prova é o comportamento do portão da publicação: a ordem
 * das etapas, o que acontece quando cada uma reprova, e o veredito que chega ao
 * provedor — que é a única coisa que ele lê para decidir se manda tráfego para
 * a versão nova. O caminho feliz, com migração aplicada num PostgreSQL de
 * verdade, mora em `pre-deploy.int.test.ts`: aqui não há banco nenhum de pé, e
 * é justamente por isso que estes casos são rápidos e sempre iguais.
 *
 * Todos rodam o script de verdade, com ambiente montado à mão. Herdar o
 * ambiente da máquina faria o resultado depender de quem executa a suíte — e,
 * pior, faria a prova passar por um motivo diferente do que ela afirma.
 */

const PRE_DEPLOY = fileURLToPath(
  new URL("../railway/pre-deploy.sh", import.meta.url),
);
const CONFIGURACAO = fileURLToPath(
  new URL("../railway/railway.json", import.meta.url),
);

/**
 * Quanto um caso pode esperar a pré-publicação. Cada caso roda o script de
 * verdade, e ele abre o bash e dois processos do Node (conferência de
 * compatibilidade e aplicador de migrações). Num Linux isso leva um segundo;
 * no Windows, com a máquina ocupada, uma execução levou 22 s — e o padrão de
 * 5 s do Vitest derrubava o caso por tempo, sem nada ter reprovado. A espera
 * não entra em asserção nenhuma: o que se afirma é o código e o relato.
 */
const ESPERA_DA_PUBLICACAO = 180_000;

/** Códigos de saída combinados com o provedor. */
const LIBERADA = 0;
const REPROVOU = 1;
const AMBIENTE_INCOMPLETO = 2;

/** Banco que não existe: ninguém escuta nesta porta, e a conexão é recusada na hora. */
const BANCO_INALCANCAVEL =
  "postgresql://sc_migrator:seg@127.0.0.1:1/simpleclick";

interface Veredito {
  readonly codigo: number;
  readonly texto: string;
}

/** Ambiente de produção bem formado, com o banco fora do alcance. */
function ambienteDeProducao(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://sc_app:seg@agrupador.interno:6432/simpleclick",
    DATABASE_URL_DIRETA: BANCO_INALCANCAVEL,
    REDIS_URL: "redis://cache.interno:6379/0",
    SENHA_BANCO_MIGRADOR: "senha_de_migracao_1",
    SENHA_BANCO_APLICACAO: "senha_de_aplicacao_1",
    SENHA_BANCO_ADMINISTRACAO: "senha_de_administracao_1",
  };
}

function publicar(variaveis: Record<string, string>): Veredito {
  const execucao = spawnSync("bash", [PRE_DEPLOY], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...variaveis },
    encoding: "utf8",
  });

  return {
    codigo: execucao.status ?? -1,
    texto: `${execucao.stdout ?? ""}${execucao.stderr ?? ""}`,
  };
}

/** Posição de um trecho no relato, ou -1 quando ele não apareceu. */
function posicaoNoRelato(veredito: Veredito, trecho: string): number {
  return veredito.texto.indexOf(trecho);
}

describe("pré-publicação: migração antes da troca de versão", () => {
  it(
    "@spec:AC-029 migração que falha interrompe a publicação, e a versão anterior continua atendendo",
    () => {
      const veredito = publicar(ambienteDeProducao());

      expect(veredito.codigo).toBe(REPROVOU);
      expect(veredito.texto).toContain("publicação interrompida");
      expect(veredito.texto).toContain("aplicar migrações");
      // A frase que importa a quem lê o registro de madrugada: ninguém ficou sem
      // loja no ar, porque a versão nova nunca chegou a entrar em rotação.
      expect(veredito.texto).toContain(
        "a versão anterior continua atendendo — nada foi trocado",
      );
      expect(veredito.texto).not.toContain("publicação liberada");
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-029 a troca de versão nunca é liberada com o banco fora do estado esperado",
    () => {
      const veredito = publicar(ambienteDeProducao());

      // O código de saída é o contrato inteiro com o provedor: zero libera a
      // troca, qualquer outro a interrompe.
      expect(veredito.codigo).not.toBe(LIBERADA);
      expect(veredito.texto).toContain(
        "nenhuma migração pela metade ficou no banco",
      );
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-029 confere o esquema numa etapa própria, depois de aplicar",
    () => {
      const veredito = publicar(ambienteDeProducao());

      // "Aplicou" e "o banco ficou igual ao que este código espera" são duas
      // perguntas, e é a segunda que decide se a versão nova pode receber a
      // primeira requisição. Como a primeira já reprovou, a segunda nem começa.
      const aplicar = posicaoNoRelato(veredito, "aplicar migrações");
      const conferir = posicaoNoRelato(veredito, "banco em dia com o código");
      expect(aplicar).toBeGreaterThan(-1);
      expect(conferir).toBe(-1);
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-029 recusa migrar pelo agrupador, antes de tocar no banco",
    () => {
      const variaveis = ambienteDeProducao();
      variaveis.DATABASE_URL_DIRETA =
        "postgresql://sc_migrator:seg@agrupador.interno:6432/simpleclick";

      const veredito = publicar(variaveis);

      expect(veredito.codigo).toBe(REPROVOU);
      expect(veredito.texto).toContain("conexão de migração");
      // Agrupador em modo transação descarta o estado da sessão entre comandos, e
      // migração é feita de estado de sessão: papel corrente, função, gatilho.
      expect(veredito.texto).toContain("agrupador");
      expect(posicaoNoRelato(veredito, "aplicar migrações")).toBe(-1);
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-029 sem a conexão de migração, interrompe em vez de subir sobre um banco desconhecido",
    () => {
      const variaveis = ambienteDeProducao();
      delete variaveis.DATABASE_URL_DIRETA;

      const veredito = publicar(variaveis);

      expect(veredito.codigo).toBe(AMBIENTE_INCOMPLETO);
      expect(veredito.texto).toContain("DATABASE_URL_DIRETA");
      expect(veredito.texto).toContain("publicação interrompida");
    },
    ESPERA_DA_PUBLICACAO,
  );

  it("@spec:AC-029 a configuração da publicação roda o pré-publicação antes da troca de versão", () => {
    const configuracao = JSON.parse(readFileSync(CONFIGURACAO, "utf8")) as {
      build?: { builder?: string; dockerfilePath?: string };
      deploy?: {
        preDeployCommand?: string | string[];
        startCommand?: string;
        healthcheckPath?: string;
      };
    };

    // É este campo, e só ele, que coloca a migração ENTRE "a imagem está
    // pronta" e "a imagem recebe tráfego". Sem ele, o script existiria e nunca
    // seria chamado no momento que o critério exige.
    const antesDaTroca = [configuracao.deploy?.preDeployCommand ?? []]
      .flat()
      .join(" ");
    expect(antesDaTroca).toContain("infra/railway/pre-deploy.sh");

    // E o comando de partida é o da imagem construída aqui: a mesma imagem que
    // acabou de rodar a migração é a que passa a atender.
    expect(configuracao.build?.dockerfilePath).toBe("apps/api/Dockerfile");
    expect(configuracao.deploy?.startCommand).toContain(
      "apps/api/dist/main.js",
    );

    // A entrada em rotação depende de "consigo atender de verdade", que
    // consulta banco e cache — e não de "o processo está de pé".
    expect(configuracao.deploy?.healthcheckPath).toBe("/v1/health/ready");
  });
});

describe("pré-publicação: separação de ambientes é o primeiro passo", () => {
  it(
    "@spec:AC-031 recusa publicar com a conexão de teste carregada no ambiente",
    () => {
      const variaveis = ambienteDeProducao();
      variaveis.DATABASE_URL_TEST =
        "postgresql://sc_app:seg@db.interno:5432/simpleclick_test";

      const veredito = publicar(variaveis);

      expect(veredito.codigo).toBe(REPROVOU);
      expect(veredito.texto).toContain("separação de ambientes");
      expect(veredito.texto).toContain("DATABASE_URL_TEST");
      // Nada além do primeiro passo chegou a acontecer: a suíte apaga e recria
      // dados, e uma publicação com essa variável a bordo é arma carregada.
      expect(posicaoNoRelato(veredito, "aplicar migrações")).toBe(-1);
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-031 recusa publicar com o cache de teste carregado no ambiente",
    () => {
      const variaveis = ambienteDeProducao();
      variaveis.REDIS_URL_TEST = "redis://cache.interno:6379/1";

      const veredito = publicar(variaveis);

      expect(veredito.codigo).toBe(REPROVOU);
      expect(veredito.texto).toContain("REDIS_URL_TEST");
      expect(posicaoNoRelato(veredito, "aplicar migrações")).toBe(-1);
    },
    ESPERA_DA_PUBLICACAO,
  );

  it(
    "@spec:AC-031 não lê o arquivo de ambiente da máquina de quem desenvolve",
    () => {
      // O repositório tem um `.env` com a conexão de TESTE dentro. Se o script o
      // lesse, este caso reprovaria por "variável de teste presente" (código 1).
      // Reprovar por configuração ausente (código 2) é a prova de que ele só
      // enxerga o que o cofre do provedor entregou.
      const veredito = publicar({});

      expect(veredito.codigo).toBe(AMBIENTE_INCOMPLETO);
      expect(veredito.texto).toContain("DATABASE_URL");
      expect(veredito.texto).not.toContain(
        "está definida no ambiente de produção",
      );
    },
    ESPERA_DA_PUBLICACAO,
  );
});

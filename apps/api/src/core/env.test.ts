import { describe, expect, it } from "vitest";

import {
  carregarAmbiente,
  ErroDeAmbiente,
  segundoPlanoLigado,
  VARIAVEIS,
  variaveisAposentadasPresentes,
  type FonteDeAmbiente,
} from "./env.js";

/**
 * Nenhum valor aqui é segredo real: são cadeias de exemplo, montadas em
 * constante justamente para que o arquivo de teste nunca pareça — nem seja —
 * um lugar onde credencial mora (P-002).
 */
const CONEXAO_DA_APLICACAO =
  "postgresql://aplicacao:trocar@localhost:6432/simpleclick_dev?pgbouncer=true";
const CONEXAO_DIRETA =
  "postgresql://migracao:trocar@localhost:5432/simpleclick_dev";
const CONEXAO_DE_TESTE =
  "postgresql://aplicacao:trocar@localhost:5432/simpleclick_test";
const CACHE = "redis://localhost:6379/0";
/**
 * Segredo de prova com variedade de caracteres (48 distintos), montado em
 * código para não ser um literal: produção recusa repetição como "x" × 48
 * (A-1 da revisão #149). Não é chave de lugar nenhum.
 */
const ALFABETO =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CHAVE_DE_ASSINATURA = Array.from(
  { length: 48 },
  (_, i) => ALFABETO[(i * 7) % ALFABETO.length],
).join("");

/** Ambiente completo e válido — cada teste tira ou estraga uma peça dele. */
function ambienteCompleto(): Record<string, string> {
  return {
    NODE_ENV: "development",
    PORT: "3001",
    DATABASE_URL: CONEXAO_DA_APLICACAO,
    DATABASE_URL_DIRETA: CONEXAO_DIRETA,
    DATABASE_URL_TEST: CONEXAO_DE_TESTE,
    REDIS_URL: CACHE,
    JWT_SECRET: CHAVE_DE_ASSINATURA,
    ORIGENS_PERMITIDAS:
      "https://simpleclick.localhost,https://api.simpleclick.localhost",
    LOG_LEVEL: "info",
  };
}

/** Ambiente completo menos as variáveis pedidas. */
function ambienteSem(...ausentes: readonly string[]): FonteDeAmbiente {
  const fonte = ambienteCompleto();
  for (const nome of ausentes) delete fonte[nome];
  return fonte;
}

/** Captura a recusa de partida, falhando o teste se ela não acontecer. */
function recusaAoCarregar(fonte: FonteDeAmbiente): ErroDeAmbiente {
  try {
    carregarAmbiente(fonte);
  } catch (erro) {
    if (erro instanceof ErroDeAmbiente) return erro;
    throw erro;
  }
  throw new Error("a API aceitou iniciar com ambiente inválido");
}

describe("carregarAmbiente", () => {
  it("@spec:AC-002 recusa iniciar quando falta variável obrigatória, apontando-a pelo nome", () => {
    const erro = recusaAoCarregar(ambienteSem("DATABASE_URL"));

    expect(erro.variaveis).toContain("DATABASE_URL");
    expect(erro.message).toContain("DATABASE_URL");
    expect(erro.message).toContain("ausente");
  });

  it("@spec:AC-002 diz o que se espera da variável ausente, não apenas que ela falta", () => {
    const erro = recusaAoCarregar(ambienteSem("JWT_SECRET"));

    const problema = erro.problemas.find((p) => p.variavel === "JWT_SECRET");
    expect(problema?.esperado).toMatch(/ao menos 32 caracteres/);
    // A expectativa precisa chegar a quem lê a mensagem, não ficar só no objeto.
    expect(erro.message).toContain("esperado:");
    expect(erro.message).toContain("ao menos 32 caracteres");
  });

  it("@spec:AC-002 nomeia todas as variáveis que faltam de uma vez, não só a primeira", () => {
    // DATABASE_URL_TEST entra aqui de propósito: ela só é exigida ao olhar
    // NODE_ENV junto, e essa checagem não pode ficar escondida atrás das outras
    // — senão quem configura corrige tudo, roda de novo e leva um segundo susto.
    const erro = recusaAoCarregar(
      ambienteSem(
        "DATABASE_URL",
        "DATABASE_URL_TEST",
        "REDIS_URL",
        "ORIGENS_PERMITIDAS",
      ),
    );

    expect([...erro.variaveis].sort()).toEqual([
      "DATABASE_URL",
      "DATABASE_URL_TEST",
      "ORIGENS_PERMITIDAS",
      "REDIS_URL",
    ]);
  });

  it("@spec:AC-002 recusa variável presente porém inválida, dizendo que o valor é que está errado", () => {
    const fonte = ambienteCompleto();
    fonte.PORT = "oito mil";

    const erro = recusaAoCarregar(fonte);
    const problema = erro.problemas.find((p) => p.variavel === "PORT");

    expect(problema?.motivo).toContain("valor inválido");
    expect(problema?.esperado).toContain("entre 1 e 65535");
  });

  it("@spec:AC-002 recusa cadeia de conexão que não é do serviço esperado", () => {
    const fonte = ambienteCompleto();
    fonte.REDIS_URL = "postgresql://localhost:5432/nao_sou_cache";

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["REDIS_URL"]);
    expect(erro.message).toContain("valor inválido");
  });

  it("@spec:AC-002 recusa segredo de assinatura curto demais para ser segredo", () => {
    const fonte = ambienteCompleto();
    fonte.JWT_SECRET = "curto";

    expect(recusaAoCarregar(fonte).variaveis).toEqual(["JWT_SECRET"]);
  });

  it("@spec:AC-002 recusa origem autorizada que não é uma origem", () => {
    const fonte = ambienteCompleto();
    fonte.ORIGENS_PERMITIDAS = "https://simpleclick.localhost/painel";

    expect(recusaAoCarregar(fonte).variaveis).toEqual(["ORIGENS_PERMITIDAS"]);
  });

  it("@spec:AC-002 falha na partida e não depois, porque não olha o ambiente do processo", () => {
    // Se a função lesse process.env por dentro, o valor plantado aqui salvaria
    // a partida e o defeito só apareceria no meio de uma requisição.
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = CHAVE_DE_ASSINATURA;
    try {
      expect(recusaAoCarregar(ambienteSem("JWT_SECRET")).variaveis).toEqual([
        "JWT_SECRET",
      ]);
    } finally {
      if (anterior === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = anterior;
    }
  });

  it("@spec:AC-002 aceita ambiente completo e entrega os valores já convertidos", () => {
    const ambiente = carregarAmbiente(ambienteCompleto());

    expect(ambiente.PORT).toBe(3001);
    expect(ambiente.NODE_ENV).toBe("development");
    expect(ambiente.ORIGENS_PERMITIDAS).toEqual([
      "https://simpleclick.localhost",
      "https://api.simpleclick.localhost",
    ]);
  });

  it("@spec:AC-002 aplica os valores padrão do que é opcional, sem exigir configuração extra", () => {
    const ambiente = carregarAmbiente(
      ambienteSem("PORT", "NODE_ENV", "LOG_LEVEL"),
    );

    expect(ambiente.NODE_ENV).toBe("development");
    expect(ambiente.PORT).toBe(3001);
    expect(ambiente.LOG_LEVEL).toBe("info");
  });

  it("@spec:AC-002 descreve todas as variáveis previstas, para que nenhuma falhe sem explicação", () => {
    expect([...VARIAVEIS].sort()).toEqual([
      "CHAVE_CIFRA_TOTP",
      "DATABASE_URL",
      "DATABASE_URL_DIRETA",
      "DATABASE_URL_TEST",
      "FLAG_VITRINE_PROXIMO_PRECO",
      "JWT_SECRET",
      "LOG_LEVEL",
      "NODE_ENV",
      "ORIGENS_PERMITIDAS",
      "PORT",
      "REDIS_URL",
      "SEGUNDO_PLANO",
    ]);

    for (const nome of VARIAVEIS) {
      const erro = recusaAoCarregar({ [nome]: "%%invalido%%" });
      const problema = erro.problemas.find((p) => p.variavel === nome);
      expect(problema?.esperado ?? "").not.toBe("");
      expect(problema?.esperado).not.toContain("veja .env.example");
    }
  });

  it("@spec:AC-031 recusa iniciar quando o banco de teste é o mesmo banco da aplicação", () => {
    const fonte = ambienteCompleto();
    fonte.DATABASE_URL_TEST = fonte.DATABASE_URL as string;

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["DATABASE_URL_TEST"]);
    expect(erro.message).toContain("mesmo banco");
  });

  it("@spec:AC-031 exige o banco de teste fora de produção, para a suíte nunca cair no banco da aplicação", () => {
    const erro = recusaAoCarregar(ambienteSem("DATABASE_URL_TEST"));

    expect(erro.variaveis).toEqual(["DATABASE_URL_TEST"]);
  });
});

describe("o nome da porta", () => {
  it("@spec:AC-048 recusa o nome antigo API_PORT quando ele aponta para outra porta, nomeando as duas variáveis", () => {
    const fonte = ambienteCompleto();
    fonte.PORT = "4100";
    fonte.API_PORT = "4200";

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["API_PORT"]);
    expect(erro.message).toContain("API_PORT");
    expect(erro.message).toContain("PORT (4100)");
    expect(erro.message).toContain("um nome só");
  });

  it("@spec:AC-048 compara o nome antigo com a porta padrão quando PORT não veio", () => {
    // O caso perigoso: o modelo antigo de `.env` trazia só API_PORT. Com outro
    // número ali, a API escutaria em 3001 e ninguém acharia a API.
    const fonte = { ...ambienteSem("PORT"), API_PORT: "4200" };

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["API_PORT"]);
    expect(erro.message).toContain("o padrão");
  });

  it("@spec:AC-048 tolera o nome antigo quando ele aponta para a mesma porta, e o aponta como aposentado", () => {
    const fonte = { ...ambienteSem("PORT"), API_PORT: "3001" };

    const ambiente = carregarAmbiente(fonte);

    expect(ambiente.PORT).toBe(3001);
    expect(variaveisAposentadasPresentes(fonte)).toEqual(["API_PORT"]);
    expect(variaveisAposentadasPresentes(ambienteCompleto())).toEqual([]);
  });

  it("@spec:AC-048 com PORT inválida, quem reclama é PORT, e não o nome antigo", () => {
    const fonte = ambienteCompleto();
    fonte.PORT = "oito mil";
    fonte.API_PORT = "3001";

    expect(recusaAoCarregar(fonte).variaveis).toEqual(["PORT"]);
  });
});

describe("o segundo plano", () => {
  it("@spec:AC-046 liga sozinho em produção e fica desligado fora dela, salvo pedido explícito", () => {
    expect(segundoPlanoLigado({ NODE_ENV: "production" })).toBe(true);
    expect(segundoPlanoLigado({ NODE_ENV: "development" })).toBe(false);
    expect(segundoPlanoLigado({ NODE_ENV: "test" })).toBe(false);
    expect(
      segundoPlanoLigado({ NODE_ENV: "development", SEGUNDO_PLANO: "ligado" }),
    ).toBe(true);
    expect(
      segundoPlanoLigado({
        NODE_ENV: "production",
        SEGUNDO_PLANO: "desligado",
      }),
    ).toBe(false);
  });

  it("@spec:AC-046 recusa valor de segundo plano que não é ligado nem desligado", () => {
    const fonte = ambienteCompleto();
    fonte.SEGUNDO_PLANO = "talvez";

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["SEGUNDO_PLANO"]);
    expect(erro.message).toContain("ligado | desligado");
  });
});

describe("a feature flag do próximo preço (card #140)", () => {
  it("[CA-12] aceita ligado e desligado, e ausente passa", () => {
    for (const valor of ["ligado", "desligado"]) {
      const fonte = ambienteCompleto();
      fonte.FLAG_VITRINE_PROXIMO_PRECO = valor;
      expect(carregarAmbiente(fonte).FLAG_VITRINE_PROXIMO_PRECO).toBe(valor);
    }
    expect(
      carregarAmbiente(ambienteCompleto()).FLAG_VITRINE_PROXIMO_PRECO,
    ).toBeUndefined();
  });

  it("[CA-12] recusa 'ligada' e 'sim' listando os valores aceitos", () => {
    for (const valor of ["ligada", "sim"]) {
      const fonte = ambienteCompleto();
      fonte.FLAG_VITRINE_PROXIMO_PRECO = valor;

      const erro = recusaAoCarregar(fonte);

      expect(erro.variaveis).toEqual(["FLAG_VITRINE_PROXIMO_PRECO"]);
      expect(erro.message).toContain("ligado | desligado");
    }
  });
});

describe("segredos de exemplo e fracos em produção (A-1, revisão #149)", () => {
  /** Mesmo texto do .env.example: público no repositório. */
  const MARCADOR = "TROQUE_POR_UM_SEGREDO_GERADO_COM_AO_MENOS_32_CARACTERES";
  const CHAVE_DA_CIFRA = Buffer.alloc(32, 7).toString("base64");

  function producao(): Record<string, string> {
    const fonte = ambienteCompleto();
    fonte.NODE_ENV = "production";
    fonte.CHAVE_CIFRA_TOTP = CHAVE_DA_CIFRA;
    delete fonte.DATABASE_URL_TEST;
    return fonte;
  }

  it("[A-1] produção parte com segredo gerado (controle)", () => {
    expect(carregarAmbiente(producao()).NODE_ENV).toBe("production");
  });

  it("[A-1] produção recusa o marcador TROQUE_ do .env.example como JWT_SECRET, sem ecoar o valor", () => {
    const fonte = producao();
    fonte.JWT_SECRET = MARCADOR;

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["JWT_SECRET"]);
    expect(erro.message).toContain(".env.example");
    expect(erro.message).not.toContain(MARCADOR);
  });

  it("[A-1] produção recusa JWT_SECRET de baixa variedade, como 32 letras 'a'", () => {
    const fonte = producao();
    fonte.JWT_SECRET = "a".repeat(32);

    const erro = recusaAoCarregar(fonte);

    expect(erro.variaveis).toEqual(["JWT_SECRET"]);
    expect(erro.message).toContain("caracteres distintos");
    expect(erro.message).not.toContain("a".repeat(32));
  });

  it("[A-1] produção recusa o marcador nos outros segredos e nas conexões", () => {
    const fonte = producao();
    fonte.SEGREDO_DE_REVALIDACAO = MARCADOR;
    fonte.SEGREDO_DA_PONTE = MARCADOR;
    fonte.METRICAS_TOKEN = "b".repeat(40);
    fonte.DATABASE_URL =
      "postgresql://TROQUE_USUARIO:TROQUE_SENHA@localhost:6432/simpleclick?pgbouncer=true";
    fonte.REDIS_URL = "redis://:TROQUE_SENHA@localhost:6379/0";

    expect(recusaAoCarregar(fonte).variaveis).toEqual([
      "DATABASE_URL",
      "METRICAS_TOKEN",
      "REDIS_URL",
      "SEGREDO_DA_PONTE",
      "SEGREDO_DE_REVALIDACAO",
    ]);
  });

  it("[M-1] produção parte SEM a credencial de migração: só o pré-deploy a usa", () => {
    const fonte = producao();
    delete fonte.DATABASE_URL_DIRETA;

    const ambiente = carregarAmbiente(fonte);

    expect(ambiente.DATABASE_URL_DIRETA).toBeUndefined();
  });

  it("[M-1] fora de produção ela continua obrigatória, nomeada na recusa", () => {
    const erro = recusaAoCarregar(ambienteSem("DATABASE_URL_DIRETA"));

    expect(erro.variaveis).toEqual(["DATABASE_URL_DIRETA"]);
    expect(erro.message).toContain("obrigatória quando NODE_ENV não é production");
  });

  it("[A-1] fora de produção o modelo copiado continua subindo (desenvolvimento)", () => {
    const fonte = ambienteCompleto();
    fonte.JWT_SECRET = MARCADOR;
    fonte.SEGREDO_DE_REVALIDACAO = MARCADOR;

    expect(carregarAmbiente(fonte).JWT_SECRET).toBe(MARCADOR);
  });
});

describe("a chave que cifra o segredo do aplicativo autenticador", () => {
  /** 32 bytes de exemplo — não é chave de lugar nenhum. */
  const CHAVE_DE_EXEMPLO = Buffer.alloc(32, 7).toString("base64");

  function producaoCompleta(): Record<string, string> {
    const fonte = ambienteCompleto();
    fonte.NODE_ENV = "production";
    delete fonte.DATABASE_URL_TEST;
    return fonte;
  }

  it("@spec:AC-130 produção não parte sem a chave, e a recusa diz o nome dela e como gerá-la", () => {
    const erro = recusaAoCarregar(producaoCompleta());

    expect(erro.variaveis).toEqual(["CHAVE_CIFRA_TOTP"]);
    expect(erro.message).toContain("obrigatória em production");
    expect(erro.message).toContain("randomBytes(32)");
  });

  it("@spec:AC-130 produção parte com a chave de 32 bytes em base64", () => {
    const fonte = producaoCompleta();
    fonte.CHAVE_CIFRA_TOTP = CHAVE_DE_EXEMPLO;

    expect(carregarAmbiente(fonte).CHAVE_CIFRA_TOTP).toBe(CHAVE_DE_EXEMPLO);
  });

  it("@spec:AC-130 chave de tamanho errado ou fora de base64 é recusada em qualquer ambiente, sem ecoar o valor", () => {
    const curta = Buffer.alloc(16, 7).toString("base64");
    for (const ambiente of ["development", "production"] as const) {
      for (const valor of [curta, "isto não é base64 nenhum!"]) {
        const fonte =
          ambiente === "production" ? producaoCompleta() : ambienteCompleto();
        fonte.CHAVE_CIFRA_TOTP = valor;

        const erro = recusaAoCarregar(fonte);

        expect(erro.variaveis).toEqual(["CHAVE_CIFRA_TOTP"]);
        expect(erro.message).toContain("valor inválido");
        expect(erro.message).not.toContain(valor);
      }
    }
  });

  it("@spec:AC-130 fora de produção a chave é opcional, e valor vazio conta como ausente", () => {
    expect(carregarAmbiente(ambienteCompleto()).CHAVE_CIFRA_TOTP).toBe(
      undefined,
    );
    const fonte = ambienteCompleto();
    fonte.CHAVE_CIFRA_TOTP = "   ";
    expect(carregarAmbiente(fonte).CHAVE_CIFRA_TOTP).toBe(undefined);

    const producao = producaoCompleta();
    producao.CHAVE_CIFRA_TOTP = "";
    expect(recusaAoCarregar(producao).variaveis).toEqual(["CHAVE_CIFRA_TOTP"]);
  });
});

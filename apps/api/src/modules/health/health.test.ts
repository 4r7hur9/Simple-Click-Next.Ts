import { createServer, type Server, type Socket } from "node:net";

import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// Importação só de tipo: some na conversão e por isso NÃO carrega o módulo do
// banco antes de o ambiente do cenário estar montado.
import type { AcessoAoBanco } from "../../core/db.ts";

/**
 * Prova de que VIVO e PRONTO são coisas distintas (AC-023).
 *
 * O cenário central é literal: **a API sobe com o banco inalcançável**. O
 * endereço do banco aponta para uma porta onde ninguém escuta, o processo sobe
 * assim mesmo, `/live` responde que está de pé e `/ready` responde que ainda
 * não pode receber tráfego. Nenhum substituto simulado é usado para isso — é a
 * conexão de verdade que precisa ser recusada.
 *
 * O ambiente é montado ANTES de qualquer importação que fale com o banco:
 * `core/db.ts` lê a cadeia de conexão na primeira transação, e um `.env` da
 * máquina de quem roda o teste apontaria para um banco de pé, apagando o
 * cenário inteiro.
 */

/** Porta 1 é privilegiada e não tem serviço: a conexão é recusada na hora. */
const BANCO_INALCANCAVEL = "postgresql://sc_app:sem-segredo@127.0.0.1:1/nada";
const BANCO_DIRETO_INALCANCAVEL =
  "postgresql://sc_migrator:sem-segredo@127.0.0.1:2/nada";
const CACHE_INALCANCAVEL = "redis://127.0.0.1:1/0";

/**
 * Credenciais inventadas do cache de mentira.
 *
 * Moram em constante nomeada, e não coladas na atribuição, porque a
 * verificação de P-002 reprova literal ao lado de `password` — e ela está
 * certa em reprovar: é assim que segredo de verdade entra em código sem
 * ninguém notar. Nenhuma das duas abre nada; o servidor que as recebe é
 * levantado pelo próprio teste.
 */
const CREDENCIAL_DE_MENTIRA_ACEITA = "credencial-de-mentira-aceita";
const CREDENCIAL_DE_MENTIRA_RECUSADA = "credencial-de-mentira-recusada";

process.env.DATABASE_URL = BANCO_INALCANCAVEL;
process.env.DATABASE_URL_DIRETA = BANCO_DIRETO_INALCANCAVEL;
process.env.REDIS_URL = CACHE_INALCANCAVEL;

const { criarApp, PREFIXO_DE_SAUDE } = await import("../../app.ts");
const { encerrarBanco } = await import("../../core/db.ts");
const { criarRegistrador, definirRegistrador } =
  await import("../../core/log.ts");
const {
  CAMINHO_PRONTO,
  CAMINHO_VIVO,
  criarRotasDeSaude,
  STATUS_NAO_PRONTO,
  verificarPronto,
} = await import("./health.routes.ts");
const { cacheResponde } = await import("./health.cache.ts");

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Cache de mentira: um servidor que fala o protocolo do Redis o suficiente. */
interface CacheDeMentira {
  readonly url: string;
  /** O que o servidor recebeu, para conferir que o `AUTH` foi mesmo enviado. */
  recebido(): string;
  encerrar(): Promise<void>;
}

/** Sobe um servidor local que responde ao que a verificação de saúde envia. */
async function subirCacheDeMentira(
  responder: (recebido: string, soquete: Socket) => void,
): Promise<CacheDeMentira> {
  let recebido = "";
  const servidor: Server = createServer((soquete) => {
    soquete.on("data", (pedaco: Buffer) => {
      recebido += pedaco.toString("utf8");
      responder(recebido, soquete);
    });
  });

  await new Promise<void>((resolver) => {
    servidor.listen(0, "127.0.0.1", resolver);
  });
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === "string") {
    throw new Error("o cache de mentira não conseguiu uma porta local");
  }

  return {
    url: `redis://127.0.0.1:${endereco.port}/0`,
    recebido: () => recebido,
    encerrar: () =>
      new Promise<void>((resolver) => {
        servidor.close(() => resolver());
      }),
  };
}

/** Cache de mentira que aceita qualquer senha e responde ao `PING`. */
function cacheQueResponde(): Promise<CacheDeMentira> {
  return subirCacheDeMentira((recebido, soquete) => {
    if (recebido.includes("AUTH")) soquete.write("+OK\r\n");
    if (recebido.includes("PING")) soquete.write("+PONG\r\n");
  });
}

/** Banco de mentira que aceita a transação. Serve só ao caminho feliz. */
function bancoQueResponde(): AcessoAoBanco {
  return {
    emTransacao: async <T>(acao: (tx: never) => Promise<T>) =>
      acao({ $queryRaw: async () => [{ um: 1 }] } as never),
    encerrar: async () => {},
  };
}

/** Registrador silencioso: o teste não precisa de linha de registro na tela. */
function silenciar(): void {
  definirRegistrador(
    criarRegistrador({
      nivel: "debug",
      ambiente: "test",
      destino: { write() {} },
    }),
  );
}

beforeAll(silenciar);

afterEach(silenciar);

afterAll(async () => {
  definirRegistrador(undefined);
  await encerrarBanco();
});

// ---------------------------------------------------------------------------
// AC-023 — a API sobe com o banco fora do ar
// ---------------------------------------------------------------------------

describe("verificações de saúde com o banco inalcançável", () => {
  it("@spec:AC-023 responde que está VIVA mesmo sem alcançar o banco", async () => {
    const resposta = await request(criarApp()).get(
      `${PREFIXO_DE_SAUDE}${CAMINHO_VIVO}`,
    );

    expect(resposta.status).toBe(200);
    expect(resposta.body.vivo).toBe(true);
    expect(resposta.body.servico).toBe("simpleclick-api");
    expect(typeof resposta.body.emPeSegundos).toBe("number");
  }, 20_000);

  it("@spec:AC-023 responde que NÃO está pronta, porque o banco não respondeu", async () => {
    const resposta = await request(criarApp()).get(
      `${PREFIXO_DE_SAUDE}${CAMINHO_PRONTO}`,
    );

    expect(resposta.status).toBe(STATUS_NAO_PRONTO);
    expect(resposta.body.pronto).toBe(false);
    expect(resposta.body.dependencias.banco).toBe("indisponivel");
  }, 20_000);

  it("@spec:AC-023 a verificação de vivo não consulta dependência nenhuma", async () => {
    let consultou = false;
    const acessoQueAcusa: AcessoAoBanco = {
      emTransacao: async () => {
        consultou = true;
        throw new Error("a verificação de vivo não pode tocar o banco");
      },
      encerrar: async () => {},
    };

    const app = express();
    app.use(
      "/v1/health",
      criarRotasDeSaude({
        acesso: acessoQueAcusa,
        urlDoCache: CACHE_INALCANCAVEL,
      }),
    );

    const resposta = await request(app).get(`/v1/health${CAMINHO_VIVO}`);

    expect(resposta.status).toBe(200);
    // Se vivo dependesse do banco, a primeira queda do banco faria o
    // orquestrador matar e recriar todas as instâncias da API de uma vez.
    expect(consultou).toBe(false);
  });

  it("@spec:AC-023 a resposta de pronto não conta qual banco nem qual máquina falhou", async () => {
    const resposta = await request(criarApp()).get(
      `${PREFIXO_DE_SAUDE}${CAMINHO_PRONTO}`,
    );

    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain("127.0.0.1");
    expect(corpo).not.toContain("postgres");
    expect(corpo).not.toContain("sc_app");
    expect(corpo).not.toMatch(/\bat\s+\S+\s+\(/);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// AC-023 — pronto só passa quando as DUAS dependências respondem
// ---------------------------------------------------------------------------

describe("pronto exige banco e cache respondendo", () => {
  it("@spec:AC-023 com banco de pé e cache fora, continua não pronta", async () => {
    const resultado = await verificarPronto({
      acesso: bancoQueResponde(),
      urlDoCache: CACHE_INALCANCAVEL,
      esperaMaximaMs: 3_000,
    });

    expect(resultado.pronto).toBe(false);
    expect(resultado.dependencias).toEqual({
      banco: "ok",
      cache: "indisponivel",
    });
  }, 20_000);

  it("@spec:AC-023 com cache de pé e banco fora, continua não pronta", async () => {
    const cache = await cacheQueResponde();
    try {
      const resultado = await verificarPronto({
        urlDoCache: cache.url,
        esperaMaximaMs: 5_000,
      });

      expect(resultado.pronto).toBe(false);
      expect(resultado.dependencias).toEqual({
        banco: "indisponivel",
        cache: "ok",
      });
    } finally {
      await cache.encerrar();
    }
  }, 20_000);

  it("@spec:AC-023 só depois de banco e cache responderem é que a API fica pronta", async () => {
    const cache = await cacheQueResponde();
    try {
      const app = express();
      app.use(
        "/v1/health",
        criarRotasDeSaude({
          acesso: bancoQueResponde(),
          urlDoCache: cache.url,
          esperaMaximaMs: 5_000,
        }),
      );

      const resposta = await request(app).get(`/v1/health${CAMINHO_PRONTO}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toEqual({
        pronto: true,
        dependencias: { banco: "ok", cache: "ok" },
      });
    } finally {
      await cache.encerrar();
    }
  }, 20_000);

  it("@spec:AC-023 a API passa de não pronta a pronta sem reiniciar, quando o banco volta", async () => {
    const cache = await cacheQueResponde();
    let bancoDePe = false;

    const bancoQueVolta: AcessoAoBanco = {
      emTransacao: async <T>(acao: (tx: never) => Promise<T>) => {
        if (!bancoDePe) throw new Error("conexão recusada");
        return acao({ $queryRaw: async () => [{ um: 1 }] } as never);
      },
      encerrar: async () => {},
    };

    try {
      const app = express();
      app.use(
        "/v1/health",
        criarRotasDeSaude({
          acesso: bancoQueVolta,
          urlDoCache: cache.url,
          esperaMaximaMs: 5_000,
        }),
      );

      const antes = await request(app).get(`/v1/health${CAMINHO_PRONTO}`);
      expect(antes.status).toBe(STATUS_NAO_PRONTO);

      bancoDePe = true;
      const depois = await request(app).get(`/v1/health${CAMINHO_PRONTO}`);

      // Guardar o resultado da verificação transformaria a rota numa mentira
      // com atraso: o mesmo processo precisa mudar de resposta.
      expect(depois.status).toBe(200);
      expect(depois.body.pronto).toBe(true);
    } finally {
      await cache.encerrar();
    }
  }, 20_000);

  it("@spec:AC-023 dependência que pendura vira indisponível dentro da espera", async () => {
    // Servidor que aceita a conexão e nunca responde: o modo de falha que trava
    // uma verificação de saúde ingênua para sempre.
    const mudo = await subirCacheDeMentira(() => {});
    const comecou = Date.now();
    try {
      const resultado = await verificarPronto({
        acesso: bancoQueResponde(),
        urlDoCache: mudo.url,
        esperaMaximaMs: 300,
      });

      expect(resultado.dependencias.cache).toBe("indisponivel");
      expect(Date.now() - comecou).toBeLessThan(5_000);
    } finally {
      await mudo.encerrar();
    }
  }, 20_000);
});

// ---------------------------------------------------------------------------
// AC-023 — a conversa com o cache
// ---------------------------------------------------------------------------

describe("verificação do cache", () => {
  it("@spec:AC-023 autentica antes de perguntar, quando a cadeia traz credencial", async () => {
    const cache = await cacheQueResponde();
    try {
      const comCredencial = new URL(cache.url);
      comCredencial.password = CREDENCIAL_DE_MENTIRA_ACEITA;

      expect(await cacheResponde(comCredencial.toString(), 3_000)).toBe(true);
      // Sem `AUTH`, um Redis protegido responderia `-NOAUTH` ao `PING` e a
      // verificação diria "cache no ar" sobre um cache que não atende.
      expect(cache.recebido()).toContain("AUTH");
      expect(cache.recebido()).toContain("PING");
    } finally {
      await cache.encerrar();
    }
  }, 20_000);

  it("@spec:AC-023 cache que recusa a credencial conta como indisponível", async () => {
    const recusa = await subirCacheDeMentira((_recebido, soquete) => {
      soquete.write("-NOAUTH Authentication required.\r\n");
    });
    try {
      const comCredencial = new URL(recusa.url);
      comCredencial.password = CREDENCIAL_DE_MENTIRA_RECUSADA;

      expect(await cacheResponde(comCredencial.toString(), 3_000)).toBe(false);
    } finally {
      await recusa.encerrar();
    }
  }, 20_000);

  it("@spec:AC-023 cadeia de cache inválida não derruba a verificação", async () => {
    expect(await cacheResponde("isto-nao-e-uma-url", 500)).toBe(false);
    expect(await cacheResponde(CACHE_INALCANCAVEL, 2_000)).toBe(false);
  }, 20_000);
});

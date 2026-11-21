import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import {
  abrirContextoRaiz,
  contextoAtual,
  executarComoRequisicao,
  executarNoContexto,
  marcasDaRequisicao,
} from "./contexto.ts";
import {
  criarRegistrador,
  definirRegistrador,
  EVENTOS,
  middlewareDeRegistro,
  type Registrador,
} from "./log.ts";

/**
 * Correções do #139 (pendências 3 e 4 do #133): o papel registrado é o da
 * requisição inteira, e a rota sai com o prefixo do sub-roteador.
 */

type Linha = Record<string, unknown>;

function coletar(): { registrador: Registrador; linhas: () => Linha[] } {
  const escritas: string[] = [];
  const registrador = criarRegistrador({
    nivel: "debug",
    ambiente: "test",
    destino: {
      write(m: string) {
        escritas.push(m);
      },
    },
  });
  return {
    registrador,
    linhas: () =>
      escritas
        .join("")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as Linha),
  };
}

afterEach(() => definirRegistrador(undefined));

const aguardar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("rota registrada com o prefixo do sub-roteador", () => {
  it("um 4xx tratado dentro do sub-roteador registra o molde completo", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);
    const app = express();
    app.use(middlewareDeRegistro());
    const roteador = express.Router();
    roteador.get("/:id/recusa", (_req, res) => {
      res.status(409).json({ ok: false });
    });
    app.use("/v1/pedidos", roteador);

    await request(app).get("/v1/pedidos/abc-123/recusa");
    await aguardar(10);

    const fim = coletor
      .linhas()
      .find((l) => l.evento === EVENTOS.requisicaoTerminou);
    expect(fim?.rota).toBe("/v1/pedidos/:id/recusa");
    expect(fim?.status).toBe(409);
    expect(JSON.stringify(coletor.linhas())).not.toContain("abc-123");
  });

  it("um erro lançado também registra o molde completo", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);
    const app = express();
    app.use(middlewareDeRegistro());
    const roteador = express.Router();
    roteador.get("/:id/falha", (_req, _res, next) => {
      next(new Error("x"));
    });
    app.use("/v1/pedidos", roteador);
    app.use(
      (
        _e: unknown,
        _req: express.Request,
        res: express.Response,
        _n: express.NextFunction,
      ) => {
        res.status(500).end();
      },
    );

    await request(app).get("/v1/pedidos/zzz-999/falha");
    await aguardar(10);

    const fim = coletor
      .linhas()
      .find((l) => l.evento === EVENTOS.requisicaoTerminou);
    expect(fim?.rota).toBe("/v1/pedidos/:id/falha");
  });
});

describe("papel e identificador da requisição inteira", () => {
  it("registra o papel de MAIOR privilégio visto, não o do contexto raiz", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);
    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/painel", async (_req, res) => {
      await executarComoRequisicao({ papel: "CUSTOMER", usuarioId: "u-1" }, () =>
        aguardar(1),
      );
      await executarComoRequisicao(
        { papel: "OWNER", usuarioId: "u-2", lojaId: "loja-1" },
        () => aguardar(1),
      );
      await executarComoRequisicao({ papel: "PUBLIC" }, () => aguardar(1));
      res.json({ ok: true });
    });

    await request(app).get("/painel");
    await aguardar(10);

    const linhas = coletor.linhas();
    const fim = linhas.find((l) => l.evento === EVENTOS.requisicaoTerminou);
    expect(fim?.papel).toBe("OWNER");
    expect(fim?.usuarioId).toBe("u-1"); // o primeiro definido
    expect(fim?.lojaId).toBe("loja-1");
    expect(new Set(linhas.map((l) => l.requisicaoId)).size).toBe(1);
  });

  it("sem acesso autenticado, o papel continua PUBLIC", async () => {
    const coletor = coletar();
    definirRegistrador(coletor.registrador);
    const app = express();
    app.use(middlewareDeRegistro());
    app.get("/aberta", (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get("/aberta");
    await aguardar(10);
    const fim = coletor
      .linhas()
      .find((l) => l.evento === EVENTOS.requisicaoTerminou);
    expect(fim?.papel).toBe("PUBLIC");
  });

  it("contexto aninhado mantém o id e NÃO herda transação nem credenciais", () => {
    const raiz = abrirContextoRaiz({
      tokenDoPedido: "token-de-mentira",
      chaveDoFechamento: "chave-de-mentira",
      sessaoDoCarrinho: "sessao-de-mentira",
      papel: "OWNER",
    });
    raiz.transacao = { aberta: true };

    executarNoContexto(raiz, () => {
      executarComoRequisicao({ papel: "PUBLIC" }, (filho) => {
        expect(filho.requisicaoId).toBe(raiz.requisicaoId);
        expect(filho.transacao).toBeUndefined();
        expect(filho.tokenDoPedido).toBeUndefined();
        expect(filho.chaveDoFechamento).toBeUndefined();
        expect(filho.sessaoDoCarrinho).toBeUndefined();
        expect(filho.papel).toBe("PUBLIC");
        expect(filho.lojaId).toBeUndefined();
        expect(contextoAtual()).toBe(filho);
      });
    });
  });

  it("duas raízes têm identificadores diferentes", () => {
    const a = abrirContextoRaiz();
    const b = abrirContextoRaiz();
    expect(a.requisicaoId).not.toBe(b.requisicaoId);
    // Fora de qualquer requisição, cada execução também é uma raiz nova.
    const ids = new Set([
      executarComoRequisicao({}, (c) => c.requisicaoId),
      executarComoRequisicao({}, (c) => c.requisicaoId),
    ]);
    expect(ids.size).toBe(2);
  });

  it("as marcas são uma cópia congelada", () => {
    const raiz = abrirContextoRaiz({ papel: "CUSTOMER" });
    executarNoContexto(raiz, () => {
      const marcas = marcasDaRequisicao();
      expect(marcas?.papel).toBe("CUSTOMER");
      expect(Object.isFrozen(marcas)).toBe(true);
    });
    expect(marcasDaRequisicao()).toBeUndefined();
  });
});

describe("campos do registro", () => {
  it("omite telefone mas deixa passar traceId e spanId", () => {
    const coletor = coletar();
    coletor.registrador.info("pedido.criado", {
      telefone: "5585999990000",
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
    });
    const [linha] = coletor.linhas();
    expect(linha?.telefone).toBe("[omitido]");
    expect(linha?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(linha?.spanId).toBe("b7ad6b7169203331");
  });
});

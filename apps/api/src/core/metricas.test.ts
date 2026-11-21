import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { criarApp } from "../app.ts";
import { middlewareDeRegistro } from "./log.ts";
import {
  BUCKETS_DE_DURACAO,
  criarMetricas,
  metodoEmEtiqueta,
} from "./metricas.ts";

/**
 * Métricas RED (card #139). Os valores sensíveis abaixo são inventados e
 * jamais podem aparecer no texto do `/metrics`.
 */

const ID_SENTINELA = "7f3c2d1e-aaaa-4bbb-8ccc-123456789abc";
const TOKEN_SENTINELA = "token-de-acompanhamento-sentinela-0001";
const TELEFONE_SENTINELA = "5585999990000";
const APELIDO_SENTINELA = "loja-do-fulano-sentinela";

/** App de teste: medidor + registro + sub-roteadores montados em prefixo fixo. */
function montar() {
  const metricas = criarMetricas();
  const app = express();
  app.use(metricas.middleware());
  app.use(middlewareDeRegistro());

  const vitrine = express.Router();
  vitrine.post("/:apelido/pedidos", (_req, res) => {
    res.status(201).json({ ok: true });
  });
  vitrine.get("/:apelido/pedido/:token", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  vitrine.get("/:apelido/recusa", (_req, res) => {
    res.status(409).json({ erro: "x" });
  });
  vitrine.get("/:apelido/falha", (_req, _res, next) => {
    next(new Error("quebrou"));
  });
  app.use("/v1/vitrine", vitrine);
  app.get("/nua", (_req, res) => {
    res.status(200).end();
  });
  // Resposta dada por um middleware, antes de rotear.
  app.use("/portao", (_req, res) => {
    res.status(403).json({ erro: "portao" });
  });
  app.use((_req, res) => {
    res.status(404).json({ erro: "nada" });
  });
  app.use(
    (
      _erro: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ erro: "interno" });
    },
  );
  return { app, metricas };
}

const servidores: { close: () => void }[] = [];
afterEach(() => {
  while (servidores.length > 0) servidores.pop()?.close();
});

describe("métricas RED por rota", () => {
  it("rotula com o molde completo, sem ids, tokens, telefone nem apelido", async () => {
    const { app, metricas } = montar();

    await request(app)
      .post(`/v1/vitrine/${APELIDO_SENTINELA}/pedidos?telefone=${TELEFONE_SENTINELA}`)
      .set("authorization", `Bearer ${TOKEN_SENTINELA}`)
      .send({ id: ID_SENTINELA });
    await request(app).get(
      `/v1/vitrine/${APELIDO_SENTINELA}/pedido/${TOKEN_SENTINELA}`,
    );

    const texto = await metricas.registro.metrics();
    expect(texto).toContain(
      'http_requests_total{method="POST",route="/v1/vitrine/:apelido/pedidos",status_code="201"} 1',
    );
    expect(texto).toContain(
      'route="/v1/vitrine/:apelido/pedido/:token",status_code="200"',
    );
    for (const sentinela of [
      ID_SENTINELA,
      TOKEN_SENTINELA,
      TELEFONE_SENTINELA,
      APELIDO_SENTINELA,
    ]) {
      expect(texto).not.toContain(sentinela);
    }
  });

  it("conta 4xx tratado e 5xx pelo molde completo (taxa e erros)", async () => {
    const { app, metricas } = montar();

    await request(app).get(`/v1/vitrine/${APELIDO_SENTINELA}/recusa`);
    await request(app).get(`/v1/vitrine/${APELIDO_SENTINELA}/falha`);

    const texto = await metricas.registro.metrics();
    expect(texto).toContain(
      'http_requests_total{method="GET",route="/v1/vitrine/:apelido/recusa",status_code="409"} 1',
    );
    expect(texto).toContain(
      'http_requests_total{method="GET",route="/v1/vitrine/:apelido/falha",status_code="500"} 1',
    );
  });

  it("separa 404 sem rota de resposta dada antes de rotear", async () => {
    const { app, metricas } = montar();

    await request(app).get("/qualquer/coisa/do/cliente");
    await request(app).get("/portao/x");
    await request(app).get("/nua");

    const texto = await metricas.registro.metrics();
    expect(texto).toContain('route="nao_encontrada",status_code="404"');
    expect(texto).toContain('route="nao_roteada",status_code="403"');
    expect(texto).toContain('route="/nua",status_code="200"');
    expect(texto).not.toContain("qualquer");
  });

  it("agrupa método fora da lista em OUTRO", async () => {
    expect(metodoEmEtiqueta("get")).toBe("GET");
    expect(metodoEmEtiqueta("PROPFIND")).toBe("OUTRO");

    const { app, metricas } = montar();
    await request(app).propfind("/nua");
    expect(await metricas.registro.metrics()).toContain('method="OUTRO"');
  });

  it("tem o bucket de 1 segundo, que é o limite do SLO", async () => {
    expect(BUCKETS_DE_DURACAO).toContain(1);
    const { app, metricas } = montar();
    await request(app).post(`/v1/vitrine/a/pedidos`).send({});

    const texto = await metricas.registro.metrics();
    expect(texto).toContain(
      'http_request_duration_seconds_bucket{le="1",method="POST",route="/v1/vitrine/:apelido/pedidos",status_code="201"} 1',
    );
    expect(texto).toContain("http_request_duration_seconds_count");
  });

  it("marca como cancelada a conexão que fecha antes da resposta", async () => {
    const metricas = criarMetricas();
    const app = express();
    app.use(metricas.middleware());
    app.get("/lenta", () => {
      /* nunca responde */
    });
    const servidor = app.listen(0);
    servidores.push(servidor);
    const { port } = servidor.address() as AddressInfo;

    const controle = new AbortController();
    const chamada = fetch(`http://127.0.0.1:${port}/lenta`, {
      signal: controle.signal,
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    controle.abort();
    await chamada;

    let texto = "";
    for (let i = 0; i < 40 && !texto.includes("cancelada"); i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      texto = await metricas.registro.metrics();
    }
    expect(texto).toContain('route="/lenta",status_code="cancelada"');
  });

  it("não deixa nenhum roteador montado em caminho com parâmetro", () => {
    // O molde é `baseUrl + path`; um `:param` no ponto de montagem não é
    // capturado pelo setter e quebraria o rótulo. Vigia o fonte do app.
    // (A leitura é feita aqui, em texto, para a guarda não depender de rede.)
    const fonte = readFileSync(
      new URL("../app.ts", import.meta.url),
      "utf8",
    );
    const montagens = [...fonte.matchAll(/app\.use\(\s*"([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    );
    expect(montagens.length).toBeGreaterThan(5);
    // Exceção conhecida: `/v1/lojas/:apelido` monta o PORTÃO da equipe, que é
    // um middleware (não declara rota); o que ele responde sai `nao_roteada`.
    const excecoes = new Set(["/v1/lojas/:apelido"]);
    for (const caminho of montagens.filter((m) => !excecoes.has(m))) {
      expect(caminho, `montagem com :param em ${caminho}`).not.toContain(":");
    }
  });
});

describe("rota /metrics do app", () => {
  const TOKEN = "t".repeat(40);

  it("não existe por padrão (404) e não mede nada", async () => {
    const app = criarApp({ origens: [] });
    expect((await request(app).get("/metrics")).status).toBe(404);
  });

  it("fica desligada quando o acesso é 'desligado'", async () => {
    const app = criarApp({
      origens: [],
      observabilidade: { metricas: { acesso: { tipo: "desligado" } } },
    });
    expect((await request(app).get("/metrics")).status).toBe(404);
  });

  it("exige o Bearer exato quando há token: 401 sem ele, 200 com ele", async () => {
    const app = criarApp({
      origens: [],
      observabilidade: { metricas: { acesso: { tipo: "token", token: TOKEN } } },
    });
    expect((await request(app).get("/metrics")).status).toBe(401);
    expect(
      (await request(app).get("/metrics").set("authorization", "Bearer errado"))
        .status,
    ).toBe(401);
    expect(
      (await request(app).get("/metrics").set("authorization", TOKEN)).status,
    ).toBe(401);

    const ok = await request(app)
      .get("/metrics")
      .set("authorization", `Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("text/plain");
    expect(ok.headers["cache-control"]).toBe("no-store");
  });

  it("modo aberto responde sem token e expõe os RED da própria API", async () => {
    const app = criarApp({
      origens: [],
      observabilidade: { metricas: { acesso: { tipo: "aberto" } } },
    });
    await request(app).get("/");
    const resposta = await request(app).get("/metrics");
    expect(resposta.status).toBe(200);
    expect(resposta.text).toContain("# TYPE http_requests_total counter");
    expect(resposta.text).toContain("# TYPE http_request_duration_seconds histogram");
    expect(resposta.text).toContain('route="/"');
    // O próprio /metrics não se mede.
    expect(resposta.text).not.toContain('route="/metrics"');
  });
});

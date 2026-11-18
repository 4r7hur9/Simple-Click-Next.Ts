/**
 * Card #134: a guarda de origem do #111 nas escritas de `/api/loja/*` e
 * `/api/auth/*`. A API é trocada por um `fetch` que só anota a chamada: nos
 * casos recusados, nenhuma chamada pode existir; nos legítimos, o pedido
 * segue (a primeira ida à API acontece).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as auth from "../src/app/api/auth/[...action]/route.ts";
import * as secao from "../src/app/api/loja/[secao]/route.ts";
import * as tema from "../src/app/api/loja/tema/route.ts";
import * as feed from "../src/app/api/loja/feed/route.ts";
import * as comentarios from "../src/app/api/loja/comentarios/[[...caminho]]/route.ts";
import * as aprovacao from "../src/app/api/loja/aprovacao/route.ts";
import * as imagem from "../src/app/api/loja/imagem/[tipo]/route.ts";
import * as midia from "../src/app/api/loja/midia/[...caminho]/route.ts";

const SITE = "https://simpleclick.localhost";
const UUID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";
const COOKIE = "sc_access=token-da-pessoa; sc_refresh=renovacao-da-pessoa";
const JSON_ = { "content-type": "application/json" };

let chamadas: string[];

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    chamadas.push(String(url));
    return Response.json({ ok: true });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

interface Pedido {
  readonly metodo: string;
  readonly cabecalhos?: Record<string, string>;
  readonly corpo?: BodyInit;
  readonly semCookie?: boolean;
}

function pedido(caminho: string, p: Pedido): Request {
  return new Request(`${SITE}${caminho}`, {
    method: p.metodo,
    headers: {
      ...(p.semCookie === true ? {} : { cookie: COOKIE }),
      ...p.cabecalhos,
    },
    ...(p.corpo === undefined ? {} : { body: p.corpo }),
  });
}

type Rota = (requisicao: Request) => Promise<Response>;

/** Cada escrita das rotas, já com o contexto de parâmetros que ela pede. */
const ESCRITAS_JSON: readonly (readonly [string, string, Rota])[] = [
  [
    "PUT /api/loja/contato",
    "/api/loja/contato",
    (r) => secao.PUT(r, { params: Promise.resolve({ secao: "contato" }) }),
  ],
  ["PUT /api/loja/tema", "/api/loja/tema", (r) => tema.PUT(r)],
  ["PUT /api/loja/feed", "/api/loja/feed", (r) => feed.PUT(r)],
  [
    "PUT /api/loja/comentarios/configuracao",
    "/api/loja/comentarios/configuracao",
    (r) =>
      comentarios.PUT(r, {
        params: Promise.resolve({ caminho: ["configuracao"] }),
      }),
  ],
  ["PUT /api/loja/aprovacao", "/api/loja/aprovacao", (r) => aprovacao.PUT(r)],
  [
    "POST /api/auth/login",
    "/api/auth/login",
    (r) => auth.POST(r, { params: Promise.resolve({ action: ["login"] }) }),
  ],
];

function metodoDe(nome: string): string {
  return nome.split(" ")[0] ?? "POST";
}

describe("escritas JSON de /api/loja e /api/auth (card #134)", () => {
  it.each(
    ESCRITAS_JSON.flatMap(([n, c, r]) =>
      ["cross-site", "same-site", "none"].map((v) => [n, c, r, v] as const),
    ),
  )(
    "[CA-1] %s com Sec-Fetch-Site %s dá 403 sem chamar a API",
    async (nome, caminho, rota, valor) => {
      const r = await rota(
        pedido(caminho, {
          metodo: metodoDe(nome),
          cabecalhos: { ...JSON_, "sec-fetch-site": valor },
          corpo: "{}",
        }),
      );
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ erro: "origem_recusada" });
      expect(chamadas).toHaveLength(0);
    },
  );

  it.each(
    ESCRITAS_JSON.flatMap(([n, c, r]) =>
      ["null", "https://outro-site.example"].map((o) => [n, c, r, o] as const),
    ),
  )(
    "[CA-1] %s com Origin %s (sem Sec-Fetch-Site) dá 403",
    async (nome, caminho, rota, origem) => {
      const r = await rota(
        pedido(caminho, {
          metodo: metodoDe(nome),
          cabecalhos: { ...JSON_, origin: origem },
          corpo: "{}",
        }),
      );
      expect(r.status).toBe(403);
      expect(chamadas).toHaveLength(0);
    },
  );

  it.each(
    ESCRITAS_JSON.flatMap(([n, c, r]) =>
      ["text/plain", "application/x-www-form-urlencoded"].map(
        (t) => [n, c, r, t] as const,
      ),
    ),
  )(
    "[CA-2] %s com corpo %s dá 415 sem chamar a API",
    async (nome, caminho, rota, tipo) => {
      const r = await rota(
        pedido(caminho, {
          metodo: metodoDe(nome),
          cabecalhos: { "content-type": tipo, "sec-fetch-site": "same-origin" },
          corpo: "a=1",
        }),
      );
      expect(r.status).toBe(415);
      expect(await r.json()).toEqual({ erro: "tipo_nao_suportado" });
      expect(chamadas).toHaveLength(0);
    },
  );

  it.each(ESCRITAS_JSON)(
    "[CA-3] %s da mesma origem com JSON segue para a API",
    async (nome, caminho, rota) => {
      const r = await rota(
        pedido(caminho, {
          metodo: metodoDe(nome),
          cabecalhos: { ...JSON_, "sec-fetch-site": "same-origin" },
          corpo: JSON.stringify({ email: "a@b.c", senha: "x" }),
        }),
      );
      expect([403, 415]).not.toContain(r.status);
      expect(chamadas.length).toBeGreaterThan(0);
    },
  );

  it("[CA-3] Origin igual ao site, sem Sec-Fetch-Site, segue", async () => {
    const r = await tema.PUT(
      pedido("/api/loja/tema", {
        metodo: "PUT",
        cabecalhos: { ...JSON_, origin: SITE },
        corpo: "{}",
      }),
    );
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });

  it("[CA-3] POST sem corpo da mesma origem segue (reenviar a loja)", async () => {
    const r = await aprovacao.POST(
      pedido("/api/loja/aprovacao", {
        metodo: "POST",
        cabecalhos: { ...JSON_, "sec-fetch-site": "same-origin" },
      }),
    );
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });

  it("[CA-3] DELETE de comentário da mesma origem segue", async () => {
    const r = await comentarios.DELETE(
      pedido(`/api/loja/comentarios/${UUID}`, {
        metodo: "DELETE",
        cabecalhos: { "sec-fetch-site": "same-origin" },
      }),
      { params: Promise.resolve({ caminho: [UUID] }) },
    );
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });

  it("[CA-4] a recusa vem antes da sessão: 403 mesmo sem cookie", async () => {
    const r = await secao.PUT(
      pedido("/api/loja/contato", {
        metodo: "PUT",
        semCookie: true,
        cabecalhos: { ...JSON_, "sec-fetch-site": "cross-site" },
        corpo: "{}",
      }),
      { params: Promise.resolve({ secao: "contato" }) },
    );
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-4] leitura (GET) não passa pela guarda", async () => {
    const r = await tema.GET(
      pedido("/api/loja/tema", {
        metodo: "GET",
        cabecalhos: { "sec-fetch-site": "cross-site" },
      }),
    );
    expect(r.status).not.toBe(403);
  });
});

describe("formulários de acesso sem script (card #134)", () => {
  const formulario = (cabecalhos: Record<string, string>) =>
    auth.POST(
      pedido("/api/auth/recuperar-senha", {
        metodo: "POST",
        semCookie: true,
        cabecalhos: {
          "content-type": "application/x-www-form-urlencoded",
          ...cabecalhos,
        },
        corpo: "email=pessoa%40exemplo.test",
      }),
      { params: Promise.resolve({ action: ["recuperar-senha"] }) },
    );

  it.each([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ origin: "null" }],
    [{ origin: "https://outro-site.example" }],
  ])("[CA-1] formulário de fora (%o) dá 403 sem chamar a API", async (c) => {
    const r = await formulario(c);
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-3] formulário form-urlencoded da mesma origem segue", async () => {
    const r = await formulario({
      "sec-fetch-site": "same-origin",
      origin: SITE,
    });
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });
});

describe("renovar pelo servidor do site (card #134)", () => {
  it("[CA-3] o pedido igual ao de renovar-acesso (só cookie) segue", async () => {
    const r = await auth.POST(
      new Request(`${SITE}/api/auth/renovar`, {
        method: "POST",
        headers: { cookie: "sc_refresh=renovacao", "sec-fetch-mode": "cors" },
      }),
      { params: Promise.resolve({ action: ["renovar"] }) },
    );
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });
});

describe("envio de imagem e vídeo: só a origem (card #134)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const enviarLogo = (cabecalhos: Record<string, string>) =>
    imagem.PUT(
      pedido("/api/loja/imagem/logo", {
        metodo: "PUT",
        cabecalhos: { "content-type": "image/png", ...cabecalhos },
        corpo: png,
      }),
      { params: Promise.resolve({ tipo: "logo" }) },
    );

  it.each([
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "cross-site" }],
    [{ origin: "null" }],
  ])("[CA-1] imagem de fora (%o) dá 403 sem chamar a API", async (c) => {
    const r = await enviarLogo(c);
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-3] imagem image/png da mesma origem segue (não é 415)", async () => {
    const r = await enviarLogo({ "sec-fetch-site": "same-origin" });
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });

  const stories = (cabecalhos: Record<string, string>) =>
    midia.POST(
      pedido("/api/loja/midia/stories", {
        metodo: "POST",
        cabecalhos: { "content-type": "video/mp4", ...cabecalhos },
        corpo: png,
      }),
      { params: Promise.resolve({ caminho: ["stories"] }) },
    );

  it("[CA-1] vídeo de outro site dá 403 sem chamar a API", async () => {
    const r = await stories({ "sec-fetch-site": "cross-site" });
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-3] vídeo video/mp4 da mesma origem segue (não é 415)", async () => {
    const r = await stories({ "sec-fetch-site": "same-origin" });
    expect([403, 415]).not.toContain(r.status);
    expect(chamadas.length).toBeGreaterThan(0);
  });
});

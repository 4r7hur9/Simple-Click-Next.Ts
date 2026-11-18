/**
 * Proxy da conta (card #111): tabela caminho × método e proteção contra
 * pedido de fora (AC-11125, AC-11126). A API é trocada por um `fetch` que só
 * anota a chamada: nos casos recusados, nenhuma chamada pode existir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as resto from "../src/app/api/conta/[...resto]/route.ts";
import * as enderecos from "../src/app/api/conta/enderecos/route.ts";
import * as enderecoPorId from "../src/app/api/conta/enderecos/[id]/route.ts";

const SITE = "https://simpleclick.localhost";
const UUID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";
const COOKIE = "sc_access=token-da-pessoa";

let chamadas: { url: string; metodo: string }[];

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(url), metodo: init?.method ?? "GET" });
    return Response.json({ ok: true });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

interface Pedido {
  readonly metodo?: string;
  readonly cabecalhos?: Record<string, string>;
  readonly corpo?: string;
  readonly cookie?: boolean;
}

function pedido(caminho: string, p: Pedido = {}): Request {
  const metodo = p.metodo ?? "GET";
  return new Request(`${SITE}/api/conta/${caminho}`, {
    method: metodo,
    headers: {
      ...(p.cookie === false ? {} : { cookie: COOKIE }),
      "sec-fetch-site": "same-origin",
      ...p.cabecalhos,
    },
    ...(p.corpo === undefined ? {} : { body: p.corpo }),
  });
}

async function chamar(caminho: string, p: Pedido = {}): Promise<Response> {
  const metodo = (p.metodo ?? "GET") as "GET" | "POST" | "PATCH" | "DELETE";
  const partes = caminho.split("/").map((s) => decodeURIComponent(s));
  return resto[metodo](pedido(caminho, p), {
    params: Promise.resolve({ resto: partes }),
  });
}

const JSON_ = { "content-type": "application/json" };

describe("a tabela caminho × método (AC-11125)", () => {
  it("[CA-25] @spec:AC-11125 tirar um produto favorito chega à API pelo caminho exato", async () => {
    const r = await chamar(`favoritos/produtos/${UUID}`, { metodo: "DELETE" });
    expect(r.status).toBe(200);
    expect(chamadas).toEqual([
      {
        url: expect.stringContaining(`/v1/conta/favoritos/produtos/${UUID}`),
        metodo: "DELETE",
      },
    ]);
  });

  it.each([
    ["GET", "dados"],
    ["PATCH", "dados"],
    ["POST", "senha"],
    ["GET", "sessoes"],
    ["DELETE", `sessoes/${UUID}`],
    ["POST", "aplicativo/desativar"],
    ["POST", "excluir"],
    ["GET", "aceites"],
    ["POST", "aceites"],
    ["POST", "privacidade/exportar"],
    ["GET", "favoritos"],
    ["GET", "recentes"],
    ["POST", "favoritos/moda-feminina"],
    ["DELETE", "favoritos/moda-feminina"],
    ["GET", "tutorial"],
    ["POST", "tutorial"],
  ])(
    "[CA-25] @spec:AC-11125 %s %s continua passando",
    async (metodo, caminho) => {
      const comCorpo =
        metodo === "PATCH" ||
        (metodo === "POST" && !caminho.startsWith("favoritos"));
      const r = await chamar(caminho, {
        metodo,
        ...(comCorpo ? { cabecalhos: JSON_, corpo: "{}" } : {}),
      });
      expect(r.status).toBe(200);
      expect(chamadas).toHaveLength(1);
    },
  );

  it.each([
    ["GET", "favoritos/produtos/x/y"],
    ["DELETE", "favoritos/produtos/x/y"],
    ["DELETE", "favoritos/produtos"],
    ["DELETE", "favoritos/produtos/nao-e-uuid"],
    ["POST", `favoritos/produtos/${UUID}`],
    ["GET", "favoritos/produtos/%2F"],
    ["GET", "feed/favoritos"],
    ["GET", "metricas"],
    ["GET", "excluir"],
    ["HEAD", "excluir"],
    ["DELETE", "dados"],
    ["POST", "dados"],
    ["PATCH", "sessoes"],
    ["DELETE", "aceites"],
    ["GET", "favoritos/moda-feminina"],
    ["PUT", "dados"],
  ])(
    "[CA-25] @spec:AC-11125 %s %s é recusado sem chamar a API",
    async (metodo, caminho) => {
      const partes = caminho.split("/").map((s) => decodeURIComponent(s));
      const handler = (
        resto as Record<
          string,
          (
            r: Request,
            c: { params: Promise<{ resto: string[] }> },
          ) => Promise<Response>
        >
      )[metodo];
      const r =
        handler === undefined
          ? Response.json({}, { status: 404 }) // o Next responde 405 a método sem handler
          : await handler(pedido(caminho, { metodo }), {
              params: Promise.resolve({ resto: partes }),
            });
      expect([404, 405]).toContain(r.status);
      expect(chamadas).toHaveLength(0);
    },
  );

  it("[CA-25] @spec:AC-11125 segmento '..' ou '.' nunca atravessa", async () => {
    for (const caminho of ["..", ".", "dados/.."]) {
      const r = await chamar(caminho);
      expect(r.status).toBe(404);
    }
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-25] @spec:AC-11125 sem cookie, 401 sem chamar a API", async () => {
    const r = await chamar("dados", { cookie: false });
    expect(r.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });
});

describe("pedido de fora do site é recusado (AC-11126)", () => {
  const ESCRITA = { metodo: "PATCH" as const, corpo: "{}" };

  it.each([["cross-site"], ["same-site"], ["none"]])(
    "[CA-26] @spec:AC-11126 Sec-Fetch-Site %s dá 403",
    async (valor) => {
      const r = await chamar("dados", {
        ...ESCRITA,
        cabecalhos: { ...JSON_, "sec-fetch-site": valor },
      });
      expect(r.status).toBe(403);
      expect(chamadas).toHaveLength(0);
    },
  );

  it.each([
    ["null"],
    ["https://outro-site.example"],
    ["https://simpleclick.localhost:8443"],
  ])(
    "[CA-26] @spec:AC-11126 Origin %s dá 403 quando não há Sec-Fetch-Site",
    async (origem) => {
      const req = new Request(`${SITE}/api/conta/dados`, {
        method: "PATCH",
        headers: { cookie: COOKIE, origin: origem, ...JSON_ },
        body: "{}",
      });
      const r = await resto.PATCH(req, {
        params: Promise.resolve({ resto: ["dados"] }),
      });
      expect(r.status).toBe(403);
      expect(chamadas).toHaveLength(0);
    },
  );

  it("[CA-26] @spec:AC-11126 a recusa vem antes do 401", async () => {
    const r = await chamar("dados", {
      ...ESCRITA,
      cookie: false,
      cabecalhos: { ...JSON_, "sec-fetch-site": "cross-site" },
    });
    expect(r.status).toBe(403);
  });

  it("[CA-26] @spec:AC-11126 mesma origem com charset passa", async () => {
    const r = await chamar("dados", {
      ...ESCRITA,
      cabecalhos: { "content-type": "Application/JSON; charset=utf-8" },
    });
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(1);
  });

  it("[CA-26] @spec:AC-11126 Origin igual ao site passa sem Sec-Fetch-Site", async () => {
    const req = new Request(`${SITE}/api/conta/dados`, {
      method: "PATCH",
      headers: { cookie: COOKIE, origin: SITE, ...JSON_ },
      body: "{}",
    });
    const r = await resto.PATCH(req, {
      params: Promise.resolve({ resto: ["dados"] }),
    });
    expect(r.status).toBe(200);
  });

  it.each([
    ["text/plain"],
    ["application/x-www-form-urlencoded"],
    ["multipart/form-data; boundary=x"],
  ])("[CA-26] @spec:AC-11126 corpo %s dá 415", async (tipo) => {
    const r = await chamar("dados", {
      ...ESCRITA,
      cabecalhos: { "content-type": tipo },
    });
    expect(r.status).toBe(415);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-26] @spec:AC-11126 corpo sem tipo dá 415, e sem corpo passa (favoritar sem corpo)", async () => {
    const semTipo = await chamar("dados", { ...ESCRITA });
    expect(semTipo.status).toBe(415);
    const semCorpo = await chamar("favoritos/moda-feminina", {
      metodo: "POST",
    });
    expect(semCorpo.status).toBe(200);
    expect(chamadas).toHaveLength(1);
  });
});

describe("endereços (AC-11125, AC-11126)", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it.each([[".."], ["."], ["%2e%2e"], ["nao-e-uuid"]])(
    "[CA-25] @spec:AC-11125 o id '%s' é recusado sem chamar a API",
    async (id) => {
      const put = await enderecoPorId.PUT(
        pedido("enderecos/x", {
          metodo: "PUT",
          cabecalhos: JSON_,
          corpo: "{}",
        }),
        ctx(decodeURIComponent(id)),
      );
      const del = await enderecoPorId.DELETE(
        pedido("enderecos/x", { metodo: "DELETE" }),
        ctx(decodeURIComponent(id)),
      );
      expect([put.status, del.status]).toEqual([404, 404]);
      expect(chamadas).toHaveLength(0);
    },
  );

  it("[CA-26] @spec:AC-11126 PUT e DELETE de fora dão 403; POST de fora também", async () => {
    const fora = { "sec-fetch-site": "cross-site" };
    const put = await enderecoPorId.PUT(
      pedido("enderecos/x", {
        metodo: "PUT",
        cabecalhos: { ...JSON_, ...fora },
        corpo: "{}",
      }),
      ctx(UUID),
    );
    const del = await enderecoPorId.DELETE(
      pedido("enderecos/x", { metodo: "DELETE", cabecalhos: fora }),
      ctx(UUID),
    );
    const post = await enderecos.POST(
      pedido("enderecos", {
        metodo: "POST",
        cabecalhos: { ...JSON_, ...fora },
        corpo: "{}",
      }),
    );
    expect([put.status, del.status, post.status]).toEqual([403, 403, 403]);
    expect(chamadas).toHaveLength(0);
  });

  it("[CA-25] @spec:AC-11125 o uso normal do site continua passando", async () => {
    const lista = await enderecos.GET(pedido("enderecos"));
    const novo = await enderecos.POST(
      pedido("enderecos", { metodo: "POST", cabecalhos: JSON_, corpo: "{}" }),
    );
    const troca = await enderecoPorId.PUT(
      pedido(`enderecos/${UUID}`, {
        metodo: "PUT",
        cabecalhos: JSON_,
        corpo: "{}",
      }),
      ctx(UUID),
    );
    const apaga = await enderecoPorId.DELETE(
      pedido(`enderecos/${UUID}`, { metodo: "DELETE" }),
      ctx(UUID),
    );
    expect([lista.status, novo.status, troca.status, apaga.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(chamadas).toHaveLength(4);
  });
});

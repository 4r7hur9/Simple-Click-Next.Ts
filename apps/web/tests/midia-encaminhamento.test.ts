/**
 * O encaminhamento da mídia do painel (card #48): só os caminhos da galeria,
 * dos vídeos e dos stories passam, para a loja DA SESSÃO, com os bytes como
 * chegaram.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/server/loja-do-painel.ts", () => ({
  sessaoParaEncaminhar: vi.fn(async () => ({
    token: "tok",
    apelido: "pastelaria-da-vila",
  })),
}));
vi.mock("../src/server/api-client.ts", () => ({
  enderecoDaApi: () => "http://api.test",
}));

import {
  DELETE,
  GET,
  POST,
} from "../src/app/api/loja/midia/[...caminho]/route";

const PRODUTO = "00000000-0000-4000-8000-000000000001";

function contexto(caminho: string) {
  return { params: Promise.resolve({ caminho: caminho.split("/") }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("encaminhamento da mídia do painel", () => {
  it("leva o vídeo cru para a loja da sessão, com a consulta", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", buscar);
    const bytes = new Uint8Array([1, 2, 3]);
    const resposta = await POST(
      new Request(
        `http://site.test/api/loja/midia/catalogo/produtos/${PRODUTO}/videos?duracaoSegundos=12`,
        { method: "POST", body: bytes, headers: { "content-type": "video/mp4" } },
      ),
      contexto(`catalogo/produtos/${PRODUTO}/videos`),
    );
    expect(resposta.status).toBe(201);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `http://api.test/v1/lojas/pastelaria-da-vila/catalogo/produtos/${PRODUTO}/videos?duracaoSegundos=12`,
    );
    expect(new Headers(init.headers).get("content-type")).toBe("video/mp4");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes);
  });

  it("stories: lista e apaga", async () => {
    const buscar = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", buscar);
    await GET(new Request("http://site.test/api/loja/midia/stories"), contexto("stories"));
    await DELETE(
      new Request(`http://site.test/api/loja/midia/stories/${PRODUTO}`, { method: "DELETE" }),
      contexto(`stories/${PRODUTO}`),
    );
    expect(buscar.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "http://api.test/v1/lojas/pastelaria-da-vila/stories",
      `http://api.test/v1/lojas/pastelaria-da-vila/stories/${PRODUTO}`,
    ]);
  });

  it("caminho fora da lista não sai do site", async () => {
    const buscar = vi.fn();
    vi.stubGlobal("fetch", buscar);
    const resposta = await DELETE(
      new Request("http://site.test/api/loja/midia/equipe/x", { method: "DELETE" }),
      contexto("equipe/x"),
    );
    expect(resposta.status).toBe(404);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("limites vão para a rota pública", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", buscar);
    await GET(new Request("http://site.test/api/loja/midia/limites"), contexto("limites"));
    expect((buscar.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://api.test/v1/midia/limites",
    );
  });
});

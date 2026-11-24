/**
 * Card #8: o tutorial do cliente (POST /api/conta/tutorial) levava 403
 * `origem_nao_autorizada` no staging, e o GET /api/conta/aceites dava 401 em
 * toda página anônima.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/conta/[...resto]/route.ts";

const SITE_PUBLICO = "https://staging.simplclick.com.br";
// Atrás do proxy do Railway, `request.url` traz o endereço INTERNO do servidor.
const URL_INTERNA = "http://localhost:8080";

afterEach(() => vi.unstubAllGlobals());

function contexto(...resto: string[]) {
  return { params: Promise.resolve({ resto }) };
}

describe("tutorial e aceites na ponte da conta", () => {
  it("[CA-1] o tutorial salva com a origem do próprio site, não a do endereço interno", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", buscar);
    const resposta = await POST(
      new Request(`${URL_INTERNA}/api/conta/tutorial`, {
        method: "POST",
        headers: {
          origin: SITE_PUBLICO,
          host: "staging.simplclick.com.br",
          cookie: "sc_access=token",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: "{}",
      }),
      contexto("tutorial"),
    );
    expect(resposta.status).toBe(200);
    const [, pedido] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect((pedido.headers as Record<string, string>)["origin"]).toBe(
      SITE_PUBLICO,
    );
  });

  it("[CA-2] sem sessão, GET aceites responde 200 sem pendências e sem chamar a API", async () => {
    const buscar = vi.fn();
    vi.stubGlobal("fetch", buscar);
    const resposta = await GET(
      new Request(`${SITE_PUBLICO}/api/conta/aceites`, { method: "GET" }),
      contexto("aceites"),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      pendentes: [],
      anonimo: true,
    });
    expect(buscar).not.toHaveBeenCalled();
  });
});

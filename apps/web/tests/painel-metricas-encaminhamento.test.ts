/**
 * Prova do encaminhamento das métricas (T-803).
 *
 * A tela fala com `/api/painel/metricas` do próprio site; a rota lê o token
 * do cookie httpOnly (P-008) e leva a MESMA consulta à API. O que se prova
 * aqui é o caminho da rota inteiro — sessão, endereço, cabeçalhos e corpo —,
 * com a API trocada por uma resposta escrita pelo teste.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as metricas } from "../src/app/api/painel/metricas/route.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface ChamadaNaApi {
  readonly url: string;
  readonly cabecalhos: Headers;
  readonly metodo: string;
}

function simularApi(resposta: () => Response): ChamadaNaApi[] {
  const chamadas: ChamadaNaApi[] = [];
  vi.stubGlobal(
    "fetch",
    async (endereco: RequestInfo | URL, init?: RequestInit) => {
      chamadas.push({
        url: String(endereco),
        cabecalhos: new Headers(init?.headers),
        metodo: init?.method ?? "GET",
      });
      return resposta();
    },
  );
  return chamadas;
}

function pedidoDaTela(caminho: string, cookie?: string): Request {
  return new Request(`https://simpleclick.localhost${caminho}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}

describe("encaminhamento das métricas", () => {
  it("sem sessão não chega à API", async () => {
    const chamadas = simularApi(() => new Response("{}"));
    const resposta = await metricas(pedidoDaTela("/api/painel/metricas"));

    expect(resposta.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("leva o token e a consulta inteira, e devolve a resposta da API sem cache", async () => {
    const chamadas = simularApi(() =>
      Response.json(
        { erro: "periodo_invalido", explicacao: "x" },
        { status: 400 },
      ),
    );
    const resposta = await metricas(
      pedidoDaTela(
        "/api/painel/metricas?periodo=personalizado&de=2026-08-01&ate=2026-08-15",
        "outro=1; sc_access=token-do-dono",
      ),
    );

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.metodo).toBe("GET");
    expect(chamadas[0]?.url).toMatch(
      /\/v1\/lojas\/[^/]+\/metricas\?periodo=personalizado&de=2026-08-01&ate=2026-08-15$/,
    );
    expect(chamadas[0]?.cabecalhos.get("authorization")).toBe(
      "Bearer token-do-dono",
    );
    expect(resposta.status).toBe(400);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(await resposta.json()).toEqual({
      erro: "periodo_invalido",
      explicacao: "x",
    });
  });

  it("não filtra a consulta: a loja informada na requisição chega à API, que é quem a recusa", async () => {
    const chamadas = simularApi(() =>
      Response.json({ erro: "entrada_invalida" }, { status: 400 }),
    );
    const resposta = await metricas(
      pedidoDaTela(
        "/api/painel/metricas?periodo=hoje&lojaId=outra",
        "sc_access=token-do-dono",
      ),
    );

    expect(chamadas[0]?.url).toContain("lojaId=outra");
    expect(resposta.status).toBe(400);
  });
});

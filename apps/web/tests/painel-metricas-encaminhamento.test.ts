/**
 * Prova dos encaminhamentos das métricas (T-803, T-808).
 *
 * A tela fala com `/api/painel/metricas` do próprio site; a rota lê o token
 * do cookie httpOnly (P-008), descobre a loja pela sessão (`GET /v1/eu`,
 * T-115) e leva a MESMA consulta à API. O que se prova
 * aqui é o caminho da rota inteiro — sessão, endereço, cabeçalhos e corpo —,
 * com a API trocada por uma resposta escrita pelo teste.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as metricas } from "../src/app/api/painel/metricas/route.ts";
import { GET as exportar } from "../src/app/api/painel/metricas/exportar/route.ts";
import { LOJA_DA_SESSAO, quemSouEu } from "./apoio-da-loja-da-sessao";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface ChamadaNaApi {
  readonly url: string;
  readonly cabecalhos: Headers;
  readonly metodo: string;
}

/**
 * A API de mentira: `GET /v1/eu` responde a dona com a loja da sessão, e as
 * demais chamadas (as que a prova confere) recebem a resposta do teste.
 */
function simularApi(resposta: () => Response): ChamadaNaApi[] {
  const chamadas: ChamadaNaApi[] = [];
  vi.stubGlobal(
    "fetch",
    async (endereco: RequestInfo | URL, init?: RequestInit) => {
      if (String(endereco).endsWith("/v1/eu")) {
        return Response.json(quemSouEu());
      }
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
      new RegExp(
        `/v1/lojas/${LOJA_DA_SESSAO.apelido}/metricas\\?periodo=personalizado&de=2026-08-01&ate=2026-08-15$`,
      ),
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

  it("a planilha chega com o nome do arquivo e a marca de codificação intactos", async () => {
    const csv = "﻿data;numero\r\n27/09/2026;1\r\n";
    const chamadas = simularApi(
      () =>
        new Response(csv, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="pedidos-loja-2026-09-21-a-2026-09-27.csv"',
            "x-quantidade-de-pedidos": "1",
          },
        }),
    );
    const resposta = await exportar(
      pedidoDaTela(
        "/api/painel/metricas/exportar?periodo=7d",
        "sc_access=token-do-dono",
      ),
    );

    expect(chamadas[0]?.url).toMatch(
      new RegExp(
        `/v1/lojas/${LOJA_DA_SESSAO.apelido}/metricas/exportar\\?periodo=7d$`,
      ),
    );
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(resposta.headers.get("content-disposition")).toContain(
      "pedidos-loja-2026-09-21-a-2026-09-27.csv",
    );
    expect(resposta.headers.get("x-quantidade-de-pedidos")).toBe("1");
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

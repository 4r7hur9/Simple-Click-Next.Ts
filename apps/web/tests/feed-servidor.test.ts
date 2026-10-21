/**
 * Prova das leituras do feed no servidor (card #37), com uma resposta de
 * mentira no lugar da rede: o token vai no cabeçalho, resposta fora do
 * contrato vira "indisponível" e token vencido não esconde a lista pública.
 */
import { describe, expect, it, vi } from "vitest";

import {
  buscarLojasDaContaNoFeed,
  buscarLojasDoFeed,
  buscarProdutosDoFeed,
  buscarTiposDeNegocio,
} from "../src/server/feed.ts";

const LOJA = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  tipoDeNegocio: "FOOD_SNACK",
  tipoDeNegocioNome: "Lanchonete",
  cidade: "São Paulo",
  bairro: "Vila Nova",
  uf: "SP",
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  logo: null,
  capa: null,
  corDestaque: "cor-da-loja",
  distanciaKm: 1.2,
  produtosNoFeed: 6,
  favorita: true,
  ultimaVisita: null,
};

function responder(status: number, corpo: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("buscarProdutosDoFeed", () => {
  it("devolve a página conferida pelo contrato", async () => {
    const buscar = responder(200, {
      produtos: [
        {
          id: "p1",
          nome: "Pastel de carne",
          descricao: null,
          precoCentavos: 1200,
          precoOriginalCentavos: null,
          imagem: null,
          categoria: "Pastéis",
          loja: {
            apelido: LOJA.apelido,
            nome: LOJA.nome,
            tipoDeNegocio: LOJA.tipoDeNegocio,
            logo: null,
            cidade: null,
            bairro: null,
            formasDeEntrega: ["PICKUP"],
          },
          distanciaKm: null,
          publicadoEm: "2026-10-16T10:00:00.000Z",
        },
      ],
      pagina: 1,
      porPagina: 24,
      total: 1,
    });
    const lido = await buscarProdutosDoFeed("ordem=relevancia", buscar);
    expect(lido.estado).toBe("ok");
    if (lido.estado === "ok") expect(lido.dados.itens[0]?.nome).toBe("Pastel de carne");
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(/\/v1\/feed\/produtos\?ordem=relevancia$/);
  });

  it("com sessão, leva o token (o favorito do produto vem marcado); vencido, repete sem ele", async () => {
    const pagina = { produtos: [], pagina: 1, porPagina: 24, total: 0 };
    const buscar = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(Response.json(pagina));
    const lido = await buscarProdutosDoFeed("ordem=relevancia", buscar, "tok-vencido");
    expect(lido.estado).toBe("ok");
    const primeira = buscar.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const segunda = buscar.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(primeira["authorization"]).toBe("Bearer tok-vencido");
    expect(segunda["authorization"]).toBeUndefined();
  });

  it("resposta fora do contrato e rede fora viram indisponível", async () => {
    expect((await buscarProdutosDoFeed("", responder(200, { lista: [] }))).estado).toBe("indisponivel");
    const caiu = vi.fn(async () => {
      throw new Error("rede");
    });
    expect((await buscarProdutosDoFeed("", caiu)).estado).toBe("indisponivel");
  });
});

describe("buscarLojasDoFeed", () => {
  it("com sessão, o token vai no cabeçalho (nunca na URL)", async () => {
    const buscar = responder(200, { lojas: [LOJA], pagina: 1, porPagina: 24, total: 1 });
    const lido = await buscarLojasDoFeed("ordem=nome", "tok-123", buscar);
    expect(lido.estado).toBe("ok");
    const [url, init] = buscar.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("tok-123");
    expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer tok-123");
  });

  it("token vencido: busca de novo sem ele", async () => {
    const buscar = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ lojas: [{ ...LOJA, favorita: false }], pagina: 1, porPagina: 24, total: 1 }),
      );
    const lido = await buscarLojasDoFeed("", "vencido", buscar);
    expect(lido.estado).toBe("ok");
    expect(buscar).toHaveBeenCalledTimes(2);
    const segunda = buscar.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(segunda["authorization"]).toBeUndefined();
  });
});

describe("buscarLojasDaContaNoFeed", () => {
  it("favoritas com localização; sem sessão vira nao-autenticado", async () => {
    const buscar = responder(200, { lojas: [LOJA], pagina: 1, porPagina: 50, total: 1 });
    const lido = await buscarLojasDaContaNoFeed("favoritos", "tok", { lat: -23.5, lng: -46.6 }, buscar);
    expect(lido.estado).toBe("ok");
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(/\/v1\/conta\/favoritos\?porPagina=50&lat=-23.5&lng=-46.6$/);

    const negado = await buscarLojasDaContaNoFeed("recentes", "tok", {}, responder(401, {}));
    expect(negado.estado).toBe("nao-autenticado");
  });
});

describe("buscarTiposDeNegocio", () => {
  it("lista os tipos; API fora vira lista vazia", async () => {
    const tipos = await buscarTiposDeNegocio(
      responder(200, { tipos: [{ codigo: "APPAREL", nome: "Roupas", alimentacao: false }] }),
    );
    expect(tipos).toEqual([{ codigo: "APPAREL", nome: "Roupas", alimentacao: false }]);
    expect(await buscarTiposDeNegocio(responder(500, {}))).toEqual([]);
  });
});

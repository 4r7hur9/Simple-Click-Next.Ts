// @vitest-environment jsdom
/**
 * Card #108 · T-10808c — estoque, faixa de preço e as ordens novas, da URL até
 * a API: leitura em reais, serialização em centavos, chips, formulário, e a
 * degradação honesta quando a API ainda é a antiga.
 */
import { describe, expect, it, vi } from "vitest";

import {
  lerPrecoEmReais,
  limitarFiltros,
  type OrdemDoCatalogo,
} from "../src/lib/catalogo";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";
import {
  buscarPaginaDoCatalogo,
  buscarResumoDoCatalogo,
} from "../src/server/vitrine";

import { PAGINA, RESUMO, renderizarTela } from "./apoio-do-catalogo-na-tela";

describe("o preço no endereço (reais) vira centavos", () => {
  it("[CA-10] @spec:AC-10816 aceita vírgula e ponto, e ignora o que não é número", () => {
    expect(lerPrecoEmReais("10")).toBe(1000);
    expect(lerPrecoEmReais("10,50")).toBe(1050);
    expect(lerPrecoEmReais("10.50")).toBe(1050);
    expect(lerPrecoEmReais("0,99")).toBe(99);
    for (const ruim of [
      "",
      " ",
      "abc",
      "-1",
      "1e9",
      "10,555",
      "Infinity",
      "NaN",
      "0x10",
    ]) {
      expect(lerPrecoEmReais(ruim), ruim).toBeNull();
    }
    expect(lerPrecoEmReais(null)).toBeNull();
    expect(lerPrecoEmReais(undefined)).toBeNull();
  });

  it("[CA-10] @spec:AC-10816 acima do teto vale o teto (R$ 1.000.000,00)", () => {
    expect(lerPrecoEmReais("999999999")).toBe(100_000_000);
    expect(lerPrecoEmReais("1000000")).toBe(100_000_000);
  });

  it("[CA-10] @spec:AC-10816 o filtro de especificação é cortado no que a API aceita", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `k${i}=v`);
    expect(limitarFiltros(muitos)).toHaveLength(20);
    expect(limitarFiltros(["a=1", "a=1", "b=2"])).toEqual(["a=1", "b=2"]);
    expect(limitarFiltros(["x".repeat(121), "ok=1"])).toEqual(["ok=1"]);
  });
});

describe("o que vai para a API", () => {
  function respostaDaPagina(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), { status });
  }
  const PAGINA_JSON = {
    versao: "1",
    produtos: [],
    total: 0,
    proximoCursor: null,
  };

  it("[CA-10] @spec:AC-10816 sem os campos novos, a requisição é idêntica à de hoje", async () => {
    const buscar = vi.fn(async () => respostaDaPagina(PAGINA_JSON));
    await buscarPaginaDoCatalogo(
      "loja",
      {
        categoria: "salgados",
        busca: "p",
        filtros: ["a=1"],
        atacado: true,
        ordem: "menor-preco",
      },
      buscar as unknown as typeof fetch,
    );
    const url = new URL((buscar.mock.calls[0] as unknown as [string])[0]);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "atacado",
      "busca",
      "categoria",
      "filtro",
      "ordem",
    ]);
  });

  it("[CA-10] @spec:AC-10816 estoque, faixa (em centavos) e ordem nova vão como a API espera", async () => {
    const buscar = vi.fn(async () => respostaDaPagina(PAGINA_JSON));
    await buscarPaginaDoCatalogo(
      "loja",
      { estoque: true, precoMin: 1050, precoMax: 9900, ordem: "lancamentos" },
      buscar as unknown as typeof fetch,
    );
    const url = new URL((buscar.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("estoque")).toBe("1");
    expect(url.searchParams.get("precoMin")).toBe("1050");
    expect(url.searchParams.get("precoMax")).toBe("9900");
    expect(url.searchParams.get("ordem")).toBe("lancamentos");
  });

  it("[CA-10] @spec:AC-10816 a API antiga recusa o campo novo: repete UMA vez sem ele e avisa que degradou", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            erro: "entrada_invalida",
            campos: [{ caminho: "precoMin" }],
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(respostaDaPagina(PAGINA_JSON));
    const resultado = await buscarPaginaDoCatalogo(
      "loja",
      { estoque: true, precoMin: 100, ordem: "lancamentos", categoria: "x" },
      buscar as unknown as typeof fetch,
    );
    expect(buscar).toHaveBeenCalledTimes(2);
    const segunda = new URL((buscar.mock.calls[1] as unknown as [string])[0]);
    expect(segunda.searchParams.has("estoque")).toBe(false);
    expect(segunda.searchParams.has("precoMin")).toBe(false);
    expect(segunda.searchParams.has("ordem")).toBe(false);
    expect(segunda.searchParams.get("categoria")).toBe("x");
    expect(resultado).toMatchObject({ estado: "encontrado", degradado: true });
  });

  it("[CA-10] @spec:AC-10816 outro 400, ou 400 sem campo novo, continua sendo erro (sem repetir)", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 400 }));
    const r = await buscarResumoDoCatalogo(
      "loja",
      { estoque: true },
      buscar as unknown as typeof fetch,
    );
    expect(r.estado).toBe("indisponivel");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("[CA-10] @spec:AC-10816 sem campo novo no pedido, o 400 nem é repetido", async () => {
    const buscar = vi.fn(
      async () =>
        new Response(JSON.stringify({ campos: [{ caminho: "ordem" }] }), {
          status: 400,
        }),
    );
    const r = await buscarPaginaDoCatalogo(
      "loja",
      { ordem: "menor-preco" },
      buscar as unknown as typeof fetch,
    );
    expect(r.estado).toBe("indisponivel");
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe("a tela", () => {
  it("[CA-10] @spec:AC-10816 lê reais do endereço e manda centavos para a API", async () => {
    const { chamadasAoResumo } = await renderizarTela({
      estoque: "1",
      "preco-de": "10,50",
      "preco-ate": "99",
    });
    const opcoes = chamadasAoResumo[0]?.[1] as Record<string, unknown>;
    expect(opcoes["estoque"]).toBe(true);
    expect(opcoes["precoMin"]).toBe(1050);
    expect(opcoes["precoMax"]).toBe(9900);
  });

  it("[CA-10] @spec:AC-10816 mínimo maior que máximo troca de lugar; valor inválido é ignorado", async () => {
    const trocados = await renderizarTela({
      "preco-de": "50",
      "preco-ate": "10",
    });
    const op = trocados.chamadasAoResumo[0]?.[1] as Record<string, unknown>;
    expect([op["precoMin"], op["precoMax"]]).toEqual([1000, 5000]);

    const ruim = await renderizarTela({ "preco-de": "abc", "preco-ate": "-5" });
    const o2 = ruim.chamadasAoResumo[0]?.[1] as Record<string, unknown>;
    expect(o2["precoMin"]).toBeNull();
    expect(o2["precoMax"]).toBeNull();
  });

  it("[CA-10] @spec:AC-10816 mais de 20 filtros no endereço são cortados antes de ir à API", async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => `k${i}=v`);
    const { chamadasAoResumo } = await renderizarTela({ filtro: muitos });
    const opcoes = chamadasAoResumo[0]?.[1] as { filtros: string[] };
    expect(opcoes.filtros).toHaveLength(20);
  });

  it("[CA-10] @spec:AC-10816 estoque e faixa viram chips, e cada um tira só o seu", async () => {
    const { documento } = await renderizarTela(
      {
        estoque: "1",
        "preco-de": "10",
        "preco-ate": "20",
        busca: "pao",
        filtro: ["tamanho=M"],
      },
      {
        resumo: {
          ...RESUMO,
          filtros: [{ chave: "tamanho", nome: "Tamanho", valores: ["M"] }],
        },
      },
    );
    const chips = [
      ...documento.querySelectorAll<HTMLAnchorElement>(
        ".sc-catalogo__ativos a.sc-chip",
      ),
    ];
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Remover filtro Tamanho: M",
      "Remover filtro Em estoque",
      "Remover filtro Preço: R$ 10,00 a R$ 20,00",
    ]);

    const semEstoque = new URL(chips[1]!.getAttribute("href")!, "http://x");
    expect(semEstoque.searchParams.has("estoque")).toBe(false);
    expect(semEstoque.searchParams.get("preco-de")).toBe("10");
    expect(semEstoque.searchParams.get("preco-ate")).toBe("20");
    expect(semEstoque.searchParams.get("busca")).toBe("pao");
    expect(semEstoque.searchParams.getAll("filtro")).toEqual(["tamanho=M"]);

    const semPreco = new URL(chips[2]!.getAttribute("href")!, "http://x");
    expect(semPreco.searchParams.get("estoque")).toBe("1");
    expect(semPreco.searchParams.has("preco-de")).toBe(false);
    expect(semPreco.searchParams.has("preco-ate")).toBe(false);
  });

  it("[CA-10] @spec:AC-10816 o formulário sempre tem Só em estoque e a faixa, mesmo sem especificação", async () => {
    const { documento } = await renderizarTela({
      estoque: "1",
      "preco-de": "10,5",
    });
    const form = documento.querySelector(
      'form[aria-label="Filtrar por especificação"]',
    )!;
    expect(
      (
        form.querySelector('input[name="estoque"]') as HTMLInputElement
      ).hasAttribute("checked"),
    ).toBe(true);
    expect(
      form.querySelector('input[name="preco-de"]')?.getAttribute("value"),
    ).toBe("10.5");
    expect(
      form.querySelector('label[for="filtro-preco-de"]')?.textContent,
    ).toContain("Preço mínimo (R$)");
    expect(
      form.querySelector('label[for="filtro-preco-ate"]')?.textContent,
    ).toContain("Preço máximo (R$)");
    expect(form.textContent).toContain("Limpar filtros");
  });

  it("[CA-10] @spec:AC-10816 a busca leva estoque e faixa junto", async () => {
    const { documento } = await renderizarTela({
      estoque: "1",
      "preco-ate": "30",
    });
    const busca = documento.querySelector('form[role="search"]')!;
    expect(
      busca.querySelector('input[name="estoque"]')?.getAttribute("value"),
    ).toBe("1");
    expect(
      busca.querySelector('input[name="preco-ate"]')?.getAttribute("value"),
    ).toBe("30");
  });

  it("[CA-10] @spec:AC-10816 o 'Ver mais' leva o recorte com estoque e faixa em centavos", async () => {
    const { documento } = await renderizarTela(
      { categoria: "salgados", estoque: "1", "preco-ate": "30" },
      { pagina: { ...PAGINA, total: 90, proximoCursor: "abc" } },
    );
    const link = new URL(
      documento
        .querySelector<HTMLAnchorElement>(".sc-vitrine__ver-mais a")!
        .getAttribute("href")!,
      "http://x",
    );
    expect(link.searchParams.get("estoque")).toBe("1");
    expect(link.searchParams.get("preco-ate")).toBe("30");
  });

  it("[CA-10] @spec:AC-10816 a ordem nova aparece no menu e marca a em vigor", async () => {
    const { documento } = await renderizarTela({ ordem: "lancamentos" });
    const vigor = documento.querySelector("#painel-da-ordem [aria-current]");
    expect(vigor?.textContent?.trim()).toBe("Lançamentos");
  });
});

describe("quando a API ainda é a antiga (leitura degradada)", () => {
  it("[CA-10] @spec:AC-10816 não mostra chips dos filtros novos nem a ordem nova como aplicados, e avisa", async () => {
    const { documento } = await renderizarTela(
      { estoque: "1", "preco-de": "10", ordem: "lancamentos" },
      { degradado: true },
    );
    expect(documento.querySelector(".sc-catalogo__ativos")).toBeNull();
    expect(
      documento
        .querySelector("#painel-da-ordem [aria-current]")
        ?.textContent?.trim(),
    ).toBe("Destaques primeiro");
    expect(
      documento.querySelector(".sc-catalogo__aviso")?.textContent,
    ).toContain("Alguns filtros não puderam ser aplicados");
    expect(
      documento.querySelector(".sc-catalogo__aviso")?.getAttribute("role"),
    ).toBe("status");
  });

  it("[CA-10] @spec:AC-10816 sem degradação não há aviso", async () => {
    const { documento } = await renderizarTela({ estoque: "1" });
    expect(documento.querySelector(".sc-catalogo__aviso")).toBeNull();
  });
});

describe("a TV não aplica o que só a API aplica", () => {
  const catalogo = {
    versao: "1",
    secoes: [
      {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        apelido: "a",
        nome: "A",
        produtos: RESUMO.secoes[0]!.produtos,
      },
    ],
    destaques: [],
  };

  for (const ordem of [
    "lancamentos",
    "maior-desconto-atacado",
  ] as OrdemDoCatalogo[]) {
    it(`[CA-10] @spec:AC-10816 a ordem ${ordem} mantém a ordem do dono no catálogo inteiro`, () => {
      const dono = prepararCatalogo(catalogo as never, { apelidoDaLoja: "x" });
      const pedida = prepararCatalogo(catalogo as never, {
        apelidoDaLoja: "x",
        ordem,
      });
      expect(pedida.secoes.flatMap((s) => s.produtos.map((p) => p.id))).toEqual(
        dono.secoes.flatMap((s) => s.produtos.map((p) => p.id)),
      );
    });
  }
});

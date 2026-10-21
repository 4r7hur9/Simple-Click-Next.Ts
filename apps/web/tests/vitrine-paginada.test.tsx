// @vitest-environment jsdom
/**
 * Card #74 — o cardápio em pedaços: o resumo e a página da API viram a tela
 * com o "Ver mais" certo em cada lista, e os endereços pedidos à API levam os
 * filtros, a ordem e o cursor.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  PaginaDoCatalogoNoContrato,
  ProdutoNaVitrineNoContrato,
  ResumoDoCatalogoNoContrato,
} from "@simpleclick/contracts";

import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import {
  precisaDePagina,
  prepararCatalogoEmPaginas,
} from "../src/server/catalogo-na-tela";
import {
  buscarPaginaDoCatalogo,
  buscarResumoDoCatalogo,
} from "../src/server/vitrine";

const LOJA = "autopecas-da-vila";

function produto(n: number, precoCentavos: number | null = 1000 + n): ProdutoNaVitrineNoContrato {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    apelido: `peca-${n}`,
    nome: `Peça ${n}`,
    chamada: null,
    precoCentavos,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
  };
}

const FREIOS = "aaaaaaaa-1111-4111-8111-111111111111";
const MOTOR = "bbbbbbbb-2222-4222-8222-222222222222";

const RESUMO: ResumoDoCatalogoNoContrato = {
  versao: "7",
  secoes: [
    {
      id: FREIOS,
      apelido: "freios",
      nome: "Freios",
      total: 548,
      produtos: [produto(1), produto(2), produto(3), produto(4)],
      proximoCursor: "eyJwIjo0fQ",
    },
    {
      id: MOTOR,
      apelido: "motor",
      nome: "Motor",
      total: 2,
      produtos: [produto(5), produto(6)],
      proximoCursor: null,
    },
  ],
  destaques: [produto(9)],
  filtros: [],
  atacado: { produtos: 0, menorPedidoMinimo: null },
};

/** O resumo como vem quando a tela pede só as contagens. */
const SO_CONTAGENS: ResumoDoCatalogoNoContrato = {
  ...RESUMO,
  secoes: RESUMO.secoes.map((secao) => ({
    ...secao,
    produtos: [],
    proximoCursor: null,
  })),
};

const PAGINA: PaginaDoCatalogoNoContrato = {
  versao: "7",
  produtos: Array.from({ length: 24 }, (_, i) => produto(100 + i)),
  total: 548,
  proximoCursor: "eyJwIjoyNH0",
};

describe("quando a tela precisa de uma página", () => {
  it("só com categoria escolhida ou ordem fora da do dono", () => {
    expect(precisaDePagina(null, null)).toBe(false);
    expect(precisaDePagina("", "relevancia")).toBe(false);
    expect(precisaDePagina("freios", null)).toBe(true);
    expect(precisaDePagina(null, "menor-preco")).toBe(true);
    // Ordem desconhecida vale a do dono.
    expect(precisaDePagina(null, "qualquer")).toBe(false);
  });
});

describe("o cardápio sem filtro", () => {
  const naTela = prepararCatalogoEmPaginas(RESUMO, null, {
    apelidoDaLoja: LOJA,
  });

  it("mostra todas as seções com os primeiros produtos e o total de cada uma", () => {
    expect(naTela.secoes.map((s) => [s.nome, s.produtos.length, s.total])).toEqual([
      ["Freios", 4, 548],
      ["Motor", 2, 2],
    ]);
    expect(naTela.destaques.map((p) => p.nome)).toEqual(["Peça 9"]);
    expect(naTela.abas.map((a) => a.nome)).toEqual(["Todas", "Freios", "Motor"]);
  });

  it("a seção que não veio inteira continua pela categoria; a inteira não tem 'Ver mais'", () => {
    const [freios, motor] = naTela.secoes;
    expect(freios?.mais).toEqual({
      cursor: "eyJwIjo0fQ",
      recorte: {
        categoria: "freios",
        busca: null,
        filtros: [],
        atacado: false,
        ordem: "relevancia",
      },
      link: `/loja/${LOJA}/cardapio?categoria=freios`,
    });
    expect(motor?.mais).toBeNull();
  });

  it("loja com produtos não é 'catálogo sendo montado' mesmo quando só vieram as contagens", () => {
    const soContagens = prepararCatalogoEmPaginas(SO_CONTAGENS, null, {
      apelidoDaLoja: LOJA,
    });
    expect(soContagens.lojaSemCatalogo).toBe(false);
  });
});

describe("a categoria escolhida", () => {
  const naTela = prepararCatalogoEmPaginas(SO_CONTAGENS, PAGINA, {
    apelidoDaLoja: LOJA,
    categoriaEscolhida: "freios",
    termoBuscado: "pastilha",
    filtros: ["marca=COBREQ"],
    atacado: true,
  });

  it("vem da página, com o total da lista e sem destaques", () => {
    expect(naTela.secoes).toHaveLength(1);
    const [freios] = naTela.secoes;
    expect(freios?.nome).toBe("Freios");
    expect(freios?.produtos).toHaveLength(24);
    expect(freios?.total).toBe(548);
    expect(naTela.destaques).toEqual([]);
    expect(naTela.filtroEmVigor).toBe("Freios");
  });

  it("o 'Ver mais' leva o recorte inteiro e, sem script, a página seguinte", () => {
    const mais = naTela.secoes[0]?.mais;
    expect(mais?.recorte).toEqual({
      categoria: "freios",
      busca: "pastilha",
      filtros: ["marca=COBREQ"],
      atacado: true,
      ordem: "relevancia",
    });
    expect(mais?.link).toBe(
      `/loja/${LOJA}/cardapio?categoria=freios&busca=pastilha&filtro=marca%3DCOBREQ&atacado=1&cursor=eyJwIjoyNH0`,
    );
  });

  it("na última página não há 'Ver mais'", () => {
    const ultima = prepararCatalogoEmPaginas(
      SO_CONTAGENS,
      { ...PAGINA, proximoCursor: null },
      { apelidoDaLoja: LOJA, categoriaEscolhida: "freios" },
    );
    expect(ultima.secoes[0]?.mais).toBeNull();
  });

  it("categoria que não existe explica, sem quebrar", () => {
    const sumiu = prepararCatalogoEmPaginas(
      SO_CONTAGENS,
      { ...PAGINA, produtos: [], total: 0, proximoCursor: null },
      { apelidoDaLoja: LOJA, categoriaEscolhida: "nao-existe" },
    );
    expect(sumiu.filtroSemAcerto).toBe(true);
    expect(sumiu.lojaSemCatalogo).toBe(false);
  });
});

describe("a ordem fora da do dono", () => {
  it("vira uma lista só, a da página, com o 'Ver mais' na ordem pedida", () => {
    const naTela = prepararCatalogoEmPaginas(SO_CONTAGENS, PAGINA, {
      apelidoDaLoja: LOJA,
      ordem: "menor-preco",
    });
    expect(naTela.secoes.map((s) => s.nome)).toEqual(["Todos os produtos"]);
    expect(naTela.secoes[0]?.mais?.recorte.ordem).toBe("menor-preco");
    expect(naTela.secoes[0]?.mais?.link).toBe(
      `/loja/${LOJA}/cardapio?ordem=menor-preco&cursor=eyJwIjoyNH0`,
    );
  });
});

describe("a grade com 'Ver mais'", () => {
  it("desenha os cartões que vieram, a contagem total e o link que funciona sem script", () => {
    const naTela = prepararCatalogoEmPaginas(RESUMO, null, {
      apelidoDaLoja: LOJA,
    });
    const freios = naTela.secoes[0];
    if (freios === undefined) throw new Error("sem seção");
    document.body.innerHTML = renderToStaticMarkup(
      <GradeDeProdutos secao={freios} />,
    );
    expect(document.querySelectorAll(".sc-vitrine__cartao")).toHaveLength(4);
    expect(document.querySelector(".sc-vitrine__secao-contagem")?.textContent).toBe(
      "548 itens",
    );
    const verMais = document.querySelector<HTMLAnchorElement>(
      ".sc-vitrine__ver-mais a",
    );
    expect(verMais?.getAttribute("href")).toBe(`/loja/${LOJA}/cardapio?categoria=freios`);
    expect(verMais?.textContent).toBe("Ver mais 544 produtos de Freios");
  });

  it("seção inteira não tem 'Ver mais'", () => {
    const naTela = prepararCatalogoEmPaginas(RESUMO, null, {
      apelidoDaLoja: LOJA,
    });
    const motor = naTela.secoes[1];
    if (motor === undefined) throw new Error("sem seção");
    document.body.innerHTML = renderToStaticMarkup(<GradeDeProdutos secao={motor} />);
    expect(document.querySelector(".sc-vitrine__ver-mais")).toBeNull();
  });
});

describe("os endereços pedidos à API", () => {
  function gravador() {
    const pedidos: string[] = [];
    const buscar = (async (endereco: string) => {
      pedidos.push(endereco);
      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
    return { pedidos, buscar };
  }

  it("o resumo leva filtros, porSecao e totalMaximo", async () => {
    const { pedidos, buscar } = gravador();
    const resultado = await buscarResumoDoCatalogo(
      LOJA,
      {
        busca: " pastilha ",
        categoria: "freios",
        filtros: ["marca=COBREQ"],
        atacado: true,
        porSecao: 24,
        totalMaximo: 72,
      },
      buscar,
    );
    expect(resultado.estado).toBe("nao-encontrada");
    const url = new URL(pedidos[0] ?? "");
    expect(url.pathname).toBe(`/v1/vitrine/${LOJA}/catalogo/resumo`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      busca: "pastilha",
      categoria: "freios",
      filtro: "marca=COBREQ",
      atacado: "1",
      porSecao: "24",
      totalMaximo: "72",
    });
  });

  it("a página leva ordem (fora da padrão) e cursor", async () => {
    const { pedidos, buscar } = gravador();
    await buscarPaginaDoCatalogo(
      LOJA,
      { categoria: "freios", ordem: "maior-preco", cursor: "eyJwIjoyNH0" },
      buscar,
    );
    await buscarPaginaDoCatalogo(LOJA, { ordem: "relevancia" }, buscar);
    const [primeira, segunda] = pedidos.map((p) => new URL(p));
    expect(primeira?.pathname).toBe(`/v1/vitrine/${LOJA}/catalogo/produtos`);
    expect(Object.fromEntries(primeira?.searchParams ?? [])).toEqual({
      categoria: "freios",
      ordem: "maior-preco",
      cursor: "eyJwIjoyNH0",
    });
    expect(segunda?.search).toBe("");
  });

  it("resposta fora do contrato é indisponibilidade, e não lista vazia", async () => {
    const buscar = (async () =>
      new Response(JSON.stringify({ produtos: "não" }), { status: 200 })) as unknown as typeof fetch;
    const resultado = await buscarPaginaDoCatalogo(LOJA, {}, buscar);
    expect(resultado.estado).toBe("indisponivel");
  });
});

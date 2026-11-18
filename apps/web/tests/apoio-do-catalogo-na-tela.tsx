/**
 * Apoio dos testes `catalogo-*.onp.test.tsx` (card #108): monta a TELA do
 * catálogo (`TelaDoCatalogo`, componente de servidor assíncrono) com a API
 * trocada por dublês, e devolve o HTML e as chamadas que ela fez.
 *
 * Os dublês são `vi.doMock` + `import()` dinâmico: o `vi.mock` estático só vale
 * dentro do arquivo de teste, e aqui o mesmo apoio serve a vários arquivos.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";

import type {
  PaginaDoCatalogoNoContrato,
  ProdutoNaVitrineNoContrato,
  ResumoDoCatalogoNoContrato,
} from "@simpleclick/contracts";

export const LOJA = "casa-do-sabor";

export const SECAO_A = "aaaaaaaa-1111-4111-8111-111111111111";
export const SECAO_B = "bbbbbbbb-2222-4222-8222-222222222222";

export function produto(
  n: number,
  extra: Partial<ProdutoNaVitrineNoContrato> = {},
): ProdutoNaVitrineNoContrato {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    apelido: `item-${n}`,
    nome: `Item ${n}`,
    chamada: null,
    precoCentavos: 1000 + n,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
    ...extra,
  };
}

export const RESUMO: ResumoDoCatalogoNoContrato = {
  versao: "1",
  secoes: [
    {
      id: SECAO_A,
      apelido: "salgados",
      nome: "Salgados",
      total: 3,
      produtos: [produto(1), produto(2), produto(3)],
      proximoCursor: null,
    },
    {
      id: SECAO_B,
      apelido: "bebidas",
      nome: "Bebidas",
      total: 2,
      produtos: [produto(4), produto(5)],
      proximoCursor: null,
    },
    {
      id: "cccccccc-3333-4333-8333-333333333333",
      apelido: "doces",
      nome: "Doces",
      total: 1,
      produtos: [produto(6)],
      proximoCursor: null,
    },
  ],
  destaques: [],
  filtros: [],
  atacado: { produtos: 0, menorPedidoMinimo: null },
};

export const PAGINA: PaginaDoCatalogoNoContrato = {
  versao: "1",
  produtos: [produto(1), produto(2), produto(3)],
  total: 3,
  proximoCursor: null,
};

export function vitrineDaLoja(
  extra: { rotulo?: string; nome?: string; aberta?: boolean } = {},
) {
  return {
    loja: {
      apelido: LOJA,
      nome: extra.nome ?? "Casa do Sabor",
      ramo: "FOOD_SNACK",
      boasVindas: null,
      sobre: null,
      logo: null,
      capa: null,
      formasDeEntrega: ["PICKUP"],
      enderecoParaRetirada: null,
      rotulos: { catalogo: extra.rotulo ?? "Cardápio" },
      tema: { corDestaque: "#ff8a00" },
      // O preset do ramo: categorias e destaques ligados, como nas lojas reais.
      blocos: {
        cadastroProduto: [],
        detalheProduto: [],
        vitrine: ["categorias", "destaques"],
      },
    },
    abertura: {
      aberta: extra.aberta ?? true,
      proximaAbertura: null,
      motivo: "ABERTA",
    },
    horario: null,
    banners: [],
  };
}

export interface DubleDaTela {
  resumo?: ResumoDoCatalogoNoContrato;
  /** Resposta que depende do pedido (ex.: só contagens × com produtos). */
  resumoDe?: (opcoes: Record<string, unknown>) => ResumoDoCatalogoNoContrato;
  pagina?: PaginaDoCatalogoNoContrato;
  vitrine?: ReturnType<typeof vitrineDaLoja>;
  /** Resposta de `buscarVitrine` fora do normal (ex.: loja suspensa). */
  /** A API ainda não conhece os filtros novos: a leitura voltou degradada. */
  degradado?: boolean;
  estadoDaVitrine?: "encontrada" | "nao-encontrada";
}

export interface ResultadoDaTela {
  html: string;
  documento: Document;
  chamadasAoResumo: unknown[][];
  chamadasAPagina: unknown[][];
}

/** Monta a tela e a devolve já como HTML e como documento do jsdom. */
export async function renderizarTela(
  consulta: Record<string, string | string[] | undefined> = {},
  dubles: DubleDaTela = {},
): Promise<ResultadoDaTela> {
  const chamadasAoResumo: unknown[][] = [];
  const chamadasAPagina: unknown[][] = [];

  vi.resetModules();
  vi.doMock("../src/server/vitrine.ts", () => ({
    buscarVitrine: async () =>
      dubles.estadoDaVitrine === "nao-encontrada"
        ? { estado: "nao-encontrada" }
        : {
            estado: "encontrada",
            vitrine: dubles.vitrine ?? vitrineDaLoja(),
          },
    buscarResumoDoCatalogo: async (...args: unknown[]) => {
      chamadasAoResumo.push(args);
      const opcoes = (args[1] ?? {}) as Record<string, unknown>;
      return {
        estado: "encontrado",
        dados: dubles.resumoDe?.(opcoes) ?? dubles.resumo ?? RESUMO,
        ...(dubles.degradado ? { degradado: true } : {}),
      };
    },
    buscarPaginaDoCatalogo: async (...args: unknown[]) => {
      chamadasAPagina.push(args);
      return { estado: "encontrado", dados: dubles.pagina ?? PAGINA };
    },
  }));
  vi.doMock("../src/server/fechamento.ts", () => ({
    buscarFechamento: async () => ({ estado: "nao-encontrado" }),
  }));
  vi.doMock("../src/app/(loja)/loja/[slug]/checkout/acoes.ts", () => ({
    prepararFechamentoDaJanela: async () => null,
  }));
  vi.doMock("../src/app/(loja)/loja/[slug]/cardapio/acoes.ts", () => ({
    carregarMaisProdutos: async () => null,
    carregarProdutoDaJanela: async () => null,
  }));
  vi.doMock("next/navigation", () => ({
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
  }));

  const { TelaDoCatalogo } =
    await import("../src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx");
  const elemento = await TelaDoCatalogo({ slug: LOJA, consulta });
  const html = renderToStaticMarkup(elemento);
  const documento = new DOMParser().parseFromString(html, "text/html");
  return { html, documento, chamadasAoResumo, chamadasAPagina };
}

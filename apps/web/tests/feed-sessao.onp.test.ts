// @vitest-environment jsdom
/**
 * Card #106, T-10601: a sessão vai na leitura de produtos (estrelas certas em
 * todas as páginas), uma conta nunca vê o dado de outra e a sessão vencida é
 * dita, não escondida. A rede é uma resposta de mentira que olha o
 * `authorization`, como a API de verdade faria.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProdutoDoFeed } from "@simpleclick/contracts";

const sessao = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) =>
      sessao.token === undefined || nome !== "sc_access" ? undefined : { value: sessao.token },
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: ({ priority: _p, ...props }: ComponentProps<"img"> & { readonly priority?: boolean }) =>
    createElement("img", props),
}));

import {
  conteudoDosProdutos,
  lojasDaConta,
  seguidasDaConta,
  storiesDoFeed,
} from "../src/app/(explorar)/explorar/_dados.ts";
import { maisPosts } from "../src/app/(explorar)/explorar/acoes.ts";
import { lerConsulta } from "../src/features/feed/consulta.ts";
import { FeedDePosts } from "../src/features/feed/FeedDePosts.tsx";

const LOJA_DO_PRODUTO = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  tipoDeNegocio: "FOOD_SNACK",
  logo: null,
  cidade: "São Paulo",
  bairro: "Vila Nova",
  formasDeEntrega: ["PICKUP"],
};

function produto(id: string, favorito: boolean) {
  return {
    id,
    nome: `Produto ${id}`,
    descricao: null,
    precoCentavos: 1000,
    precoOriginalCentavos: null,
    imagem: null,
    categoria: null,
    loja: LOJA_DO_PRODUTO,
    distanciaKm: null,
    publicadoEm: "2026-10-16T10:00:00.000Z",
    favorito,
  };
}

function lojaDaConta(apelido: string) {
  return {
    apelido,
    nome: apelido,
    tipoDeNegocio: "FOOD_SNACK",
    tipoDeNegocioNome: "Lanchonete",
    cidade: "São Paulo",
    bairro: "Centro",
    uf: "SP",
    formasDeEntrega: ["PICKUP"],
    logo: null,
    capa: null,
    corDestaque: "cor-da-loja",
    distanciaKm: null,
    produtosNoFeed: 1,
    favorita: true,
    ultimaVisita: null,
  };
}

/** Cada conta tem os seus favoritos; o visitante, nenhum. */
const FAVORITOS: Readonly<Record<string, string>> = { "tok-a": "p-a", "tok-b": "p-b" };
const LOJAS: Readonly<Record<string, string>> = { "tok-a": "loja-a", "tok-b": "loja-b" };

const chamadas: { url: string; auth: string | undefined; cache: string | undefined }[] = [];

function responder(url: string, init?: RequestInit): Response {
  const cabecalhos = (init?.headers ?? {}) as Record<string, string>;
  const auth = cabecalhos["authorization"];
  chamadas.push({ url, auth, cache: init?.cache });
  const token = auth?.replace("Bearer ", "");
  if (token === "tok-vencido") return new Response("{}", { status: 401 });
  if (url.includes("/v1/feed/produtos")) {
    const marcado = token === undefined ? undefined : FAVORITOS[token];
    return Response.json({
      produtos: ["p-a", "p-b", "p-c"].map((id) => produto(id, id === marcado)),
      pagina: Number(new URL(url).searchParams.get("pagina") ?? "1"),
      porPagina: 24,
      total: 72,
    });
  }
  if (url.includes("/v1/conta/")) {
    if (token === undefined) return new Response("{}", { status: 401 });
    return Response.json({ lojas: [lojaDaConta(LOJAS[token] ?? "outra")], pagina: 1, porPagina: 50, total: 1 });
  }
  if (url.includes("/v1/stories")) return Response.json({ lojas: [] });
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  chamadas.length = 0;
  sessao.token = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => responder(String(url), init)),
  );
});
afterEach(() => vi.unstubAllGlobals());

const consulta = (pagina = 1) => ({ ...lerConsulta("produtos", {}), pagina });
const estrelas = (itens: readonly unknown[]) =>
  (itens as ProdutoDoFeed[]).filter((p) => (p as { favorito?: boolean }).favorito).map((p) => p.id);

describe("sessão na leitura de produtos", () => {
  it("[CA-1] @spec:AC-10613 a página 1 e a 3 levam a sessão do servidor e a estrela vem marcada", async () => {
    sessao.token = "tok-a";
    const primeira = await conteudoDosProdutos(consulta(1), "tok-a");
    const terceira = await maisPosts({}, 3);
    expect(primeira.estado).toBe("produtos");
    expect(estrelas(primeira.estado === "produtos" ? primeira.itens : [])).toEqual(["p-a"]);
    expect(terceira.ok && estrelas(terceira.dados.itens)).toEqual(["p-a"]);
    const leituras = chamadas.filter((c) => c.url.includes("/v1/feed/produtos"));
    expect(leituras.map((c) => c.auth)).toEqual(["Bearer tok-a", "Bearer tok-a"]);
    expect(new URL(leituras[1]?.url ?? "").searchParams.get("pagina")).toBe("3");
  });

  it("[CA-1] @spec:AC-10613 a sessão nunca vem do navegador: parâmetros com token são ignorados", async () => {
    sessao.token = "tok-b";
    await maisPosts({ authorization: "Bearer tok-a", token: "tok-a", busca: "pastel" }, 2);
    const leitura = chamadas.find((c) => c.url.includes("/v1/feed/produtos"));
    expect(leitura?.auth).toBe("Bearer tok-b");
    expect(leitura?.url).not.toContain("tok-a");
  });
});

describe("uma conta nunca vê a outra", () => {
  it("[CA-3] @spec:AC-10611 conta A, visitante e conta B recebem só o que é delas", async () => {
    const a = await conteudoDosProdutos(consulta(), "tok-a");
    const visitante = await conteudoDosProdutos(consulta(), undefined);
    const b = await conteudoDosProdutos(consulta(), "tok-b");
    const marcadas = (c: typeof a) => (c.estado === "produtos" ? estrelas(c.itens) : null);
    expect(marcadas(a)).toEqual(["p-a"]);
    expect(marcadas(visitante)).toEqual([]);
    expect(marcadas(b)).toEqual(["p-b"]);

    const lojasA = await lojasDaConta("favoritos", "tok-a");
    const lojasB = await lojasDaConta("favoritos", "tok-b");
    expect(lojasA.estado === "ok" && lojasA.dados.map((l) => l.apelido)).toEqual(["loja-a"]);
    expect(lojasB.estado === "ok" && lojasB.dados.map((l) => l.apelido)).toEqual(["loja-b"]);
    expect((await seguidasDaConta("tok-b")).apelidos).toEqual(["loja-b"]);
  });

  it("[CA-3] @spec:AC-10611 toda leitura é no-store e o visitante não manda authorization", async () => {
    await conteudoDosProdutos(consulta(), "tok-a");
    await conteudoDosProdutos(consulta(), undefined);
    await lojasDaConta("recentes", "tok-a");
    await storiesDoFeed("tok-a");
    expect(chamadas.length).toBeGreaterThanOrEqual(4);
    expect(chamadas.every((c) => c.cache === "no-store")).toBe(true);
    expect(chamadas.filter((c) => c.auth === undefined).map((c) => c.url)).toHaveLength(1);
  });

  it("[CA-3] @spec:AC-10611 nada com sessão passa por cache do Next", () => {
    for (const arquivo of [
      "src/app/(explorar)/explorar/_dados.ts",
      "src/app/(explorar)/explorar/acoes.ts",
      "src/server/feed.ts",
      "src/server/feed-social.ts",
    ]) {
      const texto = readFileSync(join(__dirname, "..", arquivo), "utf8");
      expect(texto, arquivo).not.toMatch(/unstable_cache|["']use cache["']/);
    }
  });
});

describe("sessão vencida", () => {
  it("[CA-2] @spec:AC-10614 produtos, ações e stories avisam em vez de fingir que não há favoritos", async () => {
    sessao.token = "tok-vencido";
    const primeira = await conteudoDosProdutos(consulta(), "tok-vencido");
    expect(primeira.estado === "produtos" && primeira.sessaoVencida).toBe(true);
    expect(primeira.estado === "produtos" && estrelas(primeira.itens)).toEqual([]);
    const mais = await maisPosts({}, 2);
    expect(mais.ok && mais.dados.sessaoVencida).toBe(true);
    expect((await storiesDoFeed("tok-vencido")).sessaoVencida).toBe(true);
    expect((await seguidasDaConta("tok-vencido")).sessaoVencida).toBe(true);
  });

  it("[CA-2] @spec:AC-10614 sessão boa e visitante não são sessão vencida", async () => {
    const boa = await conteudoDosProdutos(consulta(), "tok-a");
    const visitante = await conteudoDosProdutos(consulta(), undefined);
    expect(boa.estado === "produtos" && boa.sessaoVencida).toBeUndefined();
    expect(visitante.estado === "produtos" && visitante.sessaoVencida).toBeUndefined();
    expect((await seguidasDaConta(undefined)).sessaoVencida).toBe(false);
  });

  it("[CA-2] @spec:AC-10614 a tela pede para entrar de novo, uma vez, e só nesse caso", () => {
    const acoes = {
      maisPosts: async () => ({ ok: false as const, motivo: "indisponivel" as const }),
      curtir: async () => ({ ok: false as const, motivo: "indisponivel" as const }),
      favoritarProduto: async () => ({ ok: false as const, motivo: "indisponivel" as const }),
      comentarios: async () => ({ ok: false as const, motivo: "indisponivel" as const }),
      comentar: async () => ({ ok: false as const, motivo: "indisponivel" as const }),
    };
    const montar = (vencida: boolean) =>
      renderToStaticMarkup(
        createElement(FeedDePosts, {
          inicial: [produto("p-a", false)] as unknown as readonly ProdutoDoFeed[],
          total: 1,
          parametros: {},
          logado: true,
          voltarPara: "/explorar/produtos?busca=pastel",
          seguidas: [],
          acoes,
          sessaoVencida: vencida,
        }),
      );
    const vencida = montar(true);
    expect(vencida.match(/Entrar de novo/g)).toHaveLength(1);
    expect(vencida).toContain("/entrar?proximo=");
    expect(montar(false)).not.toContain("Entrar de novo");
  });
});

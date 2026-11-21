// @vitest-environment jsdom
/**
 * Card #152: /explorar é a vitrine mista (stories, lojas perto, destaques e
 * posts), e não mais um redirecionamento para a lista de produtos. A lista
 * continua em /explorar/produtos, sem as seções da vitrine.
 */
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: ({ priority: _p, ...props }: ComponentProps<"img"> & { readonly priority?: boolean }) =>
    createElement("img", props),
}));

import PaginaDoExplorar from "../src/app/(explorar)/explorar/page.tsx";
import PaginaDeProdutos from "../src/app/(explorar)/explorar/produtos/page.tsx";
import { enderecoDaVitrine, enderecoDoFeed, lerConsulta } from "../src/features/feed/consulta.ts";
import { Destaques, LojasPerto } from "../src/features/feed/SecoesDoInicio.tsx";
import { TelaDoFeed } from "../src/features/feed/TelaDoFeed.tsx";

const loja = {
  apelido: "pastelaria",
  nome: "Pastelaria do Zé",
  tipoDeNegocio: "FOOD_SNACK",
  tipoDeNegocioNome: "Lanchonete",
  cidade: "São Paulo",
  bairro: "Centro",
  uf: "SP",
  formasDeEntrega: ["PICKUP"],
  logo: null,
  capa: null,
  corDestaque: "cor-da-loja",
  distanciaKm: 0.8,
  produtosNoFeed: 1,
  favorita: false,
  ultimaVisita: null,
};

const consulta = { ...lerConsulta("produtos", {}), inicio: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
});
afterEach(() => vi.unstubAllGlobals());

function vitrine(extra: Partial<Parameters<typeof TelaDoFeed>[0]> = {}) {
  return renderToStaticMarkup(
    <TelaDoFeed
      consulta={consulta}
      tipos={[]}
      conteudo={{ estado: "produtos", itens: [], total: 0, porPagina: 24 }}
      logado={false}
      secoes={{
        stories: <div data-secao="stories" />,
        suasLojas: (
          <LojasPerto
            lojas={[loja]}
            comRegiao
            logado={false}
            voltarPara="/explorar"
            verTodas="/explorar/lojas"
          />
        ),
        destaques: (
          <Destaques aba="recentes" produtos={[]} consulta={consulta} enderecoDaAba={() => "/explorar"} />
        ),
      }}
      {...extra}
    />,
  );
}

describe("página /explorar", () => {
  it("[CA-3] renderiza as seções na ordem: stories, lojas, destaques e posts", () => {
    const html = vitrine();
    const ordem = [
      'data-secao="stories"',
      "Lojas perto de você",
      "Destaques e ofertas",
      "Publicações das lojas",
    ].map((trecho) => html.indexOf(trecho));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it("[CA-3] 'Ver todas' vai às lojas e 'Ver todos' aos produtos", () => {
    const html = vitrine();
    expect(html).toMatch(/href="\/explorar\/lojas"[^>]*>\s*Ver todas/);
    expect(html).toMatch(/href="\/explorar\/produtos[^"]*"[^>]*>\s*Ver todos/);
  });

  it("[CA-3] mostra o estado vazio quando não há posts nem produtos", () => {
    const html = vitrine();
    expect(html).toContain("Nenhum produto no feed ainda");
    expect(html).toContain("As lojas ainda não publicaram produtos");
  });

  it("[CA-3] sem lojas na região, a seção diz isso e leva à lista", () => {
    const html = renderToStaticMarkup(
      <LojasPerto lojas={[]} comRegiao logado={false} voltarPara="/explorar" verTodas="/explorar/lojas" />,
    );
    expect(html).toContain("Nenhuma loja encontrada na sua região");
    expect(html).toContain('href="/explorar/lojas"');
  });

  it("[CA-3] com a API fora, o feed mostra o erro com 'Tentar de novo'", () => {
    const html = vitrine({ conteudo: { estado: "indisponivel" } });
    expect(html).toContain("O feed não carregou");
    expect(html).toContain("Tentar de novo");
  });

  it("[CA-3] a página não redireciona: monta a vitrine com a região da consulta", async () => {
    const { redirect } = await import("next/navigation");
    const elemento = (await PaginaDoExplorar({
      searchParams: Promise.resolve({ lat: "-23.55", lng: "-46.63", busca: "x" }),
    })) as ReactElement<{
      consulta: { inicio?: boolean; lat?: number; busca?: string };
      secoes: unknown;
    }>;
    expect(redirect).not.toHaveBeenCalled();
    expect(elemento.props.consulta.inicio).toBe(true);
    expect(elemento.props.consulta.lat).toBeCloseTo(-23.55, 2);
    // Busca e filtros são da lista de produtos, não da vitrine.
    expect(elemento.props.consulta.busca).toBeUndefined();
    expect(elemento.props.secoes).toBeDefined();
  });

  it("[CA-1] /explorar/produtos é a lista, sem as seções da vitrine", async () => {
    const elemento = (await PaginaDeProdutos({
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ consulta: { inicio?: boolean }; secoes?: unknown }>;
    expect(elemento.props.consulta.inicio).not.toBe(true);
    expect(elemento.props.secoes).toBeUndefined();
    const html = renderToStaticMarkup(
      <TelaDoFeed
        consulta={lerConsulta("produtos", {})}
        tipos={[]}
        conteudo={{ estado: "produtos", itens: [], total: 0, porPagina: 24 }}
        logado={false}
      />,
    );
    expect(html).not.toContain("Lojas perto de você");
    expect(html).toContain("Produtos encontrados");
  });

  it("[CA-2] os endereços: vitrine em /explorar, listas levam os filtros", () => {
    const c = lerConsulta("produtos", { lat: "-23.55", lng: "-46.63", busca: "pizza" });
    expect(enderecoDaVitrine(c)).toBe("/explorar?lat=-23.55&lng=-46.63");
    expect(enderecoDoFeed(c, { aba: "lojas" })).toContain("/explorar/lojas?busca=pizza");
    expect(enderecoDoFeed({ ...c, inicio: true }, { aba: "produtos", inicio: false })).toMatch(
      /^\/explorar\/produtos\?/,
    );
  });

  it("[CA-2] o celular tem as três áreas dentro do feed, com Produtos", () => {
    const html = vitrine();
    // A barra é do cliente (BarraDoFeed); renderiza as pílulas na primeira passada.
    expect(html).toContain('aria-label="Áreas do Explorar"');
    expect(html).toContain(">Produtos<");
  });
});

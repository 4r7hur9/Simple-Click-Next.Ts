// @vitest-environment jsdom
/**
 * Card #106, T-10604/06/07/08: "Suas lojas" (só da própria conta, convite
 * para o visitante), destaques com preço "de" e atacado só com dado da loja,
 * abas sem "Mais pedidos", grade do computador e Gaveta do #104 nos comentários.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  abaDeDestaques,
  dadosDeSuasLojas,
  destaquesDoInicio,
} from "../src/app/(explorar)/explorar/_dados.ts";
import { lerConsulta } from "../src/features/feed/consulta.ts";
import { Destaques, SuasLojas } from "../src/features/feed/SecoesDoInicio.tsx";

const RAIZ = join(process.cwd(), "apps", "web", "src", "features", "feed");

function loja(apelido: string) {
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

function produto(id: string, original: number | null) {
  return {
    id,
    nome: `Produto ${id}`,
    descricao: null,
    precoCentavos: 1000,
    precoOriginalCentavos: original,
    imagem: null,
    categoria: null,
    loja: {
      apelido: "pastelaria",
      nome: "Pastelaria",
      tipoDeNegocio: "FOOD_SNACK",
      logo: null,
      cidade: null,
      bairro: null,
      formasDeEntrega: ["PICKUP"],
    },
    distanciaKm: null,
    publicadoEm: "2026-10-16T10:00:00.000Z",
    favorito: false,
  };
}

const urls: string[] = [];
beforeEach(() => {
  urls.length = 0;
  sessao.token = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      urls.push(u);
      const auth = ((init?.headers ?? {}) as Record<string, string>)["authorization"];
      if (u.includes("/v1/conta/favoritos")) {
        return Response.json({ lojas: [loja("a"), loja("b")], pagina: 1, porPagina: 50, total: 2 });
      }
      if (u.includes("/v1/conta/recentes")) {
        return Response.json({ lojas: [loja("b"), loja("c")], pagina: 1, porPagina: 50, total: 2 });
      }
      if (u.includes("/v1/feed/produtos")) {
        return Response.json({
          produtos: [produto("p1", 1500), produto("p2", null)],
          pagina: 1,
          porPagina: 8,
          total: 2,
          auth,
        });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Suas lojas", () => {
  it("[CA-10] @spec:AC-10610 mostra as favoritas e as recentes da conta, sem repetir", async () => {
    const dados = await dadosDeSuasLojas("tok-a");
    expect(dados.estado === "ok" && dados.lojas.map((l) => l.apelido)).toEqual(["a", "b", "c"]);
  });

  it("[CA-12] @spec:AC-10612 o visitante não pede nada de conta e vê o convite", async () => {
    const dados = await dadosDeSuasLojas(undefined);
    expect(dados.estado).toBe("visitante");
    expect(urls.filter((u) => u.includes("/v1/conta/"))).toHaveLength(0);
    const html = renderToStaticMarkup(<SuasLojas estado="visitante" lojas={[]} voltarPara="/explorar/produtos" />);
    expect(html).toContain("Entre para ver");
    expect(html).toContain("/entrar?proximo=");
  });

  it("[CA-14] @spec:AC-10614 sessão vencida pede para entrar, não mostra 'sem lojas'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const dados = await dadosDeSuasLojas("tok-vencido");
    expect(dados.estado).toBe("sessao-vencida");
    const html = renderToStaticMarkup(<SuasLojas estado="sessao-vencida" lojas={[]} voltarPara="/explorar/produtos" />);
    expect(html).toContain("Entre de novo");
  });

  it("[CA-12] @spec:AC-10612 sem lojas a seção some inteira", () => {
    expect(renderToStaticMarkup(<SuasLojas estado="ok" lojas={[]} voltarPara="/" />)).toBe("");
  });
});

describe("Destaques e ofertas", () => {
  const consulta = lerConsulta("produtos", {});
  const html = renderToStaticMarkup(
    <Destaques
      aba="recentes"
      produtos={[produto("p1", 1500), produto("p2", null)] as never}
      consulta={consulta}
      enderecoDaAba={(a) => `/explorar/produtos?destaques=${a}`}
    />,
  );

  it("[CA-20] @spec:AC-10620 o preço 'de' só aparece quando a loja informou", () => {
    expect(html.match(/<s /g)).toHaveLength(1);
  });

  it("[CA-21] @spec:AC-10621 só as abas Recentes e Atacado, sem 'Mais pedidos'", () => {
    expect(html).toContain("Recentes");
    expect(html).toContain("Atacado");
    expect(html).not.toMatch(/Mais pedidos/i);
  });

  it("[CA-21] @spec:AC-10621 a aba Atacado usa o filtro existente e a ordem recentes", async () => {
    expect(abaDeDestaques("atacado")).toBe("atacado");
    expect(abaDeDestaques("qualquer")).toBe("recentes");
    await destaquesDoInicio(lerConsulta("produtos", {}), "atacado", undefined);
    expect(urls[0]).toContain("atacado=1");
    expect(urls[0]).toContain("ordem=recentes");
    expect(urls[0]).toContain("porPagina=8");
  });

  it("[CA-25] @spec:AC-10625 sem produtos aparece um caminho útil", () => {
    const vazio = renderToStaticMarkup(
      <Destaques aba="atacado" produtos={[]} consulta={consulta} enderecoDaAba={() => "/x"} />,
    );
    expect(vazio).toContain("Ver as lojas");
  });

  it("[CA-3] @spec:AC-10603 a seção tem 'Ver todos' para a lista completa", () => {
    expect(html).toContain("Ver todos");
  });
});

describe("composição e ações", () => {
  const css = readFileSync(join(RAIZ, "feed.css"), "utf8");

  it("[CA-2] @spec:AC-10602 no computador: lojas em 3 colunas e destaques em 4", () => {
    const bloco = css.slice(css.indexOf("@media (min-width: 1280px)", css.indexOf(".sc-inicio__secao")));
    expect(bloco).toMatch(/\.sc-inicio__lojas[^}]*repeat\(3,/s);
    expect(bloco).toMatch(/\.sc-inicio__produtos[^}]*repeat\(4,/s);
  });

  it("[CA-1] @spec:AC-10601 no celular só a faixa de lojas rola na horizontal", () => {
    expect(css).toMatch(/\.sc-inicio__lojas \{[^}]*overflow-x: auto/s);
    expect(css).not.toMatch(/\.sc-inicio__produtos \{[^}]*overflow-x/s);
  });

  it("[CA-4] @spec:AC-10604 sem banner de destaque", () => {
    const tela = readFileSync(join(RAIZ, "TelaDoFeed.tsx"), "utf8");
    expect(tela).not.toMatch(/banner/i);
  });

  it("[CA-23] @spec:AC-10623 os comentários usam a Gaveta do #104", () => {
    const gaveta = readFileSync(join(RAIZ, "GavetaDeComentarios.tsx"), "utf8");
    expect(gaveta).toContain("<Gaveta");
    expect(gaveta).not.toContain("showModal");
  });

  it("[CA-23] @spec:AC-10623 curtir é ✦ (brilho) e favoritar é ★ (estrela)", () => {
    expect(readFileSync(join(RAIZ, "Post.tsx"), "utf8")).toContain("IconeBrilho");
    expect(readFileSync(join(RAIZ, "BotaoFavoritar.tsx"), "utf8")).toContain("IconeEstrela");
  });
});

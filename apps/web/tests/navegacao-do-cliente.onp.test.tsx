/**
 * As regras da navegação do cliente (card #105): um item ativo por rota,
 * itens por papel sem atalho indevido, abas do feed que levam os filtros
 * compatíveis e uma regra só de "sem barra".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/explorar/produtos" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import { RodapeLegal } from "../src/features/legal/RodapeLegal.tsx";
import {
  abasDoTopo,
  avatarEmPerfil,
  enderecoDaAbaDoFeed,
  itemPrincipalAtivo,
  itensPrincipais,
  type IdDoItemPrincipal,
} from "../src/features/usuario/regras-da-navegacao.ts";
import {
  caminhoSemBarra,
  itensDoUsuario,
  VISITANTE,
  type UsuarioDaBarra,
} from "../src/lib/quem-esta-logado.ts";

const comoLogado = (
  papel: "cliente" | "dono" | "equipe" | "admin",
): UsuarioDaBarra => ({
  papel,
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja:
    papel === "dono" || papel === "equipe"
      ? { apelido: "padaria", nome: "Padaria" }
      : null,
  temOutrasLojas: papel === "dono",
});

const TABELA: readonly (readonly [string, IdDoItemPrincipal | null])[] = [
  ["/explorar", "explorar"],
  ["/explorar/produtos", "produtos"],
  ["/explorar/lojas", "lojas"],
  ["/loja/padaria", "lojas"],
  ["/loja/padaria/sobre", "lojas"],
  ["/loja/padaria/cardapio", "lojas"],
  ["/loja/padaria/produto/p1", "lojas"],
  ["/loja/padaria/carrinho", "lojas"],
  ["/loja/padaria/checkout", "lojas"],
  ["/loja/padaria/pedido/TOKEN", "pedidos"],
  ["/conta/favoritos", "favoritos"],
  ["/conta/pedidos", "pedidos"],
  ["/conta/pedidos/p1", "pedidos"],
  ["/conta", "perfil"],
  ["/conta/dados", "perfil"],
  ["/conta/enderecos", "perfil"],
  ["/conta/seguranca", "perfil"],
  ["/conta/seguranca/aplicativo", "perfil"],
  ["/painel", null],
  ["/admin/lojas", null],
  ["/escolher-loja", null],
  ["/", null],
];

describe("um item ativo por rota", () => {
  it.each(TABELA)("[CA-7] @spec:AC-10501 %s → %s", (caminho, esperado) => {
    expect(itemPrincipalAtivo(caminho)).toBe(esperado);
  });

  it("[CA-7] @spec:AC-10501 sem caminho nenhum item fica ativo", () => {
    expect(itemPrincipalAtivo(null)).toBeNull();
  });

  it("[CA-7] @spec:AC-10501 /explorar/lojas ativa só Lojas (nunca Explorar junto)", () => {
    const itens = itensPrincipais({
      usuario: comoLogado("cliente"),
      caminho: "/explorar/lojas",
    });
    expect(itens.filter((i) => i.ativo).map((i) => i.id)).toEqual(["lojas"]);
  });

  it.each(TABELA.filter(([, id]) => id !== null))(
    "[CA-7] @spec:AC-10503 %s tem exatamente um item ativo na barra",
    (caminho) => {
      const itens = itensPrincipais({
        usuario: comoLogado("cliente"),
        caminho,
      });
      expect(itens).toHaveLength(5);
      expect(itens.filter((i) => i.ativo)).toHaveLength(1);
    },
  );

  it("[CA-7] @spec:AC-10503 a barra tem cinco rótulos visíveis e rotas existentes", () => {
    const itens = itensPrincipais({
      usuario: comoLogado("cliente"),
      caminho: "/explorar/produtos",
    });
    expect(itens.map((i) => i.rotulo)).toEqual([
      "Explorar",
      "Lojas",
      "Favoritos",
      "Pedidos",
      "Perfil",
    ]);
    expect(itens.map((i) => i.href)).toEqual([
      "/explorar",
      "/explorar/lojas",
      "/conta/favoritos",
      "/conta/pedidos",
      "/conta/dados",
    ]);
  });

  it("[CA-6] o Perfil de quem tem sessão abre o modal Minha conta; o visitante só entra", () => {
    const perfil = (usuario: UsuarioDaBarra) =>
      itensPrincipais({ usuario, caminho: "/explorar/produtos" }).find(
        (i) => i.id === "perfil",
      );
    expect(perfil(comoLogado("cliente"))?.atributos).toEqual({
      "data-abre-conta": "dados",
    });
    expect(perfil(VISITANTE)?.atributos).toBeUndefined();
    // Favoritos e Pedidos continuam links comuns.
    const outros = itensPrincipais({
      usuario: comoLogado("cliente"),
      caminho: "/explorar/produtos",
    }).filter((i) => i.id !== "perfil");
    expect(outros.every((i) => i.atributos === undefined)).toBe(true);
  });

  it("[CA-7] @spec:AC-10501 as abas do topo são Explorar, Lojas, Produtos, Favoritos e Pedidos; Perfil é o avatar", () => {
    const abas = abasDoTopo({
      usuario: comoLogado("cliente"),
      caminho: "/conta/dados",
    });
    expect(abas.map((a) => a.id)).toEqual([
      "explorar",
      "lojas",
      "produtos",
      "favoritos",
      "pedidos",
    ]);
    // Em Perfil nenhuma aba é a página atual; o avatar ganha o estado.
    expect(abas.some((a) => a.ativo)).toBe(false);
    expect(avatarEmPerfil("/conta/dados")).toBe(true);
    expect(avatarEmPerfil("/conta/pedidos")).toBe(false);
  });
});

describe("itens por papel", () => {
  const todos = [
    ["visitante", VISITANTE],
    ["cliente", comoLogado("cliente")],
    ["dono", comoLogado("dono")],
    ["equipe", comoLogado("equipe")],
    ["admin", comoLogado("admin")],
  ] as const;

  const hrefsDoMenu = (usuario: UsuarioDaBarra) =>
    itensDoUsuario(usuario, "/explorar/produtos").map((i) => i.href);
  const hrefsDaBarra = (usuario: UsuarioDaBarra, caminho: string) =>
    [
      ...itensPrincipais({ usuario, caminho }),
      ...abasDoTopo({ usuario, caminho }),
    ].map((i) => i.href);

  it.each(todos)(
    "[CA-8] @spec:AC-10515 %s: a barra e as abas nunca levam ao painel nem à administração",
    (_, usuario) => {
      for (const caminho of ["/explorar/produtos", "/loja/padaria", "/conta"]) {
        for (const href of hrefsDaBarra(usuario, caminho)) {
          expect(href).not.toMatch(/^\/(?:painel|admin)/);
        }
      }
    },
  );

  it("[CA-8] @spec:AC-10515 visitante e cliente nunca recebem /painel nem /admin no menu", () => {
    for (const usuario of [VISITANTE, comoLogado("cliente")]) {
      for (const href of hrefsDoMenu(usuario)) {
        expect(href).not.toMatch(/^\/(?:painel|admin)/);
      }
    }
  });

  it("[CA-8] @spec:AC-10515 dono e equipe recebem o painel e nunca /admin", () => {
    for (const papel of ["dono", "equipe"] as const) {
      const hrefs = hrefsDoMenu(comoLogado(papel));
      expect(hrefs).toContain("/painel");
      expect(hrefs.some((h) => h.startsWith("/admin"))).toBe(false);
    }
  });

  it("[CA-8] @spec:AC-10515 só o administrador recebe /admin", () => {
    expect(hrefsDoMenu(comoLogado("admin"))).toContain("/admin");
  });

  it("[CA-8] @spec:AC-10515 o papel vem só do usuário recebido, nunca do endereço", () => {
    const adulterado = itensPrincipais({
      usuario: VISITANTE,
      caminho: "/explorar/produtos",
      busca: new URLSearchParams("papel=admin&admin=1"),
    });
    expect(adulterado.map((i) => i.href).join(" ")).not.toContain("/admin");
  });

  it("[CA-8] @spec:AC-10511 visitante entra e volta para onde tocou", () => {
    const itens = itensPrincipais({
      usuario: VISITANTE,
      caminho: "/explorar/produtos",
    });
    const porId = Object.fromEntries(itens.map((i) => [i.id, i.href]));
    expect(porId["favoritos"]).toBe("/entrar?proximo=%2Fconta%2Ffavoritos");
    expect(porId["pedidos"]).toBe("/entrar?proximo=%2Fconta%2Fpedidos");
    expect(porId["perfil"]).toBe("/entrar?proximo=%2Fconta%2Fdados");
    expect(itens.every((i) => i.atributos === undefined)).toBe(true);
  });

  it("[CA-8] @spec:AC-10511 dentro da loja o visitante abre a janela de acesso", () => {
    const itens = itensPrincipais({
      usuario: VISITANTE,
      caminho: "/loja/padaria/cardapio",
    });
    for (const id of ["favoritos", "pedidos", "perfil"]) {
      const item = itens.find((i) => i.id === id);
      expect(item?.atributos).toEqual({ "data-abre-acesso": "entrar" });
      expect(item?.href).toMatch(/^\/entrar\?proximo=/);
    }
    expect(itens.find((i) => i.id === "explorar")?.atributos).toBeUndefined();
  });

  it("[CA-8] @spec:AC-10514 o endereço de retorno do visitante não leva segredo nem coordenada", () => {
    const itens = itensPrincipais({
      usuario: VISITANTE,
      caminho: "/loja/padaria/pedido/SEGREDO",
      busca: new URLSearchParams("lat=-23.5&lng=-46.6"),
    });
    const texto = itens.map((i) => decodeURIComponent(i.href)).join(" ");
    expect(texto).not.toContain("SEGREDO");
    expect(texto).not.toMatch(/lat=|lng=/);
  });
});

describe("abas do feed levam os filtros compatíveis", () => {
  const busca = new URLSearchParams(
    "busca=pao&tipo=FOOD_SNACK&entrega=entrega&categoria=salgados&ordem=menor-preco&atacado=1&pagina=3",
  );

  it("[CA-9] @spec:AC-10525 de Explorar para Lojas mantém busca e filtros comuns e solta os de produtos", () => {
    const destino = enderecoDaAbaDoFeed("/explorar/produtos", busca, "lojas");
    const url = new URL(destino, "https://x.test");
    expect(url.pathname).toBe("/explorar/lojas");
    expect(url.searchParams.get("busca")).toBe("pao");
    expect(url.searchParams.get("tipo")).toBe("FOOD_SNACK");
    expect(url.searchParams.get("entrega")).toBe("entrega");
    // Só valem em produtos: não aparecem na lista de lojas.
    expect(url.searchParams.get("categoria")).toBeNull();
    expect(url.searchParams.get("atacado")).toBeNull();
    // A página 3 de outra lista não existe.
    expect(url.searchParams.get("pagina")).toBeNull();
  });

  it("[CA-9] @spec:AC-10525 de Lojas para Explorar mantém busca e filtros comuns", () => {
    const destino = enderecoDaAbaDoFeed(
      "/explorar/lojas",
      new URLSearchParams("busca=pao&lista=favoritas&entrega=retirada"),
      "produtos",
    );
    const url = new URL(destino, "https://x.test");
    expect(url.pathname).toBe("/explorar/produtos");
    expect(url.searchParams.get("busca")).toBe("pao");
    expect(url.searchParams.get("entrega")).toBe("retirada");
    expect(url.searchParams.get("lista")).toBeNull();
  });

  it("[CA-9] @spec:AC-10525 vindo de fora do feed o endereço é o limpo", () => {
    expect(enderecoDaAbaDoFeed("/conta", busca, "lojas")).toBe(
      "/explorar/lojas",
    );
    expect(enderecoDaAbaDoFeed("/loja/padaria", undefined, "produtos")).toBe(
      "/explorar/produtos",
    );
  });
});

describe("uma regra só de sem barra", () => {
  it("[CA-10] @spec:AC-10524 a TV da loja não tem barra", () => {
    expect(caminhoSemBarra("/loja/padaria/tv")).toBe(true);
    expect(caminhoSemBarra("/tv")).toBe(true);
    expect(caminhoSemBarra("/loja/padaria/tvs")).toBe(false);
    expect(caminhoSemBarra("/explorar")).toBe(false);
  });

  it("[CA-10] @spec:AC-10524 o rodapé usa a mesma regra do topo e da barra", () => {
    rota.caminho = "/loja/padaria/tv";
    expect(renderToStaticMarkup(<RodapeLegal />)).toBe("");
    rota.caminho = "/loja/padaria/tv/";
    expect(renderToStaticMarkup(<RodapeLegal />)).toBe("");
    rota.caminho = "/loja/padaria/cardapio";
    expect(renderToStaticMarkup(<RodapeLegal />)).toContain("sc-rodape-legal");
    rota.caminho = "/explorar/produtos";
  });
});

describe("abas do topo no feed (card #152)", () => {
  const usuario = comoLogado("cliente");

  it.each([
    ["/explorar", "explorar"],
    ["/explorar/produtos", "produtos"],
    ["/explorar/lojas", "lojas"],
  ])("[CA-1] em %s só a aba %s está ativa", (caminho, esperada) => {
    const abas = abasDoTopo({ usuario, caminho });
    expect(abas.filter((a) => a.ativo).map((a) => a.id)).toEqual([esperada]);
  });

  it("[CA-1] cada aba leva ao endereço certo", () => {
    const hrefs = abasDoTopo({ usuario, caminho: "/conta/pedidos" }).map((a) => a.href);
    expect(hrefs).toEqual([
      "/explorar",
      "/explorar/lojas",
      "/explorar/produtos",
      "/conta/favoritos",
      "/conta/pedidos",
    ]);
  });

  it("[CA-1] Lojas e Produtos levam busca e filtros; Explorar leva só a região", () => {
    const busca = new URLSearchParams("busca=pizza&entrega=entrega&lat=-23.55&lng=-46.63");
    const abas = abasDoTopo({ usuario, caminho: "/explorar/produtos", busca });
    const href = (id: string) => abas.find((a) => a.id === id)?.href ?? "";
    expect(href("lojas")).toContain("/explorar/lojas?");
    expect(href("lojas")).toContain("busca=pizza");
    expect(href("produtos")).toMatch(/^\/explorar\/produtos\?.*busca=pizza/);
    expect(href("explorar")).toBe("/explorar?lat=-23.55&lng=-46.63");
  });

  it("[CA-2] a barra do celular segue com 5 destinos e sem Produtos", () => {
    const ids = itensPrincipais({ usuario, caminho: "/explorar" }).map((i) => i.id);
    expect(ids).toEqual(["explorar", "lojas", "favoritos", "pedidos", "perfil"]);
  });
});

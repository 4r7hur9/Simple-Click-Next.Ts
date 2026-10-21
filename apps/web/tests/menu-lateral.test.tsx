// @vitest-environment jsdom
/**
 * Prova do menu lateral: as seções aparecem com título e TODOS os itens à
 * vista (sem grupo que abra e feche), a página atual é anunciada, o selo de
 * contador fala o número, e a gaveta do celular fecha com Esc devolvendo o
 * foco a quem abriu.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/painel/pedidos" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import {
  IconeInicio,
  IconePedido,
  IconePedidoManual,
  IconeProduto,
} from "@simpleclick/ui";

import {
  MenuLateral,
  itemEstaAtivo,
  type ItemDoMenu,
  type SecaoDoMenu,
} from "../src/features/painel/MenuLateral.tsx";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

function exigir<T>(achado: T | null, nome: string): T {
  if (achado === null) throw new Error(`não achei ${nome} na tela`);
  return achado;
}

const inicio: ItemDoMenu = {
  rotulo: "Início",
  href: "/painel",
  icone: IconeInicio,
  exato: true,
};
const pedidos: ItemDoMenu = {
  rotulo: "Pedidos",
  href: "/painel/pedidos",
  icone: IconePedido,
  excluir: ["/painel/pedidos/novo"],
  contador: 3,
};
const novoPedido: ItemDoMenu = {
  rotulo: "Novo pedido",
  href: "/painel/pedidos/novo",
  icone: IconePedidoManual,
};
const produtos: ItemDoMenu = {
  rotulo: "Produtos",
  href: "/painel/produtos",
  icone: IconeProduto,
};
const verLoja: ItemDoMenu = {
  rotulo: "Ver loja",
  href: "/loja/pastelaria",
  icone: IconeInicio,
  novaAba: true,
};

const secoes: readonly SecaoDoMenu[] = [
  { titulo: "Operação", itens: [inicio, pedidos, novoPedido] },
  { titulo: "Catálogo", itens: [produtos] },
  { titulo: "Minha loja", itens: [verLoja] },
];

function menu(): HTMLElement {
  return montar(
    <MenuLateral
      rotulo="Navegação do painel"
      marca={<a href="/painel">simpleclick</a>}
      secoes={secoes}
      atalhos={[pedidos, inicio]}
      botaoDoMenuNosAtalhos
    />,
  );
}

function navegacao(tela: HTMLElement): HTMLElement {
  return exigir(
    tela.querySelector<HTMLElement>('nav[aria-label="Navegação do painel"]'),
    "a navegação",
  );
}

beforeEach(() => {
  rota.caminho = "/painel/pedidos";
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});
afterEach(desmontar);

describe("o menu lateral", () => {
  it("mostra cada seção com o título e todos os itens de uma vez", () => {
    const nav = navegacao(menu());
    const titulos = [...nav.querySelectorAll("h2")].map((t) => t.textContent);
    expect(titulos).toEqual(["Operação", "Catálogo", "Minha loja"]);
    const links = [...nav.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "/painel",
      "/painel/pedidos",
      "/painel/pedidos/novo",
      "/painel/produtos",
      "/loja/pastelaria",
    ]);
  });

  it("não tem grupo que abre e fecha nem item escondido", () => {
    const nav = navegacao(menu());
    expect(nav.querySelector("[aria-expanded]")).toBeNull();
    expect(nav.querySelector("[hidden]")).toBeNull();
  });

  it("cada seção é uma região nomeada pelo próprio título", () => {
    const nav = navegacao(menu());
    const secao = exigir(nav.querySelector("section"), "a primeira seção");
    const titulo = exigir(secao.querySelector("h2"), "o título");
    expect(secao.getAttribute("aria-labelledby")).toBe(titulo.id);
  });

  it("marca só a página atual com aria-current", () => {
    const nav = navegacao(menu());
    const atuais = [...nav.querySelectorAll('[aria-current="page"]')];
    expect(atuais.map((link) => link.getAttribute("href"))).toEqual([
      "/painel/pedidos",
    ]);
  });

  it("'Novo pedido' não deixa 'Pedidos' marcado junto", () => {
    rota.caminho = "/painel/pedidos/novo";
    const nav = navegacao(menu());
    const atuais = [...nav.querySelectorAll('[aria-current="page"]')];
    expect(atuais.map((link) => link.getAttribute("href"))).toEqual([
      "/painel/pedidos/novo",
    ]);
  });

  it("o item de uma ficha de pedido mantém 'Pedidos' ativo", () => {
    expect(itemEstaAtivo("/painel/pedidos/42", pedidos)).toBe(true);
    expect(itemEstaAtivo("/painel/pedidos/novo", pedidos)).toBe(false);
  });

  it("o início só é atual no endereço exato", () => {
    expect(itemEstaAtivo("/painel", inicio)).toBe(true);
    expect(itemEstaAtivo("/painel/pedidos", inicio)).toBe(false);
  });

  it("o link da vitrine abre em outra aba, avisa e nunca fica como atual", () => {
    rota.caminho = "/loja/pastelaria";
    const nav = navegacao(menu());
    const link = exigir(
      nav.querySelector<HTMLAnchorElement>('a[href="/loja/pastelaria"]'),
      "o link da vitrine",
    );
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.textContent).toContain("abre em outra aba");
    expect(link.hasAttribute("aria-current")).toBe(false);
  });

  it("o selo de contador diz o número também para o leitor de tela", () => {
    const nav = navegacao(menu());
    const link = exigir(
      nav.querySelector('a[href="/painel/pedidos"]'),
      "o link de pedidos",
    );
    expect(link.textContent).toContain("3");
    expect(link.textContent).toContain("3 novos");
  });

  it("a gaveta abre como diálogo, fecha com Esc e devolve o foco", () => {
    const tela = menu();
    const abrir = exigir(
      tela.querySelector<HTMLButtonElement>("header button[aria-expanded]"),
      "o botão de abrir",
    );
    abrir.focus();
    clicar(abrir);
    const gaveta = exigir(tela.querySelector("aside"), "a gaveta");
    expect(abrir.getAttribute("aria-expanded")).toBe("true");
    expect(gaveta.getAttribute("role")).toBe("dialog");
    expect(gaveta.getAttribute("aria-modal")).toBe("true");

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(abrir.getAttribute("aria-expanded")).toBe("false");
    expect(gaveta.hasAttribute("role")).toBe(false);
    expect(document.activeElement).toBe(abrir);
  });

  it("a barra de atalhos mostra os atalhos pedidos, com o atual marcado, e o botão Menu abre a gaveta", () => {
    const tela = menu();
    const atalhos = exigir(
      tela.querySelector('nav[aria-label="Atalhos"]'),
      "a barra de atalhos",
    );
    const links = [...atalhos.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/painel/pedidos",
      "/painel",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");

    const botao = exigir(
      atalhos.querySelector<HTMLButtonElement>("button"),
      "o botão Menu",
    );
    expect(botao.textContent).toBe("Menu");
    clicar(botao);
    expect(
      exigir(tela.querySelector("aside"), "a gaveta").getAttribute("role"),
    ).toBe("dialog");
  });

  it("a lista simples (administração) continua funcionando", () => {
    const tela = montar(
      <MenuLateral
        rotulo="Navegação da administração"
        marca={<a href="/admin">simpleclick</a>}
        itens={[inicio]}
        itensDoRodape={[produtos]}
      />,
    );
    const links = [
      ...exigir(
        tela.querySelector('nav[aria-label="Navegação da administração"]'),
        "a navegação",
      ).querySelectorAll("a"),
    ];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/painel",
      "/painel/produtos",
    ]);
  });
});

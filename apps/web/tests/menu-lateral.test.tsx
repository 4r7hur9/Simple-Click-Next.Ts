// @vitest-environment jsdom
/**
 * Prova do menu lateral do painel: a página atual é anunciada, o grupo de
 * configurações abre e fecha dizendo o estado, e a gaveta do celular fecha
 * com Esc devolvendo o foco a quem abriu.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/painel/pedidos" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.caminho }));

import { IconeConfiguracoes, IconeInicio, IconePedido } from "@simpleclick/ui";

import {
  MenuLateral,
  itemEstaAtivo,
  type ItemDoMenu,
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
};
const configuracoes: ItemDoMenu = {
  rotulo: "Configurações",
  href: "/painel/config/pagamento",
  icone: IconeConfiguracoes,
  subitens: [
    { rotulo: "Pagamento", href: "/painel/config/pagamento" },
    { rotulo: "Entrega", href: "/painel/config/entrega" },
  ],
};

function menu(): HTMLElement {
  return montar(
    <MenuLateral
      rotulo="Navegação do painel"
      marca={<a href="/painel">simpleclick</a>}
      itens={[inicio, pedidos, configuracoes]}
      atalhos={[pedidos, inicio]}
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
  it("marca só a página atual com aria-current", () => {
    const nav = navegacao(menu());
    const atuais = [...nav.querySelectorAll('[aria-current="page"]')];
    expect(atuais.map((link) => link.getAttribute("href"))).toEqual([
      "/painel/pedidos",
    ]);
  });

  it("o início só é atual no endereço exato", () => {
    expect(itemEstaAtivo("/painel", inicio)).toBe(true);
    expect(itemEstaAtivo("/painel/pedidos", inicio)).toBe(false);
    expect(itemEstaAtivo("/painel/pedidos/42", pedidos)).toBe(true);
    expect(itemEstaAtivo("/painel/config/entrega", configuracoes)).toBe(true);
  });

  it("o grupo abre e fecha dizendo o estado em aria-expanded", () => {
    const nav = navegacao(menu());
    const botao = exigir(
      nav.querySelector<HTMLButtonElement>("button[aria-expanded]"),
      "o botão do grupo",
    );
    const lista = exigir(
      nav.querySelector<HTMLElement>(
        `#${CSS.escape(botao.getAttribute("aria-controls") ?? "")}`,
      ),
      "a lista do grupo",
    );
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(lista.hidden).toBe(true);
    clicar(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(lista.hidden).toBe(false);
  });

  it("o grupo da página atual já começa aberto, com o subitem atual marcado", () => {
    rota.caminho = "/painel/config/entrega";
    const nav = navegacao(menu());
    const botao = exigir(
      nav.querySelector("button[aria-expanded]"),
      "o botão do grupo",
    );
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const atual = exigir(
      nav.querySelector('ul:not([hidden]) [aria-current="page"]'),
      "o subitem atual",
    );
    expect(atual.textContent).toBe("Entrega");
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

  it("a barra de atalhos mostra os atalhos pedidos, com o atual marcado", () => {
    const atalhos = exigir(
      menu().querySelector('nav[aria-label="Atalhos"]'),
      "a barra de atalhos",
    );
    const links = [...atalhos.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Pedidos",
      "Início",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
  });
});

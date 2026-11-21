// @vitest-environment jsdom
/**
 * A barra inferior do cliente (card #105): cinco destinos com rótulo visível,
 * uma página atual, nome próprio (nunca "Atalhos"), some com o teclado virtual
 * e só existe abaixo de 64rem.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { desmontar, exigir, montar } from "./apoio-config.tsx";

const rota = vi.hoisted(() => ({ caminho: "/explorar/produtos", busca: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(rota.busca),
}));

import { BarraInferiorDoCliente } from "../src/features/usuario/BarraInferiorDoCliente.tsx";
import {
  eCampoDeTexto,
  tecladoAberto,
} from "../src/features/usuario/regras-da-navegacao.ts";
import { VISITANTE, type UsuarioDaBarra } from "../src/lib/quem-esta-logado.ts";

const cliente: UsuarioDaBarra = {
  papel: "cliente",
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja: null,
  temOutrasLojas: false,
};

beforeEach(() => {
  rota.caminho = "/explorar/produtos";
  rota.busca = "";
});
afterEach(() => {
  desmontar();
  Reflect.deleteProperty(window, "visualViewport");
  for (const campo of document.querySelectorAll("input.campo-de-teste")) {
    campo.remove();
  }
});

const barra = (usuario: UsuarioDaBarra) =>
  montar(<BarraInferiorDoCliente usuario={usuario} />);
const nav = (tela: HTMLElement) => exigir<HTMLElement>(tela, "nav");

describe("a barra", () => {
  it("[CA-14] @spec:AC-10503 tem o nome 'Navegação principal' e nunca 'Atalhos'", () => {
    const tela = barra(cliente);
    expect(nav(tela).getAttribute("aria-label")).toBe("Navegação principal");
    expect(tela.querySelector('nav[aria-label="Atalhos"]')).toBeNull();
  });

  it("[CA-14] @spec:AC-10503 mostra cinco itens com rótulo visível e rota existente", () => {
    const tela = barra(cliente);
    const itens = [...tela.querySelectorAll<HTMLAnchorElement>("a")];
    expect(itens.map((i) => i.textContent)).toEqual([
      "Explorar",
      "Lojas",
      "Favoritos",
      "Pedidos",
      "Perfil",
    ]);
    expect(itens.map((i) => i.getAttribute("href"))).toEqual([
      "/explorar",
      "/explorar/lojas",
      "/conta/favoritos",
      "/conta/pedidos",
      "/conta/dados",
    ]);
    // O Perfil abre o modal Minha conta (card #151); os outros quatro navegam.
    expect(
      itens.map((i) => i.getAttribute("data-abre-conta")),
    ).toEqual([null, null, null, null, "dados"]);
    // O rótulo é texto visível, não só o ícone.
    expect(tela.querySelectorAll(".sc-barra-inferior__rotulo")).toHaveLength(5);
  });

  it.each([
    ["/explorar/produtos", "Explorar"],
    ["/explorar/lojas", "Lojas"],
    ["/loja/padaria/cardapio", "Lojas"],
    ["/conta/favoritos", "Favoritos"],
    ["/conta/pedidos/p1", "Pedidos"],
    ["/loja/padaria/pedido/TOKEN", "Pedidos"],
    ["/conta/seguranca", "Perfil"],
  ])(
    "[CA-14] @spec:AC-10503 em %s só %s é a página atual",
    (caminho, esperado) => {
      rota.caminho = caminho;
      const tela = barra(cliente);
      const atuais = tela.querySelectorAll('[aria-current="page"]');
      expect([...atuais].map((a) => a.textContent)).toEqual([esperado]);
    },
  );

  it("[CA-14] @spec:AC-10524 some na TV da loja", () => {
    rota.caminho = "/loja/padaria/tv";
    expect(barra(cliente).querySelector("nav")).toBeNull();
  });

  it("[CA-15] @spec:AC-10511 o visitante entra e volta para Favoritos, Pedidos e Perfil", () => {
    const tela = barra(VISITANTE);
    const href = (rotulo: string) =>
      [...tela.querySelectorAll("a")]
        .find((a) => a.textContent === rotulo)
        ?.getAttribute("href");
    expect(href("Favoritos")).toBe("/entrar?proximo=%2Fconta%2Ffavoritos");
    expect(href("Pedidos")).toBe("/entrar?proximo=%2Fconta%2Fpedidos");
    expect(href("Perfil")).toBe("/entrar?proximo=%2Fconta%2Fdados");
    expect(tela.querySelector("[data-abre-acesso]")).toBeNull();
  });

  it("[CA-15] @spec:AC-10511 dentro da loja o visitante abre a janela de acesso", () => {
    rota.caminho = "/loja/padaria/cardapio";
    const tela = barra(VISITANTE);
    const comJanela = [...tela.querySelectorAll("a[data-abre-acesso]")];
    expect(comJanela.map((a) => a.textContent)).toEqual([
      "Favoritos",
      "Pedidos",
      "Perfil",
    ]);
  });

  it("[CA-15] @spec:AC-10514 o retorno do visitante não leva o código do pedido", () => {
    rota.caminho = "/loja/padaria/pedido/SEGREDO";
    const tela = barra(VISITANTE);
    expect(tela.innerHTML).not.toContain("SEGREDO");
  });
});

describe("teclado virtual", () => {
  it("[CA-16] @spec:AC-10520 a regra pura: campo em foco e área visível bem menor", () => {
    expect(
      tecladoAberto({
        alturaDeReferencia: 800,
        alturaVisivel: 450,
        campoEmFoco: true,
      }),
    ).toBe(true);
    // Sem campo em foco (barra de endereço que some): não esconde.
    expect(
      tecladoAberto({
        alturaDeReferencia: 800,
        alturaVisivel: 450,
        campoEmFoco: false,
      }),
    ).toBe(false);
    // Campo em foco, mas a área quase não mudou.
    expect(
      tecladoAberto({
        alturaDeReferencia: 800,
        alturaVisivel: 760,
        campoEmFoco: true,
      }),
    ).toBe(false);
  });

  it("[CA-16] @spec:AC-10520 só campos de texto abrem o teclado", () => {
    const texto = document.createElement("input");
    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    const area = document.createElement("textarea");
    const botao = document.createElement("button");
    expect(eCampoDeTexto(texto)).toBe(true);
    expect(eCampoDeTexto(area)).toBe(true);
    expect(eCampoDeTexto(caixa)).toBe(false);
    expect(eCampoDeTexto(botao)).toBe(false);
    expect(eCampoDeTexto(null)).toBe(false);
  });

  it("[CA-16] @spec:AC-10520 a barra some (oculta) quando o teclado sobe e volta quando fecha", () => {
    const ouvintes: Array<() => void> = [];
    const janelaVisivel = {
      height: 800,
      addEventListener: (_: string, f: () => void) => ouvintes.push(f),
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, "visualViewport", {
      value: janelaVisivel,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    const campo = document.createElement("input");
    campo.className = "campo-de-teste";
    document.body.append(campo);

    const tela = barra(cliente);
    expect(nav(tela).hasAttribute("data-oculta")).toBe(false);

    act(() => {
      campo.focus();
      janelaVisivel.height = 450;
      ouvintes.forEach((f) => f());
    });
    expect(nav(tela).hasAttribute("data-oculta")).toBe(true);
    expect(nav(tela).hasAttribute("inert")).toBe(true);

    act(() => {
      campo.blur();
      janelaVisivel.height = 800;
      ouvintes.forEach((f) => f());
    });
    expect(nav(tela).hasAttribute("data-oculta")).toBe(false);
  });
});

describe("uma navegação por largura", () => {
  const css = readFileSync(
    join(__dirname, "../src/features/usuario/navegacao.css"),
    "utf8",
  );

  it("[CA-16] @spec:AC-10504 a barra some a partir de 64rem", () => {
    expect(css).toMatch(
      /@media \(min-width: 64rem\) \{\s*\.sc-barra-cliente \{\s*display: none;/,
    );
  });

  it("[CA-16] @spec:AC-10504 as abas do topo só aparecem a partir de 64rem", () => {
    expect(css).toMatch(/\.sc-topo-cliente__abas \{\s*display: none;/);
    expect(css).toMatch(
      /@media \(min-width: 64rem\) \{\s*\.sc-topo-cliente__abas \{\s*display: block;/,
    );
  });
});

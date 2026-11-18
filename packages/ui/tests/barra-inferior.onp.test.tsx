import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponenteDeLinkProps } from "../src/componente-de-link";
import { BarraInferior, type ItemDaBarraInferior } from "../src/barra-inferior";
import { Cartao } from "../src/cartao";
import {
  IconeInicio,
  IconeLoja,
  IconePedido,
  IconeUsuario,
} from "../src/icones";

/**
 * Barra de navegação inferior do celular (card #104, T-10407): mostra onde o
 * cliente está, tem rótulo visível em todo item e respeita a área segura.
 */

const ler = (relativo: string): string =>
  readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), "utf8");

const CSS = ler("../styles/componentes.css");
const TEMA = ler("../styles/theme.css");

const ITENS: readonly ItemDaBarraInferior[] = [
  {
    id: "explorar",
    rotulo: "Explorar",
    href: "/explorar",
    icone: <IconeInicio />,
    ativo: true,
  },
  {
    id: "lojas",
    rotulo: "Lojas",
    href: "/explorar/lojas",
    icone: <IconeLoja />,
  },
  {
    id: "pedidos",
    rotulo: "Pedidos",
    href: "/conta/pedidos",
    icone: <IconePedido />,
  },
  {
    id: "perfil",
    rotulo: "Perfil",
    aoAcionar: () => {},
    icone: <IconeUsuario />,
  },
];

describe("barra inferior", () => {
  it('[CA-14] @spec:AC-10414 é uma nav com o nome que quem chama dá, e nunca "Atalhos" por padrão', () => {
    const html = renderToStaticMarkup(
      <BarraInferior rotulo="Navegação principal" itens={ITENS} />,
    );
    expect(html).toMatch(/<nav[^>]*aria-label="Navegação principal"/);
    expect(html).not.toContain("Atalhos");
    expect(html).toContain("sc-barra-inferior");
  });

  it("[CA-14] @spec:AC-10414 a página atual aparece ativa e é anunciada como página atual", () => {
    const html = renderToStaticMarkup(
      <BarraInferior rotulo="Navegação principal" itens={ITENS} />,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /<a[^>]*href="\/explorar"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/explorar"/,
    );
    expect(html).toContain("sc-barra-inferior__item--ativo");
  });

  it("[CA-14] @spec:AC-10414 todo item tem rótulo visível, e o ícone é decorativo", () => {
    const html = renderToStaticMarkup(
      <BarraInferior rotulo="Navegação principal" itens={ITENS} />,
    );
    for (const item of ITENS) {
      expect(html).toContain(
        `<span class="sc-barra-inferior__rotulo">${item.rotulo}</span>`,
      );
    }
    expect(
      html.match(/class="sc-barra-inferior__icone" aria-hidden="true"/g),
    ).toHaveLength(4);
    // O rótulo não é só para o leitor de tela.
    expect(html).not.toMatch(/sc-barra-inferior__rotulo[^>]*sc-so-leitor/);
  });

  it("[CA-14] @spec:AC-10414 respeita a área segura do aparelho", () => {
    expect(CSS).toMatch(
      /\.sc-barra-inferior\s*\{[^}]*padding-block-end:\s*env\(safe-area-inset-bottom/,
    );
    expect(TEMA).toMatch(/--altura-da-barra-inferior:\s*4rem/);
    expect(CSS).toMatch(
      /\.sc-barra-inferior__lista\s*\{[^}]*min-height:\s*var\(--altura-da-barra-inferior\)/,
    );
  });

  it("[CA-14] @spec:AC-10414 usa o componente de link injetado e repassa atributos data-*", () => {
    function LinkDoApp({
      href,
      className,
      children,
      ...resto
    }: ComponenteDeLinkProps) {
      return (
        <a data-do-app href={href} className={className} {...resto}>
          {children}
        </a>
      );
    }
    const html = renderToStaticMarkup(
      <BarraInferior
        rotulo="Navegação principal"
        componenteDeLink={LinkDoApp}
        itens={[
          {
            id: "entrar",
            rotulo: "Entrar",
            href: "/entrar",
            icone: <IconeUsuario />,
            atributos: { "data-abre-acesso": "" },
          },
        ]}
      />,
    );
    expect(html).toContain("data-do-app");
    expect(html).toContain("data-abre-acesso");
  });

  it("[CA-14] @spec:AC-10414 item de ação vira botão, e o ativo dele não vira aria-current", () => {
    const html = renderToStaticMarkup(
      <BarraInferior
        rotulo="Navegação principal"
        itens={[
          {
            id: "perfil",
            rotulo: "Perfil",
            aoAcionar: () => {},
            icone: <IconeUsuario />,
            ativo: true,
          },
        ]}
      />,
    );
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("<a ");
  });

  it("[CA-14] @spec:AC-10414 oculta tira a barra da tela e da ordem do Tab", () => {
    const html = renderToStaticMarkup(
      <BarraInferior rotulo="Navegação principal" itens={ITENS} oculta />,
    );
    expect(html).toMatch(/<nav[^>]*\binert=""/);
    expect(html).toContain("data-oculta");
    expect(CSS).toMatch(
      /\.sc-barra-inferior\[data-oculta\]\s*\{\s*display:\s*none/,
    );

    const visivel = renderToStaticMarkup(
      <BarraInferior rotulo="Navegação principal" itens={ITENS} />,
    );
    expect(visivel).not.toContain("inert");
    expect(visivel).not.toContain("data-oculta");
  });

  it("[CA-14] @spec:AC-10414 o ativo usa a cor principal com letra escura, sem ler a cor de marca da loja", () => {
    const trecho = CSS.slice(CSS.indexOf("/* --- barra de navegação inferior"));
    expect(trecho).toMatch(
      /\.sc-barra-inferior__item--ativo \.sc-barra-inferior__icone\s*\{[^}]*background-color:\s*var\(--cor-primaria\)[^}]*color:\s*var\(--cor-em-primaria\)/,
    );
    expect(trecho).not.toMatch(/--cor-marca|--cor-sobre-marca/);
  });

  it("[CA-14] @spec:AC-10414 o cartão de vitrine é só uma superfície, sem papel interativo", () => {
    const html = renderToStaticMarkup(
      <Cartao superficie="vitrine" titulo="Pastelaria Sol">
        <p>Aberta agora</p>
      </Cartao>,
    );
    expect(html).toContain("sc-cartao--vitrine");
    expect(html).not.toMatch(/role=|tabindex/);
    expect(renderToStaticMarkup(<Cartao titulo="x" />)).not.toContain(
      "sc-cartao--vitrine",
    );
  });
});

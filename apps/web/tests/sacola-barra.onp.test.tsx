// @vitest-environment jsdom
/**
 * Prova da barra fixa da sacola e da troca de forma (card #110, T-11002).
 *
 * A barra é do celular e do tablet. O que o CSS declara (área segura, posição,
 * ponto de troca) é lido da folha; a largura real e a área segura do aparelho
 * são prova em navegador do #114.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BarraDaSacola } from "../src/features/carrinho/BarraDaSacola";
import {
  PONTO_DA_COLUNA,
  formaDaSacolaAgora,
  useFormaDaSacola,
} from "../src/features/carrinho/forma-da-sacola";

// O React só aceita `act` quando o ambiente diz que é um teste.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

function montar(elemento: React.ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(elemento));
  return container;
}

const FOLHA = readFileSync(
  resolve(__dirname, "../../../packages/ui/styles/fechamento.css"),
  "utf8",
);

/** O corpo da primeira regra cujo seletor é exatamente `seletor`. */
function regra(seletor: string): string {
  const inicio = FOLHA.indexOf(`\n${seletor} {`);
  if (inicio < 0) throw new Error(`regra ${seletor} não encontrada`);
  return FOLHA.slice(FOLHA.indexOf("{", inicio), FOLHA.indexOf("}", inicio));
}

describe("[CA-4] a barra mostra a contagem, o total e abre a sacola (AC-11004)", () => {
  it("[CA-4] @spec:AC-11004 com três itens: '3 itens', o subtotal e 'Ver sacola'", () => {
    const aoAbrir = vi.fn();
    const tela = montar(
      <BarraDaSacola contagem={3} total="R$ 46,99" aoAbrir={aoAbrir} />,
    );

    expect(tela.textContent).toContain("3 itens");
    expect(tela.textContent).toContain("R$ 46,99");
    const abrir = tela.querySelector("button");
    expect(abrir?.textContent).toBe("Ver sacola");
    // Abre um diálogo: quem usa leitor de tela é avisado.
    expect(abrir?.getAttribute("aria-haspopup")).toBe("dialog");
    // O nome acessível começa pelo texto visível e diz o resto.
    expect(abrir?.getAttribute("aria-label")).toBe(
      "Ver sacola: 3 itens, total R$ 46,99",
    );

    abrir?.click();
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it("[CA-4] @spec:AC-11004 com um item só, o singular; sem total ainda, só a contagem", () => {
    const tela = montar(
      <BarraDaSacola contagem={1} total={null} aoAbrir={() => {}} />,
    );

    expect(tela.textContent).toContain("1 item");
    expect(tela.textContent).not.toContain("1 itens");
    expect(tela.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Ver sacola: 1 item",
    );
  });

  it("[CA-4] @spec:AC-11004 é uma região com nome e o gancho do tutorial, e não a classe do botão antigo", () => {
    const tela = montar(
      <BarraDaSacola contagem={2} total="R$ 10,00" aoAbrir={() => {}} />,
    );

    const barra = tela.firstElementChild;
    expect(barra?.getAttribute("aria-label")).toBe("Sua sacola");
    expect(barra?.getAttribute("data-sacola")).toBe("barra");
    // `.sc-sacola` é do botão redondo arrastável, com CSS de posição própria.
    expect(barra?.classList.contains("sc-sacola")).toBe(false);
  });
});

describe("[CA-5] a barra não cobre o conteúdo nem o aparelho (AC-11005)", () => {
  it("[CA-5] @spec:AC-11005 fica fixa embaixo e respeita a área segura do aparelho", () => {
    const barra = regra(".sc-sacola-barra");

    expect(barra).toContain("position: fixed");
    expect(barra).toContain("inset-block-end: 0");
    expect(barra).toContain("env(safe-area-inset-bottom)");
    expect(barra).toContain("env(safe-area-inset-left)");
    expect(barra).toContain("env(safe-area-inset-right)");
  });

  it("[CA-5] @spec:AC-11005 sobe acima do aviso de cookies e some na forma de coluna", () => {
    expect(FOLHA).toMatch(
      /body:has\(\.sc-cookies\) \.sc-sacola-barra\s*\{[^}]*--altura-do-aviso-de-cookies/,
    );
    expect(FOLHA).toMatch(
      new RegExp(
        `@media \\(min-width: ${PONTO_DA_COLUNA}px\\)\\s*\\{\\s*\\.sc-sacola-barra\\s*\\{\\s*display: none`,
      ),
    );
  });

  it("[CA-5] @spec:AC-11005 o alvo de toque é o do cliente (48px) e o botão usa o foco visível da marca", () => {
    const abrir = regra(".sc-sacola-barra__abrir");
    expect(abrir).toContain("--altura-toque-cliente");
    expect(FOLHA).toMatch(
      /\.sc-sacola-barra__abrir:focus-visible\s*\{[^}]*outline: 3px solid var\(--cor-foco\)/,
    );
  });
});

describe("[CA-30] a forma da sacola segue a largura da janela (AC-11030)", () => {
  /** Um `matchMedia` que o teste controla: a janela alarga ou encolhe. */
  function janela(larguraInicial: number) {
    let largura = larguraInicial;
    const ouvintes = new Set<() => void>();
    vi.stubGlobal("matchMedia", (consulta: string) => ({
      get matches() {
        return (
          largura >= PONTO_DA_COLUNA &&
          consulta.includes(`${PONTO_DA_COLUNA}px`)
        );
      },
      media: consulta,
      addEventListener: (_: string, fn: () => void) => ouvintes.add(fn),
      removeEventListener: (_: string, fn: () => void) => ouvintes.delete(fn),
    }));
    return {
      mudarPara(nova: number) {
        largura = nova;
        act(() => ouvintes.forEach((fn) => fn()));
      },
    };
  }

  function Sonda({ aoVer }: { aoVer: (forma: string) => void }) {
    aoVer(useFormaDaSacola());
    return null;
  }

  it("[CA-30] @spec:AC-11030 a mesma sacola vira coluna ao alargar e barra ao encolher", () => {
    const controle = janela(800);
    const vistas: string[] = [];
    montar(<Sonda aoVer={(forma) => vistas.push(forma)} />);
    expect(vistas.at(-1)).toBe("barra");

    controle.mudarPara(1440);
    expect(vistas.at(-1)).toBe("coluna");

    controle.mudarPara(1000);
    expect(vistas.at(-1)).toBe("barra");
  });

  it("[CA-30] @spec:AC-11030 sem matchMedia (servidor, navegador antigo) vale a barra", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(formaDaSacolaAgora()).toBe("barra");
  });
});

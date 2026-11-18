// @vitest-environment jsdom
/**
 * Barra de filtros do painel com as peças da base visual (card #112,
 * T-11202): chip e gaveta do pacote, uma só gaveta montada, foco de volta,
 * fechar ao alargar. O que o painel já fazia (busca, limpar) não muda.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Atalho,
  BarraDeFiltros,
} from "../src/features/painel-filtros/BarraDeFiltros.tsx";
import { clicar, desmontar, montar } from "./apoio-config.tsx";

let largo = false;
let escuta: (() => void) | null = null;

beforeEach(() => {
  largo = false;
  escuta = null;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return largo;
    },
    addEventListener: (_: string, f: () => void) => (escuta = f),
    removeEventListener: () => (escuta = null),
  }));
});
afterEach(desmontar);

function barra(aoLimpar = () => undefined, ativo = false) {
  return montar(
    <BarraDeFiltros
      rotuloDaBusca="Buscar produtos"
      placeholder="Buscar"
      busca=""
      aoBuscar={() => undefined}
      filtros={[
        {
          tipo: "selecao",
          id: "estoque",
          rotulo: "Estoque",
          valor: "",
          opcoes: [{ valor: "", rotulo: "Todos" }],
          aoMudar: () => undefined,
        },
      ]}
      atalhos={
        <Atalho ativo={ativo} aoAlternar={() => undefined}>
          Acabando
        </Atalho>
      }
      contagem="1 de 1"
      ligados={0}
      filtrado
      aoLimpar={aoLimpar}
    />,
  );
}

describe("painel · barra de filtros", () => {
  it("[CA-1] @spec:AC-11218 o atalho é um Chip do pacote e a faixa tem nome", () => {
    const tela = barra(undefined, true);
    const chip = tela.querySelector("button.sc-chip");
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(tela.querySelector('[role="group"][aria-label]')).not.toBeNull();
    expect(tela.querySelector(".sc-filtros__chip")).toBeNull();
  });

  it("[CA-2] @spec:AC-11221 a gaveta só existe aberta, uma vez, e fecha ao alargar", () => {
    const tela = barra();
    expect(tela.querySelectorAll("dialog")).toHaveLength(1);
    expect(tela.querySelector(".sc-gaveta-modal__painel")).toBeNull();
    const botao = [...tela.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Filtros"),
    );
    if (!botao) throw new Error("sem botão Filtros");
    clicar(botao);
    expect(tela.querySelectorAll(".sc-gaveta-modal__painel")).toHaveLength(1);
    expect(tela.querySelector(".sc-so-leitor")?.textContent).toBe(
      "Fechar os filtros",
    );
    largo = true;
    act(() => escuta?.());
    expect(tela.querySelector(".sc-gaveta-modal__painel")).toBeNull();
  });

  it("[CA-3] @spec:AC-11220 limpar filtros continua chamando a ação", () => {
    const aoLimpar = vi.fn();
    const tela = barra(aoLimpar);
    const limpar = [...tela.querySelectorAll("button")].find(
      (b) => b.textContent === "Limpar filtros",
    );
    if (!limpar) throw new Error("sem Limpar filtros");
    clicar(limpar);
    expect(aoLimpar).toHaveBeenCalledTimes(1);
  });

  it("[CA-4] @spec:AC-11218 filtros.css não define mais chip nem gaveta próprios", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../packages/ui/styles/filtros.css"),
      "utf8",
    );
    expect(css).not.toMatch(/\.sc-filtros__chip\s*[{:]/);
    expect(css).not.toMatch(/\.sc-gaveta\s*\{/);
  });
});

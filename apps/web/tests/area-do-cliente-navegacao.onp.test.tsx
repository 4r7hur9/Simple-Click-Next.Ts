// @vitest-environment jsdom
/**
 * Seções da conta (card #111, AC-11122, AC-11124): a lista de seções com a
 * atual marcada e anunciada como página atual, sem convite de entrar.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  PaginaDaConta,
  type PaginaDaMinhaConta,
} from "../src/features/conta/PaginaDaConta";
import { desmontar, montar } from "./apoio-config";

afterEach(desmontar);

const PAGINAS: readonly PaginaDaMinhaConta[] = [
  "inicio",
  "pedidos",
  "favoritos",
  "dados",
  "enderecos",
  "seguranca",
];

function tela(atual: PaginaDaMinhaConta): HTMLElement {
  return montar(
    <PaginaDaConta atual={atual} titulo="Título" descricao="Descrição">
      <p>conteúdo</p>
    </PaginaDaConta>,
  );
}

describe("as seções da conta (AC-11122)", () => {
  it("[CA-22] @spec:AC-11122 seis seções, na ordem, em uma navegação com nome", () => {
    const raiz = tela("inicio");
    const nav = raiz.querySelector('nav[aria-label="Seções da conta"]');
    expect(nav).not.toBeNull();
    expect(
      [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.textContent),
    ).toEqual([
      "Visão geral",
      "Pedidos",
      "Favoritos",
      "Dados",
      "Endereços",
      "Segurança",
    ]);
    expect(
      [...(nav?.querySelectorAll("a") ?? [])].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "/conta",
      "/conta/pedidos",
      "/conta/favoritos",
      "/conta/dados",
      "/conta/enderecos",
      "/conta/seguranca",
    ]);
  });

  it.each(PAGINAS)(
    "[CA-22] @spec:AC-11122 em %s só a seção atual é anunciada como página atual",
    (atual) => {
      const raiz = tela(atual);
      const marcados = raiz.querySelectorAll(
        '.sc-secoes-da-conta [aria-current="page"]',
      );
      expect(marcados).toHaveLength(1);
      const esperado = {
        inicio: "Visão geral",
        pedidos: "Pedidos",
        favoritos: "Favoritos",
        dados: "Dados",
        enderecos: "Endereços",
        seguranca: "Segurança",
      }[atual];
      expect(marcados[0]?.textContent).toBe(esperado);
      desmontar();
    },
  );

  it("[CA-22] @spec:AC-11122 em /conta a lista é a página inicial das seções do celular", () => {
    expect(
      tela("inicio")
        .querySelector(".sc-secoes-da-conta")
        ?.hasAttribute("data-hub"),
    ).toBe(true);
    desmontar();
    expect(
      tela("dados")
        .querySelector(".sc-secoes-da-conta")
        ?.hasAttribute("data-hub"),
    ).toBe(false);
  });
});

describe("a conta não convida quem já está dentro (AC-11124)", () => {
  it("[CA-24] @spec:AC-11124 nenhuma seção mostra Entrar nem Criar conta, e nada força o tema", () => {
    const raiz = tela("pedidos");
    expect(raiz.textContent).not.toMatch(/Entrar|Criar conta/);
    expect(raiz.innerHTML).not.toContain("data-tema");
  });
});

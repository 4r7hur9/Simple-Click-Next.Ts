// @vitest-environment jsdom
/**
 * A conta sem sidebar (card #151): as páginas da conta são uma coluna só, sem
 * a lista de seções, e nada nelas convida quem já está dentro (AC-11124).
 * Dados, Endereços e Segurança moram no modal "Minha conta" (modal-da-conta).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PaginaDaConta } from "../src/features/conta/PaginaDaConta";
import { desmontar, montar } from "./apoio-config";

afterEach(desmontar);

function tela(): HTMLElement {
  return montar(
    <PaginaDaConta titulo="Título" descricao="Descrição">
      <p>conteúdo</p>
    </PaginaDaConta>,
  );
}

const lerFonte = (caminho: string) =>
  readFileSync(join(__dirname, "../src", caminho), "utf8");

describe("a conta não tem sidebar nem faixa de seções (card #151)", () => {
  it("[CA-1] a moldura mostra só o título, a descrição e o conteúdo", () => {
    const raiz = tela();
    expect(raiz.querySelector("h1")?.textContent).toBe("Título");
    expect(raiz.textContent).toContain("conteúdo");
    expect(raiz.querySelector('nav[aria-label="Seções da conta"]')).toBeNull();
    expect(raiz.querySelector(".sc-secoes-da-conta")).toBeNull();
    expect(raiz.querySelectorAll("nav")).toHaveLength(0);
  });

  it("[CA-1] o componente da sidebar e o CSS dela foram removidos", () => {
    const css = readFileSync(
      join(__dirname, "../../../packages/ui/styles/conta.css"),
      "utf8",
    );
    expect(css).not.toContain("sc-secoes-da-conta");
    expect(() => lerFonte("features/conta/SecoesDaConta.tsx")).toThrow();
    for (const pagina of [
      "app/(conta)/conta/pedidos/page.tsx",
      "app/(conta)/conta/favoritos/page.tsx",
      "features/conta/PaginaDaConta.tsx",
    ]) {
      expect(lerFonte(pagina)).not.toContain("SecoesDaConta");
    }
  });
});

describe("a conta não convida quem já está dentro (AC-11124)", () => {
  it("[CA-1] @spec:AC-11124 nada na moldura mostra Entrar nem Criar conta, e nada força o tema", () => {
    const raiz = tela();
    expect(raiz.textContent).not.toMatch(/Entrar|Criar conta/);
    expect(raiz.innerHTML).not.toContain("data-tema");
  });
});

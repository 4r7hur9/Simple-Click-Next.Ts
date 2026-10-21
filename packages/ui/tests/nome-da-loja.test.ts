/**
 * O título com o nome da loja na loja pública.
 *
 * Decisão do dono: o nome é SEMPRE em caixa alta onde ele é título (página
 * inicial da loja, topo do cardápio e Sobre). A página inicial e o Sobre
 * mantêm o tamanho grande de origem; só o topo do cardápio é menor, de 2rem
 * no celular a 3rem no computador, em até duas linhas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function folha(nome: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../styles/${nome}.css`, import.meta.url)),
    "utf8",
  );
}

/** O primeiro bloco do seletor, do `{` ao `}` que fecha a regra. */
function regra(css: string, seletor: string): string {
  const inicio = css.indexOf(`${seletor} {\n`);
  expect(inicio, `regra ${seletor}`).toBeGreaterThanOrEqual(0);
  return css.slice(inicio, css.indexOf("\n}\n", inicio));
}

describe("o nome da loja como título", () => {
  it.each([
    ["narrativa", ".sc-loja__nome"],
    ["vitrine", ".sc-vitrine__capa-nome"],
    ["sobre", ".sc-sobre__nome"],
  ])("%s: %s fica em caixa alta", (arquivo, seletor) => {
    expect(regra(folha(arquivo), seletor)).toContain(
      "text-transform: uppercase;",
    );
  });

  it("a página inicial da loja mantém o tamanho grande", () => {
    expect(regra(folha("narrativa"), ".sc-loja__nome")).toContain(
      "font-size: clamp(2.25rem, 9vw, 4.25rem);",
    );
  });

  it("o topo do cardápio vai de 2rem a 3rem, em até duas linhas", () => {
    const capa = regra(folha("vitrine"), ".sc-vitrine__capa-nome");
    expect(capa).toContain(
      "--nome-da-loja-tamanho: clamp(2rem, 1.5rem + 1.8vw, 3rem);",
    );
    expect(capa).toContain("-webkit-line-clamp: 2;");
  });
});

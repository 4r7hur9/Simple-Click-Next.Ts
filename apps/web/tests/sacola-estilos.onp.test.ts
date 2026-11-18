/**
 * Prova dos estilos da sacola (card #110, T-11001 e T-11009).
 *
 * A sacola tem DOIS lugares que precisam concordar sobre a largura em que ela
 * vira coluna: o código (`forma-da-sacola.ts`) e o CSS do catálogo
 * (`vitrine.css`). Se um mudar sem o outro, a sacola some ou aparece duas
 * vezes. Os estilos dela moram em `fechamento.css`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PONTO_DA_COLUNA } from "../src/features/carrinho/forma-da-sacola";

const ESTILOS = resolve(__dirname, "../../../packages/ui/styles");
const VITRINE = readFileSync(resolve(ESTILOS, "vitrine.css"), "utf8");
const FECHAMENTO = readFileSync(resolve(ESTILOS, "fechamento.css"), "utf8");

describe("[CA-31] o ponto de troca e a folha da sacola (AC-11004)", () => {
  it("[CA-31] @spec:AC-11004 o catálogo vira três zonas na mesma largura em que a sacola vira coluna", () => {
    const consulta = `@media (min-width: ${PONTO_DA_COLUNA}px)`;
    const inicio = VITRINE.indexOf(consulta);
    expect(inicio).toBeGreaterThan(-1);
    // A região da sacola é a zona da direita dessa media query.
    const bloco = VITRINE.slice(inicio);
    expect(bloco).toContain(".sc-catalogo > .sc-catalogo__sacola");
  });

  it("[CA-31] @spec:AC-11004 a barra e a coluna têm estilo em fechamento.css", () => {
    for (const classe of [
      ".sc-sacola-barra",
      ".sc-sacola-barra__abrir",
      ".sc-sacola-coluna",
      ".sc-sacola-coluna__titulo",
      ".sc-sacola-atalho",
    ]) {
      expect(FECHAMENTO).toContain(`${classe} {`);
    }
  });
});

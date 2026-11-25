/**
 * O /admin e as subpáginas não têm faixa nem rótulo verde de "Administração
 * da plataforma" no alto (pedido do dono, várias vezes). O selo dentro do menu
 * lateral e o `aria-label` do <main> continuam valendo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "src");

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory()
      ? arquivos(caminho)
      : /\.tsx?$/.test(nome)
        ? [caminho]
        : [];
  });
}

describe("admin sem faixa no topo", () => {
  it("nenhuma tela do admin escreve o rótulo 'Administração da plataforma' como texto visível", () => {
    const telas = [
      ...arquivos(join(RAIZ, "app", "(admin)")),
      ...arquivos(join(RAIZ, "features", "admin-dashboard")),
    ];
    const achados = telas.filter((arquivo) =>
      readFileSync(arquivo, "utf8")
        .split("\n")
        .some(
          (linha) =>
            /Administração da plataforma/i.test(linha) &&
            !/aria-label=|^\s*(\*|\/\/|\/\*)/.test(linha),
        ),
    );
    expect(achados).toEqual([]);
  });
});

/**
 * "A rota da TV" tem uma definição só (card #137, achado 9): a mesma regra
 * decide se o proxy anota a loja de origem e se o aviso de cookies some. Antes
 * o cookie usava `/tv` e `/tv/*` e o aviso usava só `/tv`, e as duas telas
 * discordavam em `/loja/x/tv/qualquer-coisa`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ehRotaDaTv } from "../src/features/tv/rota-da-tv";
import { apelidoDaLojaNoCaminho } from "../src/lib/loja-de-origem";

const CAMINHOS_DA_LOJA = [
  "/loja/padaria",
  "/loja/padaria/",
  "/loja/padaria/tv",
  "/loja/padaria/tv/",
  "/loja/padaria/tv/extra",
  "/loja/padaria/tvs",
  "/loja/padaria/cardapio",
  "/loja/padaria/produto/tv",
  "/loja/padaria/sobre",
];

describe("[CA-9] uma definição só para a rota da TV", () => {
  it("o cookie de origem e o aviso de cookies concordam em todo caminho de loja", () => {
    for (const caminho of CAMINHOS_DA_LOJA) {
      const naTv = ehRotaDaTv(caminho);
      // Na TV não se anota a origem; fora dela, a loja é anotada.
      expect(apelidoDaLojaNoCaminho(caminho) === undefined, caminho).toBe(naTv);
    }
  });

  it("consulta e fragmento não mudam a decisão", () => {
    expect(
      apelidoDaLojaNoCaminho("/loja/padaria/tv?modo=retrato"),
    ).toBeUndefined();
    expect(apelidoDaLojaNoCaminho("/loja/padaria/tv#topo")).toBeUndefined();
    expect(apelidoDaLojaNoCaminho("/loja/padaria/cardapio?busca=tv")).toBe(
      "padaria",
    );
  });

  it("o cookie de origem usa ehRotaDaTv, sem regra própria", () => {
    const fonte = readFileSync(
      path.resolve(__dirname, "../src/lib/loja-de-origem.ts"),
      "utf8",
    );
    expect(fonte).toMatch(/import \{ ehRotaDaTv \} from "\.\/rota-da-tv\.ts"/);
    expect(fonte).not.toMatch(/\\\/tv/);
    // O aviso de cookies (ForaDaTv) lê a MESMA função, pelo atalho de features.
    const deFeatures = readFileSync(
      path.resolve(__dirname, "../src/features/tv/rota-da-tv.ts"),
      "utf8",
    );
    expect(deFeatures).toMatch(/export \{ ehRotaDaTv \} from "\.\.\/\.\.\/lib\/rota-da-tv\.ts"/);
    expect(deFeatures).not.toMatch(/RegExp|\/\^/);
  });
});

/**
 * Todas as lojas pintam com o MESMO verde, legível (card #114, AC-11411,
 * P-106).
 *
 * Decisão do usuário (17/11/2026): acabou a cor própria de cada loja; tudo
 * usa o verde SimpleClick #B7FF00 (`--cor-primaria`) com texto escuro sobre
 * ele. O AC-11411 ("a cor de cada loja continua legível") passa a provar isto:
 *
 * 1. em todo bloco de tema (claro, escuro pelo aparelho, escuro e claro
 *    forçados) o verde é #B7FF00 e o texto sobre ele dá pelo menos 4,5:1;
 * 2. nenhuma folha de estilo das telas redefine `--cor-primaria` fora do
 *    `theme.css` — uma regra perdida pintaria uma loja de outra cor;
 * 3. nenhuma tela do site lê a cor salva da loja (`tema.corDestaque`) para
 *    pintar — o dado antigo continua no banco (o #127 removeu sem migração).
 *
 * Não repete os pares de contraste dos tokens do #104 (AC-10404): aqui só o
 * que garante "uma cor para todas as lojas". No navegador, a cor pintada de
 * cada loja é medida em `e2e/specs/toque-e-contraste-redesign.onp.spec.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  CONTRASTE_MINIMO_TEXTO,
  emHex,
  relacaoDeContraste,
} from "@simpleclick/ui";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "../../..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

/** Todos os arquivos de uma pasta (recursivo) com as extensões pedidas. */
function arquivos(pasta: string, extensoes: readonly string[]): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === ".next") continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (extensoes.some((e) => nome.endsWith(e))) achados.push(caminho);
    }
  };
  andar(join(RAIZ, pasta));
  return achados.map((c) => relative(RAIZ, c));
}

const TEMA = ler("packages/ui/styles/theme.css");

/** Os blocos de tema que declaram o verde: seletor → declarações. */
function blocosComOVerde(): Map<string, string> {
  const blocos = new Map<string, string>();
  for (const achado of TEMA.matchAll(
    /([^{}]+)\{([^{}]*--cor-primaria\s*:[^{}]*)\}/g,
  )) {
    const seletor = (achado[1] ?? "").trim().split("\n").at(-1)?.trim() ?? "";
    blocos.set(seletor, achado[2] ?? "");
  }
  return blocos;
}

const valor = (bloco: string, token: string) =>
  new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(bloco)?.[1]?.trim();

describe("um verde para todas as lojas (AC-11411)", () => {
  const blocos = blocosComOVerde();

  it("[CA-15] @spec:AC-11411 @principle:P-106 o tema declara o verde em todos os blocos de tema", () => {
    // :root (claro), escuro pelo aparelho, [data-tema=escuro], [data-tema=claro].
    expect(blocos.size).toBeGreaterThanOrEqual(4);
  });

  for (const [seletor, bloco] of blocosComOVerde()) {
    it(`[CA-15] @spec:AC-11411 @principle:P-106 em "${seletor}" o verde é #B7FF00 e o texto sobre ele é escuro e legível`, () => {
      const verde = valor(bloco, "--cor-primaria");
      const texto = valor(bloco, "--cor-em-primaria");
      expect(verde && emHex(verde).toLowerCase()).toBe("#b7ff00");
      expect(texto).toBeDefined();
      expect(
        relacaoDeContraste(texto ?? "#fff", verde ?? "#fff"),
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    });
  }

  it("[CA-15] @spec:AC-11411 nenhuma folha de estilo das telas redefine --cor-primaria", () => {
    const folhas = [
      ...arquivos("packages/ui/styles", [".css"]),
      ...arquivos("apps/web/src", [".css"]),
    ].filter((c) => !c.endsWith("packages/ui/styles/theme.css"));
    const redefinem = folhas.filter((c) => /--cor-primaria\s*:/.test(ler(c)));
    expect(redefinem).toEqual([]);
  });

  it("[CA-15] @spec:AC-11411 nenhuma tela do site pinta com a cor salva da loja", () => {
    const telas = arquivos("apps/web/src", [".ts", ".tsx"]).filter(
      (c) => !/\.test\.tsx?$/.test(c) && !c.includes("/(dev)/"),
    );
    // Ler a cor SALVA da loja (`loja.tema.corDestaque`) ou passar a cor da
    // loja como cor principal a um envelope de tema é pintar com cor própria.
    // (A Aparência do painel usa só o verde padrão e não entra.)
    const pintamComACorDaLoja = telas.filter((c) => {
      const texto = ler(c);
      return (
        /loja\??\.tema\??\.corDestaque/.test(texto) ||
        /corPrincipal=\{loja/.test(texto)
      );
    });
    expect(pintamComACorDaLoja).toEqual([]);
  });
});

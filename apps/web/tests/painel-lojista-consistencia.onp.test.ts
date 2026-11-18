import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ESTILOS,
  PASTAS_DO_PAINEL,
  arquivos,
  ler,
  RAIZ_WEB,
} from "./apoio-painel-lojista.ts";

const COR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
/** O seletor de cor mostra cores de verdade: é a única exceção nos .tsx. */
const EXCECAO_TSX = [/SeletorDeCor\.tsx$/];
/**
 * Estilos do painel sem cor literal: as etapas do pedido usam os tokens
 * `--cor-etapa-*` de theme.css (claro e escuro).
 */
const CSS_DO_PAINEL = [
  "pedidos.css",
  "filtros.css",
  "cadastro.css",
  "seletor-de-cor.css",
];

function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("painel · consistência visual", () => {
  const tsx = PASTAS_DO_PAINEL.flatMap((p) => arquivos(p, [".tsx", ".ts"]));

  it("[CA-1] @spec:AC-11246 nenhum .tsx do painel tem cor literal (fora o seletor de cor)", () => {
    const sujos = tsx
      .filter((f) => !EXCECAO_TSX.some((r) => r.test(f)))
      .filter((f) => COR_LITERAL.test(ler(f)));
    expect(sujos).toEqual([]);
  });

  it("[CA-2] @spec:AC-11247 os estilos do painel não têm cor literal (etapas por token)", () => {
    for (const nome of CSS_DO_PAINEL) {
      const css = semComentarios(ler(join(ESTILOS, nome)));
      const achados = css
        .split("\n")
        .filter((linha) => COR_LITERAL.test(linha));
      // O seletor de cor desenha as cores de verdade.
      if (nome === "seletor-de-cor.css") continue;
      expect(achados, nome).toEqual([]);
      if (nome === "pedidos.css")
        expect(css).toContain("var(--cor-etapa-aguardando)");
    }
  });

  it("[CA-3] @spec:AC-11248 sem o verde antigo #b2f800 em lugar nenhum do painel", () => {
    const todos = [
      ...tsx,
      ...PASTAS_DO_PAINEL.flatMap((p) => arquivos(p, [".css"])),
      ...CSS_DO_PAINEL.map((n) => join(ESTILOS, n)),
    ];
    expect(todos.filter((f) => /b2f800/i.test(ler(f)))).toEqual([]);
  });

  it("[CA-4] @spec:AC-11249 sem recurso externo nem dado de exemplo do Stitch", () => {
    const todos = [
      ...tsx,
      ...PASTAS_DO_PAINEL.flatMap((p) => arquivos(p, [".css"])),
    ];
    const ruins = todos.filter((f) =>
      /https?:\/\/(fonts\.googleapis|lh3\.googleusercontent|cdn\.tailwindcss)|universokar|autope[cç]as/i.test(
        ler(f),
      ),
    );
    expect(ruins).toEqual([]);
    expect(RAIZ_WEB).toBeTruthy();
  });
});

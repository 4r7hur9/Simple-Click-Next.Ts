/**
 * Toque e tema da administração (card #113, T-11311, AC-11329 e AC-11331).
 *
 * O alvo de toque vem do token do #104 (`--altura-toque`), sem medida
 * própria; e a administração não ganha folha de estilo nem troca de tema:
 * segue o tema claro de hoje, com os tokens do pacote. A medida
 * renderizada fica para o e2e do #114.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { arquivos, ESTILOS, ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const PASTAS = [
  join(RAIZ_WEB, "src/features/admin"),
  join(RAIZ_WEB, "src/features/admin-dashboard"),
  join(RAIZ_WEB, "src/app/(admin)"),
];
const todos = PASTAS.flatMap((p) => arquivos(p, [".ts", ".tsx"]));

describe("alvo de toque", () => {
  it("[CA-15] @spec:AC-11329 o token de toque existe no tema e o chip do pacote o usa", () => {
    expect(ler(join(ESTILOS, "theme.css"))).toMatch(
      /--altura-toque:\s*[\d.]+rem/,
    );
    const componentes = ler(join(ESTILOS, "componentes.css"));
    expect(componentes).toMatch(
      /\.sc-chip\s*\{[^}]*min-height:\s*var\(--altura-toque\)/,
    );
  });

  it("[CA-15] @spec:AC-11329 as abas e o link do cartão usam o token, e nenhuma altura de controle é escrita à mão", () => {
    expect(ler(join(RAIZ_WEB, "src/features/admin/AbasDaLoja.tsx"))).toContain(
      "min-h-[var(--altura-toque)]",
    );
    expect(
      ler(join(RAIZ_WEB, "src/features/admin-dashboard/CartaoDeNumero.tsx")),
    ).toContain("min-h-[var(--altura-toque)]");

    // Altura fixa só vale por token. Exceção nomeada: o cartão de número
    // reserva espaço, e não é um alvo de toque.
    const EXCECOES = [/CartaoDeNumero\.tsx$/];
    const sujos = todos
      .filter((f) => !EXCECOES.some((r) => r.test(f)))
      .filter((f) =>
        /\b(?:min-h|h|size)-\[(?!var\()[\d.]+(?:px|rem)\]/.test(ler(f)),
      );
    expect(sujos).toEqual([]);
  });
});

describe("tema", () => {
  it("[CA-15] @spec:AC-11331 a administração não tem folha de estilo própria nem escolhe tema", () => {
    expect(existsSync(join(ESTILOS, "admin.css"))).toBe(false);
    for (const arquivo of todos) {
      const codigo = ler(arquivo);
      expect(codigo, arquivo).not.toMatch(
        /data-tema|dataset\.tema|prefers-color-scheme|color-scheme/,
      );
    }
  });

  it("[CA-15] @spec:AC-11331 o tema claro de hoje segue com os valores de antes (superfície e tinta)", () => {
    const tema = ler(join(ESTILOS, "theme.css"));
    // O primeiro bloco `:root` é o tema claro; o atenção claro é o âmbar de sempre.
    expect(tema).toMatch(/--cor-atencao:\s*#8a5300/i);
    expect(tema).toMatch(/--cor-atencao-suave:\s*#fdf3e2/i);
  });
});

/**
 * A moldura da administração não ganha guarda nem cache (card #113,
 * T-11302). O layout só desenha menu e conteúdo; quem decide o acesso é a
 * API. O número do selo de pendentes é lido a cada requisição, nunca fixado
 * no módulo (AC-11302).
 */
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const { pendentes } = vi.hoisted(() => ({ pendentes: vi.fn() }));

vi.mock("../src/server/pendentes-da-administracao.ts", () => ({
  lojasPendentesDeAprovacao: pendentes,
}));
vi.mock("../src/features/painel/MenuDaAdministracao.tsx", () => ({
  MenuDaAdministracao: () => null,
}));
vi.mock("../src/app/_usuario/sessao.tsx", () => ({
  UsuarioDoMenuDaSessao: () => null,
}));

import LayoutDaAdministracao from "../src/app/(admin)/admin/layout.tsx";

const CAMINHO = join(RAIZ_WEB, "src/app/(admin)/admin/layout.tsx");

/** Todo elemento React da árvore devolvida, em profundidade. */
function elementos(no: unknown): { props: Record<string, unknown> }[] {
  if (no === null || typeof no !== "object") return [];
  if (Array.isArray(no)) return no.flatMap(elementos);
  const elemento = no as { props?: Record<string, unknown> };
  if (elemento.props === undefined) return [];
  return [
    { props: elemento.props },
    ...elementos(elemento.props.children),
    ...Object.values(elemento.props).flatMap((valor) =>
      valor !== elemento.props?.children ? elementos(valor) : [],
    ),
  ];
}

describe("moldura da administração", () => {
  it("[CA-4] @spec:AC-11302 o selo de pendentes é lido a cada requisição, sem memória entre uma e outra", async () => {
    pendentes.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const primeira = await LayoutDaAdministracao({ children: null });
    const segunda = await LayoutDaAdministracao({ children: null });

    expect(pendentes).toHaveBeenCalledTimes(2);
    const numero = (arvore: unknown) =>
      elementos(arvore).find((e) => "pendentes" in e.props)?.props.pendentes;
    expect(numero(primeira)).toBe(3);
    expect(numero(segunda)).toBe(0);
  });

  it("[CA-4] @spec:AC-11307 o layout não ganha guarda, cache nem estado de módulo", () => {
    const codigo = ler(CAMINHO).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codigo).not.toMatch(/["']use cache["']|unstable_cache|revalidate/);
    expect(codigo).not.toMatch(
      /\bredirect\s*\(|\bnotFound\s*\(|\bcookies\s*\(/,
    );
    expect(codigo).not.toMatch(/^(let|var)\s/m);
    // O layout continua um componente de servidor que só repassa o número.
    expect(codigo).not.toContain('"use client"');
    expect(codigo).toContain("lojasPendentesDeAprovacao()");
  });
});

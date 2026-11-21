/**
 * A moldura da administração não ganha cache (card #113, T-11302) e, desde o
 * card #163, passa pela guarda do servidor ANTES de desenhar menu e conteúdo:
 * a decisão "layout sem guarda" do #113 foi revista, porque a casca exposta a
 * qualquer conta era a causa do acesso indevido. A guarda mora em
 * `server/acesso-da-administracao.ts` (aqui, simulada); o layout não chama
 * `redirect`/`notFound` por conta própria. O número do selo de pendentes é
 * lido a cada requisição, nunca fixado no módulo (AC-11302).
 */
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const { pendentes, guarda, menu } = vi.hoisted(() => ({
  pendentes: vi.fn(),
  guarda: vi.fn(),
  menu: vi.fn(),
}));

vi.mock("../src/server/acesso-da-administracao.ts", () => ({
  exigirAdministracaoDaPlataforma: guarda,
}));

vi.mock("../src/server/pendentes-da-administracao.ts", () => ({
  lojasPendentesDeAprovacao: pendentes,
}));
vi.mock("../src/features/painel/MenuDaAdministracao.tsx", () => ({
  MenuDaAdministracao: menu,
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

beforeEach(() => {
  pendentes.mockReset();
  guarda.mockReset();
  menu.mockReset();
  guarda.mockResolvedValue(undefined);
  menu.mockReturnValue(null);
});

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

  it("[CA-3] o layout passa pela guarda do servidor antes do selo e do menu", async () => {
    const ordem: string[] = [];
    guarda.mockImplementationOnce(async () => {
      ordem.push("guarda");
    });
    pendentes.mockImplementationOnce(async () => {
      ordem.push("pendentes");
      return 2;
    });

    await LayoutDaAdministracao({ children: null });

    expect(guarda).toHaveBeenCalledWith("/admin");
    expect(ordem).toEqual(["guarda", "pendentes"]);
  });

  it("[CA-2] guarda recusou: o layout não lê pendentes nem devolve a casca", async () => {
    const recusa = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    guarda.mockRejectedValueOnce(recusa);

    await expect(LayoutDaAdministracao({ children: null })).rejects.toBe(
      recusa,
    );
    expect(pendentes).not.toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();
  });

  it("[CA-4] @spec:AC-11307 o layout chama a guarda pelo helper, sem cache nem estado de módulo", () => {
    const codigo = ler(CAMINHO).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codigo).not.toMatch(/["']use cache["']|unstable_cache|revalidate/);
    // A decisão (redirect/404) é do helper; o layout não lê cookie nem decide.
    expect(codigo).not.toMatch(
      /\bredirect\s*\(|\bnotFound\s*\(|\bcookies\s*\(/,
    );
    expect(codigo).not.toMatch(/^(let|var)\s/m);
    expect(codigo).not.toContain('"use client"');
    const guardaNoCodigo = codigo.indexOf(
      'await exigirAdministracaoDaPlataforma("/admin")',
    );
    expect(guardaNoCodigo).toBeGreaterThan(-1);
    expect(guardaNoCodigo).toBeLessThan(
      codigo.indexOf("lojasPendentesDeAprovacao()"),
    );
  });
});

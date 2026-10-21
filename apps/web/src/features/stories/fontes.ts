/**
 * As fontes do editor de Stories, resolvidas para o navegador.
 *
 * A Space Grotesk do site chega pelo `next/font` com um nome gerado
 * (`--fonte-titulo-da-marca`). O canvas não entende `var()`, então o estilo
 * "Moderno" usa o nome real dessa variável, e a tela e o canvas passam a
 * desenhar com a mesma fonte.
 */
import { FONTES_DO_TEXTO } from "./documento.ts";
import type { FamiliasDoEditor } from "./composicao.ts";

export function familiasDoEditor(
  raiz: Element | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): FamiliasDoEditor {
  const daMarca =
    raiz === null || typeof getComputedStyle !== "function"
      ? ""
      : getComputedStyle(raiz).getPropertyValue("--fonte-titulo-da-marca").trim();
  const familias = Object.fromEntries(
    FONTES_DO_TEXTO.map((fonte) => [
      fonte.id,
      fonte.id === "moderno" && daMarca !== ""
        ? `${daMarca}, ${fonte.familia}`
        : fonte.familia,
    ]),
  ) as Record<(typeof FONTES_DO_TEXTO)[number]["id"], string>;
  return familias;
}

/** Espera as fontes carregarem antes de desenhar no canvas (evita cair na fonte reserva). */
export async function esperarAsFontes(): Promise<void> {
  if (typeof document === "undefined" || document.fonts === undefined) return;
  try {
    await document.fonts.ready;
  } catch {
    // Sem fontes prontas, desenha com a reserva.
  }
}

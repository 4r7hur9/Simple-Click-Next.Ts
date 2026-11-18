"use client";

/**
 * Em que forma a sacola aparece: coluna ao lado do catálogo, ou barra fixa
 * embaixo (card #110, AC-11001, AC-11004, AC-11030).
 *
 * UM PONTO DE TROCA SÓ. A largura abaixo é a mesma da media query do catálogo
 * (`vitrine.css`, região `.sc-catalogo__sacola`): se uma divergir da outra, a
 * sacola some ou aparece duas vezes. O teste `sacola-estilos.onp.test.ts` lê a
 * folha e confere os dois.
 *
 * NO SERVIDOR, E SEM `matchMedia`, É "BARRA". A primeira pintura no navegador
 * também: a sacola nasce vazia no HTML (AC-11026), então a hidratação não
 * diverge, e a troca para a coluna acontece depois, com os itens.
 */
import { useSyncExternalStore } from "react";

/** A partir desta largura (px) a sacola é a coluna do catálogo. */
export const PONTO_DA_COLUNA = 1280;

export type FormaDaSacola = "coluna" | "barra";

const CONSULTA = `(min-width: ${PONTO_DA_COLUNA}px)`;

function temMatchMedia(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

export function formaDaSacolaAgora(): FormaDaSacola {
  if (!temMatchMedia()) return "barra";
  return window.matchMedia(CONSULTA).matches ? "coluna" : "barra";
}

function assinar(aoMudar: () => void): () => void {
  if (!temMatchMedia()) return () => {};
  const lista = window.matchMedia(CONSULTA);
  lista.addEventListener("change", aoMudar);
  return () => lista.removeEventListener("change", aoMudar);
}

/** A forma de agora, que se atualiza quando a largura da janela passa o ponto. */
export function useFormaDaSacola(): FormaDaSacola {
  return useSyncExternalStore(assinar, formaDaSacolaAgora, () => "barra");
}

/**
 * O rascunho da vitrine aplicado ao que a API devolveu (card #36).
 *
 * Só as rotas da prévia (`/loja/<loja>/previa/...`) passam um rascunho às telas
 * públicas; todas as outras rotas da loja chamam sem ele e nada muda.
 */
import { cookies } from "next/headers";

import {
  COOKIE_DA_PREVIA,
  lerRascunho,
  vitrineComRascunho,
  type RascunhoDaVitrine,
} from "../lib/rascunho-da-vitrine.ts";
import type { ResultadoDaVitrine } from "./vitrine.ts";

/** O rascunho que o navegador do dono deixou no cookie, se for desta loja. */
export async function rascunhoDoPedido(
  apelido: string,
): Promise<RascunhoDaVitrine | null> {
  const guardado = (await cookies()).get(COOKIE_DA_PREVIA)?.value;
  return lerRascunho(guardado, apelido);
}

/** A vitrine com o rascunho por cima; sem rascunho, a mesma de antes. */
export function resultadoComRascunho(
  resultado: ResultadoDaVitrine,
  rascunho: RascunhoDaVitrine | null | undefined,
): ResultadoDaVitrine {
  if (rascunho === null || rascunho === undefined) return resultado;
  if (resultado.estado !== "encontrada") return resultado;
  return {
    estado: "encontrada",
    vitrine: vitrineComRascunho(resultado.vitrine, rascunho),
  };
}

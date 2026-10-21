/** Textos e contas do painel de crescimento. Nada aqui toca a rede. */
import { escreverDinheiro } from "../../lib/metricas.ts";

export { escreverDinheiro };

const INTEIRO = new Intl.NumberFormat("pt-BR");
const CURTO = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const escreverInteiro = (n: number): string => INTEIRO.format(n);
export const escreverCurto = (n: number): string => CURTO.format(n);
export const escreverDinheiroCurto = (centavos: number): string =>
  `R$ ${CURTO.format(centavos / 100)}`;

/** `2026-10-16` vira `16/10`. */
export function diaCurto(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** `2026-10-16` vira `16/10/2026`. */
export function diaCompleto(iso: string): string {
  return `${diaCurto(iso)}/${iso.slice(0, 4)}`;
}

export function escreverPercentual(valor: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)}%`;
}

export interface Variacao {
  readonly sentido: "alta" | "queda" | "igual";
  /** Percentual absoluto; `null` quando o anterior era zero (não há base). */
  readonly percentual: number | null;
  readonly texto: string;
}

/**
 * Compara o período com o anterior. Anterior zero não tem percentual: com
 * valor novo diz "novo", sem valor diz "sem variação".
 */
export function compararComAnterior(
  atual: number,
  anterior: number | null,
): Variacao | null {
  if (anterior === null) return null;
  if (atual === anterior) {
    return { sentido: "igual", percentual: 0, texto: "Sem variação" };
  }
  if (anterior === 0) {
    return { sentido: "alta", percentual: null, texto: "Novo no período" };
  }
  const percentual = ((atual - anterior) / Math.abs(anterior)) * 100;
  const sentido = percentual > 0 ? "alta" : "queda";
  return {
    sentido,
    percentual: Math.abs(percentual),
    texto: `${sentido === "alta" ? "+" : "-"}${escreverPercentual(Math.abs(percentual))}`,
  };
}

/** Maior valor de uma série, para escalar as barras (nunca zero). */
export function maiorDe(valores: readonly number[]): number {
  return Math.max(1, ...valores);
}

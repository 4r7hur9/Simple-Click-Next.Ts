/**
 * Peças comuns dos filtros das listas do painel (card #77): produtos,
 * pedidos e clientes escrevem e leem valores do mesmo jeito.
 */

/** "12,50", "12.5", "1.250,00" ou "R$ 12" em centavos; texto torto ou vazio vira `null`. */
export function lerReais(texto: string): number | null {
  let limpo = texto.trim().replace(/^R\$\s*/i, "");
  // Com vírgula, o ponto é separador de milhar: "1.250,00".
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/** O mesmo texto sem acento e em minúsculas, para comparar buscas. */
export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

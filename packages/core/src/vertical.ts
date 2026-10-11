/**
 * Vocabulário de composição por ramo (T-309).
 *
 * O banco guarda a composição como JSON porque um novo ramo deve ser uma linha
 * de preset, não uma migração. Este módulo normaliza a entrada na fronteira e
 * oferece uma consulta única para API e site, evitando `if` espalhado nas
 * telas.
 */

export const TELAS_DO_RAMO = [
  "cadastroProduto",
  "detalheProduto",
  "vitrine",
] as const;

export type TelaDoRamo = (typeof TELAS_DO_RAMO)[number];

export interface ComposicaoDoRamo {
  readonly cadastroProduto: readonly string[];
  readonly detalheProduto: readonly string[];
  readonly vitrine: readonly string[];
}

const COMPOSICAO_VAZIA: ComposicaoDoRamo = {
  cadastroProduto: [],
  detalheProduto: [],
  vitrine: [],
};

/** O JSON do banco como objeto; qualquer outra forma vira objeto vazio. */
function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** Só os nomes de bloco válidos: texto não vazio; o resto é descartado. */
function lista(valor: unknown): readonly string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

/** Normaliza as chaves snake_case do preset para o contrato camelCase. */
export function composicaoDoRamo(bruto: unknown): ComposicaoDoRamo {
  const blocos = objeto(bruto);
  return {
    cadastroProduto: lista(blocos["cadastro_produto"]),
    detalheProduto: lista(blocos["detalhe_produto"]),
    vitrine: lista(blocos["vitrine"]),
  };
}

/** Consulta se o preset pede um bloco nesta tela. */
export function temBloco(
  composicao: ComposicaoDoRamo,
  tela: TelaDoRamo,
  bloco: string,
): boolean {
  return composicao[tela].includes(bloco);
}

/** Padrão seguro para consumidores que recebem um objeto ausente. */
export function composicaoVazia(): ComposicaoDoRamo {
  return COMPOSICAO_VAZIA;
}

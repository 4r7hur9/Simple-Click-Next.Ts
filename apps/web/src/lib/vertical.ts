import type { ComposicaoDoRamo, TelaDoRamo } from "@simpleclick/core";

export type { ComposicaoDoRamo, TelaDoRamo } from "@simpleclick/core";

/** O componente de tela consulta o mesmo preset que a API publicou. */
export function temBloco(
  composicao: ComposicaoDoRamo,
  tela: TelaDoRamo,
  bloco: string,
): boolean {
  return composicao[tela].includes(bloco);
}

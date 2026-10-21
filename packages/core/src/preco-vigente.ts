/**
 * Qual preço vale AGORA (AC-410, AC-503).
 *
 * POR QUE ESTA REGRA SUBIU PARA O CORE. Ela nasceu dentro da rota do produto,
 * na T-405. Quando a conferência do carrinho passou a precisar da mesma
 * decisão — qual dos preços cadastrados é o que se cobra —, ela virou regra de
 * dois módulos. A tabela de fronteiras não deixa um módulo importar o outro, e
 * a saída que a arquitetura prescreve é esta: a regra sobe para
 * `packages/core`, e os dois a chamam.
 *
 * Copiá-la no segundo lugar teria funcionado no dia. O custo apareceria depois:
 * a vitrine mostrando o preço promocional e o fechamento cobrando o cheio,
 * porque alguém corrigiu uma das duas cópias.
 *
 * O QUE ELA DECIDE, em uma frase: vale o promocional quando existe um valendo
 * agora, e o base vira o preço "de". Sem promoção, vale o base.
 */

/** Um preço cadastrado, como o catálogo o guarda. */
export interface PrecoCadastrado {
  /** `BASE`, `PROMO`, `WHOLESALE`, `CLUB` — `COST` nunca chega aqui. */
  readonly tipo: string;
  readonly valorEmCentavos: number;
  /** A partir de quantas unidades ele vale. */
  readonly quantidadeMinima: number;
  readonly ativo: boolean;
  readonly comecaEm: Date | null;
  readonly terminaEm: Date | null;
  /**
   * O nome que o DONO deu ao preço: "Atacado", "Terça do pastel".
   *
   * Opcional porque a vitrine só precisa do número; quem precisa do nome é a
   * tela que explica QUAL preço foi usado (AC-310), e ela o recebe daqui.
   */
  readonly rotulo?: string | null;
  /**
   * Faixa de atacado COM DESCONTO (card #53, migração 0064): o desconto incide
   * sobre o preço de varejo vigente, e `valorEmCentavos` é ignorado. Nulo ou
   * ausente = preço fixo, o atacado antigo.
   */
  readonly tipoDeDesconto?: "PERCENTUAL" | "VALOR" | null;
  /** Percentual inteiro (1 a 99) ou centavos por unidade. */
  readonly desconto?: number | null;
}

/** O par (o que se paga, o preço "de"). */
export interface PrecoVigente {
  /** Nulo quando não há preço nenhum valendo — e nulo NÃO é zero. */
  readonly atualEmCentavos: number | null;
  /** O valor riscado ao lado, quando há promoção de verdade. */
  readonly anteriorEmCentavos: number | null;
}

/**
 * Se o preço está valendo no instante dado.
 *
 * PREÇO DE ATACADO NÃO É O PREÇO DA VITRINE. "A partir de 10 unidades" não é o
 * que alguém paga levando uma, e mostrá-lo anunciaria um valor que ninguém
 * pagaria. Ele volta a importar quando a quantidade chegar lá — e aí quem
 * decide é quem conhece a quantidade, não esta função.
 */
export function precoValeAgora(
  preco: PrecoCadastrado,
  agora: Date,
  quantidade = 1,
): boolean {
  if (!preco.ativo) return false;
  if (preco.quantidadeMinima > quantidade) return false;
  if (preco.comecaEm !== null && preco.comecaEm > agora) return false;
  // O fim é EXCLUSIVO: promoção que termina às 18h não vale às 18h em ponto.
  if (preco.terminaEm !== null && preco.terminaEm <= agora) return false;
  return true;
}

/** Escolhe o preço que vale, entre os cadastrados. */
export function precoQueVale(
  precos: readonly PrecoCadastrado[],
  agora: Date,
  quantidade = 1,
): PrecoVigente {
  const valendo = precos.filter((p) => precoValeAgora(p, agora, quantidade));

  // Entre dois do mesmo tipo valendo ao mesmo tempo, vale o MENOR: cadastro
  // sobreposto é engano do dono, e cobrar o maior por engano dele é o cliente
  // pagando a conta.
  const menorDe = (tipo: string): number | null => {
    const doTipo = valendo.filter((p) => p.tipo === tipo);
    if (doTipo.length === 0) return null;
    return Math.min(...doTipo.map((p) => p.valorEmCentavos));
  };

  const base = menorDe("BASE");
  const promo = menorDe("PROMO");

  if (promo === null)
    return { atualEmCentavos: base, anteriorEmCentavos: null };

  return {
    atualEmCentavos: promo,
    // Só é "de" se for MAIOR que o que se paga. Base igual ou menor que a
    // promoção é cadastro errado, e riscá-lo mentiria sobre o desconto.
    anteriorEmCentavos: base !== null && base > promo ? base : null,
  };
}

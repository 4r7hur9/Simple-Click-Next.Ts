/**
 * O preço do produto, no topo da página (AC-410).
 *
 * DESENHADO NO SERVIDOR. É o número que a pessoa veio buscar, e ele não pode
 * esperar script para aparecer — nem em rede ruim, nem para o buscador, nem
 * para a prévia do compartilhamento.
 *
 * A PROMOÇÃO É CONTADA EM PALAVRAS, e não só com o riscado: `<s>` é estilo, e
 * estilo não chega a quem ouve a página. "De R$ 15,00 por R$ 12,00" chega.
 */

export interface SeloDePrecoProps {
  /** Já escrito como dinheiro. Nulo quando o preço depende de escolha. */
  readonly preco: string | null;
  readonly precoAnterior?: string | null | undefined;
  /** O que dizer quando ainda não há um preço só. */
  readonly convite?: string | undefined;
}

export function SeloDePreco({
  preco,
  precoAnterior = null,
  convite = "Escolha uma opção para ver o preço",
}: SeloDePrecoProps) {
  if (preco === null) {
    // Produto cujo preço depende da variante abre sem preço, e a página
    // convida a escolher. Mostrar o da primeira variante seria anunciar um
    // valor que muda sozinho quando a pessoa escolher o tamanho.
    return <p className="sc-produto__preco-convite">{convite}</p>;
  }

  return (
    <p className="sc-produto__precos">
      {precoAnterior ? (
        <span className="sc-produto__preco-anterior">
          <span className="sc-so-leitor">De </span>
          <s>{precoAnterior}</s>
        </span>
      ) : null}
      <span className="sc-produto__preco">
        {precoAnterior ? <span className="sc-so-leitor">por </span> : null}
        {preco}
      </span>
    </p>
  );
}

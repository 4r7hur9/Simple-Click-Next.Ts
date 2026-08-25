/**
 * A marca de "esgotado" sobre o cartão de um produto indisponível.
 *
 * O PRODUTO CONTINUA VISÍVEL, e isso é decisão de negócio, não de estilo. Sumir
 * com o que acabou faz a vitrine encolher e reaparecer sozinha ao longo do dia,
 * e quem procurou a coxinha de ontem conclui que a loja parou de vender
 * coxinha. Vendo-a marcada como esgotada, a pessoa entende que ela existe e
 * volta amanhã — e o dono não perde o cliente junto com o estoque.
 *
 * O que NÃO é decidido aqui é o impedimento de comprar: isso mora na página do
 * produto (AC-413, T-405), onde existe o botão que precisa ser barrado. Uma
 * vitrine que também barrasse teria duas cópias da mesma regra.
 */

/** A faixa que atravessa a imagem do produto que acabou. */
export function CartaoEsgotado() {
  return (
    <span className="sc-vitrine__esgotado">
      {/*
        O texto NÃO é `aria-hidden`: quem usa leitor de tela precisa ouvir que
        acabou antes de abrir o produto, e não depois. Ele é lido junto do nome
        porque está dentro do mesmo link.
      */}
      <span className="sc-vitrine__esgotado-selo">Esgotado</span>
    </span>
  );
}

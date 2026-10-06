/**
 * Pedido não encontrado (AC-614).
 *
 * Endereço de acompanhamento adivinhado, trocado ou que nunca existiu cai aqui
 * — e a resposta é a mesma para todos: o pedido não foi encontrado. Sem esta
 * página, o Next subiria até a da loja ("Esta loja não está disponível"), que
 * manda o cliente desconfiar da loja quando o problema é o link.
 *
 * Ela não diz se o código chegou perto de algum pedido nem se a loja tem
 * pedidos: qualquer diferença entre "quase" e "nada" ajudaria a adivinhar.
 */
export default function PedidoNaoEncontrado() {
  return (
    <main className="sc-pagina-da-loja">
      <section className="sc-secao">
        <div className="sc-secao__conteudo">
          <h1 className="sc-secao__titulo">Pedido não encontrado</h1>
          <p className="sc-secao__texto">
            Este link de acompanhamento não corresponde a nenhum pedido. Confira
            se ele foi copiado inteiro, a partir da mensagem do seu pedido.
          </p>
        </div>
      </section>
    </main>
  );
}

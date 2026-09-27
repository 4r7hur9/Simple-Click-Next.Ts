/**
 * O que a página do cupom mostra na TELA, e nunca no papel (T-606).
 *
 * Os endereços são `<a>` comuns, e não o `Link` do framework, de propósito:
 * abrir a página do cupom EMITE uma via (AC-621), e o `Link` pré-carrega o
 * destino quando aparece na tela — cada pré-carregamento seria uma via contada
 * sem papel nenhum.
 */
export function AcoesDaImpressao({
  pedidoId,
  larguraMm,
  via,
}: {
  readonly pedidoId: string;
  readonly larguraMm: number;
  readonly via: number;
}) {
  const doPedido = encodeURIComponent(pedidoId);
  return (
    <nav className="sc-cupom-acoes" aria-label="Impressão do cupom">
      <p className="sc-cupom-acoes__resumo">
        <strong>
          {via > 1 ? `Reimpressão — ${String(via)}ª via` : "1ª via"}
        </strong>{" "}
        · papel de {larguraMm} mm
      </p>
      <p className="sc-cupom-acoes__ajuda">
        A janela de impressão abre sozinha. Se ela não abrir, use o atalho de
        imprimir do navegador. Cada abertura desta página conta uma nova via.
      </p>
      <div className="sc-cupom-acoes__botoes">
        <a
          className="sc-botao sc-botao--primario"
          href={`/imprimir/${doPedido}`}
        >
          Imprimir outra via
        </a>
        <a
          className="sc-botao sc-botao--fantasma"
          href={`/painel/pedidos/${doPedido}`}
        >
          Voltar ao pedido
        </a>
      </div>
    </nav>
  );
}

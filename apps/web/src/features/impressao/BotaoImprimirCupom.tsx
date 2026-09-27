/**
 * O clique que imprime o cupom (T-606 — AC-617).
 *
 * Abre a página do cupom em outra aba: ela chama o diálogo de impressão do
 * navegador sozinha, e a fila de pedidos continua aberta e atualizando atrás
 * dela. `<a>` comum, e não `Link`: abrir a página emite uma via (AC-621), e
 * pré-carregamento contaria via que nunca saiu no papel.
 */
export function BotaoImprimirCupom({
  pedidoId,
}: {
  readonly pedidoId: string;
}) {
  return (
    <a
      className="sc-botao sc-botao--primario"
      href={`/imprimir/${encodeURIComponent(pedidoId)}`}
      target="_blank"
      rel="noopener"
    >
      Imprimir cupom
    </a>
  );
}

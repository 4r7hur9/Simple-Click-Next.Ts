import { Esqueleto } from "@simpleclick/ui";

import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";

/** O estado de espera da lista (P-011): a forma do que vai chegar. */
export default function CarregandoMeusPedidos() {
  return (
    <PaginaDaConta
      titulo="Meus pedidos"
      descricao="Tudo que você pediu, em todas as lojas, com o status de agora e o resumo dos seus gastos. Abra um pedido para acompanhá-lo sem precisar do link."
    >
      <Esqueleto linhas={4} rotulo="Carregando seus pedidos…" />
    </PaginaDaConta>
  );
}

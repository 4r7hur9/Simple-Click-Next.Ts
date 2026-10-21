import { IconeAjuda } from "@simpleclick/ui";
import type { Metadata } from "next";

import { EmConstrucaoDoPainel } from "../../../../features/painel/EmConstrucaoDoPainel.tsx";

export const metadata: Metadata = { title: "Ajuda | SimpleClick" };

export default function Pagina() {
  return (
    <EmConstrucaoDoPainel
      titulo="Ajuda e tutorial"
      icone={IconeAjuda}
      descricao="Aqui você vai encontrar o passo a passo para usar o painel, do primeiro produto ao primeiro pedido."
      topicos={[
        "Como cadastrar produtos e categorias",
        "Como controlar estoque, variações e opções",
        "Como receber e acompanhar pedidos",
        "Como configurar entrega, pagamento e horários",
      ]}
    />
  );
}

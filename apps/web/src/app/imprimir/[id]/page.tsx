import type { Metadata } from "next";
import { headers } from "next/headers";

import { AcoesDaImpressao } from "../../../features/impressao/AcoesDaImpressao.tsx";
import { AvisoDoCupom } from "../../../features/impressao/AvisoDoCupom.tsx";
import { FolhaDoCupom } from "../../../features/impressao/FolhaDoCupom.tsx";
import { ImprimirAoAbrir } from "../../../features/impressao/ImprimirAoAbrir.tsx";
import { emitirCupomParaImprimir } from "../../../server/cupom.ts";
import "./cupom.css";

/**
 * O cupom do pedido, para impressão por clique no navegador (T-606 — AC-617,
 * AC-618).
 *
 * Mora FORA do grupo do painel de propósito: a casca do painel (cabeçalho,
 * navegação, avisos de configuração) não pode sair no papel. Aqui só há o
 * cupom — e, na tela, a barra de ações que a impressão esconde.
 *
 * Abrir esta página emite uma via (AC-621): a API soma a via e devolve o cupom
 * já marcado. A janela de impressão do navegador abre sozinha — nada a
 * instalar na máquina da loja.
 */
export const metadata: Metadata = {
  title: "Cupom do pedido | SimpleClick",
  robots: { index: false, follow: false },
};

export default async function PaginaDoCupom({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const cabecalhos = await headers();
  const resultado = await emitirCupomParaImprimir(id, cabecalhos.get("cookie"));

  if (resultado.estado !== "pronto") {
    return (
      <main className="sc-cupom-pagina">
        <AvisoDoCupom motivo={resultado.estado} pedidoId={id} />
      </main>
    );
  }

  const { folha } = resultado;
  return (
    <main className="sc-cupom-pagina">
      <AcoesDaImpressao
        pedidoId={id}
        larguraMm={folha.larguraMm}
        via={folha.via}
      />
      <FolhaDoCupom folha={folha} />
      <ImprimirAoAbrir />
    </main>
  );
}

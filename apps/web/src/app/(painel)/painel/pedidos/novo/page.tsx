import "@simpleclick/ui/styles/pedidos.css";

import Link from "next/link";
import { Erro } from "@simpleclick/ui";

import { MontarPedido } from "../../../../../features/painel-pedidos/MontarPedido.tsx";
import { exigirLojaDaPagina } from "../../../../../server/loja-da-pagina.ts";
import { produtosDoBalcao } from "../../../../../server/produtos-do-balcao.ts";

export const metadata = { title: "Novo pedido | SimpleClick" };

/** Um valor de busca da URL, só quando é texto simples. */
function parametro(valor: string | string[] | undefined): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

export default async function PaginaDoNovoPedido({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<Record<string, string | string[] | undefined>>
  >;
}) {
  const busca = await searchParams;
  // A loja da sessão, a mesma que as rotas de encaminhamento usam (T-115).
  const { loja } = await exigirLojaDaPagina();
  const catalogo = await produtosDoBalcao(loja.apelido);

  return (
    <div className="sc-pedidos sc-pedidos--respiro">
      <Link
        className="sc-botao sc-botao--discreta sc-botao--pequeno sc-pedidos__voltar"
        href="/painel/pedidos"
      >
        ← Voltar para o quadro
      </Link>
      <header className="sc-pedidos__cabeca">
        <p className="sc-pedidos__sobretitulo">Pedido do balcão</p>
        <h1 className="sc-pedidos__titulo">Lançar pedido</h1>
        <p className="sc-pedidos__descricao">
          Escolha o cliente, os itens e como ele recebe e paga. O pedido entra
          no quadro em “Pedido gerado”.
        </p>
      </header>
      {catalogo.estado === "ok" ? (
        <MontarPedido
          produtos={catalogo.produtos}
          clienteId={parametro(busca.cliente)}
          repetirPedidoId={parametro(busca.repetir)}
        />
      ) : (
        <Erro
          titulo="Não foi possível carregar o catálogo"
          mensagem="Sem o catálogo não há como montar o pedido. Recarregue a página em instantes."
        />
      )}
    </div>
  );
}

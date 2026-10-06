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
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/painel/pedidos"
      >
        ← Voltar para a fila
      </Link>
      <header className="mt-4 mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Pedido do balcão
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
          Lançar pedido
        </h1>
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
    </main>
  );
}

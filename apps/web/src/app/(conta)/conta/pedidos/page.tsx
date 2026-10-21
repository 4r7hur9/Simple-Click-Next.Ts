import { redirect } from "next/navigation";

import { FiltrosDePedidos } from "../../../../features/conta/FiltrosDePedidos.tsx";
import { MeusPedidos } from "../../../../features/conta/MeusPedidos.tsx";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import { filtrarPedidos, lerFiltro, lojasDosPedidos } from "../../../../lib/conta-do-cliente.ts";
import { buscarMeusPedidos } from "../../../../lib/meus-pedidos.ts";
import { tokenOuEntrar } from "../_token.ts";

export const metadata = { title: "Meus pedidos | SimpleClick" };

// A lista muda a cada passo da loja: nada aqui pode ser gerado de antemão.
export const dynamic = "force-dynamic";

/**
 * Meus pedidos, em todas as lojas (AC-616), com filtro por situação, loja e
 * período. A sessão vive em cookie que só o servidor lê (P-008). Sem sessão, a
 * pessoa vai entrar — e não recebe uma lista vazia que mentiria.
 */
export default async function PaginaDeMeusPedidos({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; periodo?: string; loja?: string }>;
}) {
  const token = await tokenOuEntrar();
  const filtro = lerFiltro(await searchParams);

  const leitura = await buscarMeusPedidos(token);
  if (leitura.estado === "nao-autenticado") redirect("/entrar");

  const todos = leitura.estado === "ok" ? leitura.pedidos : [];
  const exibida =
    leitura.estado === "ok"
      ? { ...leitura, pedidos: filtrarPedidos(todos, filtro, new Date()) }
      : leitura;
  const filtrada = filtro.situacao !== "todos" || filtro.periodo !== "todos" || filtro.loja !== "";

  return (
    <PaginaDaConta
      atual="pedidos"
      titulo="Meus pedidos"
      descricao="Tudo que você pediu, em todas as lojas, com o status de agora. Abra um pedido para acompanhá-lo sem precisar do link."
    >
      {todos.length > 0 ? <FiltrosDePedidos filtro={filtro} lojas={lojasDosPedidos(todos)} /> : null}
      <MeusPedidos leitura={exibida} filtrada={filtrada} />
    </PaginaDaConta>
  );
}

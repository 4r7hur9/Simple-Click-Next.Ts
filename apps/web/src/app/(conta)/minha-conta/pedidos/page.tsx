import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MeusPedidos } from "../../../../features/conta/MeusPedidos.tsx";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import { buscarMeusPedidos } from "../../../../lib/meus-pedidos.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../../server/session-cookie.ts";

export const metadata = { title: "Meus pedidos | SimpleClick" };

// A lista muda a cada passo da loja: nada aqui pode ser gerado de antemão.
export const dynamic = "force-dynamic";

/**
 * Meus pedidos, em todas as lojas (AC-616).
 *
 * A sessão do cliente vive em cookie que só o servidor lê (P-008): a página
 * pede à API daqui, com o token no cabeçalho, e o navegador nunca o vê. Sem
 * sessão, ou com sessão vencida, a pessoa vai entrar de novo — e não recebe
 * uma lista vazia que mentiria "você não tem pedidos".
 */
export default async function PaginaDeMeusPedidos() {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  if (token === undefined || token === "") redirect("/entrar");

  const leitura = await buscarMeusPedidos(token);
  if (leitura.estado === "nao-autenticado") redirect("/entrar");

  return (
    <PaginaDaConta
      atual="pedidos"
      titulo="Meus pedidos"
      descricao="Tudo que você pediu, em todas as lojas, com o status de agora. Abra um pedido para acompanhá-lo sem precisar do link."
    >
      <MeusPedidos leitura={leitura} />
    </PaginaDaConta>
  );
}

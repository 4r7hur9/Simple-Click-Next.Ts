import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MeusPedidos } from "../../../../features/conta/MeusPedidos.tsx";
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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Minha conta
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          Meus pedidos
        </h1>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Tudo que você pediu, em todas as lojas, com o status de agora. Abra um
          pedido para acompanhá-lo sem precisar do link.
        </p>
      </header>
      <div className="mt-8">
        <MeusPedidos leitura={leitura} />
      </div>
    </main>
  );
}

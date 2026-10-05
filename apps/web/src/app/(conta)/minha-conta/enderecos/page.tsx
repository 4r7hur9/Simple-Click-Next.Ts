import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EnderecosSalvos } from "../../../../features/conta/EnderecosSalvos.tsx";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../../server/session-cookie.ts";

export const metadata = { title: "Meus endereços | SimpleClick" };

// A lista é da pessoa logada: nada aqui pode ser gerado de antemão.
export const dynamic = "force-dynamic";

/**
 * Meus endereços (T-707, AC-509).
 *
 * O endereço é da PESSOA, e não da loja: cadastrado aqui, ele vem preenchido
 * no fechamento de qualquer loja. Sem sessão, a pessoa vai entrar — e não
 * recebe uma lista vazia que mentiria "você não tem endereços".
 */
export default async function PaginaDosMeusEnderecos() {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  if (token === undefined || token === "") redirect("/entrar");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Minha conta
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          Meus endereços
        </h1>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Cadastre uma vez e use em qualquer loja. O endereço padrão chega
          preenchido — e editável — quando você fecha um pedido.
        </p>
      </header>
      <div className="mt-8">
        <EnderecosSalvos />
      </div>
    </main>
  );
}

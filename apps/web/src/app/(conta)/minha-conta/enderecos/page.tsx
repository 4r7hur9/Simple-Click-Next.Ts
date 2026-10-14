import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EnderecosSalvos } from "../../../../features/conta/EnderecosSalvos.tsx";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
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
    <PaginaDaConta
      atual="enderecos"
      titulo="Meus endereços"
      descricao="Cadastre uma vez e use em qualquer loja. O endereço padrão chega preenchido — e editável — quando você fecha um pedido."
    >
      <EnderecosSalvos />
    </PaginaDaConta>
  );
}

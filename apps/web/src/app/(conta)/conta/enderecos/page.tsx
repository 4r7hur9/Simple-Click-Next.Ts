import { redirect } from "next/navigation";

import { enderecoDoModal } from "../../../../lib/abas-da-conta.ts";
import { tokenOuEntrar } from "../_token.ts";

export const metadata = { title: "Minha conta | SimpleClick" };
export const dynamic = "force-dynamic";

/**
 * Link antigo (card #151): "enderecos" agora é uma aba do modal "Minha conta".
 * Sem sessão a pessoa entra e volta aqui; com sessão, vai para Pedidos com o
 * modal aberto na aba.
 */
export default async function PaginaAntigaDeEnderecos() {
  await tokenOuEntrar("/conta/enderecos");
  redirect(enderecoDoModal("enderecos"));
}

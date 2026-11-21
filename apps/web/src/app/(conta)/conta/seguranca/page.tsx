import { redirect } from "next/navigation";

import { enderecoDoModal, textoDaConsulta } from "../../../../lib/abas-da-conta.ts";
import { desviarAdministradorDasAreasDeCliente } from "../../../../server/area-do-papel.ts";
import { tokenOuEntrar } from "../_token.ts";

export const metadata = { title: "Minha conta | SimpleClick" };
export const dynamic = "force-dynamic";

/**
 * Link antigo (card #151): "Segurança" agora é uma aba do modal "Minha
 * conta". `?estado=erro` (a ação "Encerrar todas" que falhou) segue junto; só
 * esse valor exato, e a URL nova é montada, não concatenada. A administração
 * abre o mesmo modal sobre `/admin`, com o mesmo `estado` (card #170).
 */
export default async function PaginaAntigaDeSeguranca({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await tokenOuEntrar("/conta/seguranca");
  const { estado } = await searchParams;
  await desviarAdministradorDasAreasDeCliente({
    aba: "seguranca",
    estado: textoDaConsulta(estado),
  });
  redirect(enderecoDoModal("seguranca", textoDaConsulta(estado)));
}

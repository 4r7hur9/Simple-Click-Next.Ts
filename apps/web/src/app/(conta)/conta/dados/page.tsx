import { Erro } from "@simpleclick/ui";
import { redirect } from "next/navigation";

import { DadosDaConta } from "../../../../features/conta/DadosDaConta.tsx";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import { buscarDadosDaConta } from "../../../../lib/conta-do-cliente.ts";
import { tokenOuEntrar } from "../_token.ts";
import { comDestino } from "../../../../lib/destino-seguro.ts";

export const metadata = { title: "Meus dados | SimpleClick" };
export const dynamic = "force-dynamic";

export default async function PaginaDeDados() {
  const leitura = await buscarDadosDaConta(await tokenOuEntrar("/conta/dados"));
  if (leitura.estado === "nao-autenticado") redirect(comDestino("/entrar", "/conta/dados"));
  return (
    <PaginaDaConta
      atual="dados"
      titulo="Meus dados"
      descricao="Seu cadastro vale para todas as lojas. Mantenha o telefone em dia para a loja falar com você sobre o pedido."
    >
      {leitura.estado === "ok" ? (
        <DadosDaConta inicial={leitura.dados} />
      ) : (
        <Erro titulo="Não deu para carregar seus dados" mensagem="Tente de novo em instantes." />
      )}
    </PaginaDaConta>
  );
}

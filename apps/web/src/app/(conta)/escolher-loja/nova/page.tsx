import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CascaDaConta } from "../../../../features/auth/CascaDaConta.tsx";
import { FormularioOutraLoja } from "../../../../features/equipe/FormularioOutraLoja.tsx";
import { lojaDoPedidoAtual } from "../../../../server/loja-da-pagina.ts";

export const metadata: Metadata = {
  title: "Abrir outra loja | SimpleClick",
  robots: { index: false, follow: false },
};

/** Nova loja do dono (card #32): nasce aguardando aprovação e respeita o limite. */
export default async function PaginaDeNovaLoja() {
  const decisao = await lojaDoPedidoAtual();
  if (decisao.estado === "sem-sessao") redirect("/entrar");
  return (
    <CascaDaConta
      titulo="Abrir outra loja"
      descricao="Conte o básico. A administração analisa e libera a loja; enquanto isso ela não aparece para os clientes."
      identificadorDoTitulo="titulo-nova-loja"
      painel="lojista"
    >
      <FormularioOutraLoja />
    </CascaDaConta>
  );
}

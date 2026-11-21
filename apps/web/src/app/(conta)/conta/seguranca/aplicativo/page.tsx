import { Cartao } from "@simpleclick/ui";

import { PaginaDaConta } from "../../../../../features/conta/PaginaDaConta.tsx";
import { tokenOuEntrar } from "../../_token.ts";
import { AtivacaoDoAplicativo } from "./AtivacaoDoAplicativo.tsx";

export const metadata = {
  title: "Configurar aplicativo autenticador | SimpleClick",
};

// Mostra a pessoa da sessão: nada aqui pode ser guardado de antemão (AC-11120).
export const dynamic = "force-dynamic";

/** Tela de ativação do aplicativo autenticador (AC-121, AC-123). */
export default async function PaginaDoAplicativoAutenticador() {
  // Sem sessão, a pessoa entra e volta para esta tela.
  await tokenOuEntrar("/conta/seguranca/aplicativo");
  return (
    <PaginaDaConta
      titulo="Proteger a conta com aplicativo"
      descricao="Com o aplicativo autenticador, o login pede o código que aparece no seu celular. Invadir o seu e-mail deixa de bastar para entrar na conta."
    >
      <Cartao>
        <AtivacaoDoAplicativo />
      </Cartao>
    </PaginaDaConta>
  );
}

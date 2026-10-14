import { Cartao } from "@simpleclick/ui";

import { PaginaDaConta } from "../../../../../features/conta/PaginaDaConta.tsx";
import { AtivacaoDoAplicativo } from "./AtivacaoDoAplicativo.tsx";

export const metadata = {
  title: "Configurar aplicativo autenticador | SimpleClick",
};

/** Tela de ativação do aplicativo autenticador (AC-121, AC-123). */
export default function PaginaDoAplicativoAutenticador() {
  return (
    <PaginaDaConta
      atual="seguranca"
      titulo="Proteger a conta com aplicativo"
      descricao="Com o aplicativo autenticador, o login pede o código que aparece no seu celular. Invadir o seu e-mail deixa de bastar para entrar na conta."
    >
      <Cartao>
        <AtivacaoDoAplicativo />
      </Cartao>
    </PaginaDaConta>
  );
}

import type { ReactNode } from "react";

import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/** Opções e adicionais: dono e equipe com a permissão de produtos (a mesma da API). */
export default function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <GuardaDoPainel permissao="catalogo.produtos">{children}</GuardaDoPainel>
  );
}

import type { ReactNode } from "react";

import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/** Comentários: quem tem `moderar_comentarios` (dono e equipe). */
export default function LayoutDosComentarios({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <GuardaDoPainel permissao="moderar_comentarios">{children}</GuardaDoPainel>
  );
}

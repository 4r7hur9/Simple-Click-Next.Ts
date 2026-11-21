"use client";

import { useEffect } from "react";

/**
 * Tira o `?token=` da barra de endereço depois que a tela abriu, para o
 * token não ficar no histórico nem ser copiado junto com o endereço. O
 * formulário já carrega o token num campo escondido, então nada se perde; sem
 * JavaScript este componente não roda e o fluxo segue igual.
 */
export function LimparTokenDaBarra() {
  useEffect(() => {
    const endereco = new URL(window.location.href);
    if (!endereco.searchParams.has("token")) return;
    endereco.searchParams.delete("token");
    window.history.replaceState(
      window.history.state,
      "",
      `${endereco.pathname}${endereco.search}${endereco.hash}`,
    );
  }, []);
  return null;
}

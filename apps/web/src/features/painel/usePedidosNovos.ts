"use client";

/**
 * Quantos pedidos novos esperam a loja, para o selo do item "Pedidos".
 *
 * Lê a mesma fila que a tela de pedidos usa e conta os que ainda aguardam a
 * resposta da loja. Refaz a leitura de tempos em tempos e quando a aba volta
 * a ser vista. Se a leitura falha, o selo simplesmente não aparece: o menu
 * nunca vira fonte de erro.
 */
import { useEffect, useState } from "react";

import {
  agruparPedidosDaFila,
  buscarFilaDoPainel,
} from "../../lib/fila-de-pedidos.ts";

/** De quanto em quanto tempo o selo se atualiza. */
export const INTERVALO_DO_SELO_EM_MS = 30_000;

export function usePedidosNovos(ativo: boolean): number {
  const [novos, setNovos] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    async function atualizar() {
      const leitura = await buscarFilaDoPainel();
      if (!vivo || leitura.estado !== "ok") return;
      const grupos = agruparPedidosDaFila(leitura.pedidos);
      setNovos(
        grupos.aguardandoConfirmacao.length + grupos.aguardandoWhatsapp.length,
      );
    }
    void atualizar();
    const relogio = window.setInterval(
      () => void atualizar(),
      INTERVALO_DO_SELO_EM_MS,
    );
    function aoVoltar() {
      if (document.visibilityState === "visible") void atualizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo]);

  return ativo ? novos : 0;
}

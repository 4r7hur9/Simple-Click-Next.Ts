"use client";

/**
 * Quantos comentários esperam a moderação, para o selo do item "Comentários"
 * do menu (card #48). Lê `GET .../comentarios/contagem` de tempos em tempos,
 * quando a aba volta a ser vista e quando a própria tela de moderação avisa
 * que mudou algo. Se a leitura falha, o selo só não aparece.
 */
import { useEffect, useState } from "react";

/** O evento que a tela de moderação dispara depois de aprovar, recusar ou apagar. */
export const EVENTO_COMENTARIOS_MUDARAM = "sc:comentarios-mudaram";

export const INTERVALO_DO_SELO_DE_COMENTARIOS_EM_MS = 60_000;

export function avisarQueComentariosMudaram() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_COMENTARIOS_MUDARAM));
  }
}

export function useComentariosPendentes(ativo: boolean): number {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    async function atualizar() {
      try {
        const resposta = await fetch("/api/loja/comentarios/contagem", {
          cache: "no-store",
        });
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as { pendentes?: number };
        if (vivo && typeof dados.pendentes === "number") {
          setPendentes(dados.pendentes);
        }
      } catch {
        // O menu nunca vira fonte de erro.
      }
    }
    void atualizar();
    const relogio = window.setInterval(
      () => void atualizar(),
      INTERVALO_DO_SELO_DE_COMENTARIOS_EM_MS,
    );
    function aoVoltar() {
      if (document.visibilityState === "visible") void atualizar();
    }
    const aoMudar = () => void atualizar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_COMENTARIOS_MUDARAM, aoMudar);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_COMENTARIOS_MUDARAM, aoMudar);
    };
  }, [ativo]);

  return ativo ? pendentes : 0;
}

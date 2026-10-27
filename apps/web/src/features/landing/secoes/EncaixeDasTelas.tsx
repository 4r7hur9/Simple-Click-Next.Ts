"use client";

/**
 * Liga o encaixe e as entradas das seções depois da narrativa
 * (telas-em-encaixe.ts). Não desenha nada; com movimento reduzido não faz
 * nada (a rolagem é a do navegador e tudo já está no lugar).
 */
import { useEffect } from "react";

import { detectarCapacidadeDaLanding } from "../capacidade-da-landing.ts";
import { montarEntradasDasTelas, montarTelasEmEncaixe } from "./telas-em-encaixe.ts";

export function EncaixeDasTelas() {
  useEffect(() => {
    let cancelado = false;
    let desfazer: (() => void) | undefined;
    void detectarCapacidadeDaLanding().then((nivel) => {
      if (cancelado || nivel !== "completo" || window.matchMedia("(pointer: coarse)").matches) return;
      const raiz = document.querySelector<HTMLElement>(".sc-lp") ?? document.body;
      const desfazerEntradas = montarEntradasDasTelas(raiz);
      const desfazerEncaixe = montarTelasEmEncaixe(raiz);
      desfazer = () => {
        desfazerEncaixe();
        desfazerEntradas();
      };
    });
    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return null;
}

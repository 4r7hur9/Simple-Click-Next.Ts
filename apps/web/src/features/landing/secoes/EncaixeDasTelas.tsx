"use client";

/**
 * Liga o encaixe e as entradas das seções depois da narrativa
 * (telas-em-encaixe.ts). Não desenha nada; com movimento reduzido não faz
 * nada (a rolagem é a do navegador e tudo já está no lugar).
 */
import { useEffect } from "react";

import { montarEntradasDasTelas, montarTelasEmEncaixe } from "./telas-em-encaixe.ts";

export function EncaixeDasTelas() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raiz = document.querySelector<HTMLElement>(".sc-lp") ?? document.body;
    const desfazerEntradas = montarEntradasDasTelas(raiz);
    const desfazerEncaixe = montarTelasEmEncaixe(raiz);
    return () => {
      desfazerEncaixe();
      desfazerEntradas();
    };
  }, []);

  return null;
}

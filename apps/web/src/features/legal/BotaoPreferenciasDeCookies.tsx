"use client";

import type { ReactNode } from "react";

import { abrirPreferenciasDeCookies } from "./consentimento.ts";

/** Link permanente do rodapé que reabre a janela de cookies. */
export function BotaoPreferenciasDeCookies({
  className = "sc-rodape-legal__link",
  children = "Preferências de cookies",
}: {
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={abrirPreferenciasDeCookies}
    >
      {children}
    </button>
  );
}

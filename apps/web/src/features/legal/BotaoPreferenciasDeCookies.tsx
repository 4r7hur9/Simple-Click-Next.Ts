"use client";

import { abrirPreferenciasDeCookies } from "./consentimento.ts";

/** Link permanente do rodapé que reabre a janela de cookies. */
export function BotaoPreferenciasDeCookies() {
  return (
    <button
      type="button"
      className="sc-rodape-legal__link"
      onClick={abrirPreferenciasDeCookies}
    >
      Preferências de cookies
    </button>
  );
}

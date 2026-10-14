"use client";

import { useState } from "react";
import { Aviso, Botao } from "@simpleclick/ui";

import { confirmarMensagemNoWhatsApp } from "../../lib/carrinho-do-navegador.ts";

export interface BotaoJaEnvieiProps {
  readonly apelidoDaLoja: string;
  readonly tokenDoPedido: string;
  readonly confirmado?: boolean | undefined;
  readonly confirmar?: typeof confirmarMensagemNoWhatsApp | undefined;
}

/** Ação explícita do cliente para tirar o pedido da fila de fantasmas. */
export function BotaoJaEnviei({
  apelidoDaLoja,
  tokenDoPedido,
  confirmado = false,
  confirmar = confirmarMensagemNoWhatsApp,
}: BotaoJaEnvieiProps) {
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<"ok" | "erro" | null>(
    confirmado ? "ok" : null,
  );

  async function aoConfirmar() {
    setEnviando(true);
    const sucesso = await confirmar(apelidoDaLoja, tokenDoPedido);
    setEstado(sucesso ? "ok" : "erro");
    setEnviando(false);
  }

  if (estado === "ok") {
    return (
      <Aviso tom="sucesso" titulo="Mensagem sinalizada">
        A loja já pode confirmar seu pedido.
      </Aviso>
    );
  }

  return (
    <div className="space-y-3">
      <Botao
        forma="pilula"
        onClick={() => void aoConfirmar()}
        carregando={enviando}
      >
        Já enviei a mensagem
      </Botao>
      {estado === "erro" ? (
        <Aviso tom="erro">
          Não conseguimos registrar agora. Tente novamente em instantes.
        </Aviso>
      ) : null}
    </div>
  );
}

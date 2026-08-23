"use client";

import { useState, type FormEvent } from "react";

export default function TotpForm() {
  const [codigo, setCodigo] = useState("");
  const [mensagem, setMensagem] = useState<string>();

  function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensagem(
      codigo.replace(/\D/g, "").length === 6
        ? "Aplicativo autenticador ativado. Guarde seus códigos de recuperação."
        : "Informe os seis dígitos exibidos pelo aplicativo.",
    );
  }

  return (
    <form onSubmit={confirmar} className="mt-8 space-y-4" noValidate>
      <div
        aria-label="Código QR do aplicativo autenticador"
        className="flex h-48 w-48 items-center justify-center rounded border border-dashed"
      >
        QR do aplicativo
      </div>
      <label className="block" htmlFor="codigo-aplicativo">
        Código de seis dígitos
        <input
          id="codigo-aplicativo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ""))}
          className="mt-1 block rounded border px-3 py-2"
        />
      </label>
      {mensagem ? <p role="status">{mensagem}</p> : null}
      <button type="submit" className="sc-botao sc-botao--primario">
        Ativar aplicativo
      </button>
    </form>
  );
}

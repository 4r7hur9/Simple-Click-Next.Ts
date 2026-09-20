"use client";

import { useEffect, useState } from "react";

export function EditorDeMensagem() {
  const [numero, setNumero] = useState("");
  const [saudacao, setSaudacao] = useState("Olá! Segue meu pedido:");
  const [estado, setEstado] = useState("Carregando contato…");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void fetch("/api/loja/contato", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as {
          numero?: string | null;
          saudacao?: string | null;
        };
      })
      .then((dados) => {
        setNumero(dados.numero ?? "");
        setSaudacao(dados.saudacao ?? "Olá! Segue meu pedido:");
        setEstado("Contato carregado.");
      })
      .catch(() => setEstado("Entre novamente para editar o contato."));
  }, []);

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setEstado("Salvando…");
    try {
      const resposta = await fetch("/api/loja/contato", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero, saudacao }),
      });
      if (!resposta.ok) throw new Error();
      setEstado("Contato salvo. O checkout usará este número.");
    } catch {
      setEstado("Não foi possível salvar. Confira o número com DDD.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void salvar(evento)}
      className="mt-8 max-w-2xl space-y-6"
    >
      <label className="block">
        <span className="font-medium">WhatsApp da loja</span>
        <input
          className="sc-campo mt-2 w-full"
          type="tel"
          value={numero}
          onChange={(evento) => setNumero(evento.target.value)}
          placeholder="(11) 99999-9999"
          required
        />
        <span className="mt-2 block text-sm text-[var(--cor-tinta-suave)]">
          Aceitamos máscara, espaços ou o formato internacional.
        </span>
      </label>
      <label className="block">
        <span className="font-medium">Saudação da mensagem</span>
        <textarea
          className="sc-campo mt-2 min-h-28 w-full"
          value={saudacao}
          onChange={(evento) => setSaudacao(evento.target.value)}
          maxLength={280}
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primario"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar contato"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {estado}
        </p>
      </div>
    </form>
  );
}

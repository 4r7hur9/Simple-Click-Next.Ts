"use client";

import { useState } from "react";

interface OpcaoDeStatus {
  readonly status: string;
  readonly rotulo: string;
}

export function AcoesDeStatus({
  pedidoId,
  opcoes,
  aoAtualizar,
}: {
  readonly pedidoId: string;
  readonly opcoes: readonly OpcaoDeStatus[];
  readonly aoAtualizar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function mudar(status: string): Promise<void> {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/painel/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          motivo: status === "CANCELLED" ? motivo : null,
        }),
      });
      const dados = (await resposta.json()) as {
        readonly explicacao?: string;
      };
      if (!resposta.ok) {
        throw new Error(
          dados.explicacao ?? "Não foi possível atualizar o pedido.",
        );
      }
      setMotivo("");
      aoAtualizar();
    } catch (causa) {
      setErro(
        causa instanceof Error ? causa.message : "Falha ao atualizar o pedido.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const podeCancelar = opcoes.some((opcao) => opcao.status === "CANCELLED");

  return (
    <section aria-labelledby="acoes-do-pedido" className="mt-8">
      <h2 id="acoes-do-pedido" className="text-xl font-semibold">
        Próxima ação
      </h2>
      {podeCancelar ? (
        <label className="mt-4 block max-w-xl">
          <span className="font-medium">Motivo para recusar ou cancelar</span>
          <textarea
            className="sc-campo mt-2 min-h-24 w-full"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={500}
            placeholder="Ex.: produto sem estoque"
          />
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {opcoes.map((opcao) => (
          <button
            className={
              opcao.status === "CANCELLED"
                ? "sc-botao sc-botao--perigo"
                : "sc-botao sc-botao--primario"
            }
            key={opcao.status}
            type="button"
            disabled={
              salvando ||
              (opcao.status === "CANCELLED" && motivo.trim().length < 3)
            }
            onClick={() => void mudar(opcao.status)}
          >
            {salvando ? "Salvando…" : opcao.rotulo}
          </button>
        ))}
      </div>
      {erro ? (
        <p className="mt-3 text-sm text-[var(--cor-perigo)]" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

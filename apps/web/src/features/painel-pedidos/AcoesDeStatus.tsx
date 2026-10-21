"use client";

/**
 * Os botões que fazem o pedido andar (AC-604..AC-607).
 *
 * A TELA SÓ OFERECE O QUE A API OFERECE: a lista de próximos passos vem pronta
 * da máquina de status, no servidor. Pedido de retirada nunca recebe "saiu para
 * entrega" (AC-605) porque o servidor não o oferece — e, se alguém tentar por
 * fora, o servidor recusa com a explicação, que aparece aqui (AC-606).
 *
 * Recusar e cancelar exigem motivo (AC-607): o botão fica travado até haver
 * um, porque é esse texto que o cliente lê na página de acompanhamento.
 */
import { useState } from "react";
import { Info } from "@simpleclick/ui";

export interface OpcaoDeStatusNaTela {
  readonly status: string;
  readonly rotulo: string;
  /** O texto do botão: "Aceitar pedido", "Recusar pedido"... */
  readonly acao?: string | undefined;
}

/** Motivo mais curto que isso não explica nada ao cliente. */
export const TAMANHO_MINIMO_DO_MOTIVO = 3;

export function AcoesDeStatus({
  pedidoId,
  opcoes,
  aoAtualizar,
  buscar = fetch,
}: {
  readonly pedidoId: string;
  readonly opcoes: readonly OpcaoDeStatusNaTela[];
  readonly aoAtualizar: () => void;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: typeof fetch | undefined;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function mudar(status: string): Promise<void> {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await buscar(`/api/painel/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          motivo: status === "CANCELLED" ? motivo.trim() : null,
        }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as {
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
      // A recusa pode ter vindo de outro aparelho ter mudado o pedido antes:
      // reler mostra o status de verdade junto com a explicação.
      aoAtualizar();
    } finally {
      setSalvando(false);
    }
  }

  const podeCancelar = opcoes.some((opcao) => opcao.status === "CANCELLED");
  const motivoSuficiente = motivo.trim().length >= TAMANHO_MINIMO_DO_MOTIVO;

  return (
    <section aria-labelledby="acoes-do-pedido" className="sc-acoes-status">
      <h2 id="acoes-do-pedido" className="sc-acoes-status__titulo">
        Próxima ação
      </h2>
      {opcoes.length === 0 ? (
        <p className="text-[var(--cor-tinta-suave)]">
          Este pedido chegou ao fim do caminho: não há próxima ação.
        </p>
      ) : null}
      {podeCancelar ? (
        <div className="block max-w-xl">
          <span className="inline-flex items-center gap-1">
            <label
              className="text-sm font-medium"
              htmlFor={`motivo-${pedidoId}`}
            >
              Motivo para recusar ou cancelar (o cliente vê este texto)
            </label>
            <Info
              id={`motivo-${pedidoId}`}
              rotulo="o motivo"
              conteudo={{
                texto:
                  "Explique em uma frase por que o pedido não vai sair. O cliente lê este texto na página de acompanhamento do pedido.",
                exemplo: "acabou o queijo do pastel de queijo.",
              }}
            />
          </span>
          <textarea
            id={`motivo-${pedidoId}`}
            className="sc-campo__controle mt-2 min-h-24 w-full"
            aria-describedby={`motivo-${pedidoId}-dica motivo-${pedidoId}-info`}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={500}
            placeholder="Ex.: acabou o queijo; não entregamos no seu bairro"
          />
          <span
            id={`motivo-${pedidoId}-dica`}
            className="mt-1 block text-sm text-[var(--cor-tinta-suave)]"
          >
            Só para recusar ou cancelar: de 3 a 500 letras. Os botões de
            avançar não precisam de motivo.
          </span>
        </div>
      ) : null}
      <div className="sc-acoes-status__botoes">
        {opcoes.map((opcao) => (
          <button
            // Botão grande, que o dedo acerta com pressa: no celular a ação
            // ocupa a linha inteira.
            className={[
              "sc-botao sc-botao--grande min-w-0 flex-1 sm:flex-none",
              opcao.status === "CANCELLED"
                ? "sc-botao--perigo"
                : "sc-botao--primaria",
            ].join(" ")}
            key={opcao.status}
            type="button"
            data-status={opcao.status}
            disabled={
              salvando || (opcao.status === "CANCELLED" && !motivoSuficiente)
            }
            onClick={() => void mudar(opcao.status)}
          >
            {opcao.acao ?? opcao.rotulo}
          </button>
        ))}
      </div>
      {salvando ? (
        <p className="text-sm" role="status">
          Salvando…
        </p>
      ) : null}
      {erro ? (
        <p className="text-sm font-medium text-[var(--cor-erro)]" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

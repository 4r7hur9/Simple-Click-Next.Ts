"use client";

/**
 * A página que o cliente abre pelo link do pedido (AC-612..AC-615).
 *
 * Ela chega do servidor já com o pedido, e daí em diante pergunta de novo em
 * intervalo curto: quando o dono muda o status, a página mostra o passo novo em
 * poucos segundos, sem o cliente recarregar nada (AC-613). Se a pergunta falhar,
 * a página AVISA e mantém o último status — nunca some com o pedido da tela.
 *
 * Só aparece o que o contrato público traz (AC-615): o telefone do cliente vem
 * mascarado do servidor, e da loja só o nome e o contato que ela tornou público.
 */
import { useEffect, useState } from "react";
import { Aviso, Cartao, TemaDaLoja } from "@simpleclick/ui";
import type { AcompanhamentoNoContrato } from "@simpleclick/contracts";

import {
  buscarAcompanhamento,
  type ResultadoDoAcompanhamento,
} from "../../lib/acompanhamento.ts";
import { escreverDinheiro } from "../../lib/produto.ts";
import { BotaoJaEnviei } from "./BotaoJaEnviei.tsx";
import {
  LinhaDoTempo,
  explicacaoDoStatus,
  rotuloDoStatus,
} from "./LinhaDoTempo.tsx";

type Pedido = AcompanhamentoNoContrato["pedido"];

/** "Em poucos segundos", como o AC-613 pede. */
export const INTERVALO_DO_ACOMPANHAMENTO_MS = 5_000;

export interface AcompanhamentoDoPedidoProps {
  readonly apelidoDaLoja: string;
  readonly tokenDoPedido: string;
  readonly inicial: Pedido;
  readonly corPrincipal: string;
  /** Como perguntar de novo. A prova troca por um que responde sem rede. */
  readonly atualizar?:
    | ((apelido: string, token: string) => Promise<ResultadoDoAcompanhamento>)
    | undefined;
  readonly intervaloMs?: number | undefined;
}

function formaDePagamento(forma: string | null): string {
  if (forma === "PIX") return "PIX";
  if (forma === "CASH") return "Dinheiro na entrega";
  if (forma === "CARD_ON_DELIVERY") return "Cartão na entrega";
  return forma ?? "A combinar com a loja";
}

function entrega(forma: string): string {
  return forma === "PICKUP" ? "Retirada no local" : "Entrega";
}

/** O motivo do cancelamento é o do passo que cancelou. */
function motivoDoCancelamento(pedido: Pedido): string | null {
  if (pedido.status !== "CANCELLED") return null;
  const passo = [...pedido.historico]
    .reverse()
    .find((entrada) => entrada.para === "CANCELLED");
  return passo?.motivo ?? null;
}

export function AcompanhamentoDoPedido({
  apelidoDaLoja,
  tokenDoPedido,
  inicial,
  corPrincipal,
  atualizar = buscarAcompanhamento,
  intervaloMs = INTERVALO_DO_ACOMPANHAMENTO_MS,
}: AcompanhamentoDoPedidoProps) {
  const [pedido, setPedido] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;

    // A próxima pergunta só é agendada quando a anterior volta: em rede lenta,
    // uma resposta velha chegando depois da nova desfaria o status na tela.
    async function perguntar(): Promise<void> {
      const resultado = await atualizar(apelidoDaLoja, tokenDoPedido);
      if (!ativo) return;
      if (resultado.estado === "encontrado") {
        setPedido(resultado.acompanhamento.pedido);
        setErro(null);
      } else {
        setErro("Não foi possível atualizar agora.");
      }
      espera = setTimeout(() => void perguntar(), intervaloMs);
    }

    espera = setTimeout(() => void perguntar(), intervaloMs);
    return () => {
      ativo = false;
      if (espera !== undefined) clearTimeout(espera);
    };
  }, [apelidoDaLoja, tokenDoPedido, atualizar, intervaloMs]);

  const motivo = motivoDoCancelamento(pedido);

  return (
    <TemaDaLoja corPrincipal={corPrincipal} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-14">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <a
              className="font-medium text-[var(--cor-primaria-texto)] underline"
              href={`/l/${apelidoDaLoja}`}
            >
              ← Voltar para a loja
            </a>
            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
              Acompanhamento · {pedido.loja.nome}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
              Pedido nº {pedido.numero}
            </h1>
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              Código {pedido.codigo}
            </p>
          </div>
          <div
            className="rounded-full bg-[var(--cor-primaria-suave)] px-4 py-2 font-semibold text-[var(--cor-primaria-texto)]"
            data-status-atual={pedido.status}
            role="status"
            aria-live="polite"
          >
            {rotuloDoStatus(pedido.status)}
          </div>
        </header>

        <p className="mt-4 text-lg text-[var(--cor-tinta-suave)]">
          {explicacaoDoStatus(pedido.status, pedido.entrega)}
        </p>

        {pedido.status === "CANCELLED" ? (
          <Aviso className="mt-6" tom="erro" titulo="Pedido cancelado">
            {motivo !== null
              ? `A loja informou o motivo: ${motivo}`
              : "A loja cancelou este pedido."}
          </Aviso>
        ) : null}

        {erro ? (
          <Aviso className="mt-6" tom="atencao">
            {erro} O último status continua visível e a página tenta de novo
            sozinha.
          </Aviso>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <Cartao titulo="Linha do tempo">
              <LinhaDoTempo historico={pedido.historico} />
            </Cartao>

            <Cartao titulo="Itens do pedido">
              <ul className="divide-y divide-[var(--cor-borda)]">
                {pedido.itens.map((item, indice) => (
                  <li
                    key={`${item.nome}-${indice}`}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-4">
                      <p>
                        <strong>{item.quantidade}×</strong> {item.nome}
                        {item.variacao ? ` · ${item.variacao}` : ""}
                      </p>
                      <strong>{escreverDinheiro(item.totalCentavos)}</strong>
                    </div>
                    {item.opcoes.length > 0 ? (
                      <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                        {item.opcoes
                          .map((opcao) => `${opcao.grupo}: ${opcao.nome}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Cartao>
          </div>

          <aside className="space-y-6">
            <Cartao titulo="Resumo">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Entrega</dt>
                  <dd className="font-medium">{entrega(pedido.entrega)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Pagamento</dt>
                  <dd className="font-medium">
                    {formaDePagamento(pedido.formaDePagamento)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--cor-borda)] pt-3 text-base">
                  <dt>Total</dt>
                  <dd className="font-semibold" data-total>
                    {escreverDinheiro(pedido.totalCentavos)}
                  </dd>
                </div>
              </dl>
            </Cartao>

            <Cartao titulo="Seus dados">
              <p className="font-medium">{pedido.cliente.nome}</p>
              <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                Telefone {pedido.cliente.telefoneMascarado}
              </p>
            </Cartao>

            {pedido.whatsappConfirmadoEm === null &&
            pedido.status !== "CANCELLED" ? (
              <Cartao titulo="Mensagem para a loja">
                <p className="mb-4 text-sm text-[var(--cor-tinta-suave)]">
                  Se você já enviou o pedido pelo WhatsApp, avise a loja para
                  ele sair da fila de confirmações pendentes.
                </p>
                <BotaoJaEnviei
                  apelidoDaLoja={apelidoDaLoja}
                  tokenDoPedido={tokenDoPedido}
                />
              </Cartao>
            ) : null}

            <Cartao titulo={`Contato da ${pedido.loja.nome}`}>
              {pedido.loja.whatsappPublico ? (
                <a
                  className="font-medium text-[var(--cor-primaria-texto)] underline"
                  href={`https://wa.me/${pedido.loja.whatsappPublico.replace(/\D/g, "")}`}
                  data-contato-da-loja
                >
                  Falar com a loja pelo WhatsApp
                </a>
              ) : (
                <p className="text-sm text-[var(--cor-tinta-suave)]">
                  A loja não divulgou um contato público. Use a conversa em que
                  você enviou o pedido.
                </p>
              )}
            </Cartao>
          </aside>
        </div>
      </main>
    </TemaDaLoja>
  );
}

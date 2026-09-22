"use client";

import { useEffect, useState } from "react";
import { Aviso, Cartao, TemaDaLoja } from "@simpleclick/ui";
import type { AcompanhamentoNoContrato } from "@simpleclick/contracts";

import { buscarAcompanhamento } from "../../lib/acompanhamento.ts";
import { escreverDinheiro } from "../../lib/produto.ts";
import { BotaoJaEnviei } from "./BotaoJaEnviei.tsx";
import { LinhaDoTempo, rotuloDoStatus } from "./LinhaDoTempo.tsx";

type Pedido = AcompanhamentoNoContrato["pedido"];

export interface AcompanhamentoDoPedidoProps {
  readonly apelidoDaLoja: string;
  readonly tokenDoPedido: string;
  readonly inicial: Pedido;
  readonly corPrincipal: string;
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

export function AcompanhamentoDoPedido({
  apelidoDaLoja,
  tokenDoPedido,
  inicial,
  corPrincipal,
}: AcompanhamentoDoPedidoProps) {
  const [pedido, setPedido] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function atualizar() {
      const resultado = await buscarAcompanhamento(
        apelidoDaLoja,
        tokenDoPedido,
      );
      if (!ativo) return;
      if (resultado.estado === "encontrado") {
        setPedido(resultado.acompanhamento.pedido);
        setErro(null);
      } else if (resultado.estado === "indisponivel") {
        setErro("Atualização temporariamente indisponível.");
      }
    }

    const intervalo = window.setInterval(() => void atualizar(), 5_000);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, [apelidoDaLoja, tokenDoPedido]);

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
              Acompanhamento
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
              Pedido {pedido.codigo}
            </h1>
          </div>
          <div className="rounded-full bg-[var(--cor-primaria-suave)] px-4 py-2 font-semibold text-[var(--cor-primaria-texto)]">
            {rotuloDoStatus(pedido.status)}
          </div>
        </header>

        {erro ? (
          <Aviso className="mt-6" tom="atencao">
            {erro} O último status continua visível.
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
                  <dd className="font-semibold">
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

            {pedido.whatsappConfirmadoEm === null ? (
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

            {pedido.loja.whatsappPublico ? (
              <Cartao titulo={`Contato da ${pedido.loja.nome}`}>
                <a
                  className="font-medium text-[var(--cor-primaria-texto)] underline"
                  href={`https://wa.me/${pedido.loja.whatsappPublico.replace(/\D/g, "")}`}
                >
                  Falar com a loja pelo WhatsApp
                </a>
              </Cartao>
            ) : null}
          </aside>
        </div>
      </main>
    </TemaDaLoja>
  );
}

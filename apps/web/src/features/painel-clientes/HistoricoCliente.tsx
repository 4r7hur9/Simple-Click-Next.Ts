/**
 * O histórico de compras do cliente na loja (AC-711, AC-712, AC-713).
 *
 * Do mais novo para o mais antigo: número, data, itens, valor e status de cada
 * pedido. O que aparece de cada item é o que o pedido GUARDOU — nome, escolhas
 * e preço da época —, e o item cujo produto saiu do catálogo ganha a marca
 * "não está mais à venda" sem sumir e sem quebrar a tela.
 *
 * Cada pedido oferece "Repetir": a repetição abre a montagem do pedido manual
 * já preenchida, com os preços de hoje, para o dono conferir com o cliente.
 *
 * Cada pedido é CLICÁVEL: o número abre o detalhe em janela (itens, opções,
 * endereço, linha do tempo e imprimir), sem sair da ficha.
 *
 * O histórico vem pronto da ficha; o único estado daqui é qual pedido está
 * aberto na janela.
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import { Selo, Vazio } from "@simpleclick/ui";

import {
  escreverData,
  rotuloDoStatusDoPedido,
  type FichaComHistorico,
} from "../../lib/clientes-do-painel.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { JanelaDoPedido } from "../painel-pedidos/JanelaDoPedido.tsx";
import { SeloDeStatus } from "../painel-pedidos/SeloDeStatus.tsx";
import { codigoDoPedido } from "@simpleclick/contracts";

type PedidoDoHistorico = FichaComHistorico["pedidos"][number];

export interface HistoricoClienteProps {
  readonly clienteId: string;
  readonly pedidos: readonly PedidoDoHistorico[];
}

function LinhaDoPedido({
  clienteId,
  pedido,
  aoAbrir,
}: {
  readonly clienteId: string;
  readonly pedido: PedidoDoHistorico;
  readonly aoAbrir: (pedido: PedidoDoHistorico) => void;
}) {
  const saiuDoCatalogo = pedido.itens.some((item) => item.indisponivel);
  return (
    <li className="sc-ficha-pedido" data-pedido={pedido.id}>
      <div className="sc-ficha-pedido__topo">
        <div className="sc-ficha-pedido__quem">
          <h3 className="sc-ficha-pedido__numero">
            <button
              type="button"
              className="sc-ficha-pedido__abrir"
              data-abrir-pedido={pedido.id}
              aria-label={`Abrir o pedido ${codigoDoPedido(pedido.numero)}`}
              onClick={() => aoAbrir(pedido)}
            >
              Pedido {codigoDoPedido(pedido.numero)}
            </button>
          </h3>
          <p className="sc-ficha-pedido__meta">
            <span data-status={pedido.status}>
              <SeloDeStatus
                status={pedido.status}
                rotulo={rotuloDoStatusDoPedido(pedido.status)}
              />
            </span>
            <span>
              {escreverData(pedido.criadoEm)} ·{" "}
              {pedido.canal === "MANUAL" ? "Balcão" : "Site"}
            </span>
          </p>
        </div>
        <strong className="sc-ficha-pedido__total">
          {escreverDinheiro(pedido.totalCentavos)}
        </strong>
      </div>

      <ul
        className="sc-ficha-pedido__itens"
        aria-label={`Itens do pedido ${codigoDoPedido(pedido.numero)}`}
      >
        {pedido.itens.map((item, indice) => (
          <li
            key={`${pedido.id}-${indice}`}
            data-indisponivel={item.indisponivel ? "true" : undefined}
          >
            <div className="sc-ficha-pedido__item">
              <span>
                {item.quantidade}× {item.nome}
                {item.variacao ? ` (${item.variacao})` : ""}
                {item.indisponivel ? (
                  <Selo className="ml-2" semBolinha>
                    Não está mais à venda
                  </Selo>
                ) : null}
              </span>{" "}
              <span className="sc-ficha-pedido__preco">
                {escreverDinheiro(item.totalCentavos)}
              </span>
            </div>
            {item.opcoes.length > 0 ? (
              <span className="sc-ficha-pedido__opcoes">
                {item.opcoes
                  .map((opcao) => `${opcao.grupo}: ${opcao.nome}`)
                  .join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="sc-ficha-pedido__rodape">
        {saiuDoCatalogo ? (
          <span className="sc-ficha__apoio">
            Algum item saiu do catálogo: a repetição aponta o que mudou.
          </span>
        ) : null}
        <Link
          className="sc-botao sc-botao--secundaria sc-botao--pequeno"
          href={`/painel/pedidos/novo?cliente=${encodeURIComponent(clienteId)}&repetir=${encodeURIComponent(pedido.id)}`}
        >
          Repetir pedido
        </Link>
      </div>
    </li>
  );
}

export function HistoricoCliente({
  clienteId,
  pedidos,
}: HistoricoClienteProps) {
  const [aberto, setAberto] = useState<PedidoDoHistorico | null>(null);
  return (
    <section
      aria-labelledby="titulo-historico"
      className="sc-ficha__cartao sc-ficha__cartao--historico"
    >
      <div className="sc-ficha__cartao-topo">
        <h2 className="sc-ficha__titulo" id="titulo-historico">
          Histórico de pedidos
        </h2>
        {pedidos.length > 0 ? (
          <span className="sc-ficha__apoio">
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} · do
            mais novo ao mais antigo
          </span>
        ) : null}
      </div>
      {pedidos.length === 0 ? (
        <Vazio
          titulo="Este cliente ainda não pediu"
          descricao="O primeiro pedido pode ser lançado agora mesmo, pelo balcão."
          acao={
            <Link
              className="sc-botao sc-botao--primaria"
              href={`/painel/pedidos/novo?cliente=${encodeURIComponent(clienteId)}`}
            >
              Lançar o primeiro pedido
            </Link>
          }
        />
      ) : (
        <ol className="sc-ficha__historico" aria-label="Pedidos do cliente">
          {pedidos.map((pedido) => (
            <LinhaDoPedido
              key={pedido.id}
              clienteId={clienteId}
              pedido={pedido}
              aoAbrir={setAberto}
            />
          ))}
        </ol>
      )}
      <JanelaDoPedido
        pedidoId={aberto?.id ?? null}
        numero={aberto?.numero}
        aoFechar={() => setAberto(null)}
      />
    </section>
  );
}

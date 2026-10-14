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
 * Sem estado próprio: recebe o histórico pronto da ficha.
 */
import Link from "next/link";
import { Selo, Vazio } from "@simpleclick/ui";

import {
  escreverData,
  rotuloDoStatusDoPedido,
  type FichaComHistorico,
} from "../../lib/clientes-do-painel.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { SeloDeStatus } from "../painel-pedidos/SeloDeStatus.tsx";

type PedidoDoHistorico = FichaComHistorico["pedidos"][number];

export interface HistoricoClienteProps {
  readonly clienteId: string;
  readonly pedidos: readonly PedidoDoHistorico[];
}

function CartaoDoPedido({
  clienteId,
  pedido,
}: {
  readonly clienteId: string;
  readonly pedido: PedidoDoHistorico;
}) {
  const saiuDoCatalogo = pedido.itens.some((item) => item.indisponivel);
  return (
    <li
      className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-4"
      data-pedido={pedido.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">
            <Link
              className="underline-offset-4 hover:underline"
              href={`/painel/pedidos/${pedido.id}`}
            >
              Pedido #{pedido.numero}
            </Link>
          </h4>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--cor-tinta-suave)]">
            <span data-status={pedido.status}>
              <SeloDeStatus
                status={pedido.status}
                rotulo={rotuloDoStatusDoPedido(pedido.status)}
              />
            </span>
            {escreverData(pedido.criadoEm)}
            {pedido.canal === "MANUAL" ? " · Balcão" : " · Site"}
          </p>
        </div>
        <strong>{escreverDinheiro(pedido.totalCentavos)}</strong>
      </div>

      <ul
        className="mt-3 grid gap-1 text-sm"
        aria-label={`Itens do pedido ${pedido.numero}`}
      >
        {pedido.itens.map((item, indice) => (
          <li
            key={`${pedido.id}-${indice}`}
            className={item.indisponivel ? "text-[var(--cor-tinta-suave)]" : ""}
          >
            <span>
              {item.quantidade}× {item.nome}
              {item.variacao ? ` (${item.variacao})` : ""}
            </span>{" "}
            <span>{escreverDinheiro(item.totalCentavos)}</span>
            {item.indisponivel ? (
              <Selo className="ml-2" semBolinha>
                Não está mais à venda
              </Selo>
            ) : null}
            {item.opcoes.length > 0 ? (
              <span className="block pl-5 text-[var(--cor-tinta-suave)]">
                {item.opcoes
                  .map((opcao) => `${opcao.grupo}: ${opcao.nome}`)
                  .join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          className="sc-botao sc-botao--secundaria"
          href={`/painel/pedidos/novo?cliente=${encodeURIComponent(clienteId)}&repetir=${encodeURIComponent(pedido.id)}`}
        >
          Repetir pedido
        </Link>
        {saiuDoCatalogo ? (
          <span className="text-sm text-[var(--cor-tinta-suave)]">
            Algum item saiu do catálogo: a repetição aponta o que mudou.
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function HistoricoCliente({
  clienteId,
  pedidos,
}: HistoricoClienteProps) {
  return (
    <section aria-labelledby="titulo-historico">
      <h3 className="text-2xl font-semibold" id="titulo-historico">
        Histórico de pedidos
      </h3>
      {pedidos.length === 0 ? (
        <div className="mt-4">
          <Vazio
            titulo="Este cliente ainda não pediu"
            descricao="O primeiro pedido pode ser lançado agora mesmo, pelo balcão."
          />
        </div>
      ) : (
        <ol className="mt-4 grid gap-3" aria-label="Pedidos do cliente">
          {pedidos.map((pedido) => (
            <CartaoDoPedido
              key={pedido.id}
              clienteId={clienteId}
              pedido={pedido}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

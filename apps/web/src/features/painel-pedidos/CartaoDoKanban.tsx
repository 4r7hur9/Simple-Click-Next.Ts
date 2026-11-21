"use client";

/**
 * O cartão de um pedido no quadro: número, hora, cliente, itens resumidos,
 * total, como recebe, como paga e há quanto tempo está lá.
 *
 * O cartão inteiro se arrasta (arrastar nativo do navegador) e o botão rápido
 * faz o mesmo passo sem arrastar — no celular, onde o arrastar não existe, é
 * ele que move o pedido. Abrir o pedido é um botão de verdade, para o teclado
 * e o leitor de tela chegarem lá.
 */
import {
  IconeCartao,
  IconeDinheiro,
  IconeEntrega,
  IconeLocal,
  IconePix,
  IconeRelogio,
  Selo,
} from "@simpleclick/ui";

import {
  descreverEspera,
  escreverDinheiroDaFila,
  escreverHorarioDaFila,
  minutosDeEspera,
  rotuloDaEntrega,
  rotuloDoCanal,
} from "../../lib/fila-de-pedidos.ts";
import {
  acaoDeAvancar,
  dataCurta,
  resumoDosItens,
  rotuloDoPagamento,
  type PedidoDoQuadro,
} from "../../lib/quadro-de-pedidos.ts";
import { SeloAguardando } from "./SeloAguardando.tsx";
import { codigoDoPedido } from "@simpleclick/contracts";

export interface CartaoDoKanbanProps {
  readonly pedido: PedidoDoQuadro;
  readonly agora: Date;
  readonly novo: boolean;
  readonly ocupado: boolean;
  readonly arrastando: boolean;
  readonly aoAbrir: (pedido: PedidoDoQuadro) => void;
  readonly aoAvancar: (pedido: PedidoDoQuadro) => void;
  readonly aoCancelar: (pedido: PedidoDoQuadro) => void;
  readonly aoComecarArrastar: (pedido: PedidoDoQuadro) => void;
  readonly aoTerminarArrastar: () => void;
}

function IconeDoPagamento({ forma }: { readonly forma: string | null }) {
  if (forma === "PIX") return <IconePix aria-hidden="true" size={14} />;
  if (forma === "CARD_ON_DELIVERY")
    return <IconeCartao aria-hidden="true" size={14} />;
  return <IconeDinheiro aria-hidden="true" size={14} />;
}

export function CartaoDoKanban({
  pedido,
  agora,
  novo,
  ocupado,
  arrastando,
  aoAbrir,
  aoAvancar,
  aoCancelar,
  aoComecarArrastar,
  aoTerminarArrastar,
}: CartaoDoKanbanProps) {
  const acao = acaoDeAvancar(pedido);
  const emAberto =
    pedido.status !== "COMPLETED" && pedido.status !== "CANCELLED";
  const espera = descreverEspera(minutosDeEspera(pedido.criadoEm, agora));
  const ehRetirada = pedido.entrega === "PICKUP";

  return (
    <article
      aria-label={`Pedido ${codigoDoPedido(pedido.numero)}${novo ? ", novo" : ""}`}
      data-pedido={pedido.id}
      data-status={pedido.status}
      data-novo={novo}
      data-arrastando={arrastando}
      data-ocupado={ocupado}
      className="sc-cartao-pedido"
      draggable={emAberto && !ocupado}
      onDragStart={(evento) => {
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData("text/plain", pedido.id);
        aoComecarArrastar(pedido);
      }}
      onDragEnd={aoTerminarArrastar}
    >
      <button
        type="button"
        className="sc-cartao-pedido__abrir"
        onClick={() => aoAbrir(pedido)}
        // SEM aria-label: o nome do botão é o que está escrito nele (número,
        // hora, cliente, total, itens). Um rótulo diferente do texto visível
        // quebra o comando de voz (axe label-content-name-mismatch), e o
        // cartão em volta já se anuncia como "Pedido A-0004".
      >
        <span className="sc-cartao-pedido__topo">
          <span>
            <span className="sc-cartao-pedido__numero">
              {codigoDoPedido(pedido.numero)}
              {" · "}
              <time dateTime={pedido.criadoEm}>
                {escreverHorarioDaFila(pedido.criadoEm)}
              </time>
              {pedido.deOutroDia ? ` · de ${dataCurta(pedido.criadoEm)}` : ""}
            </span>
            <span className="sc-cartao-pedido__cliente">{pedido.cliente}</span>
          </span>
          <strong className="sc-cartao-pedido__total">
            {escreverDinheiroDaFila(pedido.totalCentavos)}
          </strong>
        </span>
        <span className="sc-cartao-pedido__itens">
          {resumoDosItens(pedido)}
        </span>
      </button>

      <ul className="sc-cartao-pedido__meta">
        <li>
          {ehRetirada ? (
            <IconeLocal aria-hidden="true" size={14} />
          ) : (
            <IconeEntrega aria-hidden="true" size={14} />
          )}
          {rotuloDaEntrega(pedido.entrega)}
        </li>
        <li>
          <IconeDoPagamento forma={pedido.pagamento} />
          {rotuloDoPagamento(pedido.pagamento)}
        </li>
        <li>
          <IconeRelogio aria-hidden="true" size={14} />
          {espera}
        </li>
        {pedido.canal === "MANUAL" ? (
          <li>{rotuloDoCanal(pedido.canal)}</li>
        ) : null}
      </ul>

      {novo ? <Selo tom="info">Novo</Selo> : null}
      {pedido.status === "PENDING" && pedido.aguardandoConfirmacaoWhatsapp ? (
        <SeloAguardando />
      ) : null}
      {pedido.status === "CANCELLED" && pedido.motivoCancelamento ? (
        <p className="sc-cartao-pedido__motivo">
          Motivo: {pedido.motivoCancelamento}
        </p>
      ) : null}

      {emAberto ? (
        <div className="sc-cartao-pedido__acoes">
          {acao !== null ? (
            <button
              type="button"
              className="sc-botao sc-botao--primaria sc-botao--pequeno"
              data-avancar={pedido.id}
              disabled={ocupado}
              onClick={() => aoAvancar(pedido)}
            >
              {acao}
            </button>
          ) : null}
          <button
            type="button"
            className="sc-botao sc-botao--discreta sc-botao--pequeno"
            data-cancelar={pedido.id}
            disabled={ocupado}
            onClick={() => aoCancelar(pedido)}
          >
            {pedido.status === "PENDING" ? "Recusar" : "Cancelar"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

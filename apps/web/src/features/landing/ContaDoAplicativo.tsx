"use client";

/**
 * "Faça a conta": quanto vai de taxa por mês em cada forma de vender, com as
 * tabelas oficiais de custo-do-aplicativo.ts.
 *
 * A pessoa ajusta quantos pedidos faz por mês e o valor médio de cada um; as
 * barras mostram, na hora, o que cada opção cobraria (mensalidade incluída),
 * ao lado do SimpleClick (zero). Sem script, a página já chega com a conta do
 * valor inicial pronta — o servidor desenha o mesmo componente. Mora na tela 2
 * da seção de mercado (secoes/DadosDeMercado.tsx), e o estilo está em
 * packages/ui/styles/landing-dados.css.
 *
 * Três peças lado a lado na grade da tela: as réguas, o `comparativo` que a
 * seção põe embaixo delas (o gráfico de cada R$ 100) e o resultado, que fecha
 * com a conclusão "No seu link: R$ 0" e a `chamada` (o botão de começar).
 */
import { useId, useState, type CSSProperties, type ReactNode } from "react";

import {
  LIMITE_SEM_MENSALIDADE,
  OPCOES_DE_VENDA,
  custoNoMesDaOpcao,
  emReais,
} from "./custo-do-aplicativo.ts";

const PEDIDOS = { inicial: 200, minimo: 10, maximo: 2000, passo: 10 } as const;
const TICKET = { inicial: 40, minimo: 15, maximo: 250, passo: 5 } as const;

const NUMERO = new Intl.NumberFormat("pt-BR");

export function ContaDoAplicativo({
  comparativo,
  chamada,
}: {
  /** Fica embaixo das réguas (no celular, depois do resultado). */
  readonly comparativo?: ReactNode;
  /** O botão que fecha o resultado, logo depois de "No seu link: R$ 0". */
  readonly chamada?: ReactNode;
} = {}) {
  const [pedidos, setPedidos] = useState<number>(PEDIDOS.inicial);
  const [ticket, setTicket] = useState<number>(TICKET.inicial);
  const base = useId();

  const faturamento = pedidos * ticket;
  const custos = OPCOES_DE_VENDA.map((opcao) => ({
    opcao,
    noMes: custoNoMesDaOpcao(opcao.id, faturamento),
  }));
  const maisCara = custos.reduce((a, b) => (b.noMes > a.noMes ? b : a));
  const escala = maisCara.noMes || 1;

  return (
    <div className="sc-prova-conta">
      <div className="sc-prova-conta__entradas">
        <h4 className="sc-prova__subtitulo">Faça a conta com o seu movimento</h4>

        <div className="sc-prova-conta__campo">
          <label className="sc-prova-conta__rotulo" htmlFor={`${base}-pedidos`}>
            Pedidos por mês
          </label>
          <output className="sc-prova-conta__valor" htmlFor={`${base}-pedidos`}>
            {NUMERO.format(pedidos)}
          </output>
          <input
            aria-valuetext={`${NUMERO.format(pedidos)} pedidos`}
            className="sc-prova-conta__regua"
            id={`${base}-pedidos`}
            max={PEDIDOS.maximo}
            min={PEDIDOS.minimo}
            onChange={(evento) => setPedidos(Number(evento.target.value))}
            step={PEDIDOS.passo}
            style={{ "--preenchido": (pedidos - PEDIDOS.minimo) / (PEDIDOS.maximo - PEDIDOS.minimo) } as CSSProperties}
            type="range"
            value={pedidos}
          />
        </div>

        <div className="sc-prova-conta__campo">
          <label className="sc-prova-conta__rotulo" htmlFor={`${base}-ticket`}>
            Ticket médio (R$)
          </label>
          <output className="sc-prova-conta__valor" htmlFor={`${base}-ticket`}>
            {emReais(ticket)}
          </output>
          <input
            aria-describedby={`${base}-ticket-dica`}
            aria-valuetext={emReais(ticket)}
            className="sc-prova-conta__regua"
            id={`${base}-ticket`}
            max={TICKET.maximo}
            min={TICKET.minimo}
            onChange={(evento) => setTicket(Number(evento.target.value))}
            step={TICKET.passo}
            style={{ "--preenchido": (ticket - TICKET.minimo) / (TICKET.maximo - TICKET.minimo) } as CSSProperties}
            type="range"
            value={ticket}
          />
          <p className="sc-prova-conta__dica" id={`${base}-ticket-dica`}>
            Quanto cada cliente gasta, em média, por pedido.
          </p>
        </div>

        <p className="sc-prova-conta__faturamento">
          Você vende <strong>{emReais(faturamento)}</strong> por mês
        </p>
      </div>

      <div className="sc-prova-conta__resultado">
        <p aria-live="polite" className="sc-prova-conta__manchete">
          <span className="sc-prova-conta__rotulo">
            Vai de taxa por mês na opção mais cara
          </span>
          <strong className="sc-prova-conta__total">{emReais(maisCara.noMes)}</strong>
          <span className="sc-prova-conta__ano">
            {emReais(maisCara.noMes * 12)} por ano.
          </span>
        </p>

        <ul className="sc-prova-conta__barras">
          {custos.map(({ opcao, noMes }) => (
            <li
              className="sc-prova-conta__linha"
              data-destaque={opcao.id === "simpleclick" ? "sim" : undefined}
              data-mais-cara={opcao.id === maisCara.opcao.id ? "sim" : undefined}
              key={opcao.id}
            >
              <span className="sc-prova-conta__nome">
                {opcao.nome}
                {opcao.id === maisCara.opcao.id ? (
                  <span className="sc-prova__so-leitor"> (a mais cara)</span>
                ) : null}
              </span>
              <span className="sc-prova-conta__trilho" aria-hidden="true">
                <span
                  className="sc-prova-conta__barra"
                  style={{ "--parte": noMes / escala } as CSSProperties}
                />
              </span>
              <span className="sc-prova-conta__custo">
                {emReais(noMes)}
                <span className="sc-prova__so-leitor"> por mês</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="sc-prova-conta__conclusao">
          <p className="sc-prova-conta__no-link">
            <span>No seu link:</span> <strong>R$&nbsp;0</strong>{" "}
            <span>de taxa. Os {emReais(maisCara.noMes * 12)} do ano ficam com você.</span>
          </p>
          {chamada}
        </div>

        <p className="sc-prova-conta__nota">
          Estimativa com todos os pedidos pagos pela plataforma; no iFood, a
          mensalidade só entra acima de {emReais(LIMITE_SEM_MENSALIDADE)} no mês.
        </p>
      </div>

      {comparativo ? <div className="sc-prova-conta__comparativo">{comparativo}</div> : null}
    </div>
  );
}

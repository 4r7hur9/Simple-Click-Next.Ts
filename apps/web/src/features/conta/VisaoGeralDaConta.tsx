/**
 * A Visão geral da conta (card #35): onde o cliente acompanha pedidos e
 * gastos em todas as lojas. Os cartões e gráficos seguem o padrão do painel do
 * dono (`features/dashboard`): mesmos cartões, `GraficoDeBarras` e seta de
 * variação. Os números vêm de `GET /v1/conta/metricas`; o pedido em andamento
 * vem da lista de pedidos da conta. Desde o card #151 ela é o resumo no topo de
 * Meus pedidos (a tela /conta deixou de existir), sem "Últimos pedidos": a lista
 * logo abaixo já é isso.
 */
import {
  IconeDinheiro,
  IconeEntrega,
  IconeLoja,
  IconeMetricas,
  IconePedido,
  IconeProduto,
  IconeRelogio,
  Selo,
  type Icone,
} from "@simpleclick/ui";
import type { MetricasDaContaNoContrato, VariacaoDeMetricaNoContrato } from "@simpleclick/contracts";
import Link from "next/link";
import type { ReactNode } from "react";

import type { MetricasDoCliente, PeriodoDaVisao } from "../../lib/conta-do-cliente.ts";
import { escreverDinheiro } from "../../lib/produto.ts";
import { GraficoDeBarras, escreverDinheiroCurto, type PontoDoGrafico } from "../dashboard/GraficoDeBarras.tsx";
import { VariacaoEmSeta } from "../dashboard/VariacaoEmSeta.tsx";
import { rotuloDoStatus } from "../pedido/LinhaDoTempo.tsx";
import { SeletorDoPeriodoDaConta } from "./SeletorDoPeriodoDaConta.tsx";
import { caminhoDoMeuPedido, tomDoStatus } from "./MeusPedidos.tsx";
import { codigoDoPedido } from "@simpleclick/contracts";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** A variação de uma medida contra o período anterior, no formato do painel. */
export function variacaoDe(atual: number, anterior: number): VariacaoDeMetricaNoContrato {
  const diferenca = atual - anterior;
  return {
    atual,
    anterior,
    diferenca,
    variacaoPorCento: anterior === 0 ? null : Math.round((diferenca / anterior) * 100),
    direcao: anterior === 0 ? (atual === 0 ? "igual" : "sem-base") : diferenca > 0 ? "subiu" : diferenca < 0 ? "caiu" : "igual",
  };
}

/** A hora em que mais pede ("18h às 19h"), ou nulo sem pedidos. */
export function horaDePico(porHora: readonly number[]): number | null {
  const maior = Math.max(0, ...porHora);
  return maior === 0 ? null : porHora.indexOf(maior);
}

export function diaDePico(porDia: readonly number[]): number | null {
  const maior = Math.max(0, ...porDia);
  return maior === 0 ? null : porDia.indexOf(maior);
}

interface Cartao {
  readonly nome: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly icone: Icone;
  readonly variacao?: VariacaoDeMetricaNoContrato | undefined;
  readonly unidade?: "dinheiro" | "pedidos";
  readonly inverso?: boolean;
  readonly detalhe?: ReactNode;
  readonly destaque?: boolean;
}

function Cartoes({ cartoes, contra }: { readonly cartoes: readonly Cartao[]; readonly contra: string }) {
  return (
    <dl className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3">
      {cartoes.map((c) => {
        const Desenho = c.icone;
        return (
          <div
            key={c.nome}
            data-metrica={c.nome}
            className={[
              "flex min-w-0 flex-col rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-4 shadow-[var(--sombra-larga)] min-[540px]:p-5",
              c.destaque ? "col-span-2 min-[900px]:col-span-1" : "",
            ].join(" ")}
          >
            <dt className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
              <span className="min-w-0">{c.rotulo}</span>
              <span className="hidden size-8 shrink-0 items-center justify-center rounded-[var(--raio-botao)] bg-superficie text-tinta-suave min-[540px]:inline-flex">
                <Desenho size={16} />
              </span>
            </dt>
            <dd data-valor className="mt-2 font-display text-2xl font-semibold tabular-nums [overflow-wrap:anywhere] min-[540px]:text-3xl">
              {c.valor}
            </dd>
            <dd className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-suave">
              {c.variacao !== undefined && c.unidade !== undefined ? (
                <>
                  <VariacaoEmSeta variacao={c.variacao} unidade={c.unidade} contra={contra} inverso={c.inverso} />
                  <span aria-hidden="true">vs {contra}</span>
                </>
              ) : (
                c.detalhe
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Secao({ id, titulo, children }: { readonly id: string; readonly titulo: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="sc-cartao min-w-0">
      <h2 id={id} className="sc-cartao__titulo">{titulo}</h2>
      {children}
    </section>
  );
}

function Barra({ proporcao }: { readonly proporcao: number }) {
  return (
    <div aria-hidden="true" className="mt-2 h-2.5 w-full overflow-hidden rounded-[var(--raio-completo)] bg-superficie">
      <span className="block h-full rounded-[var(--raio-completo)] bg-[var(--cor-serie-dois)]" style={{ width: `${Math.max(2, proporcao * 100)}%` }} />
    </div>
  );
}

function Tabela({ linhas, cabecalho }: { readonly linhas: readonly (readonly string[])[]; readonly cabecalho: readonly string[] }) {
  return (
    <table className="w-full text-left text-sm tabular-nums">
      <thead>
        <tr>{cabecalho.map((c) => <th key={c} className="pr-4 pb-1 font-semibold">{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l[0]}>{l.map((c, i) => <td key={i} className="pr-4 py-0.5">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export interface VisaoGeralDaContaProps {
  readonly periodo: PeriodoDaVisao;
  /** Nulo quando a API de métricas não respondeu. */
  readonly metricas: MetricasDaContaNoContrato | null;
  /** Os pedidos em andamento, da lista da conta. */
  readonly lista: Pick<MetricasDoCliente, "emAndamento">;
}

export function VisaoGeralDaConta({ periodo, metricas: m, lista }: VisaoGeralDaContaProps) {
  const r = m?.resumo;
  const ant = m?.resumoAnterior;

  const mesesDoGrafico: PontoDoGrafico[] =
    m?.gastoPorMes.map((x, i, todos) => ({
      chave: x.mes,
      rotulo: MESES[Number(x.mes.slice(5)) - 1] ?? x.mes,
      nome: `${MESES[Number(x.mes.slice(5)) - 1]} de ${x.mes.slice(0, 4)}`,
      valor: x.gastoCentavos,
      texto: escreverDinheiro(x.gastoCentavos),
      textoCurto: escreverDinheiroCurto(x.gastoCentavos),
      destaque: i === todos.length - 1,
    })) ?? [];

  const hora = m === null ? null : horaDePico(m.pedidosPorHora);
  const dia = m === null ? null : diaDePico(m.pedidosPorDiaDaSemana);
  const totalEntrega = (r?.entregues ?? 0) + (r?.retiradas ?? 0);

  return (
    <div className="sc-inicio" data-visao-geral>
      {lista.emAndamento.length > 0 ? (
        <section aria-labelledby="visao-andamento" className="sc-inicio__andamento">
          <h2 id="visao-andamento" className="sc-inicio__titulo">
            {lista.emAndamento.length === 1 ? "Pedido em andamento" : `${lista.emAndamento.length} pedidos em andamento`}
          </h2>
          <ul className="sc-inicio__lista">
            {lista.emAndamento.map((p) => (
              <li key={p.id} className="sc-andamento" data-pedido={p.id}>
                <div>
                  <p className="sc-andamento__loja">{p.loja.nome}</p>
                  <p className="sc-andamento__resumo">Pedido {codigoDoPedido(p.numero)} · {escreverDinheiro(p.totalCentavos)}</p>
                  <Selo tom={tomDoStatus(p.status)}>{rotuloDoStatus(p.status)}</Selo>
                </div>
                <Link className="sc-botao sc-botao--primaria" href={caminhoDoMeuPedido(p.id)}>Acompanhar</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SeletorDoPeriodoDaConta periodo={periodo} />

      {m === null || r === undefined || ant === undefined ? (
        <p role="alert" className="text-sm text-tinta-suave">
          Não deu para carregar seus números agora. Tente de novo em instantes.
        </p>
      ) : (
        <>
          <Cartoes
            contra="período anterior"
            cartoes={[
              { nome: "gasto", rotulo: "Gasto no período", valor: escreverDinheiro(r.gastoCentavos), icone: IconeDinheiro, variacao: variacaoDe(r.gastoCentavos, ant.gastoCentavos), unidade: "dinheiro", destaque: true },
              { nome: "pedidos", rotulo: "Pedidos", valor: String(r.pedidos), icone: IconePedido, variacao: variacaoDe(r.pedidos, ant.pedidos), unidade: "pedidos" },
              { nome: "ticket-medio", rotulo: "Ticket médio", valor: escreverDinheiro(r.ticketMedioCentavos), icone: IconeMetricas, variacao: variacaoDe(r.ticketMedioCentavos, ant.ticketMedioCentavos), unidade: "dinheiro" },
              { nome: "lojas", rotulo: "Lojas diferentes", valor: String(r.lojasDistintas), icone: IconeLoja, detalhe: "onde você pediu" },
              { nome: "cancelados", rotulo: "Cancelados", valor: String(r.cancelados), icone: IconeProduto, detalhe: "não entram nos gastos" },
              { nome: "quando", rotulo: "Mais pede", valor: dia === null ? "—" : DIAS[dia] ?? "—", icone: IconeRelogio, detalhe: hora === null ? "ainda sem pedidos" : `por volta das ${hora}h` },
            ]}
          />

          <>
              <Secao id="visao-meses" titulo="Gasto nos últimos 6 meses">
                <GraficoDeBarras
                  pontos={mesesDoGrafico}
                  descricao="Gasto por mês, nos últimos 6 meses"
                  marcas={mesesDoGrafico.map((_, i) => i)}
                  tabela={<Tabela cabecalho={["Mês", "Gasto", "Pedidos"]} linhas={m.gastoPorMes.map((x) => [x.mes, escreverDinheiro(x.gastoCentavos), String(x.pedidos)])} />}
                />
              </Secao>

              <div className="grid gap-4 min-[900px]:grid-cols-2">
                <Secao id="visao-lojas" titulo="Lojas mais pedidas">
                  {m.topLojas.length === 0 ? (
                    <p className="text-sm text-tinta-suave">Nenhuma loja neste período.</p>
                  ) : (
                    <ol className="space-y-4" data-ranking-lojas>
                      {m.topLojas.map((l, i) => (
                        <li key={l.apelido} data-loja={l.apelido}>
                          <div className="flex items-center justify-between gap-3">
                            <Link href={`/loja/${l.apelido}`} className="min-w-0 font-medium underline-offset-2 hover:underline">
                              {i + 1}º {l.nome}
                            </Link>
                            <span className="shrink-0 text-sm tabular-nums">
                              {l.pedidos === 1 ? "1 pedido" : `${l.pedidos} pedidos`} · {escreverDinheiro(l.gastoCentavos)}
                            </span>
                          </div>
                          <Barra proporcao={l.pedidos / (m.topLojas[0]?.pedidos ?? 1)} />
                        </li>
                      ))}
                    </ol>
                  )}
                </Secao>

                <Secao id="visao-produtos" titulo="Produtos mais pedidos">
                  {m.topProdutos.length === 0 ? (
                    <p className="text-sm text-tinta-suave">Nenhum produto neste período.</p>
                  ) : (
                    <ol className="space-y-4" data-ranking-produtos>
                      {m.topProdutos.map((p, i) => (
                        <li key={`${p.loja.apelido}-${p.nome}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--raio-botao)] bg-superficie text-tinta-suave" aria-hidden="true">
                                <IconeProduto size={16} />
                              </span>
                              <span className="min-w-0">
                                <span className="block font-medium [overflow-wrap:anywhere]">{i + 1}º {p.nome}</span>
                                <span className="block text-xs text-tinta-suave">{p.loja.nome}</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-sm tabular-nums">
                              {p.vezes === 1 ? "1 vez" : `${p.vezes} vezes`}
                              <span className="block text-xs text-tinta-suave">{escreverDinheiro(p.gastoCentavos)}</span>
                            </span>
                          </div>
                          <Barra proporcao={p.vezes / (m.topProdutos[0]?.vezes ?? 1)} />
                        </li>
                      ))}
                    </ol>
                  )}
                </Secao>
              </div>

              <div className="grid gap-4 min-[900px]:grid-cols-2">
                <Secao id="visao-entrega" titulo="Entrega ou retirada">
                  {totalEntrega === 0 ? (
                    <p className="text-sm text-tinta-suave">Sem pedidos neste período.</p>
                  ) : (
                    <div data-entrega-retirada>
                      <div aria-hidden="true" className="flex h-4 w-full overflow-hidden rounded-[var(--raio-completo)] bg-superficie">
                        <span className="block h-full bg-[var(--cor-serie-dois)]" style={{ width: `${((r.entregues) / totalEntrega) * 100}%` }} />
                        <span className="block h-full bg-[var(--cor-serie-tres)]" style={{ width: `${((r.retiradas) / totalEntrega) * 100}%` }} />
                      </div>
                      <ul className="mt-3 space-y-1 text-sm">
                        <li className="flex items-center gap-2"><IconeEntrega size={16} /> Entrega: <strong>{r.entregues}</strong> ({Math.round((r.entregues / totalEntrega) * 100)}%)</li>
                        <li className="flex items-center gap-2"><IconeLoja size={16} /> Retirada: <strong>{r.retiradas}</strong> ({Math.round((r.retiradas / totalEntrega) * 100)}%)</li>
                      </ul>
                    </div>
                  )}
                </Secao>

                <Secao id="visao-quando" titulo="Quando você mais pede">
                  <p className="mb-3 text-sm text-tinta-suave">
                    {dia === null || hora === null
                      ? "Sem pedidos neste período."
                      : `Geralmente de ${DIAS[dia]}, por volta das ${hora}h.`}
                  </p>
                  <GraficoDeBarras
                    pontos={m.pedidosPorDiaDaSemana.map((v, i) => ({
                      chave: `dia-${i}`,
                      rotulo: (DIAS[i] ?? "").slice(0, 3),
                      nome: DIAS[i] ?? "",
                      valor: v,
                      texto: v === 1 ? "1 pedido" : `${v} pedidos`,
                      textoCurto: String(v),
                      destaque: i === dia,
                    }))}
                    descricao="Pedidos por dia da semana"
                    marcas={[0, 1, 2, 3, 4, 5, 6]}
                    tabela={<Tabela cabecalho={["Dia", "Pedidos"]} linhas={m.pedidosPorDiaDaSemana.map((v, i) => [DIAS[i] ?? "", String(v)])} />}
                  />
                </Secao>
              </div>
          </>
        </>
      )}

    </div>
  );
}

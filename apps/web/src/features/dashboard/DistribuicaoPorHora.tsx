/**
 * O movimento por hora do dia (T-805; AC-809).
 *
 * A série chega da API com AS 24 HORAS do relógio da loja, zero onde não
 * houve pedido (`completarHoras`). A tela desenha todas, e destaca as faixas
 * de maior movimento — em cor E em texto: a frase "mais movimento" diz quais
 * são, para quem não distingue a cor e para o leitor de tela.
 */
import { useId } from "react";

import {
  escreverDinheiro,
  escreverPedidos,
  type MetricasNoContrato,
} from "../../lib/metricas.ts";
import { GraficoDeBarras } from "./GraficoDeBarras.tsx";

type PontoHorario = MetricasNoContrato["porHora"][number];

export interface DistribuicaoPorHoraProps {
  readonly pontos: readonly PontoHorario[];
}

/** Quantas faixas a frase de destaque cita, no máximo. */
const FAIXAS_EM_DESTAQUE = 3;

/** As horas que o eixo escreve: o dia em quartos, mais a última. */
const MARCAS_DAS_HORAS = [0, 6, 12, 18, 23];

/** `18` vira "18h às 19h"; a última hora fecha à meia-noite. */
export function escreverFaixa(hora: number): string {
  return `${hora}h às ${(hora + 1) % 24}h`;
}

/**
 * As faixas de maior movimento: as horas com mais pedidos, do maior para o
 * menor, empatadas pela mais cedo. Hora sem pedido nunca é destaque.
 */
export function faixasDeMaiorMovimento(
  pontos: readonly PontoHorario[],
): PontoHorario[] {
  return pontos
    .filter((ponto) => ponto.pedidos > 0)
    .sort((uma, outra) => outra.pedidos - uma.pedidos || uma.hora - outra.hora)
    .slice(0, FAIXAS_EM_DESTAQUE);
}

/** O resumo que o olho tiraria do gráfico, para quem não o vê. */
export function resumirDistribuicao(pontos: readonly PontoHorario[]): string {
  const faixas = faixasDeMaiorMovimento(pontos);
  if (faixas.length === 0) return "Nenhum pedido em hora nenhuma do período.";
  const paradas = pontos.filter((ponto) => ponto.pedidos === 0).length;
  const lista = faixas
    .map(
      (ponto) =>
        `${escreverFaixa(ponto.hora)} (${escreverPedidos(ponto.pedidos)})`,
    )
    .join(", ");
  const semPedido =
    paradas === 1 ? "1 hora sem pedido" : `${paradas} horas sem pedido`;
  return `Mais movimento: ${lista}. ${semPedido}.`;
}

export function DistribuicaoPorHora({ pontos }: DistribuicaoPorHoraProps) {
  const idDoTitulo = useId();
  const destaques = new Set(
    faixasDeMaiorMovimento(pontos).map((ponto) => ponto.hora),
  );
  const resumo = resumirDistribuicao(pontos);

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-distribuicao-por-hora
      className="rounded-lg border border-borda bg-superficie p-4"
    >
      <h2 id={idDoTitulo} className="text-lg font-semibold">
        Movimento por hora
      </h2>
      <p data-resumo-do-grafico className="mt-2 text-sm text-tinta-suave">
        {resumo}
      </p>

      <div className="mt-3">
        <GraficoDeBarras
          descricao={`Pedidos por hora do dia. ${resumo}`}
          marcas={MARCAS_DAS_HORAS.filter((hora) => hora < pontos.length)}
          pontos={pontos.map((ponto) => ({
            chave: String(ponto.hora),
            rotulo: `${ponto.hora}h`,
            valor: ponto.pedidos,
            destaque: destaques.has(ponto.hora),
          }))}
          tabela={
            <table className="w-full text-left tabular-nums">
              <caption className="sc-so-leitor">Pedidos de cada hora</caption>
              <thead>
                <tr className="border-b border-borda">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Hora
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Pedidos
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Vendido
                  </th>
                </tr>
              </thead>
              <tbody>
                {pontos.map((ponto) => (
                  <tr
                    key={ponto.hora}
                    data-linha={ponto.hora}
                    className="border-b border-borda last:border-0"
                  >
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {escreverFaixa(ponto.hora)}
                    </th>
                    <td className="py-1 pr-3">{ponto.pedidos}</td>
                    <td className="py-1">
                      {escreverDinheiro(ponto.vendidoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      </div>
    </section>
  );
}

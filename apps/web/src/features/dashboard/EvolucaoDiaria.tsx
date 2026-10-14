"use client";

/**
 * A evolução do período, dia a dia (T-805; AC-808).
 *
 * A série chega da API com UM PONTO POR DIA do período, zero onde não houve
 * venda (`completarDias`). A tela desenha todos: o dia parado aparece como
 * zero, e não some do gráfico. O dono alterna entre o valor vendido e a
 * quantidade de pedidos; a tabela do "ver os números" traz sempre os dois.
 */
import { useId, useState } from "react";

import {
  escreverDataCivil,
  escreverDinheiro,
  escreverPedidos,
  type MetricasNoContrato,
} from "../../lib/metricas.ts";
import { AlternarMedida, type MedidaDoPainel } from "./AlternarMedida.tsx";
import {
  GraficoDeBarras,
  escreverDinheiroCurto,
  marcasDoEixo,
} from "./GraficoDeBarras.tsx";

type PontoDiario = MetricasNoContrato["porDia"][number];

export interface EvolucaoDiariaProps {
  readonly pontos: readonly PontoDiario[];
  readonly medidaInicial?: MedidaDoPainel | undefined;
}

/** `2026-09-27` vira `27/09`: o ano não cabe embaixo de cada coluna. */
function diaCurto(dia: string): string {
  return escreverDataCivil(dia).slice(0, 5);
}

/** "1 dia", "4 dias". */
function escreverDias(quantidade: number): string {
  return quantidade === 1 ? "1 dia" : `${quantidade} dias`;
}

/** O resumo que o olho tiraria do gráfico, para quem não o vê. */
export function resumirEvolucao(
  pontos: readonly PontoDiario[],
  medida: MedidaDoPainel,
): string {
  const primeiro = pontos[0];
  const ultimo = pontos.at(-1);
  if (primeiro === undefined || ultimo === undefined) {
    return "Sem dias no período.";
  }
  const pedidos = pontos.reduce((soma, ponto) => soma + ponto.pedidos, 0);
  const vendido = pontos.reduce(
    (soma, ponto) => soma + ponto.vendidoCentavos,
    0,
  );
  const parados = pontos.filter((ponto) => ponto.pedidos === 0).length;
  const intervalo =
    pontos.length === 1
      ? `Em ${diaCurto(primeiro.dia)}`
      : `De ${diaCurto(primeiro.dia)} a ${diaCurto(ultimo.dia)}`;

  if (pedidos === 0) {
    return `${intervalo}: nenhuma venda, ${escreverDias(pontos.length)} em zero.`;
  }
  const medir = (ponto: PontoDiario) =>
    medida === "valor" ? ponto.vendidoCentavos : ponto.pedidos;
  const melhor = pontos.reduce((lider, ponto) =>
    medir(ponto) > medir(lider) ? ponto : lider,
  );
  const doMelhor =
    medida === "valor"
      ? escreverDinheiro(melhor.vendidoCentavos)
      : escreverPedidos(melhor.pedidos);
  const semVenda =
    parados === 0
      ? "nenhum dia sem venda"
      : `${escreverDias(parados)} sem venda`;
  return (
    `${intervalo}: ${escreverDinheiro(vendido)} em ${escreverPedidos(pedidos)}; ` +
    `melhor dia ${diaCurto(melhor.dia)}, com ${doMelhor}; ${semVenda}.`
  );
}

export function EvolucaoDiaria({
  pontos,
  medidaInicial = "valor",
}: EvolucaoDiariaProps) {
  const idDoTitulo = useId();
  const [medida, setMedida] = useState<MedidaDoPainel>(medidaInicial);
  const resumo = resumirEvolucao(pontos, medida);

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-evolucao-diaria
      data-medida={medida}
      className="sc-cartao min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={idDoTitulo} className="sc-cartao__titulo">
          Evolução por dia
        </h2>
        <AlternarMedida
          rotulo="Mostrar"
          medida={medida}
          aoTrocar={setMedida}
          nomes={{ quantidade: "Pedidos", valor: "Valor" }}
        />
      </div>

      <p data-resumo-do-grafico className="text-sm text-tinta-suave">
        {resumo}
      </p>

      <div>
        <GraficoDeBarras
          descricao={`Evolução por dia, em ${medida === "valor" ? "valor vendido" : "pedidos"}. ${resumo}`}
          marcas={marcasDoEixo(pontos.length)}
          pontos={pontos.map((ponto) => ({
            chave: ponto.dia,
            rotulo: diaCurto(ponto.dia),
            nome: escreverDataCivil(ponto.dia),
            valor: medida === "valor" ? ponto.vendidoCentavos : ponto.pedidos,
            texto:
              medida === "valor"
                ? escreverDinheiro(ponto.vendidoCentavos)
                : escreverPedidos(ponto.pedidos),
            textoCurto:
              medida === "valor"
                ? escreverDinheiroCurto(ponto.vendidoCentavos)
                : String(ponto.pedidos),
          }))}
          tabela={
            <table className="w-full text-left tabular-nums">
              <caption className="sc-so-leitor">Vendas de cada dia</caption>
              <thead>
                <tr className="border-b border-borda">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Dia
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
                    key={ponto.dia}
                    data-linha={ponto.dia}
                    className="border-b border-borda last:border-0"
                  >
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {escreverDataCivil(ponto.dia)}
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

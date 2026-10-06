/**
 * O período comparado com o anterior equivalente (T-803; AC-802).
 *
 * A PERGUNTA É "ESTOU MELHOR OU PIOR QUE ONTEM?", e a resposta vem com
 * direção e tamanho: "Subiu R$ 100,00 (25%)". A direção está em PALAVRA, e a
 * seta e a cor só a repetem — quem não distingue verde de vermelho, e quem
 * ouve a tela, recebem a mesma resposta.
 *
 * O TÍTULO DIZ CONTRA O QUÊ. Às 14h32 o dia de hoje é comparado com ontem
 * ATÉ AS 14H32 (decisão de 03/10/2026), e o título escreve isso. Sem a hora,
 * o dono leria a queda de toda manhã como se fosse contra o dia inteiro de
 * ontem.
 */
import { useId } from "react";

import {
  descreverPeriodoAnterior,
  descreverVariacao,
  escreverDinheiro,
  escreverPedidos,
  type ComparacaoDeMetricasNoContrato,
  type PeriodoDeMetricasNoContrato,
  type VariacaoDeMetricaNoContrato,
} from "../../lib/metricas.ts";

export interface ComparativoPeriodoProps {
  readonly comparacao: ComparacaoDeMetricasNoContrato;
  readonly periodo: PeriodoDeMetricasNoContrato;
}

const SETA: Readonly<Record<VariacaoDeMetricaNoContrato["direcao"], string>> = {
  subiu: "↑",
  caiu: "↓",
  igual: "=",
  "sem-base": "•",
};

const TOM: Readonly<Record<VariacaoDeMetricaNoContrato["direcao"], string>> = {
  subiu: "text-sucesso",
  caiu: "text-erro",
  igual: "text-tinta-suave",
  "sem-base": "text-tinta-suave",
};

function Variacao({
  nome,
  rotulo,
  variacao,
  unidade,
}: {
  readonly nome: string;
  readonly rotulo: string;
  readonly variacao: VariacaoDeMetricaNoContrato;
  readonly unidade: "dinheiro" | "pedidos";
}) {
  const { direcao, texto } = descreverVariacao(variacao, unidade);
  const escrever = unidade === "dinheiro" ? escreverDinheiro : escreverPedidos;

  return (
    <div
      data-variacao={nome}
      data-direcao={direcao}
      className="min-w-0 rounded-lg border border-borda bg-superficie-alta p-4"
    >
      <dt className="text-sm text-tinta-suave">{rotulo}</dt>
      <dd
        className={`mt-1 flex items-baseline gap-2 text-lg font-semibold ${TOM[direcao]}`}
      >
        <span aria-hidden="true">{SETA[direcao]}</span>
        <span data-texto className="[overflow-wrap:anywhere]">
          {texto}
        </span>
      </dd>
      <dd className="mt-1 text-sm text-tinta-suave">
        {`${escrever(variacao.atual)} agora, ${escrever(variacao.anterior)} antes`}
      </dd>
    </div>
  );
}

export function ComparativoPeriodo({
  comparacao,
  periodo,
}: ComparativoPeriodoProps) {
  const idDoTitulo = useId();
  const anterior = descreverPeriodoAnterior(comparacao, periodo);

  return (
    <section aria-labelledby={idDoTitulo} data-comparativo>
      <h2 id={idDoTitulo} className="text-lg font-semibold">
        Comparado com {anterior}
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 min-[540px]:grid-cols-2">
        <Variacao
          nome="vendido"
          rotulo="Vendido"
          variacao={comparacao.vendidoCentavos}
          unidade="dinheiro"
        />
        <Variacao
          nome="pedidos"
          rotulo="Pedidos"
          variacao={comparacao.pedidos}
          unidade="pedidos"
        />
      </dl>
    </section>
  );
}

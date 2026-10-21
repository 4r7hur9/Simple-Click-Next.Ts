/**
 * De que é feito o vendido (T-801; AC-817, AC-812, AC-810): as duas metades
 * dele — já concluído e em andamento, que somadas dão o vendido —, a divisão
 * por canal, o que espera aceite e o que ficou de fora, e a régua do que
 * conta como venda, escrita pela API (a mesma que fez a conta).
 *
 * Os números grandes e as comparações moram em `CartoesDoPainel`; aqui fica
 * só a explicação, sem conta nenhuma: tudo chega pronto do resumo da API.
 */
import { useId } from "react";

import {
  escreverDinheiro,
  escreverPedidos,
  type ResumoDeMetricasNoContrato,
} from "../../lib/metricas.ts";
import { InfoDoPainel } from "../config/RotuloComInfo.tsx";

export interface ComposicaoDasVendasProps {
  readonly resumo: ResumoDeMetricasNoContrato;
  /** A régua do que conta como venda, escrita pela API (AC-812). */
  readonly regraDeVenda: string;
}

const ROTULO = "text-xs font-semibold tracking-wide text-tinta-suave uppercase";

/** Fração de `parte` em `todo`, em porcentagem para a largura da barra. */
function fracao(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.max(0, (parte / todo) * 100));
}

function Metade({
  nome,
  rotulo,
  valor,
  detalhe,
  serie,
}: {
  readonly nome: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly detalhe: string;
  readonly serie: "dois" | "tres";
}) {
  return (
    <div
      data-metrica={nome}
      className="min-w-0 rounded-[var(--raio-botao)] bg-superficie p-3"
    >
      <dt className={`flex items-center gap-2 ${ROTULO}`}>
        <span
          aria-hidden="true"
          className="inline-block size-2.5 shrink-0 rounded-[var(--raio-completo)]"
          style={{ background: `var(--cor-serie-${serie})` }}
        />
        {rotulo}
      </dt>
      <dd
        data-valor
        className="mt-1 font-display text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]"
      >
        {valor}
      </dd>
      <dd className="text-sm text-tinta-suave">{detalhe}</dd>
    </div>
  );
}

export function ComposicaoDasVendas({
  resumo,
  regraDeVenda,
}: ComposicaoDasVendasProps) {
  const idDoTitulo = useId();
  const idDaRegra = useId();
  const { concluidos, emAndamento, emAberto, naoConfirmados } = resumo;
  const { site, balcao } = resumo.porCanal;
  const total = concluidos.totalCentavos + emAndamento.totalCentavos;
  const porCanal =
    `pelo site ${escreverDinheiro(site.totalCentavos)} (${escreverPedidos(site.quantidade)})` +
    ` · no balcão ${escreverDinheiro(balcao.totalCentavos)} (${escreverPedidos(balcao.quantidade)})`;
  const foraDoVendido =
    `Fora do vendido também: ${escreverPedidos(naoConfirmados.quantidade)}` +
    ` no WhatsApp sem confirmação do envio (${escreverDinheiro(naoConfirmados.totalCentavos)}).`;

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-composicao
      className="sc-cartao min-w-0"
    >
      <h2 id={idDoTitulo} className="sc-cartao__titulo">
        De que é feito o vendido
      </h2>

      <div
        aria-hidden="true"
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-[var(--raio-completo)] bg-superficie"
      >
        <span
          className="h-full bg-[var(--cor-serie-dois)]"
          style={{ width: `${fracao(concluidos.totalCentavos, total)}%` }}
        />
        <span
          className="h-full bg-[var(--cor-serie-tres)]"
          style={{ width: `${fracao(emAndamento.totalCentavos, total)}%` }}
        />
      </div>

      <dl className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-3">
        <Metade
          nome="concluido"
          rotulo="Já concluído"
          valor={escreverDinheiro(concluidos.totalCentavos)}
          detalhe={`${escreverPedidos(concluidos.quantidade)} entregues ou retirados`}
          serie="dois"
        />
        <Metade
          nome="em-andamento"
          rotulo="Em andamento"
          valor={escreverDinheiro(emAndamento.totalCentavos)}
          detalhe={`${escreverPedidos(emAndamento.quantidade)} em preparo, prontos ou a caminho`}
          serie="tres"
        />
        <div
          data-metrica="em-aberto"
          className="min-w-0 rounded-[var(--raio-botao)] bg-superficie p-3"
        >
          <dt className={`${ROTULO} flex items-center gap-1`}>
            Em aberto
            <InfoDoPainel explicacao="emAberto" nome="Em aberto" />
          </dt>
          <dd
            data-valor
            className="mt-1 font-display text-2xl font-semibold tabular-nums"
          >
            {emAberto.quantidade}
          </dd>
          <dd className="text-sm text-tinta-suave">
            aguardando você aceitar — ainda não é venda
          </dd>
        </div>
      </dl>

      <p data-soma className="text-sm text-tinta-suave">
        Já concluído mais em andamento é o vendido.
      </p>
      <p
        data-metrica="por-canal"
        className="border-t border-borda pt-3 text-sm"
      >
        <span className="text-tinta-suave">Por canal: </span>
        {porCanal}
      </p>
      {naoConfirmados.quantidade > 0 ? (
        <p data-metrica="nao-confirmados" className="text-sm text-tinta-suave">
          {foraDoVendido}
        </p>
      ) : null}

      <aside
        aria-labelledby={idDaRegra}
        data-regra-de-venda
        className="rounded-[var(--raio-botao)] bg-superficie p-3"
      >
        <h3 id={idDaRegra} className="text-sm font-semibold">
          O que conta como venda
        </h3>
        <p className="mt-1 text-sm leading-6 text-tinta-suave">
          {regraDeVenda}
        </p>
      </aside>
    </section>
  );
}

/**
 * Os números do período, como o dono os lê (T-801; AC-800, AC-817, AC-812).
 *
 * A ORDEM É A DA PERGUNTA DO DONO. Primeiro, grande, quanto vendeu. Logo
 * dentro do mesmo cartão, as duas metades desse valor — o que já foi
 * concluído e o que ainda está em andamento —, porque a soma das duas é o
 * vendido e separá-las em cartões soltos esconderia essa relação. Depois, os
 * números de apoio: quantos pedidos, o valor médio, o que espera aceite e o
 * que foi cancelado, este À PARTE e nunca dentro do vendido.
 *
 * A REGRA FICA ESCRITA NA TELA (AC-812). Ela vem da API, a mesma que fez a
 * conta: se a régua mudar, o texto muda junto, e a tela nunca explica uma
 * conta diferente da que fez.
 *
 * O DESENHO É O DO CARTÃO DE NÚMERO: rótulo pequeno em cima, o número
 * grande embaixo, e uma linha curta que o explica. Os cartões de apoio ficam
 * numa grade que desce para uma coluna no celular.
 *
 * Nenhuma conta mora aqui: tudo chega pronto do resumo da API.
 */
import { useId, type ReactNode } from "react";
import {
  IconeAlerta,
  IconeFechar,
  IconeMetricas,
  IconePedido,
  type Icone,
} from "@simpleclick/ui";

import {
  escreverDinheiro,
  escreverPedidos,
  type ResumoDeMetricasNoContrato,
} from "../../lib/metricas.ts";

export interface CartoesDeMetricaProps {
  readonly resumo: ResumoDeMetricasNoContrato;
  /** A régua do que conta como venda, escrita pela API (AC-812). */
  readonly regraDeVenda: string;
  /** "hoje" ou "no período": completa os rótulos ("Vendido hoje"). */
  readonly rotuloDoPeriodo: string;
}

/** Fração de `parte` em `todo`, em porcentagem para a largura da barra. */
function fracao(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.max(0, (parte / todo) * 100));
}

/**
 * As duas metades do vendido, desenhadas lado a lado.
 *
 * Decorativa para o leitor de tela: os mesmos valores estão escritos logo
 * abaixo, com rótulo. A cor é de IDENTIDADE da série (qual metade é qual), e
 * não de julgamento — a legenda ao lado de cada valor repete a cor.
 */
function BarraDoVendido({
  concluido,
  emAndamento,
}: {
  readonly concluido: number;
  readonly emAndamento: number;
}) {
  const total = concluido + emAndamento;
  return (
    <div
      aria-hidden="true"
      className="mt-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-[var(--raio-completo)] bg-superficie"
    >
      <span
        className="h-full bg-[var(--cor-serie-dois)]"
        style={{ width: `${fracao(concluido, total)}%` }}
      />
      <span
        className="h-full bg-[var(--cor-serie-tres)]"
        style={{ width: `${fracao(emAndamento, total)}%` }}
      />
    </div>
  );
}

function Legenda({ serie }: { readonly serie: "dois" | "tres" }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-block size-2.5 shrink-0 rounded-[var(--raio-completo)]",
        serie === "dois"
          ? "bg-[var(--cor-serie-dois)]"
          : "bg-[var(--cor-serie-tres)]",
      ].join(" ")}
    />
  );
}

/** O rótulo pequeno do cartão de número. */
const ROTULO = "text-xs font-semibold tracking-wide text-tinta-suave uppercase";

/** Um número de apoio: rótulo, valor e o detalhe que o explica. */
function Numero({
  nome,
  rotulo,
  valor,
  detalhe,
  icone: Desenho,
}: {
  readonly nome: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly detalhe: ReactNode;
  readonly icone: Icone;
}) {
  return (
    <div
      data-metrica={nome}
      className="flex min-w-0 flex-col rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-4 shadow-[var(--sombra-larga)] min-[540px]:p-5"
    >
      <dt className={`flex items-center justify-between gap-2 ${ROTULO}`}>
        {rotulo}
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--raio-botao)] bg-superficie text-tinta-suave">
          <Desenho size={16} />
        </span>
      </dt>
      <dd
        data-valor
        className="mt-2 font-display text-3xl font-semibold tabular-nums [overflow-wrap:anywhere]"
      >
        {valor}
      </dd>
      <dd className="mt-1 text-sm text-tinta-suave">{detalhe}</dd>
    </div>
  );
}

export function CartoesDeMetrica({
  resumo,
  regraDeVenda,
  rotuloDoPeriodo,
}: CartoesDeMetricaProps) {
  const idDoResumo = useId();
  const idDaRegra = useId();
  const { concluidos, emAndamento, emAberto, cancelados, naoConfirmados } =
    resumo;
  const { site, balcao } = resumo.porCanal;
  // Frases montadas aqui, e não picadas no JSX: o espaço entre texto e valor
  // é o tipo de detalhe que a formatação automática desloca sem avisar.
  const porCanal =
    `pelo site ${escreverDinheiro(site.totalCentavos)} (${escreverPedidos(site.quantidade)})` +
    ` · no balcão ${escreverDinheiro(balcao.totalCentavos)} (${escreverPedidos(balcao.quantidade)})`;
  const foraDoVendido =
    `Fora do vendido também: ${escreverPedidos(naoConfirmados.quantidade)}` +
    ` no WhatsApp sem confirmação do envio (${escreverDinheiro(naoConfirmados.totalCentavos)}).`;

  return (
    <section aria-labelledby={idDoResumo} data-resumo className="space-y-4">
      <h2 id={idDoResumo} className="sc-so-leitor">
        Resumo {rotuloDoPeriodo}
      </h2>

      <div
        data-metrica="vendido"
        className="rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-5 shadow-[var(--sombra-larga)] min-[540px]:p-6"
      >
        <dl>
          <dt className={ROTULO}>Vendido {rotuloDoPeriodo}</dt>
          <dd
            data-valor
            className="mt-2 font-display text-4xl font-semibold tabular-nums [overflow-wrap:anywhere] min-[540px]:text-5xl"
          >
            {escreverDinheiro(resumo.vendidoCentavos)}
          </dd>
          <dd className="mt-2 text-sm text-tinta-suave">
            {escreverPedidos(resumo.pedidos)} aceitos por você
          </dd>
        </dl>

        <BarraDoVendido
          concluido={concluidos.totalCentavos}
          emAndamento={emAndamento.totalCentavos}
        />

        <dl className="mt-4 grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
          <div
            data-metrica="concluido"
            className="min-w-0 rounded-[var(--raio-botao)] bg-superficie p-3"
          >
            <dt className={`flex items-center gap-2 ${ROTULO}`}>
              <Legenda serie="dois" />
              Já concluído
            </dt>
            <dd
              data-valor
              className="mt-1 font-display text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]"
            >
              {escreverDinheiro(concluidos.totalCentavos)}
            </dd>
            <dd className="text-sm text-tinta-suave">
              {escreverPedidos(concluidos.quantidade)} entregues ou retirados
            </dd>
          </div>
          <div
            data-metrica="em-andamento"
            className="min-w-0 rounded-[var(--raio-botao)] bg-superficie p-3"
          >
            <dt className={`flex items-center gap-2 ${ROTULO}`}>
              <Legenda serie="tres" />
              Em andamento
            </dt>
            <dd
              data-valor
              className="mt-1 font-display text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]"
            >
              {escreverDinheiro(emAndamento.totalCentavos)}
            </dd>
            <dd className="text-sm text-tinta-suave">
              {escreverPedidos(emAndamento.quantidade)} em preparo, prontos ou a
              caminho
            </dd>
          </div>
        </dl>

        <p data-soma className="mt-3 text-sm text-tinta-suave">
          Já concluído mais em andamento é o vendido.
        </p>

        <p
          data-metrica="por-canal"
          className="mt-4 border-t border-borda pt-4 text-sm"
        >
          <span className="text-tinta-suave">Por canal: </span>
          {porCanal}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 lg:grid-cols-4">
        <Numero
          nome="pedidos"
          rotulo="Pedidos"
          valor={String(resumo.pedidos)}
          detalhe="que contam como venda"
          icone={IconePedido}
        />
        <Numero
          nome="ticket-medio"
          rotulo="Valor médio por pedido"
          valor={escreverDinheiro(resumo.ticketMedioCentavos)}
          detalhe="o vendido dividido pelos pedidos"
          icone={IconeMetricas}
        />
        <Numero
          nome="em-aberto"
          rotulo="Em aberto"
          valor={String(emAberto.quantidade)}
          detalhe="aguardando você aceitar — ainda não é venda"
          icone={IconeAlerta}
        />
        <Numero
          nome="cancelados"
          rotulo="Cancelados ou recusados"
          valor={String(cancelados.quantidade)}
          detalhe={`${escreverDinheiro(cancelados.totalCentavos)} fora do vendido`}
          icone={IconeFechar}
        />
      </dl>

      {naoConfirmados.quantidade > 0 ? (
        <p data-metrica="nao-confirmados" className="text-sm text-tinta-suave">
          {foraDoVendido}
        </p>
      ) : null}

      <aside
        aria-labelledby={idDaRegra}
        data-regra-de-venda
        className="rounded-[var(--raio-cartao)] border border-borda bg-superficie p-4 min-[540px]:p-5"
      >
        <h3 id={idDaRegra} className="text-base font-semibold">
          O que conta como venda
        </h3>
        <p className="mt-1 text-sm leading-6 text-tinta-suave">
          {regraDeVenda}
        </p>
      </aside>
    </section>
  );
}

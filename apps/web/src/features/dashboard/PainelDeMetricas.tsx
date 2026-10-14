"use client";

/**
 * O painel de métricas nos quatro estados de tela (T-803; AC-800..AC-802,
 * AC-813, P-011).
 *
 * `CorpoDasMetricas` é o desenho de um período, igual no painel do dia e na
 * página de períodos: quem muda entre as duas é QUEM ESCOLHE o período, e não
 * como os números aparecem. Os quatro estados:
 *
 *   * carregando — espera com a forma do conteúdo, e nenhum número. Número
 *     velho na tela enquanto o novo não chega é "número errado" (AC-813);
 *   * erro — o que aconteceu e a saída (tentar de novo, ou entrar de novo
 *     quando a sessão acabou), sem detalhe interno;
 *   * vazio — os números zerados COM a explicação e o link da vitrine
 *     (AC-801), e não uma tela em branco;
 *   * sucesso — os números, a comparação e o período em vigor, com o
 *     horário a que os números se referem (AC-814).
 */
import { Botao, Erro, Esqueleto } from "@simpleclick/ui";

import {
  PERIODO_DE_HOJE,
  descreverPeriodo,
  nomeDoAtalho,
  periodoSemPedido,
  type BuscarMetricas,
  type ConsultaDoPeriodo,
  type PeriodoDeMetricasNoContrato,
} from "../../lib/metricas.ts";
import { CartoesDeMetrica } from "./CartoesDeMetrica.tsx";
import { ComparativoPeriodo } from "./ComparativoPeriodo.tsx";
import { DistribuicaoPorHora } from "./DistribuicaoPorHora.tsx";
import { EvolucaoDiaria } from "./EvolucaoDiaria.tsx";
import { HorarioDeReferencia } from "./HorarioDeReferencia.tsx";
import { PainelVazio } from "./PainelVazio.tsx";
import { RankingProdutos } from "./RankingProdutos.tsx";
import { useMetricas, type UsoDasMetricas } from "./useMetricas.ts";

/** "de hoje", "dos últimos 7 dias": o que a espera está calculando. */
function oQueCarrega(consulta: ConsultaDoPeriodo): string {
  if (consulta.periodo === "hoje") return "de hoje";
  if (consulta.periodo === "personalizado") return "do intervalo escolhido";
  return `dos ${nomeDoAtalho(consulta.periodo).toLowerCase()}`;
}

/** O período em vigor, com as duas pontas à vista (AC-803). */
function PeriodoEmVigor({
  periodo,
}: {
  readonly periodo: PeriodoDeMetricasNoContrato;
}) {
  const extenso = descreverPeriodo(periodo);
  return (
    <p data-periodo-em-vigor className="text-sm text-tinta-suave">
      <span className="font-semibold text-tinta">{extenso.nome}</span>
      {": "}
      {periodo.de === periodo.ate ? (
        <time dateTime={periodo.de}>{extenso.de}</time>
      ) : (
        <>
          <time dateTime={periodo.de}>{extenso.de}</time>
          {" a "}
          <time dateTime={periodo.ate}>{extenso.ate}</time>
        </>
      )}
    </p>
  );
}

export interface CorpoDasMetricasProps {
  readonly uso: UsoDasMetricas;
}

export function CorpoDasMetricas({ uso }: CorpoDasMetricasProps) {
  if (uso.fase === "carregando") {
    return (
      <div data-estado="carregando">
        <Esqueleto
          linhas={5}
          rotulo={`Calculando os números ${oQueCarrega(uso.pedida)}…`}
        />
      </div>
    );
  }

  const metricas = uso.metricas;
  if (uso.fase === "falhou" || metricas === null) {
    const semSessao = uso.falha?.semSessao === true;
    return (
      <div data-estado="erro">
        <Erro
          titulo="Não foi possível carregar os números"
          mensagem={
            semSessao
              ? "Sua sessão terminou. Entre de novo para ver os números da loja."
              : "A conexão com a loja falhou. Nenhum número aparece até a leitura dar certo, para a tela não mostrar número errado."
          }
          acao={
            semSessao ? (
              <a className="sc-botao sc-botao--primaria" href="/entrar">
                Entrar de novo
              </a>
            ) : (
              <Botao onClick={uso.tentarDeNovo}>Tentar de novo</Botao>
            )
          }
        />
      </div>
    );
  }

  const vazio = periodoSemPedido(metricas);
  const hoje = metricas.periodo.atalho === "hoje";

  return (
    <div data-estado={vazio ? "vazio" : "sucesso"} className="space-y-6">
      <div className="space-y-3">
        <PeriodoEmVigor periodo={metricas.periodo} />
        <HorarioDeReferencia
          calculadoEm={metricas.calculadoEm}
          fuso={metricas.periodo.fuso}
          deCache={metricas.deCache}
          atualizando={uso.atualizando}
          atualizacaoFalhou={uso.atualizacaoFalhou}
          aoAtualizar={uso.atualizarAgora}
        />
      </div>
      {vazio ? (
        <PainelVazio apelido={metricas.loja.apelido} hoje={hoje} />
      ) : null}
      <CartoesDeMetrica
        resumo={metricas.resumo}
        regraDeVenda={metricas.regraDeVenda}
        rotuloDoPeriodo={hoje ? "hoje" : "no período"}
      />
      <ComparativoPeriodo
        comparacao={metricas.comparacao}
        periodo={metricas.periodo}
      />
      {/* Um dia só não tem evolução: a coluna única não diz nada que os
          cartões já não digam. */}
      {metricas.porDia.length > 1 ? (
        <EvolucaoDiaria pontos={metricas.porDia} />
      ) : null}
      {/* As 24 colunas do movimento pedem a largura de dois terços: na
          metade, os números em cima delas não caberiam sem rolar. */}
      <div className="grid grid-cols-1 gap-6 min-[1280px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RankingProdutos produtos={metricas.maisVendidos} />
        <DistribuicaoPorHora pontos={metricas.porHora} />
      </div>
    </div>
  );
}

export interface PainelDoDiaProps {
  /** Leitor das métricas. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarMetricas | undefined;
  /** De quanto em quanto o painel aberto se relê (padrão: um minuto). */
  readonly intervaloMs?: number | undefined;
}

/** O resumo de hoje, que abre o painel (AC-800). */
export function PainelDoDia({ buscar, intervaloMs }: PainelDoDiaProps) {
  const uso = useMetricas({
    consultaInicial: PERIODO_DE_HOJE,
    buscar,
    intervaloMs,
  });
  return <CorpoDasMetricas uso={uso} />;
}

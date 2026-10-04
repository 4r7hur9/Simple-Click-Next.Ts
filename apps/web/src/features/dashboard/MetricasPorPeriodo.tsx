"use client";

/**
 * As métricas de um período escolhido (T-804; AC-803, AC-805, AC-806).
 *
 * O PERÍODO MORA NO ENDEREÇO DA PÁGINA. Quando um período passa a valer — e
 * só quando ele passa a valer, depois de a API aceitá-lo —, o endereço muda
 * para `?periodo=personalizado&de=...&ate=...`. Recarregar a página ou abrir
 * o link copiado em outra aba lê o mesmo período de volta (AC-806). Período
 * recusado não chega ao endereço: o link copiado logo depois de um erro abre
 * o período que estava valendo, e não o que foi recusado.
 *
 * O endereço é trocado no lugar (`replaceState`), sem empilhar uma entrada a
 * cada toque: o "voltar" do navegador sai do painel, como a pessoa espera, em
 * vez de desfazer um a um os atalhos tocados.
 */
import { Aviso } from "@simpleclick/ui";

import {
  descreverPeriodo,
  enderecoDoPeriodo,
  type BuscarMetricas,
  type ConsultaDoPeriodo,
} from "../../lib/metricas.ts";
import { CorpoDasMetricas } from "./PainelDeMetricas.tsx";
import { SeletorDePeriodo } from "./SeletorDePeriodo.tsx";
import { useMetricas } from "./useMetricas.ts";

/** Grava o período em vigor no endereço da página, sem recarregá-la. */
export function gravarPeriodoNoEndereco(consulta: ConsultaDoPeriodo): void {
  if (typeof window === "undefined") return;
  const novo = `${window.location.pathname}?${enderecoDoPeriodo(consulta)}`;
  const atual = `${window.location.pathname}${window.location.search}`;
  if (novo !== atual) {
    window.history.replaceState(window.history.state, "", novo);
  }
}

export interface MetricasPorPeriodoProps {
  /** O período lido do endereço quando a página abriu. */
  readonly consultaInicial: ConsultaDoPeriodo;
  /** Leitor das métricas. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarMetricas | undefined;
  /** Quem grava o período em vigor no endereço. */
  readonly gravarNoEndereco?:
    ((consulta: ConsultaDoPeriodo) => void) | undefined;
}

export function MetricasPorPeriodo({
  consultaInicial,
  buscar,
  gravarNoEndereco = gravarPeriodoNoEndereco,
}: MetricasPorPeriodoProps) {
  const uso = useMetricas({
    consultaInicial,
    buscar,
    aoAplicar: gravarNoEndereco,
  });
  const periodo = uso.metricas?.periodo ?? null;

  return (
    <div className="space-y-6">
      <SeletorDePeriodo
        vigente={uso.vigente}
        periodo={periodo}
        ocupado={uso.fase === "carregando"}
        aoEscolher={uso.escolher}
      />

      {uso.recusa !== null ? (
        <Aviso tom="erro" titulo="O período não foi trocado">
          <p data-recusa>{uso.recusa}</p>
          {periodo !== null ? (
            <p className="mt-1">
              Continua valendo: {descreverPeriodo(periodo).frase}.
            </p>
          ) : null}
        </Aviso>
      ) : null}

      <CorpoDasMetricas uso={uso} />
    </div>
  );
}

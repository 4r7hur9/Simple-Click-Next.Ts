"use client";

/**
 * O seletor de período das métricas (card #34): os dois atalhos mais usados
 * ("Hoje" e "7 dias") à vista e, ao lado, o calendário do `@simpleclick/ui`
 * com os demais atalhos, intervalo livre e "comparar com o período anterior".
 *
 * O SELETOR NÃO DECIDE SE O INTERVALO SERVE. Intervalo acima do limite vai
 * para a API, que recusa com explicação, e a tela mantém o período anterior
 * (AC-805). O "hoje" é o do fuso da loja, que vem junto com o período.
 */
import {
  Botao,
  SeletorDePeriodo as CalendarioDePeriodo,
  hojeNoFuso,
  periodoAnterior,
  periodoDoAtalho,
  type PeriodoIso,
} from "@simpleclick/ui";

import {
  consultaDoIntervalo,
  type ConsultaDoPeriodo,
  type PeriodoDeMetricasNoContrato,
} from "../../lib/metricas.ts";
import { InfoDoPainel } from "../config/RotuloComInfo.tsx";

export interface SeletorDePeriodoProps {
  /** O período em vigor, para marcar o atalho (nulo enquanto nada valeu). */
  readonly vigente: ConsultaDoPeriodo | null;
  /** As pontas do período em vigor. */
  readonly periodo: PeriodoDeMetricasNoContrato | null;
  /**
   * Uma leitura está no ar. Os controles NÃO são desabilitados por isso:
   * botão que se desabilita com o foco nele joga o foco de quem usa teclado
   * para o começo da página. A troca seguinte simplesmente vence a anterior.
   */
  readonly ocupado: boolean;
  readonly aoEscolher: (consulta: ConsultaDoPeriodo) => void;
  /** Comparar com o período anterior está ligado? */
  readonly comparar?: boolean | undefined;
  readonly aoComparar?: ((comparar: boolean) => void) | undefined;
}

const FUSO_PADRAO = "America/Fortaleza";

export function SeletorDePeriodo({
  vigente,
  periodo,
  ocupado,
  aoEscolher,
  comparar = true,
  aoComparar,
}: SeletorDePeriodoProps) {
  const fuso = periodo?.fuso ?? FUSO_PADRAO;
  const hoje = hojeNoFuso(fuso);
  const valor: PeriodoIso =
    periodo !== null
      ? { inicio: periodo.de, fim: periodo.ate }
      : periodoDoAtalho("hoje", hoje);

  function escolher(atalho: "hoje" | "ultimos-7"): void {
    aoComparar?.(true);
    aoEscolher(consultaDoIntervalo(periodoDoAtalho(atalho, hoje), hoje));
  }

  return (
    <div
      data-seletor-de-periodo
      data-vigente={vigente?.periodo}
      aria-busy={ocupado || undefined}
      className="flex flex-wrap items-center gap-2"
    >
      <Botao
        type="button"
        forma="pilula"
        variante={vigente?.periodo === "hoje" ? "primaria" : "secundaria"}
        aria-pressed={vigente?.periodo === "hoje"}
        onClick={() => escolher("hoje")}
      >
        Hoje
      </Botao>
      <Botao
        type="button"
        forma="pilula"
        variante={vigente?.periodo === "7d" ? "primaria" : "secundaria"}
        aria-pressed={vigente?.periodo === "7d"}
        onClick={() => escolher("ultimos-7")}
      >
        7 dias
      </Botao>
      <CalendarioDePeriodo
        value={valor}
        max={hoje}
        fuso={fuso}
        hoje={hoje}
        permitirComparacao
        comparacao={comparar ? periodoAnterior(valor) : null}
        rotulo="Escolher outro período"
        onChange={(novo, comparacao) => {
          aoComparar?.(comparacao !== null);
          aoEscolher(consultaDoIntervalo(novo, hoje));
        }}
      />
      <InfoDoPainel explicacao="periodo" nome="Período das métricas" />
    </div>
  );
}

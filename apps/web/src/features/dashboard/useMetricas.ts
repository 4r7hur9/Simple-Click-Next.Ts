"use client";

/**
 * Carregar as métricas de um período e trocar de período (T-803, T-804).
 *
 * TRÊS REGRAS DE TELA MORAM AQUI, e é por isso que elas são uma só em todo
 * lugar que mostra métrica:
 *
 *   * ENQUANTO CARREGA, NÃO HÁ NÚMERO (AC-813). Trocar de "3 dias" para
 *     "7 dias" põe a tela em espera; os números de 3 dias não ficam à vista
 *     fingindo ser de 7.
 *   * PERÍODO RECUSADO NÃO DERRUBA O QUE VALIA (AC-805). Quando a API recusa
 *     o intervalo, a tela volta ao último período aceito, com os números
 *     dele, e guarda a explicação para mostrar. Só quando nenhum período
 *     valeu ainda — o endereço já chegou com um intervalo impossível — o de
 *     hoje passa a valer, com a explicação junto.
 *   * A RESPOSTA VELHA NÃO VENCE A NOVA. Cada leitura tem a sua vez; a que
 *     chega depois de outra ter sido pedida é descartada. Sem isso, tocar
 *     "3 dias" e logo "7 dias" numa rede lenta podia terminar mostrando 3
 *     dias com o botão de 7 marcado.
 *
 * O PAINEL ABERTO SE RELÊ SOZINHO a cada minuto (AC-814, ASM-802): o pedido
 * que entra com a tela aberta aparece dentro desse prazo sem ninguém tocar em
 * nada. A releitura é silenciosa — os números ficam na tela, com o horário a
 * que se referem, até os novos chegarem — e não pede recálculo: o guardado
 * na API já muda quando entra pedido (a marca-d'água do cache). Aba
 * escondida não relê; tenta de novo no minuto seguinte.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PERIODO_DE_HOJE,
  buscarMetricasDoPainel,
  mesmoPeriodo,
  type BuscarMetricas,
  type ConsultaDoPeriodo,
  type MetricasNoContrato,
} from "../../lib/metricas.ts";

/** Os estados da tela (P-011): o vazio é decidido por quem desenha. */
export type FaseDasMetricas = "carregando" | "pronta" | "falhou";

export interface FalhaDasMetricas {
  readonly motivo: string;
  readonly semSessao: boolean;
}

export interface EstadoDasMetricas {
  readonly fase: FaseDasMetricas;
  /** Os números do período em vigor. */
  readonly metricas: MetricasNoContrato | null;
  /** O período cujos números estão na tela. */
  readonly vigente: ConsultaDoPeriodo | null;
  /** O período pedido por último — o que está carregando, ou o que falhou. */
  readonly pedida: ConsultaDoPeriodo;
  /** A explicação da API para o último período recusado (AC-805). */
  readonly recusa: string | null;
  readonly falha: FalhaDasMetricas | null;
  /** "Atualizar agora" em andamento: os números ficam, com o horário deles. */
  readonly atualizando: boolean;
  /** O último "atualizar agora" falhou; os números na tela são os de antes. */
  readonly atualizacaoFalhou: boolean;
}

export interface UsoDasMetricas extends EstadoDasMetricas {
  readonly escolher: (consulta: ConsultaDoPeriodo) => void;
  readonly tentarDeNovo: () => void;
  /** Recalcula o período em vigor agora, sem o que está guardado (AC-814). */
  readonly atualizarAgora: () => void;
}

/** O prazo de atualização do painel aberto: um minuto (ASM-802). */
export const INTERVALO_DE_RELEITURA_MS = 60_000;

export interface OpcoesDasMetricas {
  readonly consultaInicial: ConsultaDoPeriodo;
  /** De quanto em quanto o período em vigor é relido; zero desliga. */
  readonly intervaloMs?: number | undefined;
  /** Leitor das métricas. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarMetricas | undefined;
  /** Chamado quando um período passa a valer — é quem o grava no endereço. */
  readonly aoAplicar?: ((consulta: ConsultaDoPeriodo) => void) | undefined;
}

/**
 * `trocar` põe a tela em espera; `atualizar` é o "atualizar agora" do dono,
 * que pede recálculo; `reler` é a releitura silenciosa do minuto.
 */
type Modo = "trocar" | "atualizar" | "reler";

interface PeriodoQueValeu {
  readonly consulta: ConsultaDoPeriodo;
  readonly metricas: MetricasNoContrato;
}

export function useMetricas(opcoes: OpcoesDasMetricas): UsoDasMetricas {
  const [estado, setEstado] = useState<EstadoDasMetricas>(() => ({
    fase: "carregando",
    metricas: null,
    vigente: null,
    pedida: opcoes.consultaInicial,
    recusa: null,
    falha: null,
    atualizando: false,
    atualizacaoFalhou: false,
  }));

  // Guardados em referência para a leitura não reiniciar a cada desenho de
  // quem usa o gancho.
  const buscar = useRef(opcoes.buscar ?? buscarMetricasDoPainel);
  buscar.current = opcoes.buscar ?? buscarMetricasDoPainel;
  const aoAplicar = useRef(opcoes.aoAplicar);
  aoAplicar.current = opcoes.aoAplicar;
  const inicial = useRef(opcoes.consultaInicial);
  const intervalo = useRef(opcoes.intervaloMs ?? INTERVALO_DE_RELEITURA_MS);
  intervalo.current = opcoes.intervaloMs ?? INTERVALO_DE_RELEITURA_MS;

  const vez = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoQueValeu = useRef<PeriodoQueValeu | null>(null);

  const carregar = useCallback(
    async (
      consulta: ConsultaDoPeriodo,
      modo: Modo,
      recusaAnterior: string | null = null,
    ): Promise<void> => {
      vez.current += 1;
      const minhaVez = vez.current;
      clearTimeout(espera.current);

      /** Marca a próxima releitura do período que está na tela. */
      const agendar = (alvo: ConsultaDoPeriodo): void => {
        if (intervalo.current <= 0) return;
        espera.current = setTimeout(() => {
          if (typeof document !== "undefined" && document.hidden) {
            agendar(alvo);
            return;
          }
          void carregar(alvo, "reler");
        }, intervalo.current);
      };

      setEstado((atual) =>
        modo === "reler"
          ? atual
          : modo === "atualizar"
            ? { ...atual, atualizando: true, atualizacaoFalhou: false }
            : {
                ...atual,
                fase: "carregando",
                pedida: consulta,
                falha: null,
                atualizando: false,
                atualizacaoFalhou: false,
              },
      );

      const leitura = await buscar.current(consulta, {
        atualizar: modo === "atualizar",
      });
      if (minhaVez !== vez.current) return;

      if (leitura.estado === "ok") {
        ultimoQueValeu.current = { consulta, metricas: leitura.metricas };
        setEstado((atual) => ({
          fase: "pronta",
          metricas: leitura.metricas,
          vigente: consulta,
          pedida: consulta,
          // Só a troca de período decide a recusa; a releitura não a apaga.
          recusa: modo === "trocar" ? recusaAnterior : atual.recusa,
          falha: null,
          atualizando: false,
          atualizacaoFalhou: false,
        }));
        aoAplicar.current?.(consulta);
        agendar(consulta);
        return;
      }

      if (leitura.estado === "recusada") {
        const anterior = ultimoQueValeu.current;
        if (anterior !== null) {
          setEstado({
            fase: "pronta",
            metricas: anterior.metricas,
            vigente: anterior.consulta,
            pedida: anterior.consulta,
            recusa: leitura.explicacao,
            falha: null,
            atualizando: false,
            atualizacaoFalhou: false,
          });
          return;
        }
        if (!mesmoPeriodo(consulta, PERIODO_DE_HOJE)) {
          await carregar(PERIODO_DE_HOJE, "trocar", leitura.explicacao);
          return;
        }
      }

      const falha: FalhaDasMetricas =
        leitura.estado === "erro"
          ? { motivo: leitura.motivo, semSessao: leitura.semSessao }
          : { motivo: "o período de hoje foi recusado", semSessao: false };

      if (modo !== "trocar" && ultimoQueValeu.current !== null) {
        // Falhou ao atualizar: os números ficam, com o horário deles, e a
        // tela diz que não conseguiu. A próxima releitura tenta de novo.
        setEstado((atual) => ({
          ...atual,
          atualizando: false,
          atualizacaoFalhou: true,
        }));
        agendar(consulta);
        return;
      }
      setEstado((atual) => ({
        ...atual,
        fase: "falhou",
        falha,
        atualizando: false,
      }));
    },
    [],
  );

  useEffect(() => {
    void carregar(inicial.current, "trocar");
    return () => {
      // Desmontou (ou o modo estrito do React montou de novo): a leitura que
      // ainda estiver no ar chega fora da vez e é descartada, e a releitura
      // marcada não acontece.
      vez.current += 1;
      clearTimeout(espera.current);
    };
  }, [carregar]);

  const vigente = estado.vigente;
  const fase = estado.fase;
  const pedida = estado.pedida;

  const escolher = useCallback(
    (consulta: ConsultaDoPeriodo) => {
      if (
        fase === "pronta" &&
        vigente !== null &&
        mesmoPeriodo(consulta, vigente)
      ) {
        // O mesmo período de novo: nada a buscar, só some a recusa antiga.
        setEstado((atual) => ({ ...atual, recusa: null }));
        return;
      }
      void carregar(consulta, "trocar");
    },
    [carregar, fase, vigente],
  );

  const tentarDeNovo = useCallback(() => {
    void carregar(pedida, "trocar");
  }, [carregar, pedida]);

  const atualizarAgora = useCallback(() => {
    if (vigente !== null) void carregar(vigente, "atualizar");
  }, [carregar, vigente]);

  return { ...estado, escolher, tentarDeNovo, atualizarAgora };
}

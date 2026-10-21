"use client";

import {
  esquemaDasMetricasDoAdmin,
  type MetricasDoAdminNoContrato,
} from "@simpleclick/contracts";
import type { PeriodoIso } from "@simpleclick/ui";
import { useCallback, useEffect, useState } from "react";

export type EstadoDoPainel =
  | { readonly fase: "carregando"; readonly anterior: MetricasDoAdminNoContrato | null }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronto"; readonly metricas: MetricasDoAdminNoContrato };

export const MENSAGEM_DE_SESSAO =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA =
  "Não foi possível carregar os números agora. Tente de novo em instantes.";

export function enderecoDasMetricas(periodo: PeriodoIso): string {
  return `/api/admin/metricas?${new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim })}`;
}

/** Busca o painel do período; trocar o período ou tentar de novo refaz a busca. */
export function useMetricasDoAdmin(periodo: PeriodoIso) {
  const [estado, setEstado] = useState<EstadoDoPainel>({
    fase: "carregando",
    anterior: null,
  });
  const [tentativa, setTentativa] = useState(0);
  const { inicio, fim } = periodo;

  useEffect(() => {
    const cancelar = new AbortController();
    setEstado((atual) => ({
      fase: "carregando",
      anterior: atual.fase === "pronto" ? atual.metricas : atual.fase === "carregando" ? atual.anterior : null,
    }));
    (async () => {
      try {
        const resposta = await fetch(enderecoDasMetricas({ inicio, fim }), {
          cache: "no-store",
          signal: cancelar.signal,
        });
        if (resposta.status === 401 || resposta.status === 403) {
          setEstado({ fase: "erro", mensagem: MENSAGEM_DE_SESSAO });
          return;
        }
        if (!resposta.ok) {
          setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
          return;
        }
        const metricas = esquemaDasMetricasDoAdmin.parse(await resposta.json());
        setEstado({ fase: "pronto", metricas });
      } catch {
        if (!cancelar.signal.aborted) {
          setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
        }
      }
    })();
    return () => cancelar.abort();
  }, [inicio, fim, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { estado, tentarDeNovo };
}

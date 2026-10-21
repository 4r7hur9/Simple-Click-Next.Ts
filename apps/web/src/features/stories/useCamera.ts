"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  classificarErroDaCamera,
  ligarTocha,
  pararCamera,
  restricoesDaCamera,
  situacaoDaCamera,
  tochaSuportada,
  type LadoDaCamera,
  type ProblemaDaCamera,
} from "./captura.ts";

export type EstadoDaCamera =
  | { readonly tipo: "iniciando" }
  | { readonly tipo: "pronta" }
  | { readonly tipo: "problema"; readonly problema: ProblemaDaCamera };

/**
 * Liga a câmera (e desliga ao sair) enquanto `ativa`. Traz a troca de lado
 * (traseira/frontal) e a tocha, quando o aparelho tem.
 */
export function useCamera(ativa: boolean) {
  const [lado, setLado] = useState<LadoDaCamera>("environment");
  const [estado, setEstado] = useState<EstadoDaCamera>({ tipo: "iniciando" });
  const [fluxo, setFluxo] = useState<MediaStream | null>(null);
  const [temTocha, setTemTocha] = useState(false);
  const [tochaLigada, setTochaLigada] = useState(false);
  const [podeTrocar, setPodeTrocar] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const fluxoRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!ativa) return;
    let cancelado = false;

    const situacao = situacaoDaCamera({
      isSecureContext: window.isSecureContext,
      mediaDevices: navigator.mediaDevices,
    });
    if (situacao !== "disponivel") {
      setEstado({
        tipo: "problema",
        problema: situacao === "inseguro" ? "inseguro" : "sem-suporte",
      });
      return;
    }

    setEstado({ tipo: "iniciando" });
    setTochaLigada(false);
    navigator.mediaDevices
      .getUserMedia(restricoesDaCamera(lado))
      .then((novo) => {
        if (cancelado) {
          pararCamera(novo);
          return;
        }
        pararCamera(fluxoRef.current);
        fluxoRef.current = novo;
        setFluxo(novo);
        setTemTocha(tochaSuportada(novo.getVideoTracks()[0]));
        setEstado({ tipo: "pronta" });
        // Só depois da permissão o navegador revela quantas câmeras existem.
        void navigator.mediaDevices
          .enumerateDevices()
          .then((aparelhos) => {
            if (!cancelado) {
              setPodeTrocar(
                aparelhos.filter((a) => a.kind === "videoinput").length > 1,
              );
            }
          })
          .catch(() => {});
      })
      .catch((erro: unknown) => {
        if (cancelado) return;
        setFluxo(null);
        setEstado({ tipo: "problema", problema: classificarErroDaCamera(erro) });
      });

    return () => {
      cancelado = true;
    };
  }, [ativa, lado, tentativa]);

  // Ao sair da captura (ou desmontar), a câmera apaga.
  useEffect(() => {
    if (ativa) return;
    pararCamera(fluxoRef.current);
    fluxoRef.current = null;
    setFluxo(null);
  }, [ativa]);

  useEffect(
    () => () => {
      pararCamera(fluxoRef.current);
      fluxoRef.current = null;
    },
    [],
  );

  const trocarLado = useCallback(() => {
    setLado((atual) => (atual === "environment" ? "user" : "environment"));
  }, []);

  const alternarTocha = useCallback(async () => {
    const faixa = fluxoRef.current?.getVideoTracks()[0];
    if (faixa === undefined) return;
    setTochaLigada(await ligarTocha(faixa, !tochaLigada));
  }, [tochaLigada]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  return {
    estado,
    fluxo,
    lado,
    trocarLado,
    podeTrocar,
    temTocha,
    tochaLigada,
    alternarTocha,
    tentarDeNovo,
  };
}

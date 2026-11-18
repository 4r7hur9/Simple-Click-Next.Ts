"use client";

import { useEffect, useState } from "react";
import { Botao, type BotaoProps } from "./botao";

/**
 * Botão marcável com o pulso do curtir (card #104).
 *
 * O pulso é decorativo e só roda na TRANSIÇÃO de desmarcado para marcado, que
 * acontece depois do clique. Um botão que já chega marcado do servidor (o
 * produto já foi curtido) nasce quieto: `data-pulso` só aparece quando o
 * estado muda aqui dentro. Quem pediu menos movimento não vê o pulso (a regra
 * mora em `componentes.css`).
 */

export type BotaoMarcavelProps = Omit<BotaoProps, "marcado"> & {
  marcado: boolean;
};

/** Tempo máximo do pulso, caso o navegador não avise o fim da animação. */
const DURACAO_MAXIMA_DO_PULSO_MS = 700;

export function BotaoMarcavel({
  marcado,
  onAnimationEnd,
  ...resto
}: BotaoMarcavelProps) {
  const [anterior, setAnterior] = useState(marcado);
  const [pulsando, setPulsando] = useState(false);

  // Ajuste durante a renderização: o estado anterior fica guardado e só a
  // virada para "marcado" liga o pulso.
  if (marcado !== anterior) {
    setAnterior(marcado);
    setPulsando(marcado);
  }

  useEffect(() => {
    if (!pulsando) return undefined;
    const espera = setTimeout(
      () => setPulsando(false),
      DURACAO_MAXIMA_DO_PULSO_MS,
    );
    return () => clearTimeout(espera);
  }, [pulsando]);

  return (
    <Botao
      {...resto}
      marcado={marcado}
      data-pulso={pulsando ? "" : undefined}
      onAnimationEnd={(evento) => {
        setPulsando(false);
        onAnimationEnd?.(evento);
      }}
    />
  );
}

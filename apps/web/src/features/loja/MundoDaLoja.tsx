"use client";

/**
 * Camada decorativa da apresentação da loja.
 *
 * O conteúdo continua sendo servidor e completo sem JavaScript. Esta camada só
 * entra em aparelhos com WebGL, tela larga e potência suficiente; em qualquer
 * outro caso os brilhos CSS continuam sendo o fundo da loja.
 */
import { useEffect, useRef, useState } from "react";

import { lerAparelho, podeRodar3D } from "../landing/podeRodar3D.ts";

export function MundoDaLoja() {
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    if (podeRodar3D(lerAparelho())) setLiberado(true);
  }, []);

  if (!liberado) return null;
  return <MundoSobDemanda />;
}

function MundoSobDemanda() {
  const alvo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elemento = alvo.current;
    if (elemento === null) return;

    let desmontar: (() => void) | undefined;
    let cancelado = false;

    void (async () => {
      try {
        const { montarMundoDaLoja } = await import("./mundo-da-loja.ts");
        if (cancelado) return;
        desmontar = montarMundoDaLoja(elemento);
      } catch {
        // WebGL pode existir e ainda assim estar bloqueado pelo navegador. Os
        // brilhos CSS já renderizados são o fallback visual da loja.
      }
    })();

    return () => {
      cancelado = true;
      desmontar?.();
    };
  }, []);

  return <div className="sc-loja__mundo" aria-hidden="true" ref={alvo} />;
}

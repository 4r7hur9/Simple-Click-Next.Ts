"use client";

/**
 * O movimento do convite final. NÃO DESENHA NADA: acha a seção que o servidor
 * entregou (`[data-convite]`) e passa três coisas para o CSS
 * (convite-final.css):
 *
 * - `data-convite="armado"` → `"chegou"`: a entrada (aparelhos sobem, o
 *   brilho acende) quando a seção aparece na tela. Só arma com script e com
 *   movimento; sem os dois, a seção já está no estado final;
 * - `--convite-x` e `--convite-y` (de -1 a 1): onde o mouse está, para o
 *   parallax leve (só com mouse de verdade);
 * - `--convite-rolagem` (de -1 a 1): a seção acima, no meio ou abaixo do
 *   centro da tela, para as camadas andarem em velocidades diferentes.
 *
 * Cada atualização é uma só por quadro (requestAnimationFrame), e nada roda
 * com a seção fora da tela.
 */
import { useEffect, useRef } from "react";
import { detectarCapacidadeDaLanding } from "../capacidade-da-landing.ts";

const limitar = (valor: number) => Math.max(-1, Math.min(1, valor));

export function MovimentoDoConvite() {
  const ancora = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const secao = ancora.current?.closest<HTMLElement>("[data-convite]");
    if (!secao) return;
    let cancelado = false;
    let desfazer: (() => void) | undefined;
    void detectarCapacidadeDaLanding().then((nivel) => {
      if (cancelado || nivel !== "completo") return;
      desfazer = ligarMovimento(secao);
    });
    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return <span ref={ancora} hidden />;
}

function ligarMovimento(secao: HTMLElement): () => void {
    secao.dataset["convite"] = "armado";
    let visivel = false;
    let quadro = 0;
    let mouse: { x: number; y: number } | null = null;

    const desenhar = () => {
      quadro = 0;
      const caixa = secao.getBoundingClientRect();
      const meio = caixa.top + caixa.height / 2;
      secao.style.setProperty("--convite-rolagem", limitar((meio - innerHeight / 2) / innerHeight).toFixed(3));
      if (mouse) {
        secao.style.setProperty("--convite-x", limitar((mouse.x / innerWidth) * 2 - 1).toFixed(3));
        secao.style.setProperty("--convite-y", limitar(((mouse.y - caixa.top) / caixa.height) * 2 - 1).toFixed(3));
      }
    };
    const pedirQuadro = () => {
      if (visivel && !quadro) quadro = requestAnimationFrame(desenhar);
    };

    const observador = new IntersectionObserver(
      ([registro]) => {
        visivel = Boolean(registro?.isIntersecting);
        if (visivel && (registro?.intersectionRatio ?? 0) >= 0.18) secao.dataset["convite"] = "chegou";
        pedirQuadro();
      },
      { threshold: [0, 0.18] },
    );
    observador.observe(secao);

    const aoMoverOMouse = (evento: PointerEvent) => {
      if (evento.pointerType !== "mouse") return;
      mouse = { x: evento.clientX, y: evento.clientY };
      pedirQuadro();
    };
    // O mouse saiu: os aparelhos voltam devagar para o centro.
    const aoSairOMouse = () => {
      mouse = null;
      secao.style.setProperty("--convite-x", "0");
      secao.style.setProperty("--convite-y", "0");
    };
    const comMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (comMouse) {
      secao.addEventListener("pointermove", aoMoverOMouse, { passive: true });
      secao.addEventListener("pointerleave", aoSairOMouse);
    }
    window.addEventListener("scroll", pedirQuadro, { passive: true });
    window.addEventListener("resize", pedirQuadro, { passive: true });

    return () => {
      observador.disconnect();
      secao.removeEventListener("pointermove", aoMoverOMouse);
      secao.removeEventListener("pointerleave", aoSairOMouse);
      window.removeEventListener("scroll", pedirQuadro);
      window.removeEventListener("resize", pedirQuadro);
      if (quadro) cancelAnimationFrame(quadro);
      secao.dataset["convite"] = "";
    };
}

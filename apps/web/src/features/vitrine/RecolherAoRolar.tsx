"use client";
/**
 * Recolhe a barra do topo quando a pessoa rola para baixo, e a devolve quando
 * ela rola para cima.
 *
 * NÃO DESENHA NADA. Só marca `data-recolhida` na barra e deixa o CSS fazer o
 * resto: sem script, a barra fica grudada no topo e a vitrine continua inteira.
 *
 * Três casos em que ela NÃO recolhe, de propósito:
 *   * quem pediu menos movimento (`prefers-reduced-motion`) — a barra fica
 *     parada, que é o estado final e não a ausência dela;
 *   * o foco está dentro da barra — quem usa teclado não perde o campo que
 *     está digitando;
 *   * perto do topo da página, onde não há o que ganhar escondendo.
 */
import { useEffect } from "react";

/** Quantos pixels de rolagem contam como intenção, e não tremida do dedo. */
const FOLGA = 8;

export function RecolherAoRolar({ alvo }: { readonly alvo: string }) {
  useEffect(() => {
    const barra = document.getElementById(alvo);
    if (barra === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let anterior = window.scrollY;
    let agendado = false;

    function conferir() {
      agendado = false;
      if (barra === null) return;
      const atual = window.scrollY;
      const diferenca = atual - anterior;
      if (Math.abs(diferenca) < FOLGA) return;

      const recolher =
        diferenca > 0 &&
        atual > barra.offsetHeight &&
        !barra.contains(document.activeElement);
      barra.toggleAttribute("data-recolhida", recolher);
      anterior = atual;
    }

    function aoRolar() {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(conferir);
    }

    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      barra.removeAttribute("data-recolhida");
    };
  }, [alvo]);

  return null;
}

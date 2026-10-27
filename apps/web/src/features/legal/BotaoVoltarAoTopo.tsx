"use client";

import { ArrowUp } from "lucide-react";

/**
 * "Voltar ao topo" do rodapé. Sobe a página (sem deslizar para quem pediu
 * menos movimento) e leva o foco ao primeiro link do topo, para quem usa
 * teclado não ficar preso lá embaixo.
 */
export function BotaoVoltarAoTopo() {
  function subir() {
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduzido ? "auto" : "smooth" });
    document
      .querySelector<HTMLElement>("header a[href]")
      ?.focus({ preventScroll: true });
  }

  return (
    <button type="button" className="sc-rodape__topo" onClick={subir}>
      <span>Voltar ao topo</span>
      <span className="sc-rodape__topo-icone" aria-hidden="true">
        <ArrowUp size={16} strokeWidth={2.2} />
      </span>
    </button>
  );
}

"use client";

/**
 * "Fontes e metodologia": a linha pequena do pé da seção de mercado e a gaveta
 * que ela abre, com cada fonte, a data da consulta e como a conta foi feita.
 *
 * É um `popover` nativo: abre e fecha sem script (o botão aponta para ele),
 * fecha com Esc e com clique fora, e o foco volta para o botão. O script só
 * leva o foco para dentro da gaveta quando ela abre, para quem usa teclado ou
 * leitor de tela começar pela lista.
 */
import { Info, Link2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import type { FonteDeProva } from "./conteudo-de-prova.ts";

export function FontesDosDados({
  fontes,
  metodologia,
}: {
  fontes: readonly FonteDeProva[];
  metodologia: readonly string[];
}) {
  const id = useId().replace(/[^\w-]/g, "");
  const gaveta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const no = gaveta.current;
    if (!no) return;
    const aoAbrir = (evento: Event) => {
      if ((evento as ToggleEvent).newState === "open") no.querySelector<HTMLElement>("[data-fechar]")?.focus();
    };
    no.addEventListener("toggle", aoAbrir);
    return () => no.removeEventListener("toggle", aoAbrir);
  }, []);

  return (
    <div className="sc-dados__rodape">
      <button
        aria-haspopup="dialog"
        className="sc-dados__abrir-fontes"
        popoverTarget={`${id}-fontes`}
        type="button"
      >
        <Info aria-hidden="true" size={12} strokeWidth={2.25} />
        Fontes e metodologia
      </button>
      <span className="sc-dados__rodape-nota">
        Valores oficiais consultados em outubro de 2026; podem variar por plano e região.
      </span>

      <div
        aria-labelledby={`${id}-titulo`}
        className="sc-dados__gaveta"
        id={`${id}-fontes`}
        popover="auto"
        ref={gaveta}
        role="dialog"
      >
        <div className="sc-dados__gaveta-cabeca">
          <h3 className="sc-dados__gaveta-titulo" id={`${id}-titulo`}>
            Fontes e metodologia
          </h3>
          <button
            aria-label="Fechar fontes e metodologia"
            className="sc-dados__fechar"
            data-fechar
            popoverTarget={`${id}-fontes`}
            popoverTargetAction="hide"
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={2.25} />
          </button>
        </div>
        <ol className="sc-dados__lista-de-fontes">
          {fontes.map((fonte) => (
            <li key={fonte.url}>
              <a href={fonte.url} rel="noopener noreferrer" target="_blank">
                <Link2 aria-hidden="true" size={11} strokeWidth={2.25} />
                <span>{fonte.nome}</span>
                <span className="sc-prova__so-leitor"> (abre em nova aba)</span>
              </a>
              <span className="sc-dados__data">{fonte.data}</span>
            </li>
          ))}
        </ol>
        <div className="sc-dados__metodologia">
          {metodologia.map((paragrafo) => (
            <p key={paragrafo}>{paragrafo}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

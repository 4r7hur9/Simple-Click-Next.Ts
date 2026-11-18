"use client";

/**
 * A galeria do detalhe: fotos e vídeos na ordem do dono (AC-10901 a AC-10903).
 *
 * - Cada mídia ocupa a moldura inteira, de proporção FIXA: a janela não pula
 *   quando a imagem chega.
 * - Troca por arrastar (scroll-snap), pelas setas (a partir de 768 px) e pelo
 *   teclado (← e → com o foco na galeria). A posição ("2 de 3") é texto, não
 *   só bolinha.
 * - O vídeo nasce PARADO, mostrando a capa. Só toca quando a pessoa aciona
 *   "Reproduzir vídeo", e começa mudo; o som é dos controles do próprio vídeo.
 * - Com "reduzir movimento", a troca é direta, sem deslizar.
 * - Sem mídia nenhuma, a inicial do nome ocupa o mesmo lugar.
 *
 * `matchMedia`, o índice e a rolagem só são lidos em efeito ou em evento: o
 * HTML do servidor é igual ao do primeiro render do navegador.
 */
import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconeAnterior, IconeProximo, IconeVideo } from "@simpleclick/ui";

import type { MidiaNaTela } from "../../lib/produto.ts";

export interface GaleriaDoProdutoProps {
  readonly midias: readonly MidiaNaTela[];
  /** O nome do produto: dá nome acessível ao vídeo e vira a inicial sem mídia. */
  readonly nome: string;
}

function querMenosMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function GaleriaDoProduto({ midias, nome }: GaleriaDoProdutoProps) {
  const trilho = useRef<HTMLUListElement>(null);
  const [atual, setAtual] = useState(0);
  const [tocando, setTocando] = useState<number | null>(null);
  const total = midias.length;

  // Ao sair da mídia, o vídeo que estava tocando para.
  useEffect(() => {
    const el = trilho.current;
    if (el === null) return;
    el.querySelectorAll("video").forEach((video, indice) => {
      const dono = video.closest<HTMLElement>("[data-indice]");
      if (dono?.dataset["indice"] !== String(atual) && !video.paused) {
        video.pause();
      }
      void indice;
    });
  }, [atual]);

  if (total === 0) {
    return (
      <div className="sc-detalhe__sem-foto" aria-hidden="true">
        {nome.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  function irPara(indice: number) {
    const el = trilho.current;
    if (el === null) return;
    const destino = Math.max(0, Math.min(total - 1, indice));
    el.scrollTo({
      left: destino * el.clientWidth,
      behavior: querMenosMovimento() ? "auto" : "smooth",
    });
    setAtual(destino);
  }

  function aoRolar() {
    const el = trilho.current;
    if (el === null || el.clientWidth === 0) return;
    setAtual(Math.round(el.scrollLeft / el.clientWidth));
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "ArrowRight") {
      evento.preventDefault();
      irPara(atual + 1);
    } else if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      irPara(atual - 1);
    }
  }

  function reproduzir(indice: number) {
    const video = trilho.current?.querySelector<HTMLVideoElement>(
      `[data-indice="${indice}"] video`,
    );
    if (video === null || video === undefined) return;
    video.muted = true;
    setTocando(indice);
    void video.play?.();
  }

  const varias = total > 1;

  return (
    <div
      className="sc-galeria"
      role="group"
      aria-roledescription="carrossel"
      aria-label={`Galeria de ${nome}`}
      tabIndex={varias ? 0 : undefined}
      onKeyDown={varias ? aoTeclar : undefined}
    >
      <ul className="sc-detalhe__galeria" ref={trilho} onScroll={aoRolar}>
        {midias.map((midia, indice) => (
          <li
            className="sc-detalhe__figura"
            key={`${midia.tipo}-${midia.url}`}
            data-indice={indice}
          >
            {midia.tipo === "video" ? (
              <>
                <video
                  className="sc-detalhe__video"
                  src={midia.url}
                  poster={midia.capa ?? undefined}
                  preload={midia.capa ? "none" : "metadata"}
                  playsInline
                  muted
                  controls={tocando === indice}
                  aria-label={`Vídeo de ${nome}`}
                />
                {tocando === indice ? null : (
                  <button
                    type="button"
                    className="sc-detalhe__reproduzir"
                    onClick={() => reproduzir(indice)}
                  >
                    <IconeVideo aria-hidden="true" />
                    <span>Reproduzir vídeo</span>
                  </button>
                )}
              </>
            ) : (
              <Image
                className="sc-detalhe__foto"
                src={midia.url}
                alt={midia.texto ?? ""}
                fill
                priority={indice === 0}
                sizes="(max-width: 768px) 100vw, 28rem"
              />
            )}
          </li>
        ))}
      </ul>

      {varias ? (
        <>
          <p className="sc-detalhe__contagem-de-fotos" aria-live="polite">
            {atual + 1} de {total}
          </p>
          <button
            type="button"
            className="sc-galeria__seta sc-galeria__seta--anterior"
            onClick={() => irPara(atual - 1)}
            disabled={atual <= 0}
            aria-label="Mídia anterior"
          >
            <IconeAnterior aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sc-galeria__seta sc-galeria__seta--proxima"
            onClick={() => irPara(atual + 1)}
            disabled={atual >= total - 1}
            aria-label="Próxima mídia"
          >
            <IconeProximo aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}

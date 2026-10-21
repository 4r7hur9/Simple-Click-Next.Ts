"use client";

/**
 * A mídia do post (card #49): sempre 4:5. Várias mídias viram carrossel
 * (arrastar de lado, setas no computador e bolinhas embaixo). Vídeo toca no
 * mudo quando entra na tela, pausa quando sai e o toque liga/desliga o som.
 * Dois toques seguidos curtem (o brilho do Simple pula no meio da foto).
 */
import Image from "next/image";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { IconeBrilho } from "@simpleclick/ui";

import type { MidiaDoPost as Midia } from "./social.ts";

const INTERVALO_DO_TOQUE_DUPLO_MS = 300;

export function MidiaDoPost({
  midias,
  nome,
  prioridade = false,
  aoTocarDuasVezes,
}: {
  readonly midias: readonly Midia[];
  /** Nome do produto, para o texto alternativo. */
  readonly nome: string;
  readonly prioridade?: boolean;
  readonly aoTocarDuasVezes?: (() => void) | undefined;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [brilho, setBrilho] = useState(0);
  const ultimoToque = useRef(0);
  const varias = midias.length > 1;

  function irPara(indice: number) {
    const el = trilho.current;
    if (el === null) return;
    const destino = Math.max(0, Math.min(midias.length - 1, indice));
    el.scrollTo({ left: destino * el.clientWidth, behavior: "smooth" });
  }

  function aoRolar() {
    const el = trilho.current;
    if (el === null || el.clientWidth === 0) return;
    setAtual(Math.round(el.scrollLeft / el.clientWidth));
  }

  function aoClicar(evento: MouseEvent<HTMLDivElement>) {
    if ((evento.target as HTMLElement).closest("button")) return;
    const agora = evento.timeStamp;
    if (agora - ultimoToque.current < INTERVALO_DO_TOQUE_DUPLO_MS) {
      ultimoToque.current = 0;
      if (aoTocarDuasVezes) {
        aoTocarDuasVezes();
        setBrilho((n) => n + 1);
      }
    } else {
      ultimoToque.current = agora;
    }
  }

  if (midias.length === 0) {
    return (
      <div className="sc-post__midia sc-post__midia--vazia" onClick={aoClicar}>
        <span aria-hidden="true">{nome.slice(0, 1).toUpperCase()}</span>
        <BrilhoDaCurtida chave={brilho} />
      </div>
    );
  }

  return (
    <div className="sc-post__midia" onClick={aoClicar}>
      <div
        ref={trilho}
        className="sc-post__trilho"
        onScroll={aoRolar}
        role={varias ? "group" : undefined}
        aria-roledescription={varias ? "carrossel" : undefined}
        aria-label={varias ? `Fotos de ${nome}` : undefined}
      >
        {midias.map((midia, i) => (
          <div
            key={`${midia.url}-${i}`}
            className="sc-post__quadro"
            aria-roledescription={varias ? "slide" : undefined}
            aria-label={varias ? `${i + 1} de ${midias.length}` : undefined}
          >
            {midia.tipo === "video" ? (
              <VideoDoPost midia={midia} ativo={i === atual} />
            ) : (
              <Image
                src={midia.url}
                alt={midia.texto ?? (i === 0 ? nome : "")}
                fill
                priority={prioridade && i === 0}
                loading={prioridade && i === 0 ? undefined : "lazy"}
                sizes="(max-width: 720px) 100vw, 640px"
              />
            )}
          </div>
        ))}
      </div>

      {varias ? (
        <>
          <span className="sc-post__contador" aria-hidden="true">
            {atual + 1}/{midias.length}
          </span>
          {atual > 0 ? (
            <button
              type="button"
              className="sc-post__seta sc-post__seta--antes"
              aria-label="Foto anterior"
              onClick={() => irPara(atual - 1)}
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
          ) : null}
          {atual < midias.length - 1 ? (
            <button
              type="button"
              className="sc-post__seta sc-post__seta--depois"
              aria-label="Próxima foto"
              onClick={() => irPara(atual + 1)}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </button>
          ) : null}
          <span className="sc-post__bolinhas" aria-hidden="true">
            {midias.map((midia, i) => (
              <span key={`${midia.url}-${i}`} data-atual={i === atual || undefined} />
            ))}
          </span>
        </>
      ) : null}
      <BrilhoDaCurtida chave={brilho} />
    </div>
  );
}

/** O brilho que pula no meio da foto ao curtir com dois toques. */
function BrilhoDaCurtida({ chave }: { readonly chave: number }) {
  if (chave === 0) return null;
  return (
    <span key={chave} className="sc-post__brilho" aria-hidden="true">
      <IconeBrilho size={104} preenchido strokeWidth={1} />
    </span>
  );
}

function VideoDoPost({ midia, ativo }: { readonly midia: Midia; readonly ativo: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(true);
  const [naTela, setNaTela] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      ([entrada]) => setNaTela((entrada?.intersectionRatio ?? 0) >= 0.6),
      { threshold: [0, 0.6, 1] },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const el = video.current;
    if (el === null) return;
    if (naTela && ativo) {
      void el.play().catch(() => {
        // Navegador recusou tocar sozinho: fica parado com a capa.
      });
    } else {
      el.pause();
    }
  }, [naTela, ativo]);

  function alternarSom() {
    setMudo((m) => !m);
    const el = video.current;
    if (el?.paused) void el.play().catch(() => undefined);
  }

  return (
    <>
      <video
        ref={video}
        className="sc-post__video"
        src={midia.url}
        poster={midia.capa}
        muted={mudo}
        loop
        playsInline
        preload="metadata"
        aria-label="Vídeo do produto"
        onClick={alternarSom}
      />
      <button
        type="button"
        className="sc-post__som"
        aria-pressed={!mudo}
        aria-label={mudo ? "Ligar o som" : "Desligar o som"}
        onClick={alternarSom}
      >
        {mudo ? <VolumeX aria-hidden="true" size={18} /> : <Volume2 aria-hidden="true" size={18} />}
      </button>
    </>
  );
}

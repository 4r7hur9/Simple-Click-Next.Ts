"use client";

/**
 * Stories no topo do feed (card #49). O story é da LOJA: cada bolinha é a
 * foto de perfil dela, com anel verde enquanto houver story que a pessoa não
 * viu (cinza depois). Lojas com novidade vêm antes; dentro disso, as que a
 * pessoa segue. O "visto" fica neste navegador.
 *
 * O visualizador ocupa a tela em pé: barras de progresso no alto, toque na
 * esquerda volta, na direita avança, segurar pausa, X ou arrastar para baixo
 * fecha. Embaixo, "Ver loja" leva à vitrine. A API já tira os de mais de 24 h.
 */
import Link from "next/link";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import {
  CHAVE_DOS_STORIES_VISTOS,
  ordenarStories,
  primeiroNaoVisto,
  tempoRelativo,
  temStoryNovo,
  type LojaComStories,
  type StoriesVistos,
} from "./social.ts";

const SEGURAR_PAUSA_MS = 180;
const ARRASTE_QUE_FECHA_PX = 90;

function lerVistos(): StoriesVistos {
  try {
    const bruto = window.localStorage.getItem(CHAVE_DOS_STORIES_VISTOS);
    const lido: unknown = bruto === null ? {} : JSON.parse(bruto);
    if (typeof lido !== "object" || lido === null) return {};
    return Object.fromEntries(
      Object.entries(lido).filter((par): par is [string, string] => typeof par[1] === "string"),
    );
  } catch {
    return {};
  }
}

function guardarVistos(vistos: StoriesVistos): void {
  try {
    window.localStorage.setItem(CHAVE_DOS_STORIES_VISTOS, JSON.stringify(vistos));
  } catch {
    // Sem armazenamento: o anel só não lembra na próxima visita.
  }
}

export function FileiraDeStories({
  lojas,
  aoVerNaApi,
}: {
  readonly lojas: readonly LojaComStories[];
  /** Conta a visualização para a loja (com sessão). */
  readonly aoVerNaApi?: ((storyId: string) => Promise<void>) | undefined;
}) {
  const [vistos, setVistos] = useState<StoriesVistos>({});
  const [ordem, setOrdem] = useState<readonly LojaComStories[]>(lojas);
  const [aberta, setAberta] = useState<number | null>(null);

  // A ordem é fixada ao abrir a página (e ao fechar o visualizador): mudar de
  // lugar enquanto a pessoa assiste confunde.
  useEffect(() => {
    const lidos = lerVistos();
    setVistos(lidos);
    setOrdem(ordenarStories(lojas, lidos));
  }, [lojas]);

  const marcarVisto = useCallback((apelido: string, criadoEm: string, storyId: string) => {
    void aoVerNaApi?.(storyId).catch(() => undefined);
    setVistos((atual) => {
      const antes = atual[apelido];
      if (antes !== undefined && antes >= criadoEm) return atual;
      const novos = { ...atual, [apelido]: criadoEm };
      guardarVistos(novos);
      return novos;
    });
  }, [aoVerNaApi]);

  if (lojas.length === 0) return null;

  return (
    <section className="sc-stories" aria-labelledby="sc-stories-titulo">
      <header className="sc-stories__cabeca">
        <h2 id="sc-stories-titulo" className="sc-stories__titulo">
          Novidades das lojas
        </h2>
        <span className="sc-stories__selo">Stories</span>
      </header>
      <ul className="sc-stories__fileira">
        {ordem.map((loja, i) => {
          const novo = temStoryNovo(loja, vistos);
          return (
            <li key={loja.apelido}>
              <button
                type="button"
                className="sc-stories__bolinha"
                data-novo={novo || undefined}
                aria-label={`Ver stories de ${loja.nome}${novo ? " (novo)" : ""}`}
                onClick={() => setAberta(i)}
              >
                <span className="sc-stories__anel">
                  <span className="sc-stories__foto">
                    {loja.foto ? (
                      <img src={loja.foto} alt="" loading="lazy" />
                    ) : (
                      <span className="sc-stories__iniciais">{loja.iniciais}</span>
                    )}
                  </span>
                </span>
                <span className="sc-stories__nome">{loja.nome}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {aberta === null ? null : (
        <VisualizadorDeStories
          lojas={ordem}
          inicio={aberta}
          vistos={vistos}
          aoVer={marcarVisto}
          aoFechar={() => {
            setAberta(null);
            setOrdem(ordenarStories(lojas, lerVistos()));
          }}
        />
      )}
    </section>
  );
}

export function VisualizadorDeStories({
  lojas,
  inicio,
  vistos,
  aoVer,
  aoFechar,
}: {
  readonly lojas: readonly LojaComStories[];
  readonly inicio: number;
  readonly vistos: StoriesVistos;
  readonly aoVer: (apelido: string, criadoEm: string, storyId: string) => void;
  readonly aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const primeira = lojas[inicio];
  const [lojaAtual, setLojaAtual] = useState(inicio);
  const [storyAtual, setStoryAtual] = useState(() =>
    primeira === undefined ? 0 : primeiroNaoVisto(primeira, vistos),
  );
  const [progresso, setProgressoNaTela] = useState(0);
  // O relógio lê daqui (o estado só desenha): pausar e voltar continua do ponto.
  const progressoRef = useRef(0);
  const setProgresso = useCallback((valor: number) => {
    progressoRef.current = valor;
    setProgressoNaTela(valor);
  }, []);
  const [pausado, setPausado] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [arraste, setArraste] = useState(0);
  const toque = useRef<{ x: number; y: number; quando: number; segurou: boolean } | null>(null);
  const segurar = useRef<number | undefined>(undefined);

  const loja = lojas[lojaAtual];
  const story = loja?.stories[storyAtual];

  useEffect(() => {
    janela.current?.showModal?.();
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = antes;
    };
  }, []);

  useEffect(() => {
    if (loja !== undefined && story !== undefined) aoVer(loja.apelido, story.criadoEm, story.id);
  }, [loja, story, aoVer]);

  const avancar = useCallback(() => {
    setProgresso(0);
    if (loja === undefined) return;
    if (storyAtual < loja.stories.length - 1) {
      setStoryAtual((n) => n + 1);
    } else if (lojaAtual < lojas.length - 1) {
      const proxima = lojas[lojaAtual + 1];
      setLojaAtual((n) => n + 1);
      setStoryAtual(proxima === undefined ? 0 : primeiroNaoVisto(proxima, vistos));
    } else {
      janela.current?.close();
    }
  }, [loja, storyAtual, lojaAtual, lojas, vistos, setProgresso]);

  const voltar = useCallback(() => {
    setProgresso(0);
    if (storyAtual > 0) {
      setStoryAtual((n) => n - 1);
    } else if (lojaAtual > 0) {
      const anterior = lojas[lojaAtual - 1];
      setLojaAtual((n) => n - 1);
      setStoryAtual(Math.max(0, (anterior?.stories.length ?? 1) - 1));
    }
  }, [storyAtual, lojaAtual, lojas, setProgresso]);

  // Relógio da foto (o vídeo anda pelo próprio tempo).
  useEffect(() => {
    if (story === undefined || story.tipo === "video" || pausado) return;
    let anterior = performance.now();
    let quadro = 0;
    let andado = progressoRef.current;
    const passo = (agora: number) => {
      andado = Math.min(1, andado + (agora - anterior) / story.duracaoMs);
      anterior = agora;
      progressoRef.current = andado;
      setProgresso(andado);
      if (andado >= 1) avancar();
      else quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [story, pausado, avancar, setProgresso]);

  useEffect(() => {
    const el = video.current;
    if (el === null || story?.tipo !== "video") return;
    if (pausado) {
      el.pause();
      return;
    }
    void el.play().catch(() => {
      // Sem permissão para tocar com som: tenta no mudo.
      el.muted = true;
      setMudo(true);
      void el.play().catch(() => undefined);
    });
  }, [story, pausado]);

  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    toque.current = { x: e.clientX, y: e.clientY, quando: e.timeStamp, segurou: false };
    window.clearTimeout(segurar.current);
    segurar.current = window.setTimeout(() => {
      if (toque.current) toque.current.segurou = true;
      setPausado(true);
    }, SEGURAR_PAUSA_MS);
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    if (toque.current === null) return;
    const dy = e.clientY - toque.current.y;
    if (dy > 10) {
      window.clearTimeout(segurar.current);
      setArraste(dy);
    }
  }

  function aoSoltar(e: PointerEvent<HTMLDivElement>) {
    window.clearTimeout(segurar.current);
    const t = toque.current;
    toque.current = null;
    if (t === null) return;
    if (arraste > ARRASTE_QUE_FECHA_PX) {
      janela.current?.close();
      return;
    }
    setArraste(0);
    if (t.segurou) {
      setPausado(false);
      return;
    }
    const caixa = e.currentTarget.getBoundingClientRect();
    if (e.clientX - caixa.left < caixa.width * 0.3) voltar();
    else avancar();
  }

  if (loja === undefined || story === undefined) return null;

  return (
    <dialog
      ref={janela}
      className="sc-story"
      aria-label={`Stories de ${loja.nome}`}
      onClose={aoFechar}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") avancar();
        else if (e.key === "ArrowLeft") voltar();
        else if (e.key === " ") {
          e.preventDefault();
          setPausado((p) => !p);
        }
      }}
    >
      <div
        className="sc-story__palco"
        tabIndex={-1}
        autoFocus
        style={arraste > 0 ? { transform: `translateY(${arraste}px)`, opacity: Math.max(0.4, 1 - arraste / 400) } : undefined}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={() => {
          toque.current = null;
          setArraste(0);
          setPausado(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {story.tipo === "video" ? (
          <video
            key={story.id}
            ref={video}
            className="sc-story__midia"
            src={story.url}
            poster={story.capa}
            muted={mudo}
            playsInline
            preload="auto"
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setProgresso(el.currentTime / el.duration);
            }}
            onEnded={avancar}
          />
        ) : (
          <img key={story.id} className="sc-story__midia" src={story.url} alt={`Story de ${loja.nome}`} />
        )}

        <div className="sc-story__barras" aria-hidden="true">
          {loja.stories.map((s, i) => (
            <span key={s.id} className="sc-story__barra">
              <span
                style={{
                  transform: `scaleX(${i < storyAtual ? 1 : i === storyAtual ? progresso : 0})`,
                }}
              />
            </span>
          ))}
        </div>

        <header className="sc-story__topo">
          <Link className="sc-story__loja" href={`/loja/${loja.apelido}`}>
            <span className="sc-story__foto">
              {loja.foto ? <img src={loja.foto} alt="" /> : <span>{loja.iniciais}</span>}
            </span>
            <strong>{loja.nome}</strong>
          </Link>
          <span className="sc-story__quando">{tempoRelativo(story.criadoEm)}</span>
          <span className="sc-story__espaco" />
          {story.tipo === "video" ? (
            <button
              type="button"
              className="sc-story__botao"
              aria-label={mudo ? "Ligar o som" : "Desligar o som"}
              onClick={() => setMudo((m) => !m)}
            >
              {mudo ? <VolumeX aria-hidden="true" size={20} /> : <Volume2 aria-hidden="true" size={20} />}
            </button>
          ) : null}
          <button
            type="button"
            className="sc-story__botao"
            aria-label={pausado ? "Continuar" : "Pausar"}
            onClick={() => setPausado((p) => !p)}
          >
            {pausado ? <Play aria-hidden="true" size={20} /> : <Pause aria-hidden="true" size={20} />}
          </button>
          <button
            type="button"
            className="sc-story__botao"
            aria-label="Fechar stories"
            onClick={() => janela.current?.close()}
          >
            <X aria-hidden="true" size={24} />
          </button>
        </header>

        <footer className="sc-story__rodape">
          {story.legenda ? <p className="sc-story__legenda">{story.legenda}</p> : null}
          <Link className="sc-story__ver" href={`/loja/${loja.apelido}`}>
            Ver loja
          </Link>
        </footer>
      </div>
    </dialog>
  );
}

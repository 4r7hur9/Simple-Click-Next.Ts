"use client";

import { IconeExcluir } from "@simpleclick/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as EventoDePonteiro,
} from "react";

import type { FamiliasDoEditor } from "./composicao.ts";
import { desenharTracos } from "./composicao.ts";
import {
  ALTURA_DA_ETIQUETA,
  ALTURA_DA_LINHA,
  RAIO_DO_FUNDO,
  RECUO_DA_ETIQUETA,
  RECUO_DO_FUNDO,
  TAMANHO_DA_ETIQUETA,
  TAMANHO_DO_EMOJI,
  TAMANHO_DO_TEXTO,
  adicionarTraco,
  estenderTraco,
  fonteDoTexto,
  mudarFundo,
  mudarTransformacao,
  novoTraco,
  removerCamada,
  tintaSobre,
  trazerParaFrente,
  type Camada,
  type DocumentoDoStory,
  type Etiqueta,
  type Texto,
  type Traco,
} from "./documento.ts";
import {
  ALTURA_DA_LIXEIRA,
  ALTURA_DO_PALCO,
  LARGURA_DO_PALCO,
  LIMITES_DO_FUNDO,
  LIMITES_DOS_OBJETOS,
  avancarGesto,
  avancarGestoDaAlca,
  escalaBaseDaMidia,
  escalarComARoda,
  girarComARoda,
  iniciarGesto,
  iniciarGestoDaAlca,
  paraOPalco,
  sobreALixeira,
  type Gesto,
  type GestoDaAlca,
  type Ponto,
  type Transformacao,
} from "./geometria.ts";
import { linhasDoTexto, FAMILIA_DO_EMOJI } from "./composicao.ts";
import type { MidiaDoStory } from "./midia.ts";

export type FerramentaDoPalco = "mover" | "desenho" | "borracha";

type Alvo = { readonly tipo: "fundo" } | { readonly tipo: "camada"; readonly id: string };

interface GestoEmCurso {
  alvo: Alvo;
  gesto: Gesto | null;
  alca: GestoDaAlca | null;
  antes: DocumentoDoStory;
  moveu: boolean;
  inicio: Ponto;
  ultimo: Ponto;
}

/** Quanto o dedo pode andar (em unidades do palco) e ainda contar como toque. */
const FOLGA_DO_TOQUE = 14;

interface Props {
  readonly documento: DocumentoDoStory;
  readonly midia: MidiaDoStory;
  readonly familias: FamiliasDoEditor;
  readonly ferramenta: FerramentaDoPalco;
  readonly cor: string;
  readonly espessura: number;
  readonly selecionado: string | null;
  readonly aoSelecionar: (id: string | null) => void;
  /** Muda o documento durante um gesto, sem criar passo no desfazer. */
  readonly aoVivo: (documento: DocumentoDoStory) => void;
  /** Fecha o gesto: `antes` é o documento de antes dele. */
  readonly aoFechar: (antes: DocumentoDoStory) => void;
  /** Registra um passo completo (um risco novo). */
  readonly aoRegistrar: (documento: DocumentoDoStory) => void;
  readonly aoEditarTexto: (id: string) => void;
}

function transformacaoDoAlvo(documento: DocumentoDoStory, alvo: Alvo): Transformacao {
  if (alvo.tipo === "fundo") return documento.fundo.t;
  return documento.camadas.find((c) => c.id === alvo.id)?.t ?? documento.fundo.t;
}

function aplicarNoAlvo(
  documento: DocumentoDoStory,
  alvo: Alvo,
  t: Transformacao,
): DocumentoDoStory {
  return alvo.tipo === "fundo"
    ? mudarFundo(documento, t)
    : mudarTransformacao(documento, alvo.id, t);
}

function limitesDo(alvo: Alvo) {
  return alvo.tipo === "fundo" ? LIMITES_DO_FUNDO : LIMITES_DOS_OBJETOS;
}

// ---------------------------------------------------------------------------
// Aparência das camadas (a mesma geometria da composição no canvas)
// ---------------------------------------------------------------------------

function ConteudoDoTexto({ texto, familias }: { texto: Texto; familias: FamiliasDoEditor }) {
  const estilo = fonteDoTexto(texto.fonte);
  const tinta = texto.comFundo ? tintaSobre(texto.cor) : texto.cor;
  const alinhar =
    texto.alinhamento === "esquerda"
      ? "flex-start"
      : texto.alinhamento === "direita"
        ? "flex-end"
        : "center";
  const style: CSSProperties = {
    alignItems: alinhar,
    fontFamily: familias[texto.fonte],
    fontWeight: estilo.peso,
    fontStyle: estilo.italico ? "italic" : "normal",
    fontSize: TAMANHO_DO_TEXTO,
    lineHeight: `${TAMANHO_DO_TEXTO * ALTURA_DA_LINHA}px`,
  };
  return (
    <div className="sc-story-texto" style={style}>
      {linhasDoTexto(texto.texto).map((linha, i) => (
        <div
          key={i}
          className="sc-story-texto__linha"
          style={{
            height: TAMANHO_DO_TEXTO * ALTURA_DA_LINHA,
            padding: `0 ${RECUO_DO_FUNDO * TAMANHO_DO_TEXTO}px`,
            color: tinta,
            background: texto.comFundo && linha.trim() !== "" ? texto.cor : "transparent",
            borderRadius: RAIO_DO_FUNDO * TAMANHO_DO_TEXTO,
          }}
        >
          {linha === "" ? " " : linha}
        </div>
      ))}
    </div>
  );
}

function ConteudoDaEtiqueta({
  etiqueta,
  familias,
}: {
  etiqueta: Etiqueta;
  familias: FamiliasDoEditor;
}) {
  return (
    <div
      className="sc-story-etiqueta"
      style={{
        fontFamily: familias.moderno,
        fontSize: TAMANHO_DA_ETIQUETA,
        height: ALTURA_DA_ETIQUETA * TAMANHO_DA_ETIQUETA,
        lineHeight: `${ALTURA_DA_ETIQUETA * TAMANHO_DA_ETIQUETA}px`,
        padding: `0 ${RECUO_DA_ETIQUETA * TAMANHO_DA_ETIQUETA}px`,
        background: etiqueta.fundo,
        color: etiqueta.tinta,
      }}
    >
      {etiqueta.texto}
    </div>
  );
}

function ConteudoDaCamada({ camada, familias }: { camada: Camada; familias: FamiliasDoEditor }) {
  if (camada.tipo === "texto") return <ConteudoDoTexto texto={camada} familias={familias} />;
  if (camada.tipo === "emoji") {
    return (
      <div
        className="sc-story-emoji"
        style={{ fontSize: TAMANHO_DO_EMOJI, fontFamily: FAMILIA_DO_EMOJI }}
      >
        {camada.emoji}
      </div>
    );
  }
  return <ConteudoDaEtiqueta etiqueta={camada} familias={familias} />;
}

function nomeDaCamada(camada: Camada): string {
  if (camada.tipo === "texto") return `Texto: ${camada.texto.trim().slice(0, 40)}`;
  if (camada.tipo === "emoji") return `Emoji ${camada.emoji}`;
  return `Etiqueta: ${camada.texto}`;
}

// ---------------------------------------------------------------------------
// O palco
// ---------------------------------------------------------------------------

export function PalcoDoStory({
  documento,
  midia,
  familias,
  ferramenta,
  cor,
  espessura,
  selecionado,
  aoSelecionar,
  aoVivo,
  aoFechar,
  aoRegistrar,
  aoEditarTexto,
}: Props) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const desenhoRef = useRef<HTMLCanvasElement>(null);
  const [k, setK] = useState(0.3);
  const [arrastando, setArrastando] = useState(false);
  const [sobreLixeira, setSobreLixeira] = useState(false);
  const [mouseFino, setMouseFino] = useState(false);

  // Os manipuladores leem o estado mais novo por aqui, sem reabrir o gesto.
  const docRef = useRef(documento);
  docRef.current = documento;
  const props = useRef({ ferramenta, cor, espessura, selecionado });
  props.current = { ferramenta, cor, espessura, selecionado };
  const chamadas = useRef({ aoSelecionar, aoVivo, aoFechar, aoRegistrar, aoEditarTexto });
  chamadas.current = { aoSelecionar, aoVivo, aoFechar, aoRegistrar, aoEditarTexto };

  const ponteiros = useRef(new Map<number, Ponto>());
  const gestoRef = useRef<GestoEmCurso | null>(null);
  const tracoRef = useRef<Traco | null>(null);
  const quadroRef = useRef(0);
  const rodaRef = useRef<{ antes: DocumentoDoStory; relogio: number } | null>(null);

  // Tamanho do palco na tela → escala do mundo de 1080 x 1920.
  useEffect(() => {
    const palco = palcoRef.current;
    if (palco === null) return;
    const medir = () => {
      const largura = palco.getBoundingClientRect().width;
      if (largura > 0) setK(largura / LARGURA_DO_PALCO);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(palco);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    setMouseFino(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const redesenhar = useCallback(() => {
    cancelAnimationFrame(quadroRef.current);
    quadroRef.current = requestAnimationFrame(() => {
      const contexto = desenhoRef.current?.getContext("2d");
      if (!contexto) return;
      contexto.clearRect(0, 0, LARGURA_DO_PALCO, ALTURA_DO_PALCO);
      desenharTracos(
        contexto,
        tracoRef.current === null
          ? docRef.current.tracos
          : [...docRef.current.tracos, tracoRef.current],
      );
    });
  }, []);

  useEffect(() => {
    redesenhar();
  }, [documento.tracos, redesenhar]);

  useEffect(() => () => cancelAnimationFrame(quadroRef.current), []);

  const pontosAtuais = () => [...ponteiros.current.values()];

  const aplicar = useCallback((novo: DocumentoDoStory) => {
    docRef.current = novo;
    chamadas.current.aoVivo(novo);
  }, []);

  // ---- ponteiros ----------------------------------------------------------

  function aoApertar(evento: EventoDePonteiro<HTMLDivElement>) {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    const palco = palcoRef.current;
    if (palco === null) return;
    if (ponteiros.current.size >= 2) return;
    const ponto = paraOPalco(
      { x: evento.clientX, y: evento.clientY },
      palco.getBoundingClientRect(),
    );
    palco.setPointerCapture?.(evento.pointerId);
    ponteiros.current.set(evento.pointerId, ponto);
    const alvoDoToque = evento.target as Element;
    const quantos = ponteiros.current.size;

    if (quantos === 1) {
      if (alvoDoToque.closest("[data-alca]") !== null && props.current.selecionado !== null) {
        const alvo: Alvo = { tipo: "camada", id: props.current.selecionado };
        const base = transformacaoDoAlvo(docRef.current, alvo);
        gestoRef.current = {
          alvo,
          gesto: null,
          alca: iniciarGestoDaAlca(base, ponto),
          antes: docRef.current,
          moveu: true,
          inicio: ponto,
          ultimo: ponto,
        };
        setArrastando(false);
        return;
      }
      if (props.current.ferramenta !== "mover") {
        tracoRef.current = novoTraco(
          props.current.cor,
          props.current.espessura,
          props.current.ferramenta === "borracha",
          ponto,
        );
        redesenhar();
        return;
      }
      const id = alvoDoToque.closest("[data-camada]")?.getAttribute("data-camada") ?? null;
      const alvo: Alvo = id === null ? { tipo: "fundo" } : { tipo: "camada", id };
      const antes = docRef.current;
      if (id !== null) {
        chamadas.current.aoSelecionar(id);
        aplicar(trazerParaFrente(docRef.current, id));
      } else {
        chamadas.current.aoSelecionar(null);
      }
      gestoRef.current = {
        alvo,
        gesto: iniciarGesto(transformacaoDoAlvo(docRef.current, alvo), [ponto]),
        alca: null,
        antes,
        moveu: false,
        inicio: ponto,
        ultimo: ponto,
      };
      return;
    }

    // Segundo dedo: vira pinça sobre o mesmo objeto (ou sobre a foto).
    if (tracoRef.current !== null) {
      tracoRef.current = null;
      redesenhar();
    }
    const atual = gestoRef.current;
    if (atual === null) {
      const alvo: Alvo = { tipo: "fundo" };
      gestoRef.current = {
        alvo,
        gesto: iniciarGesto(transformacaoDoAlvo(docRef.current, alvo), pontosAtuais()),
        alca: null,
        antes: docRef.current,
        moveu: true,
        inicio: ponto,
        ultimo: ponto,
      };
      return;
    }
    if (atual.alca !== null) return;
    atual.moveu = true;
    atual.gesto = iniciarGesto(transformacaoDoAlvo(docRef.current, atual.alvo), pontosAtuais());
  }

  function aoMover(evento: EventoDePonteiro<HTMLDivElement>) {
    const palco = palcoRef.current;
    if (palco === null || !ponteiros.current.has(evento.pointerId)) return;
    const ponto = paraOPalco(
      { x: evento.clientX, y: evento.clientY },
      palco.getBoundingClientRect(),
    );
    ponteiros.current.set(evento.pointerId, ponto);

    if (tracoRef.current !== null) {
      tracoRef.current = estenderTraco(tracoRef.current, ponto);
      redesenhar();
      return;
    }
    const curso = gestoRef.current;
    if (curso === null) return;
    curso.ultimo = ponto;
    if (!curso.moveu && Math.hypot(ponto.x - curso.inicio.x, ponto.y - curso.inicio.y) > FOLGA_DO_TOQUE) {
      curso.moveu = true;
    }
    if (!curso.moveu) return;

    const novo =
      curso.alca !== null
        ? avancarGestoDaAlca(curso.alca, ponto)
        : curso.gesto === null
          ? null
          : avancarGesto(curso.gesto, pontosAtuais(), limitesDo(curso.alvo));
    if (novo === null) return;
    aplicar(aplicarNoAlvo(docRef.current, curso.alvo, novo));

    if (curso.alvo.tipo === "camada" && curso.alca === null && ponteiros.current.size === 1) {
      setArrastando(true);
      setSobreLixeira(sobreALixeira(ponto));
    }
  }

  function terminar(evento: EventoDePonteiro<HTMLDivElement>, cancelado: boolean) {
    if (!ponteiros.current.has(evento.pointerId)) return;
    const ultimoPonto = ponteiros.current.get(evento.pointerId)!;
    ponteiros.current.delete(evento.pointerId);
    palcoRef.current?.releasePointerCapture?.(evento.pointerId);
    const restantes = ponteiros.current.size;

    if (tracoRef.current !== null) {
      const traco = tracoRef.current;
      tracoRef.current = null;
      if (!cancelado) chamadas.current.aoRegistrar(adicionarTraco(docRef.current, traco));
      redesenhar();
      return;
    }

    const curso = gestoRef.current;
    if (curso === null) return;

    if (restantes > 0 && curso.alca === null) {
      // Levantou um dos dois dedos: o que ficou continua arrastando, sem salto.
      curso.gesto = iniciarGesto(transformacaoDoAlvo(docRef.current, curso.alvo), pontosAtuais());
      return;
    }

    gestoRef.current = null;
    setArrastando(false);
    setSobreLixeira(false);

    if (curso.alvo.tipo === "camada" && !cancelado) {
      const id = curso.alvo.id;
      if (curso.moveu && curso.alca === null && sobreALixeira(ultimoPonto)) {
        aplicar(removerCamada(docRef.current, id));
        chamadas.current.aoSelecionar(null);
        chamadas.current.aoFechar(curso.antes);
        return;
      }
      if (!curso.moveu) {
        const camada = docRef.current.camadas.find((c) => c.id === id);
        chamadas.current.aoFechar(curso.antes);
        if (camada?.tipo === "texto") chamadas.current.aoEditarTexto(id);
        return;
      }
    }
    chamadas.current.aoFechar(curso.antes);
  }

  // ---- roda do mouse (zoom; Shift gira) -----------------------------------

  useEffect(() => {
    const palco = palcoRef.current;
    if (palco === null) return;
    const aoRodar = (evento: WheelEvent) => {
      if (props.current.ferramenta !== "mover") return;
      evento.preventDefault();
      const id =
        (evento.target as Element).closest("[data-camada]")?.getAttribute("data-camada") ??
        props.current.selecionado;
      const alvo: Alvo = id === null ? { tipo: "fundo" } : { tipo: "camada", id };
      const base = transformacaoDoAlvo(docRef.current, alvo);
      const nova = evento.shiftKey
        ? girarComARoda(base, evento.deltaY || evento.deltaX)
        : escalarComARoda(base, evento.deltaY, limitesDo(alvo));
      if (rodaRef.current === null) {
        rodaRef.current = { antes: docRef.current, relogio: 0 };
      }
      window.clearTimeout(rodaRef.current.relogio);
      aplicar(aplicarNoAlvo(docRef.current, alvo, nova));
      rodaRef.current.relogio = window.setTimeout(() => {
        const antes = rodaRef.current?.antes;
        rodaRef.current = null;
        if (antes !== undefined) chamadas.current.aoFechar(antes);
      }, 350);
    };
    palco.addEventListener("wheel", aoRodar, { passive: false });
    return () => {
      palco.removeEventListener("wheel", aoRodar);
      if (rodaRef.current !== null) window.clearTimeout(rodaRef.current.relogio);
    };
  }, [aplicar]);

  // ---- desenho na tela ----------------------------------------------------

  const { fundo } = documento;
  const escalaBase = escalaBaseDaMidia(midia.largura, midia.altura, fundo.modo);
  const estiloDaMidia: CSSProperties = useMemo(
    () => ({
      width: midia.largura,
      height: midia.altura,
      transform: `translate(${fundo.t.x}px, ${fundo.t.y}px) rotate(${fundo.t.rotacao}rad) scale(${escalaBase * fundo.t.escala}) translate(${-midia.largura / 2}px, ${-midia.altura / 2}px)`,
    }),
    [escalaBase, fundo.t, midia.altura, midia.largura],
  );

  return (
    <div
      ref={palcoRef}
      className="sc-story-palco"
      data-ferramenta={ferramenta}
      data-arrastando={arrastando || undefined}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={(evento) => terminar(evento, false)}
      onPointerCancel={(evento) => terminar(evento, true)}
    >
      <div
        className="sc-story-mundo"
        style={{ width: LARGURA_DO_PALCO, height: ALTURA_DO_PALCO, transform: `scale(${k})` }}
      >
        {midia.tipo === "video" ? (
          <video
            className="sc-story-midia"
            style={estiloDaMidia}
            src={midia.url}
            muted
            loop
            autoPlay
            playsInline
            draggable={false}
            aria-label="Vídeo do story"
          />
        ) : (
          <img
            className="sc-story-midia"
            style={estiloDaMidia}
            src={midia.url}
            alt="Foto do story"
            draggable={false}
          />
        )}
        <canvas
          ref={desenhoRef}
          className="sc-story-desenho"
          width={LARGURA_DO_PALCO}
          height={ALTURA_DO_PALCO}
          aria-hidden="true"
        />
        {documento.camadas.map((camada) => {
          const escolhida = camada.id === selecionado;
          const aparente = k * camada.t.escala;
          const t = camada.t;
          return (
            <div
              key={camada.id}
              className="sc-story-camada"
              data-camada={camada.id}
              data-selecionada={escolhida || undefined}
              data-tipo={camada.tipo}
              role="img"
              aria-label={nomeDaCamada(camada)}
              style={{
                transform: `translate(${t.x}px, ${t.y}px) rotate(${t.rotacao}rad) scale(${t.escala}) translate(-50%, -50%)`,
                outlineWidth: escolhida ? 2 / aparente : 0,
              }}
            >
              <ConteudoDaCamada camada={camada} familias={familias} />
              {escolhida && mouseFino && ferramenta === "mover" ? (
                <span
                  data-alca=""
                  className="sc-story-alca"
                  aria-hidden="true"
                  style={{
                    width: 26 / aparente,
                    height: 26 / aparente,
                    right: -13 / aparente,
                    bottom: -13 / aparente,
                    borderWidth: 2 / aparente,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className="sc-story-lixeira"
        data-visivel={arrastando || undefined}
        data-ativa={sobreLixeira || undefined}
        style={{ height: `${(ALTURA_DA_LIXEIRA / ALTURA_DO_PALCO) * 100}%` }}
        aria-hidden="true"
      >
        <span className="sc-story-lixeira__icone">
          <IconeExcluir />
        </span>
      </div>
    </div>
  );
}

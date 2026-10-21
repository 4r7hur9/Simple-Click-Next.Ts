"use client";

import {
  IconeCamera,
  IconeFechar,
  IconeFlash,
  IconeFlashDesligado,
  IconeGaleria,
  IconeTrocarCamera,
} from "@simpleclick/ui";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import {
  DURACAO_MAXIMA_DO_VIDEO_SEGUNDOS,
  criarBotaoDeCaptura,
  explicarProblemaDaCamera,
  fotoDoVisor,
  iniciarGravacao,
  type Gravador,
} from "./captura.ts";
import { formatarDuracao } from "../../lib/envio-de-midia.ts";
import { useCamera } from "./useCamera.ts";

export interface CapturaFeita {
  readonly tipo: "imagem" | "video";
  readonly arquivo: Blob;
  readonly largura: number;
  readonly altura: number;
  readonly duracaoSegundos: number | null;
}

interface Props {
  /** Se a câmera deve estar ligada (some ao ir para a edição). */
  readonly ativa: boolean;
  readonly tiposAceitos: string;
  readonly maximoDoVideoSegundos?: number;
  readonly ocupada: boolean;
  readonly aviso: string | null;
  readonly aoEscolherArquivo: (arquivo: File) => void;
  readonly aoCapturar: (captura: CapturaFeita) => void;
  readonly aoFechar: () => void;
}

const RAIO_DO_ANEL = 46;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO_DO_ANEL;

/** Pede o microfone só na hora de gravar; sem ele o vídeo sai mudo. */
async function juntarMicrofone(fluxo: MediaStream): Promise<MediaStream> {
  try {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaStream([...fluxo.getVideoTracks(), ...audio.getAudioTracks()]);
  } catch {
    return fluxo;
  }
}

export function TelaDeCaptura({
  ativa,
  tiposAceitos,
  maximoDoVideoSegundos = DURACAO_MAXIMA_DO_VIDEO_SEGUNDOS,
  ocupada,
  aviso,
  aoEscolherArquivo,
  aoCapturar,
  aoFechar,
}: Props) {
  const camera = useCamera(ativa);
  const visorRef = useRef<HTMLVideoElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const [gravando, setGravando] = useState(false);
  const [fracao, setFracao] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const gravadorRef = useRef<Gravador | null>(null);
  const pendenteRef = useRef(false);
  const aoCapturarRef = useRef(aoCapturar);
  aoCapturarRef.current = aoCapturar;
  const fluxoRef = useRef<MediaStream | null>(null);
  fluxoRef.current = camera.fluxo;

  useEffect(() => {
    const visor = visorRef.current;
    if (visor === null) return;
    visor.srcObject = camera.fluxo;
    if (camera.fluxo !== null) void visor.play().catch(() => {});
  }, [camera.fluxo]);

  const botao = useMemo(
    () =>
      criarBotaoDeCaptura({
        aoTirarFoto: () => {
          const visor = visorRef.current;
          if (visor === null || fluxoRef.current === null) return;
          fotoDoVisor(visor)
            .then((foto) =>
              aoCapturarRef.current({
                tipo: "imagem",
                arquivo: foto.arquivo,
                largura: foto.largura,
                altura: foto.altura,
                duracaoSegundos: null,
              }),
            )
            .catch(() => setFalha("Não foi possível tirar a foto. Tente de novo."));
        },
        aoComecarVideo: () => {
          const visor = visorRef.current;
          const fluxo = fluxoRef.current;
          if (visor === null || fluxo === null) return;
          pendenteRef.current = true;
          void juntarMicrofone(fluxo).then((comSom) => {
            // Soltou o botão enquanto o microfone pedia permissão: sem vídeo.
            if (!pendenteRef.current) return;
            pendenteRef.current = false;
            const largura = visor.videoWidth;
            const altura = visor.videoHeight;
            setGravando(true);
            setFracao(0);
            gravadorRef.current = iniciarGravacao({
              fluxo: comSom,
              maximoSegundos: maximoDoVideoSegundos,
              aoProgredir: setFracao,
              aoTerminar: (gravacao) => {
                gravadorRef.current = null;
                setGravando(false);
                if (comSom !== fluxo) comSom.getAudioTracks().forEach((f) => f.stop());
                if (gravacao.duracaoSegundos < 0.5) return;
                aoCapturarRef.current({
                  tipo: "video",
                  arquivo: gravacao.arquivo,
                  largura,
                  altura,
                  duracaoSegundos: gravacao.duracaoSegundos,
                });
              },
              aoFalhar: () => {
                gravadorRef.current = null;
                setGravando(false);
                setFalha("Não foi possível gravar o vídeo neste aparelho.");
              },
            });
          });
        },
        aoTerminarVideo: () => {
          pendenteRef.current = false;
          gravadorRef.current?.parar();
        },
      }),
    [maximoDoVideoSegundos],
  );

  useEffect(
    () => () => {
      botao.encerrar();
      gravadorRef.current?.cancelar();
    },
    [botao],
  );

  function soltarArquivo(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastando(false);
    const arquivo = evento.dataTransfer.files[0];
    if (arquivo !== undefined && !ocupada) aoEscolherArquivo(arquivo);
  }

  const problema = camera.estado.tipo === "problema" ? camera.estado.problema : null;
  const explicacao = problema === null ? null : explicarProblemaDaCamera(problema);
  const pronta = camera.estado.tipo === "pronta";
  const decorrido = fracao * maximoDoVideoSegundos;

  return (
    <div
      className="sc-story-captura"
      data-arrastando={arrastando || undefined}
      onDragOver={(evento) => {
        evento.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={soltarArquivo}
    >
      <div className="sc-story-caixa">
      <div className="sc-story-visor" data-espelhado={camera.lado === "user" || undefined}>
        <video
          ref={visorRef}
          className="sc-story-visor__video"
          muted
          playsInline
          autoPlay
          aria-label="Visor da câmera"
          hidden={!pronta}
        />
        {camera.estado.tipo === "iniciando" ? (
          <div className="sc-story-visor__aviso" role="status">
            <p className="sc-story-visor__titulo">Ligando a câmera…</p>
            <p>
              Se o navegador perguntar, toque em <strong>Permitir</strong> para usar a
              câmera.
            </p>
          </div>
        ) : null}
        {explicacao !== null ? (
          <div className="sc-story-visor__aviso" role="alert">
            <p className="sc-story-visor__titulo">{explicacao.titulo}</p>
            <p>{explicacao.texto}</p>
            <div className="sc-story-visor__acoes">
              <button
                type="button"
                className="sc-story-botao sc-story-botao--destaque"
                onClick={() => campoRef.current?.click()}
                disabled={ocupada}
              >
                <IconeGaleria aria-hidden="true" />
                Escolher da galeria
              </button>
              {problema === "negada" || problema === "ocupada" || problema === "falha" ? (
                <button
                  type="button"
                  className="sc-story-botao"
                  onClick={camera.tentarDeNovo}
                >
                  Tentar de novo
                </button>
              ) : null}
            </div>
            <p className="sc-story-visor__dica">
              Você também pode arrastar uma foto ou um vídeo até aqui.
            </p>
          </div>
        ) : null}
      </div>

      <div className="sc-story-captura__topo">
        <button
          type="button"
          className="sc-story-icone"
          aria-label="Fechar e voltar para a lista de stories"
          onClick={aoFechar}
        >
          <IconeFechar aria-hidden="true" />
        </button>
        {gravando ? (
          <span className="sc-story-gravando" role="timer" aria-label="Gravando">
            <span aria-hidden="true" className="sc-story-gravando__ponto" />
            {formatarDuracao(decorrido)}
          </span>
        ) : null}
        {camera.temTocha && pronta ? (
          <button
            type="button"
            className="sc-story-icone"
            aria-label={camera.tochaLigada ? "Desligar o flash" : "Ligar o flash"}
            aria-pressed={camera.tochaLigada}
            onClick={() => void camera.alternarTocha()}
          >
            {camera.tochaLigada ? (
              <IconeFlash aria-hidden="true" />
            ) : (
              <IconeFlashDesligado aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="sc-story-icone sc-story-icone--vazio" aria-hidden="true" />
        )}
      </div>

      <div className="sc-story-captura__base">
        {aviso !== null || falha !== null ? (
          <p className="sc-story-captura__erro" role="alert">
            {aviso ?? falha}
          </p>
        ) : pronta && !gravando ? (
          <p className="sc-story-captura__dica">
            Toque para foto · segure para gravar até {maximoDoVideoSegundos} s
          </p>
        ) : null}
        <div className="sc-story-captura__controles">
          <button
            type="button"
            className="sc-story-galeria"
            onClick={() => campoRef.current?.click()}
            disabled={ocupada || gravando}
            aria-label="Escolher foto ou vídeo da galeria"
          >
            <IconeGaleria aria-hidden="true" />
            <span>{ocupada ? "Abrindo…" : "Galeria"}</span>
          </button>

          <button
            type="button"
            className="sc-story-disparo"
            data-gravando={gravando || undefined}
            aria-label={
              gravando ? "Soltar para parar a gravação" : "Tirar foto (segure para gravar vídeo)"
            }
            disabled={!pronta || ocupada}
            onPointerDown={(evento) => {
              if (evento.pointerType === "mouse" && evento.button !== 0) return;
              evento.currentTarget.setPointerCapture?.(evento.pointerId);
              setFalha(null);
              botao.apertou();
            }}
            onPointerUp={() => botao.soltou()}
            onPointerCancel={() => botao.cancelou()}
            onContextMenu={(evento) => evento.preventDefault()}
            onClick={(evento) => {
              // Teclado (Enter/Espaço): clique sem ponteiro = foto.
              if (evento.detail === 0) {
                botao.apertou();
                botao.soltou();
              }
            }}
          >
            <svg viewBox="0 0 100 100" aria-hidden="true" className="sc-story-disparo__anel">
              <circle cx="50" cy="50" r={RAIO_DO_ANEL} className="sc-story-disparo__trilha" />
              <circle
                cx="50"
                cy="50"
                r={RAIO_DO_ANEL}
                className="sc-story-disparo__progresso"
                strokeDasharray={CIRCUNFERENCIA}
                strokeDashoffset={CIRCUNFERENCIA * (1 - fracao)}
              />
            </svg>
            <span className="sc-story-disparo__miolo" aria-hidden="true" />
          </button>

          {camera.podeTrocar && pronta && !gravando ? (
            <button
              type="button"
              className="sc-story-galeria"
              onClick={camera.trocarLado}
              aria-label={
                camera.lado === "environment"
                  ? "Trocar para a câmera da frente"
                  : "Trocar para a câmera de trás"
              }
            >
              <IconeTrocarCamera aria-hidden="true" />
              <span>Virar</span>
            </button>
          ) : (
            <span className="sc-story-galeria sc-story-galeria--vazio" aria-hidden="true">
              <IconeCamera aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      </div>

      <input
        ref={campoRef}
        className="sc-story-arquivo"
        type="file"
        accept={tiposAceitos}
        tabIndex={-1}
        aria-label="Foto ou vídeo da galeria"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          evento.target.value = "";
          if (arquivo !== undefined) aoEscolherArquivo(arquivo);
        }}
      />
      {arrastando ? (
        <div className="sc-story-solte" aria-hidden="true">
          Solte a foto ou o vídeo aqui
        </div>
      ) : null}
    </div>
  );
}

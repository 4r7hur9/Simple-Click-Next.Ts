/**
 * Grava um vídeo com o desenho, os textos e os adesivos POR CIMA (card #84).
 *
 * Como não há servidor de vídeo, a composição acontece no navegador, em tempo
 * real: o vídeo toca escondido, cada quadro é pintado num canvas 720 x 1280
 * junto com a sobreposição e o `MediaRecorder` grava o canvas (com o som do
 * vídeo, quando o navegador deixa). Por isso leva o tempo do próprio vídeo.
 * Limitação: aba em segundo plano pausa a pintura — a tela avisa para
 * deixar a aba aberta.
 */
import {
  desenharQuadro,
  renderizarSobreposicao,
  type CriarTela,
  type FamiliasDoEditor,
  type MidiaDesenhavel,
} from "./composicao.ts";
import { escolherTipoDeGravacao, tipoSemCodec } from "./captura.ts";
import type { DocumentoDoStory } from "./documento.ts";
import { ALTURA_DO_PALCO, LARGURA_DO_PALCO } from "./geometria.ts";

/** O vídeo composto sai menor que 1080 x 1920 para o navegador dar conta em tempo real. */
export const ESCALA_DO_VIDEO = 2 / 3;
const LARGURA_DE_SAIDA = Math.round(LARGURA_DO_PALCO * ESCALA_DO_VIDEO);
const ALTURA_DE_SAIDA = Math.round(ALTURA_DO_PALCO * ESCALA_DO_VIDEO);

export function composicaoDeVideoSuportada(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return false;
  }
  const tela = document.createElement("canvas");
  return (
    typeof tela.captureStream === "function" &&
    escolherTipoDeGravacao((tipo) => MediaRecorder.isTypeSupported(tipo)) !==
      undefined
  );
}

export interface VideoComposto {
  readonly arquivo: Blob;
  readonly duracaoSegundos: number;
}

export interface OpcoesDaComposicaoDeVideo {
  readonly documento: DocumentoDoStory;
  readonly urlDoVideo: string;
  readonly familias: FamiliasDoEditor;
  readonly criarTela: CriarTela;
  readonly aoProgredir: (fracao: number) => void;
  readonly sinal?: AbortSignal;
}

/** O áudio do vídeo, sem tocar no alto-falante (Web Audio → destino de fluxo). */
function audioDoVideo(
  video: HTMLVideoElement,
): { faixas: MediaStreamTrack[]; fechar: () => void } {
  try {
    const Contexto =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Contexto === undefined) return { faixas: [], fechar: () => {} };
    const contexto = new Contexto();
    const origem = contexto.createMediaElementSource(video);
    const destino = contexto.createMediaStreamDestination();
    origem.connect(destino);
    return {
      faixas: destino.stream.getAudioTracks(),
      fechar: () => void contexto.close().catch(() => {}),
    };
  } catch {
    return { faixas: [], fechar: () => {} };
  }
}

export function comporVideo(
  opcoes: OpcoesDaComposicaoDeVideo,
): Promise<VideoComposto> {
  return new Promise((resolver, rejeitar) => {
    const tipo = escolherTipoDeGravacao((candidato) =>
      MediaRecorder.isTypeSupported(candidato),
    );
    const video = document.createElement("video");
    video.src = opcoes.urlDoVideo;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const sobreposicao = renderizarSobreposicao(
      opcoes.documento,
      opcoes.familias,
      opcoes.criarTela,
    );
    const saida = opcoes.criarTela(LARGURA_DE_SAIDA, ALTURA_DE_SAIDA);
    const contexto = saida.getContext("2d");
    if (contexto === null) {
      rejeitar(new Error("Este navegador não consegue montar o vídeo."));
      return;
    }

    let terminou = false;
    let gravador: MediaRecorder | null = null;
    let fecharAudio: () => void = () => {};
    let quadro = 0;
    const pedacos: Blob[] = [];

    const encerrar = (erro?: unknown) => {
      if (terminou) return;
      terminou = true;
      cancelAnimationFrame(quadro);
      video.pause();
      fecharAudio();
      if (erro !== undefined) {
        if (gravador !== null && gravador.state !== "inactive") {
          gravador.onstop = null;
          gravador.stop();
        }
        rejeitar(erro instanceof Error ? erro : new Error("Falha ao montar o vídeo."));
      }
    };

    opcoes.sinal?.addEventListener("abort", () =>
      encerrar(new Error("cancelado")),
    );
    video.onerror = () => encerrar(new Error("Não foi possível ler o vídeo."));

    video.onloadedmetadata = () => {
      const midia: MidiaDesenhavel = {
        origem: video,
        largura: video.videoWidth,
        altura: video.videoHeight,
      };
      const pintar = () => {
        desenharQuadro(contexto, opcoes.documento, { midia, sobreposicao }, ESCALA_DO_VIDEO);
        const duracao = Number.isFinite(video.duration) ? video.duration : 0;
        if (duracao > 0) opcoes.aoProgredir(Math.min(1, video.currentTime / duracao));
        if (!terminou && !video.ended) quadro = requestAnimationFrame(pintar);
      };

      const fluxo = saida.captureStream(30);
      const audio = audioDoVideo(video);
      fecharAudio = audio.fechar;
      audio.faixas.forEach((faixa) => fluxo.addTrack(faixa));

      try {
        gravador = new MediaRecorder(fluxo, {
          ...(tipo === undefined ? {} : { mimeType: tipo }),
          videoBitsPerSecond: 3_500_000,
        });
      } catch (erro) {
        encerrar(erro);
        return;
      }
      const ativo = gravador;
      ativo.ondataavailable = (evento) => {
        if (evento.data.size > 0) pedacos.push(evento.data);
      };
      ativo.onerror = () => encerrar(new Error("Falha ao gravar o vídeo."));
      ativo.onstop = () => {
        const duracaoSegundos = Number.isFinite(video.duration) ? video.duration : 0;
        resolver({
          arquivo: new Blob(pedacos, {
            type: tipoSemCodec(ativo.mimeType || tipo || "video/webm"),
          }),
          duracaoSegundos,
        });
      };
      video.onended = () => {
        pintar();
        encerrar();
        if (ativo.state !== "inactive") ativo.stop();
      };

      ativo.start(250);
      pintar();
      void video.play().catch((erro: unknown) => encerrar(erro));
    };
  });
}

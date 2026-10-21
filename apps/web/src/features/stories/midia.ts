/**
 * A mídia de fundo do Story (card #84): foto ou vídeo, vinda da câmera ou da
 * galeria. Confere o arquivo ANTES de abrir o editor (tamanho, tipo e duração),
 * com as mesmas regras e frases do envio antigo — a API confere de novo.
 */
import type { LimitesDeMidia } from "@simpleclick/contracts";

import {
  formatarDuracao,
  formatarTamanho,
  type DadosDoVideo,
} from "../../lib/envio-de-midia.ts";

export interface MidiaDoStory {
  readonly tipo: "imagem" | "video";
  /** Endereço local (`blob:`) para mostrar no editor. */
  readonly url: string;
  readonly arquivo: Blob;
  readonly largura: number;
  readonly altura: number;
  readonly duracaoSegundos: number | null;
  readonly origem: "camera" | "galeria";
}

export const TIPOS_DE_FOTO_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

export function ehVideo(arquivo: Pick<File, "type" | "name">): boolean {
  return arquivo.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(arquivo.name);
}

export function ehFoto(arquivo: Pick<File, "type" | "name">): boolean {
  return (
    arquivo.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(arquivo.name)
  );
}

export type ResultadoDaConferencia =
  | { readonly ok: true; readonly tipo: "imagem" | "video" }
  | { readonly ok: false; readonly motivo: string };

/** O que dá para saber antes de abrir o arquivo (tipo e tamanho). */
export function conferirArquivoEscolhido(
  arquivo: Pick<File, "type" | "name" | "size">,
  limites: LimitesDeMidia,
): ResultadoDaConferencia {
  if (ehVideo(arquivo)) {
    if (arquivo.size > limites.videoTamanhoMaximoBytes) {
      return {
        ok: false,
        motivo: `Este vídeo tem ${formatarTamanho(arquivo.size)}. O máximo é ${formatarTamanho(limites.videoTamanhoMaximoBytes)}.`,
      };
    }
    return { ok: true, tipo: "video" };
  }
  if (!ehFoto(arquivo)) {
    return {
      ok: false,
      motivo: "Escolha uma foto (JPEG, PNG ou WebP) ou um vídeo (MP4 ou WebM).",
    };
  }
  if (arquivo.size > limites.imagemDoStoryTamanhoMaximoBytes) {
    return {
      ok: false,
      motivo: `Esta foto tem ${formatarTamanho(arquivo.size)}. O máximo é ${formatarTamanho(limites.imagemDoStoryTamanhoMaximoBytes)}.`,
    };
  }
  return { ok: true, tipo: "imagem" };
}

/** Depois de ler o vídeo: ele passa do limite de duração? */
export function conferirDuracaoDoVideo(
  dados: Pick<DadosDoVideo, "duracaoSegundos">,
  limites: LimitesDeMidia,
): string | null {
  if (
    dados.duracaoSegundos !== null &&
    dados.duracaoSegundos > limites.videoDuracaoMaximaSegundos + 0.5
  ) {
    return `Este vídeo tem ${formatarDuracao(dados.duracaoSegundos)}. O story aceita até ${formatarDuracao(limites.videoDuracaoMaximaSegundos)}.`;
  }
  return null;
}

export function lerTamanhoDaImagem(
  endereco: string,
): Promise<{ largura: number; altura: number } | null> {
  return new Promise((pronto) => {
    if (endereco === "" || typeof Image === "undefined") {
      pronto(null);
      return;
    }
    const imagem = new Image();
    imagem.onload = () =>
      pronto({ largura: imagem.naturalWidth, altura: imagem.naturalHeight });
    imagem.onerror = () => pronto(null);
    imagem.src = endereco;
  });
}

/** Carrega a imagem (já decodificada) para desenhar no canvas. */
export function carregarImagem(endereco: string): Promise<HTMLImageElement> {
  return new Promise((pronto, falha) => {
    const imagem = new Image();
    imagem.onload = () => pronto(imagem);
    imagem.onerror = () => falha(new Error("Não foi possível abrir a imagem."));
    imagem.src = endereco;
  });
}

/**
 * A logo e a capa que o dono envia, conferidas pelos BYTES (AC-916, AC-918).
 *
 * O NOME DO ARQUIVO E O TIPO DECLARADO NÃO PROVAM NADA: "logo.png" pode ser um
 * PDF renomeado, e o navegador declara o tipo pela extensão. O que decide é a
 * assinatura no começo do arquivo — é ela que o navegador de quem abre a
 * vitrine vai usar para desenhar a imagem.
 *
 * A RECUSA ENSINA. Ela diz os formatos aceitos, o tamanho máximo e a proporção
 * recomendada daquela imagem — a logo é quadrada, a capa é uma faixa larga —,
 * porque "arquivo inválido" deixa o dono tentando de novo com o mesmo arquivo.
 * E recusar não toca em nada: a imagem anterior continua no ar.
 *
 * As regras (formatos, tamanho, proporção) moram no contrato, porque a tela
 * confere com as mesmas antes de enviar. A mesma conferência de assinatura
 * existe no catálogo (`catalog/imagens`); a tabela de fronteiras não deixa um
 * módulo importar o outro, e quando as duas precisarem da mesma regra ela
 * sobe para `packages/core`.
 */
import {
  REGRAS_DAS_IMAGENS_DA_LOJA,
  type TipoDeImagemDaLoja,
} from "@simpleclick/contracts";

/** Formatos que todo navegador desenha, e que a vitrine aceita. */
export type FormatoDeImagem = "jpeg" | "png" | "webp";

/** O tipo de conteúdo de cada formato, como o serviço de mídia o recebe. */
export const TIPO_DE_CONTEUDO: Readonly<Record<FormatoDeImagem, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A orientação que acompanha toda recusa. */
export interface OrientacaoDaImagem {
  readonly formatosAceitos: readonly string[];
  readonly tamanhoMaximoBytes: number;
  readonly tamanhoMaximo: string;
  readonly proporcaoRecomendada: string;
}

export type ConferenciaDaImagem =
  | {
      readonly ok: true;
      readonly formato: FormatoDeImagem;
      readonly tamanhoBytes: number;
    }
  | {
      readonly ok: false;
      readonly motivo: "VAZIO" | "NAO_E_IMAGEM" | "GRANDE_DEMAIS";
      readonly mensagem: string;
      readonly orientacao: OrientacaoDaImagem;
    };

/** A orientação de um tipo de imagem, pronta para a tela. */
export function orientacaoDaImagem(
  tipo: TipoDeImagemDaLoja,
): OrientacaoDaImagem {
  const regra = REGRAS_DAS_IMAGENS_DA_LOJA[tipo];
  return {
    formatosAceitos: regra.formatosAceitos,
    tamanhoMaximoBytes: regra.tamanhoMaximoBytes,
    tamanhoMaximo: regra.tamanhoMaximo,
    proporcaoRecomendada: regra.proporcaoRecomendada,
  };
}

function temAssinatura(
  bytes: Uint8Array,
  assinatura: readonly number[],
  inicio = 0,
): boolean {
  return assinatura.every((valor, indice) => bytes[inicio + indice] === valor);
}

function textoAscii(bytes: Uint8Array, inicio: number, tamanho: number) {
  return String.fromCharCode(...bytes.slice(inicio, inicio + tamanho));
}

/** O formato pela assinatura do arquivo, ou nulo se não é imagem aceita. */
export function formatoPelosBytes(bytes: Uint8Array): FormatoDeImagem | null {
  if (temAssinatura(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (temAssinatura(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    textoAscii(bytes, 0, 4) === "RIFF" &&
    textoAscii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** A frase da recusa, com tudo que o dono precisa para acertar. */
export function fraseDaRecusa(
  tipo: TipoDeImagemDaLoja,
  problema: string,
): string {
  const orientacao = orientacaoDaImagem(tipo);
  const nome = tipo === "logo" ? "A logo" : "A capa";
  return `${problema} ${nome} aceita ${orientacao.formatosAceitos.join(", ")} de até ${orientacao.tamanhoMaximo}, na proporção ${orientacao.proporcaoRecomendada}. A imagem anterior continua no ar.`;
}

/** Confere a imagem enviada pelo conteúdo, pelo tamanho e pelo tipo dela. */
export function conferirImagemDaLoja(
  tipo: TipoDeImagemDaLoja,
  bytes: Uint8Array,
): ConferenciaDaImagem {
  const orientacao = orientacaoDaImagem(tipo);
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      motivo: "VAZIO",
      mensagem: fraseDaRecusa(tipo, "O arquivo chegou vazio."),
      orientacao,
    };
  }
  if (bytes.byteLength > orientacao.tamanhoMaximoBytes) {
    return {
      ok: false,
      motivo: "GRANDE_DEMAIS",
      mensagem: fraseDaRecusa(tipo, "O arquivo passa do tamanho permitido."),
      orientacao,
    };
  }
  const formato = formatoPelosBytes(bytes);
  if (formato === null) {
    return {
      ok: false,
      motivo: "NAO_E_IMAGEM",
      mensagem: fraseDaRecusa(
        tipo,
        "O arquivo enviado não é uma imagem aceita.",
      ),
      orientacao,
    };
  }
  return { ok: true, formato, tamanhoBytes: bytes.byteLength };
}

/**
 * Onde a foto do produto fica hospedada (T-303, decisão D2: Cloudinary).
 *
 * A API recebe os bytes, confere o CONTEÚDO (`conferirConteudoDaImagem`) e só
 * então entrega o arquivo à hospedagem. A hospedagem devolve o endereço
 * público, e é ele que vai para `product_images`. Quem serve cada foto no
 * tamanho do aparelho é o carregador de imagens do site, que pede ao CDN a
 * largura certa (AC-306).
 *
 * A HOSPEDAGEM É UMA PORTA, e não uma chamada solta: a prova troca por uma
 * hospedagem de mentira, e o ambiente sem credencial de mídia recusa com erro
 * próprio (a rota responde 503) em vez de fingir que guardou. As credenciais
 * vêm do ambiente, nunca do código (P-002).
 */
import { createHash } from "node:crypto";

import {
  armazenamentoDeMidiaDoAmbiente,
  credenciais as credenciaisDoCloudinary,
  usaMidiaLocal,
} from "../../core/armazenamento-de-midia.ts";

import type { FormatoDaImagem } from "./imagens.usecase.ts";

export interface PedidoDeHospedagem {
  readonly bytes: Uint8Array;
  readonly formato: FormatoDaImagem;
  readonly lojaId: string;
  readonly produtoId: string;
}

export interface ImagemHospedada {
  readonly url: string;
  readonly largura: number | null;
  readonly altura: number | null;
}

export type HospedarImagem = (
  pedido: PedidoDeHospedagem,
) => Promise<ImagemHospedada>;

/** O ambiente não tem credencial de mídia: não há onde guardar a foto. */
export class ErroDeHospedagemIndisponivel extends Error {
  constructor() {
    super("A hospedagem de imagens não está configurada neste ambiente.");
    this.name = "ErroDeHospedagemIndisponivel";
  }
}

/** A hospedagem recebeu e recusou o arquivo. */
export class ErroDeHospedagemRecusada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeHospedagemRecusada";
  }
}

type Ambiente = Readonly<Record<string, string | undefined>>;
type Enviar = (
  endereco: string,
  pedido: { method: string; body: FormData },
) => Promise<Response>;

interface CredencialDeMidia {
  readonly nuvem: string;
  readonly chave: string;
  readonly segredo: string;
}

/** As duas formas de configurar: `CLOUDINARY_URL` ou as três variáveis soltas. */
function credencialDoAmbiente(ambiente: Ambiente): CredencialDeMidia | null {
  return credenciaisDoCloudinary(ambiente);
}

/**
 * Assinatura do envio: os parâmetros assinados, em ordem alfabética, seguidos
 * do segredo, em SHA-1 — é o formato que a hospedagem confere. O segredo não
 * trafega; só a assinatura.
 */
export function assinaturaDoEnvio(
  parametros: Readonly<Record<string, string>>,
  segredo: string,
): string {
  const texto = Object.keys(parametros)
    .sort()
    .map((nome) => `${nome}=${parametros[nome]}`)
    .join("&");
  return createHash("sha1").update(`${texto}${segredo}`).digest("hex");
}

/**
 * A hospedagem no Cloudinary, com envio assinado. Uma pasta por loja: é o que
 * permite medir o consumo de cada uma da cota gratuita (ASM-303).
 */
export function hospedagemNoCloudinary(
  ambiente: Ambiente = process.env,
  enviar: Enviar = (endereco, pedido) => fetch(endereco, pedido),
  agora: () => Date = () => new Date(),
): HospedarImagem {
  return async (pedido) => {
    const credencial = credencialDoAmbiente(ambiente);
    if (credencial === null) throw new ErroDeHospedagemIndisponivel();

    const assinados = {
      folder: `simpleclick/${pedido.lojaId}`,
      timestamp: String(Math.floor(agora().getTime() / 1000)),
    };
    const formulario = new FormData();
    // Cópia em memória própria: `Blob` não aceita a visão de um buffer que
    // pode ser compartilhado entre linhas de execução.
    formulario.append(
      "file",
      new Blob([Uint8Array.from(pedido.bytes)], {
        type: `image/${pedido.formato}`,
      }),
      `${pedido.produtoId}.${pedido.formato}`,
    );
    formulario.append("api_key", credencial.chave);
    formulario.append("folder", assinados.folder);
    formulario.append("timestamp", assinados.timestamp);
    formulario.append(
      "signature",
      assinaturaDoEnvio(assinados, credencial.segredo),
    );

    const resposta = await enviar(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(credencial.nuvem)}/image/upload`,
      { method: "POST", body: formulario },
    );
    const corpo = (await resposta.json().catch(() => ({}))) as {
      secure_url?: string;
      width?: number;
      height?: number;
      error?: { message?: string };
    };
    if (!resposta.ok || typeof corpo.secure_url !== "string") {
      throw new ErroDeHospedagemRecusada(
        corpo.error?.message ?? "A hospedagem recusou a imagem.",
      );
    }
    return {
      url: corpo.secure_url,
      largura: Number.isInteger(corpo.width) ? (corpo.width as number) : null,
      altura: Number.isInteger(corpo.height) ? (corpo.height as number) : null,
    };
  };
}

const EXTENSAO_DO_FORMATO: Readonly<Record<FormatoDaImagem, string>> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

/**
 * A hospedagem que o ambiente oferece: o Cloudinary quando há credencial; fora
 * de produção sem credencial, o disco da API (o mesmo dos stories), para a foto
 * do produto poder ser enviada e trocada em desenvolvimento. Em produção sem
 * credencial, a hospedagem do Cloudinary responde "indisponível" (503).
 */
export function hospedagemDoAmbiente(
  ambiente: Ambiente = process.env,
): HospedarImagem {
  const naNuvem = hospedagemNoCloudinary(ambiente);
  if (credencialDoAmbiente(ambiente) !== null || !usaMidiaLocal(ambiente)) {
    return naNuvem;
  }
  return async (pedido) => {
    const guardada = await armazenamentoDeMidiaDoAmbiente(ambiente).guardar({
      lojaId: pedido.lojaId,
      pasta: "fotos",
      tipo: "imagem",
      bytes: pedido.bytes,
      tipoDeConteudo: `image/${pedido.formato}`,
      extensao: EXTENSAO_DO_FORMATO[pedido.formato],
    });
    return { url: guardada.url, largura: null, altura: null };
  };
}

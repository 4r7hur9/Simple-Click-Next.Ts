/**
 * Onde moram os vídeos dos produtos e as fotos e vídeos dos stories (card #46).
 *
 * É UMA PORTA, como `core/midia.ts` (logo e capa) e a hospedagem das fotos do
 * catálogo — com uma diferença que o story exige: além de GUARDAR, ela APAGA.
 * O story vence em 24 horas e não pode ficar guardado; o vídeo do produto que
 * o dono tira da galeria também sai. Por isso cada arquivo guardado volta com
 * uma CHAVE, que vai para o banco junto do endereço.
 *
 * Três lugares:
 *
 *   cloudinary  produção. Credencial do ambiente: `CLOUDINARY_URL`
 *               (cloudinary://<chave>:<segredo>@<nuvem>) ou as três
 *               `CLOUDINARY_CLOUD_NAME`/`_API_KEY`/`_API_SECRET`. Vídeo vai
 *               como `resource_type=video`, e a capa sai pronta trocando a
 *               extensão por `.jpg` (o serviço gera o quadro).
 *   disco       só fora de produção: grava em `MIDIA_LOCAL_DIR` (padrão:
 *               `apps/api/.midia-local`) e a própria API serve em
 *               `/v1/midia/arquivos/...` (com suporte a Range, que o
 *               `<video>` usa). Endereço público: `MIDIA_URL_PUBLICA` ou
 *               `http://localhost:<PORT>`.
 *   memória     a prova.
 *
 * Em produção sem credencial, guardar responde indisponível (a rota diz 503).
 */

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import express, { Router, type NextFunction, type Response } from "express";

import {
  armazenamentoNoCloudinary,
  assinarEnvio,
  credenciaisDoCloudinary,
  ErroDeArmazenamentoIndisponivel,
  type ArmazenamentoDeImagens,
} from "./midia.ts";

/**
 * "produtos" e "stories": vídeos e fotos de story. "fotos": as fotos do
 * catálogo. "loja": logo, capa, fundo e topo.
 */
export type PastaDaMidia = "produtos" | "stories" | "fotos" | "loja";

export interface MidiaParaGuardar {
  readonly lojaId: string;
  readonly pasta: PastaDaMidia;
  readonly tipo: "imagem" | "video";
  readonly bytes: Uint8Array;
  /** Conferido pelos bytes: "video/mp4", "image/jpeg"… */
  readonly tipoDeConteudo: string;
  /** "mp4", "webm", "jpg", "png", "webp". */
  readonly extensao: string;
}

export interface MidiaGuardada {
  readonly url: string;
  /** Com ela o arquivo é apagado. Começa pelo lugar: "cloudinary:", "disco:"… */
  readonly chave: string;
  /** Capa gerada pelo serviço (vídeo), quando ele gera. */
  readonly capaUrl: string | null;
  readonly largura: number | null;
  readonly altura: number | null;
  /** O serviço também mede a duração do vídeo; nula quando não mede. */
  readonly duracaoMs: number | null;
}

export interface ArmazenamentoDeMidia {
  readonly lugar: "cloudinary" | "disco" | "memoria" | "indisponivel";
  guardar(midia: MidiaParaGuardar): Promise<MidiaGuardada>;
  /** Apagar o que já não existe não é erro. */
  apagar(chave: string): Promise<void>;
}

/** Não há onde guardar mídia neste ambiente. */
export class ErroDeMidiaIndisponivel extends Error {
  constructor() {
    super(
      "O envio de vídeo e de stories não está disponível neste ambiente: configure CLOUDINARY_URL.",
    );
    this.name = "ErroDeMidiaIndisponivel";
  }
}

/** O serviço de mídia recusou o arquivo. */
export class ErroDeMidiaRecusada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeMidiaRecusada";
  }
}

type Fonte = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------------------
// Cloudinary
// ---------------------------------------------------------------------------

export function credenciais(fonte: Fonte) {
  const daUrl = credenciaisDoCloudinary(fonte["CLOUDINARY_URL"]);
  if (daUrl !== null) return daUrl;
  const nuvem = fonte["CLOUDINARY_CLOUD_NAME"]?.trim();
  const chave = fonte["CLOUDINARY_API_KEY"]?.trim();
  const segredo = fonte["CLOUDINARY_API_SECRET"]?.trim();
  if (!nuvem || !chave || !segredo) return null;
  return { nuvem, chave, segredo };
}

export function midiaNoCloudinary(
  credencial: { nuvem: string; chave: string; segredo: string },
  buscar: typeof fetch = fetch,
  agora: () => Date = () => new Date(),
): ArmazenamentoDeMidia {
  const base = `https://api.cloudinary.com/v1_1/${encodeURIComponent(credencial.nuvem)}`;
  return {
    lugar: "cloudinary",
    async guardar(midia) {
      const recurso = midia.tipo === "video" ? "video" : "image";
      const assinados = {
        folder: `simpleclick/${midia.lojaId}/${midia.pasta}`,
        timestamp: String(Math.floor(agora().getTime() / 1000)),
      };
      const formulario = new FormData();
      formulario.append(
        "file",
        new Blob([Uint8Array.from(midia.bytes)], { type: midia.tipoDeConteudo }),
        `${randomUUID()}.${midia.extensao}`,
      );
      formulario.append("api_key", credencial.chave);
      formulario.append("folder", assinados.folder);
      formulario.append("timestamp", assinados.timestamp);
      formulario.append("signature", assinarEnvio(assinados, credencial.segredo));
      const resposta = await buscar(`${base}/${recurso}/upload`, {
        method: "POST",
        body: formulario,
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        secure_url?: string;
        public_id?: string;
        width?: number;
        height?: number;
        duration?: number;
        error?: { message?: string };
      };
      if (
        !resposta.ok ||
        typeof corpo.secure_url !== "string" ||
        typeof corpo.public_id !== "string"
      ) {
        throw new ErroDeMidiaRecusada(
          corpo.error?.message ?? "O serviço de mídia recusou o arquivo.",
        );
      }
      return {
        url: corpo.secure_url,
        chave: `cloudinary:${recurso}:${corpo.public_id}`,
        capaUrl:
          recurso === "video"
            ? corpo.secure_url.replace(/\.[A-Za-z0-9]+$/, ".jpg")
            : null,
        largura: Number.isInteger(corpo.width) ? (corpo.width as number) : null,
        altura: Number.isInteger(corpo.height) ? (corpo.height as number) : null,
        duracaoMs:
          typeof corpo.duration === "number" && corpo.duration > 0
            ? Math.round(corpo.duration * 1000)
            : null,
      };
    },
    async apagar(chave) {
      const [lugar, recurso, ...resto] = chave.split(":");
      const publicId = resto.join(":");
      if (lugar !== "cloudinary" || !recurso || publicId === "") return;
      const assinados = {
        invalidate: "true",
        public_id: publicId,
        timestamp: String(Math.floor(agora().getTime() / 1000)),
      };
      const corpo = new URLSearchParams({
        ...assinados,
        api_key: credencial.chave,
        signature: assinarEnvio(assinados, credencial.segredo),
      });
      const resposta = await buscar(`${base}/${recurso}/destroy`, {
        method: "POST",
        body: corpo,
      });
      if (!resposta.ok) {
        throw new Error(`o serviço de mídia respondeu ${resposta.status} ao apagar`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Disco (desenvolvimento)
// ---------------------------------------------------------------------------

/** O caminho público dos arquivos servidos pela própria API. */
export const CAMINHO_DOS_ARQUIVOS_DE_MIDIA = "/v1/midia/arquivos";

const FORMATO_DA_CHAVE_DO_DISCO =
  /^[0-9a-f-]{36}\/(produtos|stories|fotos|loja)\/[0-9a-f-]{36}\.(mp4|webm|jpg|png|webp|gif)$/;

/**
 * Pasta padrão do desenvolvimento: dentro da API, e não na pasta temporária do
 * sistema — o sistema limpa a temporária, e a logo enviada ontem sumiria da
 * loja sem aviso (a imagem "quebrada" que parecia não ter sido trocada).
 */
const PASTA_PADRAO_DO_DISCO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".midia-local",
);

export function pastaDaMidiaLocal(fonte: Fonte = process.env): string {
  const escolhida = fonte["MIDIA_LOCAL_DIR"]?.trim();
  return resolve(
    escolhida !== undefined && escolhida !== ""
      ? escolhida
      : PASTA_PADRAO_DO_DISCO,
  );
}

export function midiaNoDisco(
  pasta: string,
  enderecoPublico: string,
): ArmazenamentoDeMidia {
  const base = enderecoPublico.replace(/\/+$/, "");
  function caminhoDe(relativo: string): string | null {
    if (!FORMATO_DA_CHAVE_DO_DISCO.test(relativo)) return null;
    const completo = resolve(pasta, relativo);
    return completo.startsWith(pasta + sep) ? completo : null;
  }
  return {
    lugar: "disco",
    async guardar(midia) {
      const relativo = `${midia.lojaId}/${midia.pasta}/${randomUUID()}.${midia.extensao}`;
      const completo = caminhoDe(relativo);
      if (completo === null) throw new Error("chave de mídia fora do formato");
      await mkdir(dirname(completo), { recursive: true });
      await writeFile(completo, midia.bytes);
      return {
        url: `${base}${CAMINHO_DOS_ARQUIVOS_DE_MIDIA}/${relativo}`,
        chave: `disco:${relativo}`,
        capaUrl: null,
        largura: null,
        altura: null,
        duracaoMs: null,
      };
    },
    async apagar(chave) {
      if (!chave.startsWith("disco:")) return;
      const completo = caminhoDe(chave.slice("disco:".length));
      if (completo === null) return;
      await rm(completo, { force: true });
    },
  };
}

/**
 * Serve os arquivos do disco (só fora de produção). Aceita Range. Arquivo
 * que não existe (story vencido e limpo, vídeo apagado) responde 404.
 */
export function servirMidiaLocal(fonte: Fonte = process.env): Router {
  const rotas = Router();
  rotas.use(
    express.static(pastaDaMidiaLocal(fonte), {
      index: false,
      dotfiles: "deny",
      // O nome de cada arquivo é único (um por envio): nunca muda de conteúdo.
      maxAge: "1y",
      immutable: true,
    }),
  );
  rotas.use((_requisicao, resposta) => {
    resposta.status(404).json({ erro: "nao_encontrado" });
  });
  return rotas;
}

// ---------------------------------------------------------------------------
// Memória (prova)
// ---------------------------------------------------------------------------

export interface MidiaEmMemoria extends ArmazenamentoDeMidia {
  readonly arquivos: ReadonlyMap<string, Uint8Array>;
}

export function midiaEmMemoria(): MidiaEmMemoria {
  const arquivos = new Map<string, Uint8Array>();
  return {
    lugar: "memoria",
    arquivos,
    async guardar(midia) {
      const relativo = `${midia.lojaId}/${midia.pasta}/${randomUUID()}.${midia.extensao}`;
      arquivos.set(`memoria:${relativo}`, midia.bytes);
      return {
        url: `https://midia.teste/${relativo}`,
        chave: `memoria:${relativo}`,
        capaUrl: null,
        largura: null,
        altura: null,
        duracaoMs: null,
      };
    },
    async apagar(chave) {
      arquivos.delete(chave);
    },
  };
}

// ---------------------------------------------------------------------------
// O do ambiente
// ---------------------------------------------------------------------------

function indisponivel(): ArmazenamentoDeMidia {
  return {
    lugar: "indisponivel",
    guardar: async () => {
      throw new ErroDeMidiaIndisponivel();
    },
    apagar: async () => {},
  };
}

/** Disco só fora de produção: o disco da hospedagem some a cada deploy. */
export function usaMidiaLocal(fonte: Fonte = process.env): boolean {
  return credenciais(fonte) === null && fonte["NODE_ENV"] !== "production";
}

let doAmbiente: ArmazenamentoDeMidia | undefined;

export function armazenamentoDeMidiaDoAmbiente(
  fonte: Fonte = process.env,
): ArmazenamentoDeMidia {
  if (fonte === process.env && doAmbiente !== undefined) return doAmbiente;
  const credencial = credenciais(fonte);
  let escolhido: ArmazenamentoDeMidia;
  if (credencial !== null) {
    escolhido = midiaNoCloudinary(credencial);
  } else if (fonte["NODE_ENV"] !== "production") {
    const publico =
      fonte["MIDIA_URL_PUBLICA"]?.trim() ||
      `http://localhost:${fonte["PORT"]?.trim() || "3001"}`;
    escolhido = midiaNoDisco(pastaDaMidiaLocal(fonte), publico);
  } else {
    escolhido = indisponivel();
  }
  if (fonte === process.env) doAmbiente = escolhido;
  return escolhido;
}

/**
 * As falhas do serviço de mídia, com o mesmo aviso em todas as rotas que
 * guardam arquivo (vídeo do produto e stories): 503 sem serviço, 422 recusado.
 */
export function responderFalhaDeMidia(
  causa: unknown,
  resposta: Response,
  proximo: NextFunction,
): void {
  if (causa instanceof ErroDeMidiaIndisponivel) {
    resposta
      .status(503)
      .json({ erro: "midia_indisponivel", mensagem: causa.message });
    return;
  }
  if (causa instanceof ErroDeMidiaRecusada) {
    resposta.status(422).json({ erro: "midia_recusada", mensagem: causa.message });
    return;
  }
  proximo(causa);
}

// ---------------------------------------------------------------------------
// Imagens da loja e fotos do catálogo: enviar, trocar e apagar a antiga
// ---------------------------------------------------------------------------

const EXTENSAO_DO_TIPO: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * A chave de um arquivo nosso, a partir do endereço público guardado no banco.
 *
 * SÓ devolve chave de arquivo que esta loja enviou: o que veio do seed
 * (`/demo/...`), de outra loja ou de um endereço colado pelo dono não casa com
 * nenhum formato daqui e volta `null` — assim trocar a imagem nunca apaga uma
 * imagem compartilhada.
 */
export function chaveDaMidiaPelaUrl(url: string, lojaId: string): string | null {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    return null;
  }
  const caminho = decodeURIComponent(endereco.pathname);

  // Disco: <qualquer origem>/v1/midia/arquivos/<loja>/<pasta>/<uuid>.<ext>
  const prefixo = `${CAMINHO_DOS_ARQUIVOS_DE_MIDIA}/`;
  if (caminho.startsWith(prefixo)) {
    const relativo = caminho.slice(prefixo.length);
    return relativo.startsWith(`${lojaId}/`) &&
      FORMATO_DA_CHAVE_DO_DISCO.test(relativo)
      ? `disco:${relativo}`
      : null;
  }

  // Prova (memória).
  if (endereco.hostname === "midia.teste") {
    const relativo = caminho.slice(1);
    return relativo.startsWith(`${lojaId}/`) ? `memoria:${relativo}` : null;
  }

  // Cloudinary: /<nuvem>/<recurso>/upload/[transformações/][v123/]<id>.<ext>
  if (endereco.hostname === "res.cloudinary.com") {
    const partes = caminho.split("/").filter((parte) => parte !== "");
    const recurso = partes[1];
    if (partes[2] !== "upload" || (recurso !== "image" && recurso !== "video")) {
      return null;
    }
    const restante = partes.slice(3);
    const inicio = restante.findIndex(
      (parte) => parte === "simpleclick" || parte === "lojas",
    );
    if (inicio === -1 || restante[inicio + 1] !== lojaId) return null;
    const publicId = restante.slice(inicio).join("/").replace(/\.[A-Za-z0-9]+$/, "");
    return `cloudinary:${recurso}:${publicId}`;
  }
  return null;
}

/**
 * Apaga o arquivo que o endereço aponta, quando ele é desta loja e foi enviado
 * por nós. É o "limpe a anterior ao substituir": melhor esforço — falha de
 * rede ao apagar nunca desfaz a troca já gravada, só deixa um arquivo órfão.
 */
export async function apagarMidiaPelaUrl(
  armazenamento: Pick<ArmazenamentoDeMidia, "apagar">,
  lojaId: string,
  url: string | null | undefined,
  aoFalhar: (causa: unknown) => void = () => {},
): Promise<void> {
  if (url === null || url === undefined || url === "") return;
  const chave = chaveDaMidiaPelaUrl(url, lojaId);
  if (chave === null) return;
  try {
    await armazenamento.apagar(chave);
  } catch (causa) {
    aoFalhar(causa);
  }
}

/**
 * Onde a logo, a capa, o fundo e o topo da loja são guardados.
 *
 * Com credencial do Cloudinary, lá (produção). Sem credencial FORA de
 * produção, no disco da API — o mesmo caminho que já guarda vídeos e stories.
 * Em produção sem credencial, a porta responde "indisponível" (a rota diz
 * 503). Foi a falta deste meio-termo que fazia todo envio local responder 503
 * e a imagem antiga ficar no ar.
 */
export function imagensDaLojaDoAmbiente(
  fonte: Fonte = process.env,
): ArmazenamentoDeImagens {
  const armazenamento = armazenamentoDeMidiaDoAmbiente(fonte);
  const credencial = credenciais(fonte);
  const naNuvem =
    credencial === null ? null : armazenamentoNoCloudinary(credencial);
  return {
    async guardar(imagem) {
      if (naNuvem !== null) return naNuvem.guardar(imagem);
      if (armazenamento.lugar === "indisponivel") {
        throw new ErroDeArmazenamentoIndisponivel();
      }
      const extensao = EXTENSAO_DO_TIPO[imagem.tipoDeConteudo];
      if (extensao === undefined) {
        throw new ErroDeMidiaRecusada("Formato de imagem não aceito.");
      }
      const guardada = await armazenamento.guardar({
        lojaId: imagem.lojaId,
        pasta: "loja",
        tipo: "imagem",
        bytes: imagem.bytes,
        tipoDeConteudo: imagem.tipoDeConteudo,
        extensao,
      });
      return { url: guardada.url };
    },
    apagar: (url, lojaId) => apagarMidiaPelaUrl(armazenamento, lojaId, url),
  };
}

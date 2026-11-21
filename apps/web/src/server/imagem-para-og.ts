/**
 * Prepara a foto de um produto para o `next/og` (AC-414, D-7).
 *
 * O `next/og` (satori) desenha PNG, JPEG e GIF. Com WebP — o formato das fotos
 * da carga demo (`/demo/...webp`) — ele estoura no meio da resposta ("failed to
 * pipe response") e o cliente recebe ECONNRESET, sem prévia nenhuma. Uma
 * exceção dentro do `ImageResponse` não dá para pegar com try/catch, então a
 * foto é VALIDADA ANTES de entrar na imagem: só passa o que o `next/og`
 * desenha, já como data URI (sem segunda ida ao endereço do site, que no
 * ambiente local nem resolve). Qualquer outra coisa devolve `null` e a prévia
 * sai com o fundo verde, que é o desenho sem foto.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { enderecoDoSite } from "./endereco-do-site.ts";

const LIMITE_EM_BYTES = 4 * 1024 * 1024;
const TEMPO_LIMITE_EM_MS = 3_000;

/** O tipo pelo conteúdo (e não pela extensão ou pelo cabeçalho, que mentem). */
export function tipoDaImagemParaOg(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  return null;
}

function comoDataUri(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > LIMITE_EM_BYTES) return null;
  const tipo = tipoDaImagemParaOg(bytes);
  if (tipo === null) return null;
  return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function lerDaPastaPublica(caminho: string): Promise<Uint8Array | null> {
  const raiz = path.resolve(process.cwd(), "public");
  const arquivo = path.resolve(raiz, `.${decodeURIComponent(caminho)}`);
  if (!arquivo.startsWith(raiz + path.sep)) return null;
  try {
    return await readFile(arquivo);
  } catch {
    return null;
  }
}

async function baixar(endereco: string): Promise<Uint8Array | null> {
  const resposta = await fetch(endereco, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_EM_MS),
    redirect: "follow",
  });
  if (!resposta.ok) return null;
  const declarado = Number(resposta.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_EM_BYTES) return null;
  return new Uint8Array(await resposta.arrayBuffer());
}

/**
 * A foto como data URI desenhável, ou `null` (sem foto, formato que o `next/og`
 * não desenha, arquivo ausente, endereço fora do ar). Nunca lança.
 */
export async function fotoParaOg(url: string | null): Promise<string | null> {
  if (url === null || url.length === 0) return null;
  try {
    const local = url.startsWith("/") && !url.startsWith("//");
    const bytes = local
      ? ((await lerDaPastaPublica(url)) ?? (await baixar(new URL(url, enderecoDoSite()).href)))
      : await baixar(new URL(url).href);
    if (bytes === null) return null;
    const protocolo = local ? "http:" : new URL(url).protocol;
    if (protocolo !== "http:" && protocolo !== "https:") return null;
    return comoDataUri(bytes);
  } catch {
    return null;
  }
}

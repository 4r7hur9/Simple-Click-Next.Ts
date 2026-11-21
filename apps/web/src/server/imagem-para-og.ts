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
 *
 * O ENDEREÇO DA FOTO VEM DO DONO DA LOJA, então buscar nele é buscar onde
 * outra pessoa mandou (SSRF, card #137). Por isso, ANTES de qualquer conexão:
 * só `https`, só os hosts de imagem conhecidos (o próprio site e o CDN de
 * imagens) e só se o nome resolver para endereço público — loopback, rede
 * privada e link-local (onde mora o serviço de metadados da nuvem) são
 * recusados. Redirecionamento não é seguido às cegas: cada salto passa pela
 * mesma conferência. O corpo é lido aos pedaços e a leitura é abortada ao
 * passar do limite, com ou sem `Content-Length`; um relógio único cobre a
 * resolução do nome, os saltos e o corpo.
 */
import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import path from "node:path";

import { enderecoDoSite } from "./endereco-do-site.ts";

export const LIMITE_DA_FOTO_EM_BYTES = 4 * 1024 * 1024;
const TEMPO_LIMITE_EM_MS = 3_000;
const SALTOS_PERMITIDOS = 3;

/** O CDN das imagens enviadas pelas lojas (o mesmo de `next.config.ts`). */
const HOST_DO_CDN = "res.cloudinary.com";

/** Faixas que nunca são origem de foto pública. */
const ENDERECOS_INTERNOS = (() => {
  const lista = new BlockList();
  for (const [rede, prefixo] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    lista.addSubnet(rede, prefixo, "ipv4");
  }
  for (const [rede, prefixo] of [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    lista.addSubnet(rede, prefixo, "ipv6");
  }
  return lista;
})();

/** Verdadeiro para loopback, rede privada, link-local e afins. */
export function ehEnderecoInterno(ip: string): boolean {
  const versao = isIP(ip);
  if (versao === 0) return true;
  if (versao === 6) {
    // IPv4 escrito como IPv6 (`::ffff:10.0.0.1`) vale pelo IPv4.
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapeado?.[1] !== undefined)
      return ENDERECOS_INTERNOS.check(mapeado[1], "ipv4");
    return ENDERECOS_INTERNOS.check(ip, "ipv6");
  }
  return ENDERECOS_INTERNOS.check(ip, "ipv4");
}

/** Resolve um nome em todos os endereços dele. A prova troca por uma tabela. */
export type ResolverNome = (host: string) => Promise<readonly string[]>;

const resolverPeloDns: ResolverNome = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map(
    (achado) => achado.address,
  );

export interface DependenciasDaFoto {
  readonly buscar?: typeof fetch | undefined;
  readonly resolverNome?: ResolverNome | undefined;
}

/** Os hosts de onde a prévia aceita buscar foto. */
function hostsPermitidos(): ReadonlySet<string> {
  const hosts = new Set([HOST_DO_CDN]);
  try {
    hosts.add(new URL(enderecoDoSite()).hostname.toLowerCase());
  } catch {
    // Endereço do site malformado: fica só o CDN.
  }
  return hosts;
}

/**
 * O endereço pode ser buscado? `https`, host conhecido, sem usuário/senha
 * embutidos e com o nome resolvendo só para endereço público.
 */
export async function enderecoPodeSerBuscado(
  endereco: URL,
  resolverNome: ResolverNome = resolverPeloDns,
): Promise<boolean> {
  if (endereco.protocol !== "https:") return false;
  if (endereco.username !== "" || endereco.password !== "") return false;
  const host = endereco.hostname.toLowerCase();
  if (!hostsPermitidos().has(host)) return false;
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal) !== 0) return !ehEnderecoInterno(literal);
  let enderecos: readonly string[];
  try {
    enderecos = await resolverNome(host);
  } catch {
    return false;
  }
  return (
    enderecos.length > 0 && enderecos.every((ip) => !ehEnderecoInterno(ip))
  );
}

/** O tipo pelo conteúdo (e não pela extensão ou pelo cabeçalho, que mentem). */
export function tipoDaImagemParaOg(bytes: Uint8Array): string | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38
  ) {
    return "image/gif";
  }
  return null;
}

function comoDataUri(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > LIMITE_DA_FOTO_EM_BYTES) return null;
  const tipo = tipoDaImagemParaOg(bytes);
  if (tipo === null) return null;
  return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function lerDaPastaPublica(caminho: string): Promise<Uint8Array | null> {
  // `turbopackIgnore`: o caminho é montado em tempo de execução, e sem o
  // comentário o Turbopack rastreia a pasta pública inteira (mais de 22 mil
  // arquivos) para dentro do artefato da rota. É ele mesmo que sugere o
  // comentário no aviso do build.
  const raiz = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
  const arquivo = path.resolve(
    /*turbopackIgnore: true*/ raiz,
    `.${decodeURIComponent(caminho)}`,
  );
  if (!arquivo.startsWith(raiz + path.sep)) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ arquivo);
  } catch {
    return null;
  }
}

/** Lê o corpo aos pedaços; passou do limite, cancela e devolve `null`. */
async function lerComLimite(resposta: Response): Promise<Uint8Array | null> {
  if (resposta.body === null) return null;
  const leitor = resposta.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_DA_FOTO_EM_BYTES) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    pedacos.push(value);
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const pedaco of pedacos) {
    bytes.set(pedaco, posicao);
    posicao += pedaco.byteLength;
  }
  return bytes;
}

async function baixar(
  endereco: URL,
  dependencias: DependenciasDaFoto,
): Promise<Uint8Array | null> {
  const buscar = dependencias.buscar ?? fetch;
  const resolverNome = dependencias.resolverNome ?? resolverPeloDns;
  const sinal = AbortSignal.timeout(TEMPO_LIMITE_EM_MS);
  let atual = endereco;
  for (let salto = 0; salto <= SALTOS_PERMITIDOS; salto += 1) {
    if (!(await enderecoPodeSerBuscado(atual, resolverNome))) return null;
    if (sinal.aborted) return null;
    const resposta = await buscar(atual.href, {
      signal: sinal,
      redirect: "manual",
    });
    if (resposta.status >= 300 && resposta.status < 400) {
      await resposta.body?.cancel().catch(() => undefined);
      const destino = resposta.headers.get("location");
      if (destino === null) return null;
      atual = new URL(destino, atual);
      continue;
    }
    if (!resposta.ok) {
      await resposta.body?.cancel().catch(() => undefined);
      return null;
    }
    const declarado = Number(resposta.headers.get("content-length") ?? 0);
    if (declarado > LIMITE_DA_FOTO_EM_BYTES) {
      await resposta.body?.cancel().catch(() => undefined);
      return null;
    }
    return lerComLimite(resposta);
  }
  return null;
}

/**
 * A foto como data URI desenhável, ou `null` (sem foto, formato que o `next/og`
 * não desenha, arquivo ausente, endereço recusado ou fora do ar). Nunca lança.
 */
export async function fotoParaOg(
  url: string | null,
  dependencias: DependenciasDaFoto = {},
): Promise<string | null> {
  if (url === null || url.length === 0) return null;
  try {
    const local = url.startsWith("/") && !url.startsWith("//");
    const bytes = local
      ? ((await lerDaPastaPublica(url)) ??
        (await baixar(new URL(url, enderecoDoSite()), dependencias)))
      : await baixar(new URL(url), dependencias);
    return bytes === null ? null : comoDataUri(bytes);
  } catch {
    return null;
  }
}

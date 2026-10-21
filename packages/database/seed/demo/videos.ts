/**
 * Os vídeos curtos da demonstração (card #50): produto e story.
 *
 * Nada é baixado. O quadro é a mesma ilustração da foto (SVG desenhado em
 * `imagens.ts`, convertido em PNG pelo `sharp`), animado num `<canvas>` com
 * aproximação lenta, um leve deslocamento e um brilho que atravessa a cena. A
 * gravação é do próprio Chromium (`MediaRecorder`, WebM VP9/VP8), o mesmo que
 * os testes de ponta a ponta já instalam (`e2e/`, Playwright): sem ffmpeg e
 * sem dependência nova.
 *
 * O arquivo leva no nome um resumo do quadro de origem: se o desenho não
 * mudou, a carga seguinte reaproveita o vídeo em vez de gravar de novo (a
 * gravação é em tempo real, ~4 s cada). Sem o Chromium do Playwright, a carga
 * segue sem vídeos e avisa.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PASTA_PUBLICA, PREFIXO_PUBLICO } from "./imagens.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export interface PedidoDeVideo {
  /** Subpasta da loja dentro de `public/demo/`. */
  readonly pasta: string;
  /** Nome do arquivo, sem extensão e sem o resumo. */
  readonly arquivo: string;
  /** O quadro de origem. */
  readonly svg: string;
  readonly largura: number;
  readonly altura: number;
  readonly segundos: number;
}

export interface VideoGravado {
  readonly url: string;
  /** `assets`/`stories.storage_key`: "demo:<caminho>" (a limpeza não apaga). */
  readonly chave: string;
  readonly bytes: number;
  readonly largura: number;
  readonly altura: number;
  readonly duracaoMs: number;
}

type Sharp = (entrada: Buffer) => { png(): { toBuffer(): Promise<Buffer> } };

interface Navegador {
  newPage(): Promise<Pagina>;
  close(): Promise<void>;
}
interface Pagina {
  evaluate(expressao: string): Promise<unknown>;
  close(): Promise<void>;
}

function carregarSharp(): Sharp {
  const doSite = createRequire(resolve(RAIZ, "apps/web/package.json"));
  const doNext = createRequire(doSite.resolve("next/package.json"));
  return doNext("sharp") as Sharp;
}

async function abrirNavegador(): Promise<Navegador | null> {
  try {
    const doE2e = createRequire(resolve(RAIZ, "e2e/package.json"));
    const { chromium } = doE2e("@playwright/test") as {
      chromium: { launch(): Promise<Navegador> };
    };
    return await chromium.launch();
  } catch {
    return null;
  }
}

const chaveDo = (pedido: PedidoDeVideo): string => `${pedido.pasta}/${pedido.arquivo}`;

function resumoDo(pedido: PedidoDeVideo): string {
  return createHash("sha1")
    .update(`${pedido.largura}x${pedido.altura}:${pedido.segundos}:v1:${pedido.svg}`)
    .digest("hex")
    .slice(0, 10);
}

/**
 * Roda DENTRO da página: anima o quadro e devolve o WebM em base64. É texto
 * (JavaScript puro) porque este pacote não compila com os tipos do navegador.
 */
const GRAVAR_NA_PAGINA = `async ({ png, largura, altura, segundos }) => {
  const imagem = new Image();
  imagem.src = png;
  await imagem.decode();
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const g = tela.getContext("2d");
  const fluxo = tela.captureStream(30);
  const tipo =
    ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    ) ?? "video/webm";
  const gravador = new MediaRecorder(fluxo, { mimeType: tipo, videoBitsPerSecond: 1200000 });
  const partes = [];
  gravador.ondataavailable = (evento) => partes.push(evento.data);
  const desenhar = (t) => {
    const p = Math.min(t / segundos, 1);
    const suave = p * p * (3 - 2 * p);
    const escala = 1.02 + 0.12 * suave;
    const w = largura * escala;
    const h = altura * escala;
    g.drawImage(
      imagem,
      (largura - w) / 2 - largura * 0.03 * (suave - 0.5),
      (altura - h) / 2 - altura * 0.02 * (suave - 0.5),
      w,
      h,
    );
    // Brilho diagonal que atravessa a cena uma vez.
    const x = -largura + p * largura * 3;
    const brilho = g.createLinearGradient(x, 0, x + largura * 0.6, altura);
    brilho.addColorStop(0, "rgba(255,255,255,0)");
    brilho.addColorStop(0.5, "rgba(255,255,255,0.18)");
    brilho.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = brilho;
    g.fillRect(0, 0, largura, altura);
  };
  desenhar(0);
  gravador.start();
  const inicio = performance.now();
  await new Promise((pronto) => {
    const quadro = () => {
      const t = (performance.now() - inicio) / 1000;
      desenhar(t);
      if (t < segundos) requestAnimationFrame(quadro);
      else pronto();
    };
    requestAnimationFrame(quadro);
  });
  const parou = new Promise((pronto) => (gravador.onstop = pronto));
  gravador.stop();
  await parou;
  const bytes = new Uint8Array(await new Blob(partes, { type: tipo }).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}`;

/**
 * Grava (ou reaproveita) os vídeos pedidos. Devolve, por "pasta/arquivo", o
 * vídeo pronto; o que não deu para gravar fica de fora do mapa.
 */
export async function gravarVideos(
  pedidos: readonly PedidoDeVideo[],
  relatar: (linha: string) => void = () => {},
  /** Falso: só reaproveita os vídeos que já existem, sem gravar os que faltam. */
  gravarOsQueFaltam = true,
): Promise<ReadonlyMap<string, VideoGravado>> {
  const prontos = new Map<string, VideoGravado>();
  const faltam: { pedido: PedidoDeVideo; destino: string; nome: string }[] = [];

  for (const pedido of pedidos) {
    const pasta = resolve(PASTA_PUBLICA, PREFIXO_PUBLICO.slice(1), pedido.pasta);
    const nome = `${pedido.arquivo}-${resumoDo(pedido)}.webm`;
    const destino = resolve(pasta, nome);
    if (existsSync(destino)) {
      prontos.set(chaveDo(pedido), descrever(pedido, nome, (await stat(destino)).size));
    } else {
      faltam.push({ pedido, destino, nome });
    }
  }
  if (faltam.length === 0 || !gravarOsQueFaltam) return prontos;

  const navegador = await abrirNavegador();
  if (navegador === null) {
    relatar(
      "⚠ vídeos: o Chromium do Playwright (pasta e2e/) não abriu — a carga segue sem vídeos. Rode `pnpm --filter e2e exec playwright install chromium` e carregue de novo.",
    );
    return prontos;
  }
  const sharp = carregarSharp();
  try {
    // Quatro gravações ao mesmo tempo: cada uma é em tempo real.
    const fila = [...faltam];
    const trabalhadores = Array.from({ length: Math.min(4, fila.length) }, async () => {
      const pagina = await navegador.newPage();
      try {
        for (let item = fila.shift(); item !== undefined; item = fila.shift()) {
          const { pedido, destino, nome } = item;
          const png = await sharp(Buffer.from(pedido.svg)).png().toBuffer();
          const argumento = JSON.stringify({
            png: `data:image/png;base64,${png.toString("base64")}`,
            largura: pedido.largura,
            altura: pedido.altura,
            segundos: pedido.segundos,
          });
          const base64 = String(
            await pagina.evaluate(`(${GRAVAR_NA_PAGINA})(${argumento})`),
          );
          const conteudo = Buffer.from(base64, "base64");
          await mkdir(dirname(destino), { recursive: true });
          await apagarVersoesAntigas(dirname(destino), pedido.arquivo, nome);
          await writeFile(destino, conteudo);
          prontos.set(chaveDo(pedido), descrever(pedido, nome, conteudo.byteLength));
        }
      } finally {
        await pagina.close();
      }
    });
    await Promise.all(trabalhadores);
    relatar(`✔ vídeos: ${faltam.length} gravado(s), ${pedidos.length - faltam.length} reaproveitado(s)`);
  } finally {
    await navegador.close();
  }
  return prontos;
}

function descrever(pedido: PedidoDeVideo, nome: string, bytes: number): VideoGravado {
  const caminho = `${PREFIXO_PUBLICO.slice(1)}/${pedido.pasta}/${nome}`;
  return {
    url: `/${caminho}`,
    chave: `demo:${caminho}`,
    bytes,
    largura: pedido.largura,
    altura: pedido.altura,
    duracaoMs: pedido.segundos * 1000,
  };
}

/** Tira da pasta o vídeo do mesmo produto gravado de um desenho anterior. */
async function apagarVersoesAntigas(
  pasta: string,
  arquivo: string,
  atual: string,
): Promise<void> {
  const nomes = await readdir(pasta).catch(() => [] as string[]);
  const antigo = new RegExp(`^${arquivo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[0-9a-f]{10}\\.webm$`);
  for (const nome of nomes) {
    if (nome !== atual && antigo.test(nome)) await rm(resolve(pasta, nome), { force: true });
  }
}

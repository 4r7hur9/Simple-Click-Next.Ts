/**
 * Vídeos dos produtos e stories de 24 horas da demonstração (cards #46/#50).
 *
 * O story é da LOJA: foto ou vídeo vertical (1080 × 1920 na foto, 720 × 1280
 * no vídeo) com a ilustração de um produto sobre as cores da marca. Ele vence
 * 24 horas depois de postado, então cada carga o posta DE NOVO, relativo a
 * agora (`horasAtras` do roteiro): rodar a carga deixa os stories ativos.
 *
 * Os arquivos ficam em `apps/web/public/demo/` como as fotos, e a chave
 * guardada começa por "demo:" — a limpeza dos stories vencidos (API) apaga a
 * linha e ignora o arquivo, que a próxima carga reaproveita.
 */

import type { ClienteSql } from "../../src/migrate.ts";
import type { LojaDemo, ProdutoDemo, StoryDemo } from "./dados.ts";
import { gravar, id } from "./escrita.ts";
import { gravarImagem, svgDoProduto, tom } from "./imagens.ts";
import type { PedidoDeVideo, VideoGravado } from "./videos.ts";

const HORA = 3_600_000;

export const idDoStory = (loja: LojaDemo, story: StoryDemo): string =>
  id(`story:${loja.chave}:${story.chave}`);

export const idDoVideo = (loja: LojaDemo, produto: ProdutoDemo): string =>
  id(`video:${loja.chave}:${produto.chave}`);

/** A ilustração do produto, enquadrada no story vertical da marca. */
export function svgDoStory(loja: LojaDemo, produto: ProdutoDemo): string {
  const destaque = loja.destaque ?? loja.secundaria;
  const quadro = svgDoProduto({
    ilustracao: produto.ilustracao,
    fundo: produto.fundo,
    cor: produto.cor,
  }).replace(
    /^<svg [^>]*>/,
    '<svg x="110" y="470" width="860" height="860" viewBox="0 0 1200 1200">',
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="st-fundo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tom(loja.primaria, 0.1)}"/>
      <stop offset="1" stop-color="${tom(loja.primaria, -0.45)}"/>
    </linearGradient>
    <clipPath id="st-recorte"><rect x="110" y="470" width="860" height="860" rx="72"/></clipPath>
  </defs>
  <rect width="1080" height="1920" fill="url(#st-fundo)"/>
  <circle cx="930" cy="250" r="260" fill="${destaque}" opacity=".28"/>
  <circle cx="120" cy="1700" r="320" fill="${destaque}" opacity=".22"/>
  <circle cx="540" cy="900" r="560" fill="#fff" opacity=".06"/>
  <rect x="96" y="456" width="888" height="888" rx="84" fill="#fff" opacity=".9"/>
  <g clip-path="url(#st-recorte)">${quadro}</g>
  <rect x="380" y="1450" width="320" height="16" rx="8" fill="${destaque}"/>
</svg>`;
}

/** O que precisa ser gravado em vídeo nesta loja (produtos e stories). */
export function videosDaLoja(loja: LojaDemo): readonly PedidoDeVideo[] {
  const pedidos: PedidoDeVideo[] = [];
  for (const produto of loja.produtos) {
    if (produto.video !== true || produto.rascunho === true) continue;
    pedidos.push({
      pasta: loja.pasta,
      arquivo: `video-${produto.chave}`,
      svg: svgDoProduto({
        ilustracao: produto.ilustracao,
        fundo: produto.fundo,
        cor: produto.cor,
      }),
      largura: 720,
      altura: 720,
      segundos: 4,
    });
  }
  for (const story of loja.stories ?? []) {
    if (story.tipo !== "VIDEO") continue;
    const produto = loja.produtos.find((p) => p.chave === story.produto);
    if (produto === undefined) continue;
    pedidos.push({
      pasta: loja.pasta,
      arquivo: `story-${story.chave}`,
      svg: svgDoStory(loja, produto),
      largura: 720,
      altura: 1280,
      segundos: 5,
    });
  }
  return pedidos;
}

interface ContextoDeMidia {
  readonly cliente: ClienteSql;
  readonly lojaId: string;
  readonly loja: LojaDemo;
  readonly donaId: string | null;
}

/** Os vídeos da galeria: logo depois da foto principal. */
export async function plantarVideosDosProdutos(
  { cliente, lojaId, loja }: ContextoDeMidia,
  videos: ReadonlyMap<string, VideoGravado>,
): Promise<number> {
  let total = 0;
  for (const produto of loja.produtos) {
    const videoId = idDoVideo(loja, produto);
    const video = videos.get(`${loja.pasta}/video-${produto.chave}`);
    if (produto.video !== true || produto.rascunho === true || video === undefined) {
      await cliente.query("DELETE FROM app.product_videos WHERE id = $1", [videoId]);
      continue;
    }
    const produtoId = id(`produto:${loja.chave}:${produto.chave}`);
    const capa = await cliente.query(
      `SELECT url FROM app.product_images
        WHERE product_id = $1 ORDER BY is_primary DESC, sort_order LIMIT 1`,
      [produtoId],
    );
    await gravar(cliente, "product_videos", {
      id: videoId,
      store_id: lojaId,
      product_id: produtoId,
      url: video.url,
      storage_key: video.chave,
      poster_url: capa.rows[0]?.url === undefined ? null : String(capa.rows[0].url),
      poster_key: null,
      content_type: "video/webm",
      size_bytes: video.bytes,
      duration_ms: video.duracaoMs,
      width: video.largura,
      height: video.altura,
      // As fotos ficam em 0, 2, 4…: o vídeo entra logo depois da principal.
      sort_order: 1,
    });
    total++;
  }
  return total;
}

/**
 * Posta os stories da loja de novo, relativos a agora: o que estava no ar sai
 * (com as visualizações) e entra com a validade renovada.
 */
export async function plantarStories(
  { cliente, lojaId, loja, donaId }: ContextoDeMidia,
  agora: Date,
  videos: ReadonlyMap<string, VideoGravado>,
): Promise<number> {
  const stories = loja.stories ?? [];
  await cliente.query(
    "DELETE FROM app.stories WHERE store_id = $1 AND id = ANY($2::uuid[])",
    [lojaId, stories.map((s) => idDoStory(loja, s))],
  );
  let total = 0;
  for (const story of stories) {
    const produto = loja.produtos.find((p) => p.chave === story.produto);
    if (produto === undefined) continue;
    const foto = await gravarImagem({
      pasta: loja.pasta,
      arquivo: `story-${story.chave}`,
      svg: svgDoStory(loja, produto),
      largura: 1080,
      altura: 1920,
    });
    const video =
      story.tipo === "VIDEO"
        ? videos.get(`${loja.pasta}/story-${story.chave}`)
        : undefined;
    const postado = new Date(agora.getTime() - story.horasAtras * HORA);
    await gravar(cliente, "stories", {
      id: idDoStory(loja, story),
      store_id: lojaId,
      kind: video === undefined ? "IMAGEM" : "VIDEO",
      media_url: video?.url ?? foto.url,
      storage_key: video?.chave ?? `demo:${foto.chave}`,
      poster_url: video === undefined ? null : foto.url,
      content_type: video === undefined ? "image/webp" : "video/webm",
      size_bytes: video?.bytes ?? foto.bytes,
      duration_ms: video?.duracaoMs ?? null,
      width: video?.largura ?? foto.largura,
      height: video?.altura ?? foto.altura,
      caption: story.legenda.slice(0, 200),
      link: story.link ?? null,
      views_count: 0,
      created_by: donaId,
      created_at: postado,
      expires_at: new Date(postado.getTime() + 24 * HORA),
    });
    total++;
  }
  return total;
}

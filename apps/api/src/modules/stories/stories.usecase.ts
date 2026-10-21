/**
 * Stories de 24 horas (card #46): as regras que não dependem de rota.
 *
 * - `agruparPorLoja`: as linhas de `app.stories_ativos` viram as bolinhas do
 *   topo do /explorar — uma por loja, com a foto de perfil e os stories do
 *   mais antigo para o mais novo (a ordem em que se assiste).
 * - Ordem das lojas: com story NÃO VISTO primeiro; entre essas, as FAVORITAS
 *   primeiro; depois o story mais recente primeiro; por fim o apelido.
 *   Sem sessão nada foi visto e nada é favorito: vale só a mais recente.
 */

import {
  iniciaisDaLoja,
  type LojaComStories,
  type StoryDaLoja,
  type StoryPublico,
} from "@simpleclick/contracts";

/** Uma linha de `app.stories_ativos(p_apelido)`. */
export interface LinhaDoStoryAtivo {
  readonly story_id: string;
  readonly kind: string;
  readonly media_url: string;
  readonly poster_url: string | null;
  readonly duration_ms: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly caption: string | null;
  readonly link: string | null;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly store_slug: string;
  readonly store_name: string;
  readonly store_logo: string | null;
  readonly accent_color: string | null;
  readonly favorited: boolean;
  readonly seen: boolean;
}

function segundos(ms: number | null): number | null {
  return ms === null ? null : Math.round(ms / 100) / 10;
}

function tipo(kind: string): "imagem" | "video" {
  return kind === "VIDEO" ? "video" : "imagem";
}

function storyPublico(linha: LinhaDoStoryAtivo): StoryPublico {
  return {
    id: linha.story_id,
    tipo: tipo(linha.kind),
    url: linha.media_url,
    capa: linha.poster_url,
    duracaoSegundos: segundos(linha.duration_ms),
    largura: linha.width,
    altura: linha.height,
    legenda: linha.caption,
    link: linha.link,
    criadoEm: linha.created_at.toISOString(),
    expiraEm: linha.expires_at.toISOString(),
    visto: linha.seen,
  };
}

/** Agrupa por loja e ordena as lojas (ver o cabeçalho). */
export function agruparPorLoja(
  linhas: readonly LinhaDoStoryAtivo[],
): LojaComStories[] {
  const porLoja = new Map<string, LinhaDoStoryAtivo[]>();
  for (const linha of linhas) {
    const lista = porLoja.get(linha.store_slug) ?? [];
    lista.push(linha);
    porLoja.set(linha.store_slug, lista);
  }
  const lojas: LojaComStories[] = [];
  for (const lista of porLoja.values()) {
    const ordenada = [...lista].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime(),
    );
    const primeira = ordenada[0];
    const ultima = ordenada.at(-1);
    if (primeira === undefined || ultima === undefined) continue;
    lojas.push({
      loja: {
        apelido: primeira.store_slug,
        nome: primeira.store_name,
        fotoDePerfil: primeira.store_logo,
        iniciais: iniciaisDaLoja(primeira.store_name),
        corDestaque: primeira.accent_color,
      },
      favorita: primeira.favorited,
      temNaoVistos: ordenada.some((linha) => !linha.seen),
      ultimoEm: ultima.created_at.toISOString(),
      stories: ordenada.map(storyPublico),
    });
  }
  return lojas.sort(
    (a, b) =>
      Number(b.temNaoVistos) - Number(a.temNaoVistos) ||
      Number(b.favorita) - Number(a.favorita) ||
      b.ultimoEm.localeCompare(a.ultimoEm) ||
      a.loja.apelido.localeCompare(b.loja.apelido),
  );
}

/** O story como o painel o vê. */
export function storyDaLoja(story: {
  readonly id: string;
  readonly kind: string;
  readonly mediaUrl: string;
  readonly posterUrl: string | null;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly caption: string | null;
  readonly link: string | null;
  readonly viewsCount: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}): StoryDaLoja {
  return {
    id: story.id,
    tipo: tipo(story.kind),
    url: story.mediaUrl,
    capa: story.posterUrl,
    duracaoSegundos: segundos(story.durationMs),
    largura: story.width,
    altura: story.height,
    legenda: story.caption,
    link: story.link,
    visualizacoes: story.viewsCount,
    criadoEm: story.createdAt.toISOString(),
    expiraEm: story.expiresAt.toISOString(),
  };
}

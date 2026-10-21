/**
 * Stories de 24 horas (card #46).
 *
 * O STORY É DA LOJA, não do produto. A loja é o perfil (foto de perfil, nome
 * e stories); o produto é o post. A loja posta uma foto ou um vídeo vertical
 * (9:16 recomendado) quando quiser, com legenda e um link opcional para um
 * caminho do próprio site (ex.: `/loja/<apelido>`).
 *
 * DURA 24 HORAS e não fica guardado: toda leitura filtra o que venceu (some
 * na hora), e a limpeza da API apaga o arquivo e a linha depois (de 10 em 10
 * minutos por padrão).
 *
 * Painel (dono e equipe com `catalogo.produtos`):
 *   POST   /v1/lojas/:apelido/stories            corpo = arquivo (foto ou vídeo)
 *   GET    /v1/lojas/:apelido/stories            os ativos, com visualizações
 *   DELETE /v1/lojas/:apelido/stories/:storyId
 *
 * Público (visitante ou cliente; com sessão diz o que a pessoa já viu):
 *   GET    /v1/stories                           ativos de todas as lojas do feed, por loja
 *   GET    /v1/stories?loja=<apelido>            só daquela loja (vitrine)
 *   POST   /v1/stories/:storyId/visto            exige sessão
 *
 * Administração:
 *   GET/PUT /v1/admin/stories/limite             padrão da plataforma
 *   GET/PUT /v1/admin/lojas/:id/stories/limite   ajuste de uma loja (null = padrão)
 *
 * A FOTO DE PERFIL da loja é a logo da aparência (envio em
 * `POST /v1/lojas/:apelido/configuracao/aparencia/imagem/logo`). Sem logo, a
 * tela desenha as `iniciais` sobre a `corDestaque`.
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";

// ---------------------------------------------------------------------------
// Perfil da loja (a bolinha do story)
// ---------------------------------------------------------------------------

const PALAVRAS_DE_LIGACAO = new Set(["da", "de", "do", "das", "dos", "e"]);

/**
 * As iniciais do nome da loja, para a bolinha sem foto: duas letras, em
 * maiúsculas, sem "da/de/do". "Pastelaria da Vila" → "PV"; "Açaí" → "AÇ".
 */
export function iniciaisDaLoja(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((palavra) => /[\p{L}\p{N}]/u.test(palavra));
  const fortes = palavras.filter(
    (palavra) => !PALAVRAS_DE_LIGACAO.has(palavra.toLowerCase()),
  );
  const usadas = fortes.length > 0 ? fortes : palavras;
  const letras = (palavra: string) =>
    [...palavra].filter((letra) => /[\p{L}\p{N}]/u.test(letra));
  const primeira = usadas[0];
  if (primeira === undefined) return "?";
  const segunda = usadas[1];
  const resultado =
    segunda === undefined
      ? letras(primeira).slice(0, 2).join("")
      : `${letras(primeira)[0] ?? ""}${letras(segunda)[0] ?? ""}`;
  return resultado.toLocaleUpperCase("pt-BR") || "?";
}

/** A loja como perfil: o que a bolinha do story e o topo do post mostram. */
export const esquemaDoPerfilDaLoja = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  /** A logo da loja; nula quando não há (a tela usa as iniciais). */
  fotoDePerfil: z.string().nullable(),
  iniciais: z.string(),
  /** A cor de destaque do tema (`#rrggbb`), ou nula. */
  corDestaque: z.string().nullable(),
});

export type PerfilDaLoja = z.infer<typeof esquemaDoPerfilDaLoja>;

// ---------------------------------------------------------------------------
// O story
// ---------------------------------------------------------------------------

export const TIPOS_DE_STORY = ["imagem", "video"] as const;

const comumDoStory = {
  id: z.string().uuid(),
  tipo: z.enum(TIPOS_DE_STORY),
  url: z.string(),
  /** Poster do vídeo; nulo em foto. */
  capa: z.string().nullable(),
  duracaoSegundos: z.number().nullable(),
  largura: z.number().int().nullable(),
  altura: z.number().int().nullable(),
  legenda: z.string().nullable(),
  /** Caminho do próprio site (começa com "/"), ou nulo. */
  link: z.string().nullable(),
  criadoEm: z.string(),
  /** Quando some: `criadoEm + 24h`. */
  expiraEm: z.string(),
};

/** O story como o PAINEL o vê. */
export const esquemaDoStoryDaLoja = z.strictObject({
  ...comumDoStory,
  /** Quantas pessoas (com conta) viram. */
  visualizacoes: z.number().int().nonnegative(),
});

export type StoryDaLoja = z.infer<typeof esquemaDoStoryDaLoja>;

export const esquemaDoLimiteDeStories = z.strictObject({
  limite: z.number().int().nonnegative(),
  uso: z.number().int().nonnegative(),
  restante: z.number().int().nonnegative(),
});

/** `GET /v1/lojas/:apelido/stories` */
export const esquemaDosStoriesDaLoja = z.strictObject({
  stories: z.array(esquemaDoStoryDaLoja),
  limite: esquemaDoLimiteDeStories,
});

/** Link do story: caminho interno do site. */
const caminhoDoSite = z
  .string()
  .trim()
  .max(300)
  .regex(
    /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%]*$/,
    "O link precisa ser um caminho do site, começando com /.",
  );

/**
 * Consulta do envio do story (o corpo são os bytes da foto ou do vídeo).
 * `duracaoSegundos`: só quando a duração do vídeo não pode ser lida do arquivo.
 */
export const esquemaDaConsultaDoEnvioDeStory = z.strictObject({
  legenda: z.string().trim().max(200).optional(),
  link: caminhoDoSite.optional(),
  duracaoSegundos: z.coerce.number().positive().max(3_600).optional(),
});

export type ConsultaDoEnvioDeStory = z.output<
  typeof esquemaDaConsultaDoEnvioDeStory
>;

/** O story como o PÚBLICO o vê. */
export const esquemaDoStoryPublico = z.strictObject({
  ...comumDoStory,
  /** Só com sessão: a pessoa já viu. Sem sessão, sempre `false`. */
  visto: z.boolean(),
});

export type StoryPublico = z.infer<typeof esquemaDoStoryPublico>;

/** Uma loja com seus stories ativos, do mais antigo para o mais novo. */
export const esquemaDaLojaComStories = z.strictObject({
  loja: esquemaDoPerfilDaLoja,
  /** Só com sessão: a pessoa favoritou a loja. */
  favorita: z.boolean(),
  /** Há story que a pessoa ainda não viu (sem sessão: sempre verdadeiro). */
  temNaoVistos: z.boolean(),
  /** Quando saiu o story mais recente. */
  ultimoEm: z.string(),
  stories: z.array(esquemaDoStoryPublico),
});

export type LojaComStories = z.infer<typeof esquemaDaLojaComStories>;

/**
 * `GET /v1/stories` — as bolinhas do topo do /explorar. Ordem: lojas com
 * story não visto primeiro; entre elas, as favoritas primeiro; depois o mais
 * recente primeiro.
 */
export const esquemaDosStoriesAtivos = z.strictObject({
  lojas: z.array(esquemaDaLojaComStories),
});

export const esquemaDaConsultaDosStoriesAtivos = z.strictObject({
  loja: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,63}$/, "Loja inválida.")
    .optional(),
});

/** `POST /v1/stories/:storyId/visto` */
export const esquemaDoStoryVisto = z.strictObject({
  id: z.string().uuid(),
  visto: z.literal(true),
});

// ---------------------------------------------------------------------------
// Administração: limite de stories ativos
// ---------------------------------------------------------------------------

/** `GET/PUT /v1/admin/stories/limite` */
export const esquemaDoPadraoDeStories = z.strictObject({
  padrao: z.number().int().min(0).max(1_000),
});

/** `PUT /v1/admin/lojas/:id/stories/limite` — `null` volta ao padrão. */
export const esquemaDoAjusteDeStories = z.strictObject({
  limite: z.number().int().min(0).max(1_000).nullable(),
});

/** Resposta do ajuste e da leitura por loja. */
export const esquemaDoLimiteDeStoriesDaLoja = z.strictObject({
  padrao: z.number().int().nonnegative(),
  ajuste: z.number().int().nonnegative().nullable(),
  limite: z.number().int().nonnegative(),
  ativos: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Rotas do contrato publicado
// ---------------------------------------------------------------------------

const parametrosDaLoja = z.strictObject({
  apelido: z.string().min(1).max(63),
});

export const rotaDeEnviarStory = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/stories",
  etiqueta: "stories",
  resumo: "Postar story da loja",
  descricao:
    "O corpo é o ARQUIVO (bytes crus): foto jpeg/png/webp (até 10 MB) ou vídeo mp4/webm (limites de GET /v1/midia/limites), conferido pelos bytes. Consulta: legenda (até 200), link (caminho do site começando com /) e duracaoSegundos (só se a duração não puder ser lida do arquivo). Fica no ar 24 horas. Acima do limite de stories ativos: 409 limite_atingido {recurso:'stories', limite, uso}. Dono e equipe com catalogo.produtos.",
  parametros: parametrosDaLoja,
  consulta: esquemaDaConsultaDoEnvioDeStory,
  resposta: esquemaDoStoryDaLoja,
  status: 201,
  errosPossiveis: [400, 401, 403, 409, 413, 503],
});

export const rotaDosStoriesDaLoja = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/stories",
  etiqueta: "stories",
  resumo: "Stories ativos da loja (painel)",
  descricao:
    "Os stories que ainda não venceram, do mais novo para o mais antigo, com visualizações, e o uso do limite.",
  parametros: parametrosDaLoja,
  resposta: esquemaDosStoriesDaLoja,
  errosPossiveis: [401, 403],
});

export const rotaDeApagarStory = definirRota({
  metodo: "delete",
  caminho: "/v1/lojas/:apelido/stories/:storyId",
  etiqueta: "stories",
  resumo: "Apagar story",
  descricao: "Tira o story do ar na hora e apaga o arquivo.",
  parametros: parametrosDaLoja.extend({ storyId: z.string().uuid() }),
  resposta: z.null(),
  status: 204,
  errosPossiveis: [401, 403],
});

export const rotaDosStoriesAtivos = definirRota({
  metodo: "get",
  caminho: "/v1/stories",
  etiqueta: "stories",
  resumo: "Stories ativos, agrupados por loja",
  descricao:
    "Sem ?loja: as lojas ativas do feed que têm story no ar (as bolinhas do /explorar), com foto de perfil, iniciais e os stories. Com ?loja=<apelido>: só aquela loja. Ordem: não vistas primeiro, favoritas primeiro, mais recente primeiro. Público; com sessão, diz o que a pessoa já viu e as favoritas.",
  consulta: esquemaDaConsultaDosStoriesAtivos,
  resposta: esquemaDosStoriesAtivos,
  errosPossiveis: [400],
});

export const rotaDeMarcarStoryVisto = definirRota({
  metodo: "post",
  caminho: "/v1/stories/:storyId/visto",
  etiqueta: "stories",
  resumo: "Marcar story como visto",
  descricao:
    "Registra que a pessoa da sessão viu o story (conta uma vez por pessoa no contador da loja). Story vencido ou inexistente: 404. Exige sessão.",
  parametros: z.strictObject({ storyId: z.string().uuid() }),
  resposta: esquemaDoStoryVisto,
  errosPossiveis: [401],
});

export const ROTAS_DOS_STORIES = [
  rotaDeEnviarStory,
  rotaDosStoriesDaLoja,
  rotaDeApagarStory,
  rotaDosStoriesAtivos,
  rotaDeMarcarStoryVisto,
] as const;

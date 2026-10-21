/**
 * Mídia do produto: fotos E vídeos na mesma galeria (card #46).
 *
 * O produto é o "post" da loja. Além das fotos (`/imagens`, que continuam
 * iguais), ele pode ter VÍDEOS mp4 ou webm. A galeria mistura os dois numa
 * ordem só, que o dono escolhe (`PUT .../midias/ordem`).
 *
 * O ENVIO É O ARQUIVO CRU no corpo (como o das fotos): a API confere o tipo
 * REAL pelos bytes (não pela extensão), o tamanho e a duração, e só então
 * entrega ao serviço de mídia. A capa (poster) do vídeo: o serviço de mídia
 * gera uma sozinho quando pode, e o painel pode enviar a sua
 * (`POST .../videos/:videoId/capa`, foto jpeg/png/webp).
 *
 * Quem pode: dono e equipe com a permissão `catalogo.produtos`.
 *
 * A vitrine (`GET /v1/vitrine/:apelido/produto/:produtoId`) e o feed
 * (`GET /v1/feed/produtos`) devolvem `midias` já na ordem do dono.
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

/**
 * Os padrões. A API lê os valores do ambiente (`MIDIA_VIDEO_MAX_MB`,
 * `MIDIA_VIDEO_MAX_SEGUNDOS`, `MIDIA_VIDEOS_POR_PRODUTO`,
 * `STORIES_IMAGEM_MAX_MB`, `STORIES_LIMPEZA_MINUTOS`) e publica os que valem em
 * `GET /v1/midia/limites`.
 */
export const LIMITES_DE_MIDIA_PADRAO = Object.freeze({
  videoTamanhoMaximoBytes: 50 * 1024 * 1024,
  videoDuracaoMaximaSegundos: 60,
  videosPorProduto: 3,
  imagemDoStoryTamanhoMaximoBytes: 10 * 1024 * 1024,
  /** Quanto um story fica no ar. */
  duracaoDoStoryHoras: 24,
  /** De quanto em quanto tempo a API apaga os stories vencidos. */
  limpezaDosStoriesMinutos: 10,
  /** Stories ativos por loja quando a administração não ajustou. */
  storiesAtivosPorLoja: 30,
});

/** Tipos de vídeo aceitos, conferidos pelos bytes. */
export const FORMATOS_DE_VIDEO = ["video/mp4", "video/webm"] as const;

/** Tipos de foto aceitos (capa do vídeo e story de foto). */
export const FORMATOS_DE_IMAGEM = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** `GET /v1/midia/limites` — público. */
export const esquemaDosLimitesDeMidia = z.strictObject({
  videoTamanhoMaximoBytes: z.number().int().positive(),
  videoDuracaoMaximaSegundos: z.number().int().positive(),
  videosPorProduto: z.number().int().nonnegative(),
  imagemDoStoryTamanhoMaximoBytes: z.number().int().positive(),
  duracaoDoStoryHoras: z.number().int().positive(),
  formatosDeVideo: z.array(z.string()),
  formatosDeImagem: z.array(z.string()),
});

export type LimitesDeMidia = z.infer<typeof esquemaDosLimitesDeMidia>;

// ---------------------------------------------------------------------------
// A mídia
// ---------------------------------------------------------------------------

export const TIPOS_DE_MIDIA = ["imagem", "video"] as const;

export const esquemaDoTipoDeMidia = z.enum(TIPOS_DE_MIDIA);

export type TipoDeMidia = z.infer<typeof esquemaDoTipoDeMidia>;

/**
 * Uma mídia como o PÚBLICO a vê (vitrine e feed). Sem identificador interno
 * do arquivo; `capa` é o poster do vídeo (nula em foto, ou vídeo sem capa).
 */
export const esquemaDaMidiaPublica = z.strictObject({
  tipo: esquemaDoTipoDeMidia,
  url: z.string(),
  capa: z.string().nullable(),
  /** Só vídeo; nula quando não se sabe. */
  duracaoSegundos: z.number().nullable(),
  largura: z.number().int().nullable(),
  altura: z.number().int().nullable(),
  /** Texto alternativo da foto. */
  texto: z.string().nullable(),
});

export type MidiaPublica = z.infer<typeof esquemaDaMidiaPublica>;

/** Uma mídia como o PAINEL a vê: com identificador, ordem e principal. */
export const esquemaDaMidiaDoProduto = z.strictObject({
  id: z.string().uuid(),
  ...esquemaDaMidiaPublica.shape,
  /** Posição na galeria (menor primeiro). Fotos e vídeos dividem a ordem. */
  ordem: z.number().int(),
  /** Só foto: a principal (a do cartão). Vídeo é sempre `false`. */
  principal: z.boolean(),
  /** Só vídeo: tamanho em bytes e tipo conferido. */
  tamanhoBytes: z.number().int().nullable(),
  formato: z.string().nullable(),
});

export type MidiaDoProduto = z.infer<typeof esquemaDaMidiaDoProduto>;

/** `GET .../produtos/:produtoId/midias` e resposta de `PUT .../midias/ordem`. */
export const esquemaDasMidiasDoProduto = z.strictObject({
  midias: z.array(esquemaDaMidiaDoProduto),
});

/**
 * `PUT .../produtos/:produtoId/midias/ordem` — a galeria inteira na ordem
 * nova. Mídia do produto que ficar de fora vai para o fim, na ordem atual.
 */
export const esquemaDaOrdemDasMidias = z.strictObject({
  ordem: z
    .array(
      z.strictObject({
        tipo: esquemaDoTipoDeMidia,
        id: z.string().uuid(),
      }),
    )
    .min(1)
    .max(50),
});

export type OrdemDasMidias = z.infer<typeof esquemaDaOrdemDasMidias>;

/**
 * Consulta do envio de vídeo (o corpo são os bytes). `duracaoSegundos` só é
 * usada quando a duração não pode ser lida do arquivo (ex.: webm gravado no
 * navegador) — o painel lê do elemento `<video>` e manda.
 */
export const esquemaDaConsultaDoEnvioDeVideo = z.strictObject({
  duracaoSegundos: z.coerce.number().positive().max(3_600).optional(),
});

// ---------------------------------------------------------------------------
// Rotas do contrato publicado
// ---------------------------------------------------------------------------

const parametrosDoProduto = z.strictObject({
  apelido: z.string().min(1).max(63),
  produtoId: z.string().uuid(),
});

const parametrosDoVideo = parametrosDoProduto.extend({
  videoId: z.string().uuid(),
});

export const rotaDosLimitesDeMidia = definirRota({
  metodo: "get",
  caminho: "/v1/midia/limites",
  etiqueta: "midia",
  resumo: "Limites de envio de mídia",
  descricao:
    "Tamanho e duração máximos do vídeo, vídeos por produto, tamanho da foto do story e quanto o story dura. A tela confere antes de enviar. Público.",
  resposta: esquemaDosLimitesDeMidia,
});

export const rotaDasMidiasDoProduto = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/catalogo/produtos/:produtoId/midias",
  etiqueta: "midia",
  resumo: "Galeria do produto (fotos e vídeos)",
  descricao:
    "Fotos e vídeos do produto na ordem da galeria. Dono e equipe com catalogo.produtos.",
  parametros: parametrosDoProduto,
  resposta: esquemaDasMidiasDoProduto,
  errosPossiveis: [401, 403],
});

export const rotaDeEnviarVideo = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/catalogo/produtos/:produtoId/videos",
  etiqueta: "midia",
  resumo: "Enviar vídeo do produto",
  descricao:
    "O corpo é o ARQUIVO do vídeo (bytes crus, qualquer Content-Type). Aceita mp4 e webm conferidos pelos bytes; recusa acima do tamanho (413 video_grande_demais) ou da duração (400 video_longo_demais), arquivo que não é vídeo (400 video_invalido), duração ilegível sem ?duracaoSegundos (400 video_sem_duracao) e o limite de vídeos por produto (400 limite_de_videos). Sem serviço de mídia: 503 midia_indisponivel. Entra no fim da galeria.",
  parametros: parametrosDoProduto,
  consulta: esquemaDaConsultaDoEnvioDeVideo,
  resposta: esquemaDaMidiaDoProduto,
  status: 201,
  errosPossiveis: [400, 401, 403, 413, 503],
});

export const rotaDeEnviarCapaDoVideo = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/catalogo/produtos/:produtoId/videos/:videoId/capa",
  etiqueta: "midia",
  resumo: "Enviar a capa (poster) do vídeo",
  descricao:
    "O corpo é a FOTO da capa (jpeg, png ou webp, até 10 MB), conferida pelos bytes. Troca a capa anterior.",
  parametros: parametrosDoVideo,
  resposta: esquemaDaMidiaDoProduto,
  errosPossiveis: [400, 401, 403, 413, 503],
});

export const rotaDeApagarVideo = definirRota({
  metodo: "delete",
  caminho: "/v1/lojas/:apelido/catalogo/produtos/:produtoId/videos/:videoId",
  etiqueta: "midia",
  resumo: "Apagar vídeo do produto",
  descricao: "Tira o vídeo da galeria e apaga o arquivo do serviço de mídia.",
  parametros: parametrosDoVideo,
  resposta: z.null(),
  status: 204,
  errosPossiveis: [401, 403],
});

export const rotaDeOrdenarMidias = definirRota({
  metodo: "put",
  caminho: "/v1/lojas/:apelido/catalogo/produtos/:produtoId/midias/ordem",
  etiqueta: "midia",
  resumo: "Ordenar a galeria do produto",
  descricao:
    "Recebe fotos e vídeos na ordem nova ({ordem:[{tipo,id}]}). Mídia de outro produto: 400 midia_desconhecida.",
  parametros: parametrosDoProduto,
  corpo: esquemaDaOrdemDasMidias,
  resposta: esquemaDasMidiasDoProduto,
  errosPossiveis: [400, 401, 403],
});

export const ROTAS_DA_MIDIA = [
  rotaDosLimitesDeMidia,
  rotaDasMidiasDoProduto,
  rotaDeEnviarVideo,
  rotaDeEnviarCapaDoVideo,
  rotaDeApagarVideo,
  rotaDeOrdenarMidias,
] as const;

/**
 * O feed do SimpleClick (/explorar), favoritos e lojas recentes (card #25).
 *
 * O feed mostra produtos e lojas de várias lojas ao mesmo tempo. Só entra loja
 * ATIVA que aceita aparecer no feed (configuração do dono) e só produto
 * publicado, disponível e marcado "publicar no feed".
 *
 * Filtros (todos opcionais): tipo de negócio (`tipo`, um ou vários, separados
 * por vírgula), categoria (só produtos), forma de receber (`entrega` ou
 * `retirada`), busca e ordem. Com `lat` e `lng` a resposta traz a distância e
 * a ordem `distancia` funciona; sem elas, a distância vem nula.
 *
 * Favoritos e recentes são da PESSOA da sessão (qualquer papel): exigem conta.
 * Favoritos (lojas e produtos, card #45) não expiram; recentes são só as lojas
 * visitadas nos últimos `JANELA_DOS_RECENTES_EM_DIAS` dias, até
 * `LIMITE_DOS_RECENTES`, e não contam como favoritos.
 */

import { z } from "zod";

import { esquemaDoAtacadoDoProduto } from "./atacado.ts";
import { esquemaDaMidiaPublica } from "./midia.ts";
import {
  esquemaDoFiltroDeAtacado,
  esquemaDoPedidoMinimoDeAtacado,
} from "./vitrine.ts";
import { definirRota } from "./rota.ts";

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

/**
 * Um ou vários códigos de tipo de negócio, separados por vírgula:
 * `?tipo=FOOD_SNACK,APPAREL` (até 10). `tiposDaConsulta` separa a lista.
 */
const listaDeTipos = z
  .string()
  .regex(
    /^[A-Za-z_]{2,40}(,[A-Za-z_]{2,40}){0,9}$/,
    "Tipo de negócio inválido: use os códigos separados por vírgula.",
  );

/** Os códigos da consulta `tipo`, já em maiúsculas. */
export function tiposDaConsulta(tipo: string | undefined): string[] {
  return (tipo ?? "")
    .split(",")
    .map((parte) => parte.trim().toUpperCase())
    .filter((parte) => parte !== "");
}

/** Texto de busca; vazio vale como sem busca (`buscaDaConsulta`). */
const textoDeBusca = z.string().max(80, "A busca cabe em até 80 caracteres.");

/** A busca da consulta, ou `undefined` quando veio vazia. */
export function buscaDaConsulta(busca: string | undefined): string | undefined {
  const limpa = busca?.trim() ?? "";
  return limpa === "" ? undefined : limpa;
}

/** Formas de receber, como o endereço as escreve. */
export const FORMAS_DE_RECEBER_NO_FEED = ["entrega", "retirada"] as const;

/** Como cada forma de receber se chama no banco. */
export const FORMA_DE_RECEBER_NO_BANCO = Object.freeze({
  entrega: "DELIVERY",
  retirada: "PICKUP",
} as const);

const comumDaConsulta = {
  tipo: listaDeTipos.optional(),
  entrega: z.enum(FORMAS_DE_RECEBER_NO_FEED).optional(),
  busca: textoDeBusca.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
};

export const ORDENS_DOS_PRODUTOS_DO_FEED = [
  "relevancia",
  "distancia",
  "preco-menor",
  "preco-maior",
  "recentes",
] as const;

export const ORDENS_DAS_LOJAS_DO_FEED = [
  "relevancia",
  "distancia",
  "recentes",
  "nome",
] as const;

/** `GET /v1/feed/produtos` */
export const esquemaDaConsultaDeProdutosDoFeed = z.strictObject({
  ...comumDaConsulta,
  categoria: z.string().trim().min(1).max(80).optional(),
  ordem: z.enum(ORDENS_DOS_PRODUTOS_DO_FEED).default("relevancia"),
  /** Só produtos com preço de atacado (card #59): `?atacado=1`. */
  atacado: esquemaDoFiltroDeAtacado.optional(),
  /** Com `atacado=1`: pedido mínimo de atacado de até N unidades. */
  pedidoMinimo: esquemaDoPedidoMinimoDeAtacado.optional(),
});

export type ConsultaDeProdutosDoFeed = z.output<
  typeof esquemaDaConsultaDeProdutosDoFeed
>;

/** `GET /v1/feed/lojas` */
export const esquemaDaConsultaDeLojasDoFeed = z.strictObject({
  ...comumDaConsulta,
  ordem: z.enum(ORDENS_DAS_LOJAS_DO_FEED).default("relevancia"),
});

export type ConsultaDeLojasDoFeed = z.output<
  typeof esquemaDaConsultaDeLojasDoFeed
>;

// ---------------------------------------------------------------------------
// Recentes: janela de tempo (card #45)
// ---------------------------------------------------------------------------

/** Os recentes mostram as lojas visitadas nestes últimos dias (padrão). */
export const JANELA_DOS_RECENTES_EM_DIAS = 30;
/** A maior janela que `?dias=` aceita. Visita mais velha que isto é apagada. */
export const JANELA_MAXIMA_DOS_RECENTES_EM_DIAS = 90;
/** Quantas lojas os recentes mostram, no máximo. */
export const LIMITE_DOS_RECENTES = 20;

/** `GET /v1/feed/recentes` */
export const esquemaDaConsultaDosRecentes = z.strictObject({
  dias: z.coerce
    .number()
    .int()
    .min(1)
    .max(JANELA_MAXIMA_DOS_RECENTES_EM_DIAS)
    .default(JANELA_DOS_RECENTES_EM_DIAS),
  lat: comumDaConsulta.lat,
  lng: comumDaConsulta.lng,
});

export type ConsultaDosRecentes = z.output<typeof esquemaDaConsultaDosRecentes>;

/** `GET /v1/conta/favoritos` e `GET /v1/conta/recentes` */
export const esquemaDaConsultaDaListaDaConta = z.strictObject({
  lat: comumDaConsulta.lat,
  lng: comumDaConsulta.lng,
  pagina: comumDaConsulta.pagina,
  porPagina: comumDaConsulta.porPagina,
});

// ---------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------

/** A loja como o cartão do feed a mostra. Sem identificador interno. */
export const esquemaDaLojaNoCartao = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  tipoDeNegocio: z.string(),
  logo: z.string().nullable(),
  /**
   * A foto de perfil da loja (card #46): a mesma logo, com o nome do modelo
   * social. A API sempre manda; opcional só para quem monta à mão.
   */
  fotoDePerfil: z.string().nullable().optional(),
  /** Duas letras para a bolinha sem foto (card #46). */
  iniciais: z.string().optional(),
  cidade: z.string().nullable(),
  bairro: z.string().nullable(),
  /** `DELIVERY` e/ou `PICKUP`. */
  formasDeEntrega: z.array(z.string()),
});

export const esquemaDoProdutoDoFeed = z.strictObject({
  /** O mesmo identificador da página do produto na vitrine. */
  id: z.string(),
  nome: z.string(),
  descricao: z.string().nullable(),
  precoCentavos: z.number().int().nullable(),
  /** Preço "de" (riscado), quando há. */
  precoOriginalCentavos: z.number().int().nullable(),
  imagem: z.string().nullable(),
  categoria: z.string().nullable(),
  loja: esquemaDaLojaNoCartao,
  /** Em quilômetros, com uma casa; nula sem `lat`/`lng` ou sem endereço da loja. */
  distanciaKm: z.number().nullable(),
  publicadoEm: z.string(),
  /**
   * Fotos e vídeos do post, na ordem do dono (card #46). `imagem` continua
   * sendo a foto do cartão. A API sempre manda; opcional só para quem monta
   * à mão.
   */
  midias: z.array(esquemaDaMidiaPublica).optional(),
  /**
   * A pessoa da sessão favoritou este produto (card #45); falso sem sessão.
   * A API sempre manda; opcional só para quem monta à mão.
   */
  favorito: z.boolean().optional(),
  /**
   * Curtidas, comentários APROVADOS e se a pessoa da sessão curtiu (card
   * #47; `curtiu` é falso sem sessão). A API sempre manda; opcionais só para
   * quem monta à mão.
   */
  curtidas: z.number().int().nonnegative().optional(),
  comentarios: z.number().int().nonnegative().optional(),
  curtiu: z.boolean().optional(),
  /**
   * O atacado do post (card #56): faixas em preço sobre `precoCentavos` e o
   * pedido mínimo. Nulo = só varejo. A API sempre manda; opcional só para
   * quem monta à mão.
   */
  atacado: esquemaDoAtacadoDoProduto.nullable().optional(),
});

export type ProdutoDoFeed = z.infer<typeof esquemaDoProdutoDoFeed>;

const paginacao = {
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  total: z.number().int().nonnegative(),
};

export const esquemaDosProdutosDoFeed = z.strictObject({
  produtos: z.array(esquemaDoProdutoDoFeed),
  ...paginacao,
  /**
   * Faceta de atacado (card #59): quantos produtos do resultado (com os mesmos
   * filtros, menos o de atacado) têm preço de atacado.
   */
  totalComAtacado: z.number().int().nonnegative().optional(),
});

export const esquemaDaLojaDoFeed = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  tipoDeNegocio: z.string(),
  tipoDeNegocioNome: z.string(),
  cidade: z.string().nullable(),
  bairro: z.string().nullable(),
  uf: z.string().nullable(),
  formasDeEntrega: z.array(z.string()),
  logo: z.string().nullable(),
  /** A foto de perfil (= logo) e as iniciais para a bolinha (card #46). */
  fotoDePerfil: z.string().nullable().optional(),
  iniciais: z.string().optional(),
  capa: z.string().nullable(),
  /** A cor de destaque do tema da loja (`#rrggbb`). */
  corDestaque: z.string(),
  distanciaKm: z.number().nullable(),
  /** Quantos produtos a loja tem no feed. */
  produtosNoFeed: z.number().int().nonnegative(),
  /** Só é verdadeiro com sessão: a pessoa favoritou esta loja. */
  favorita: z.boolean(),
  /** Última visita da pessoa da sessão, em ISO 8601; nula sem sessão. */
  ultimaVisita: z.string().nullable(),
  /**
   * Curtidas, comentários APROVADOS feitos na loja e se a pessoa da sessão curtiu (card
   * #47; `curtiu` é falso sem sessão). A API sempre manda; opcionais só para
   * quem monta à mão.
   */
  curtidas: z.number().int().nonnegative().optional(),
  comentarios: z.number().int().nonnegative().optional(),
  curtiu: z.boolean().optional(),
});

export type LojaDoFeed = z.infer<typeof esquemaDaLojaDoFeed>;

export const esquemaDasLojasDoFeed = z.strictObject({
  lojas: z.array(esquemaDaLojaDoFeed),
  ...paginacao,
});

/** Resposta de favoritar, desfavoritar e registrar visita. */
export const esquemaDaMarcaDaLoja = z.strictObject({
  apelido: z.string(),
  favorita: z.boolean(),
});

export const esquemaDaVisitaRegistrada = z.strictObject({
  apelido: z.string(),
  visitas: z.number().int().min(1),
  ultimaVisita: z.string(),
});

// ---------------------------------------------------------------------------
// Favoritos de produto, a lista de favoritos e os recentes (card #45)
// ---------------------------------------------------------------------------

/** Um produto favorito, como a aba Favoritos da conta o mostra. */
export const esquemaDoProdutoFavorito = z.strictObject({
  /** O mesmo identificador da página do produto na vitrine e do feed. */
  id: z.string(),
  nome: z.string(),
  precoCentavos: z.number().int().nullable(),
  precoOriginalCentavos: z.number().int().nullable(),
  imagem: z.string().nullable(),
  /** Dá para pedir agora (não está marcado como esgotado/pausado). */
  disponivel: z.boolean(),
  /** Pausado até esta data (ISO 8601), quando há. */
  indisponivelAte: z.string().nullable(),
  loja: esquemaDaLojaNoCartao,
  /** Quando a pessoa favoritou, em ISO 8601. */
  favoritadoEm: z.string(),
});

export type ProdutoFavorito = z.infer<typeof esquemaDoProdutoFavorito>;

/**
 * `GET /v1/feed/favoritos`: as lojas e os produtos favoritos, do mais novo
 * para o mais antigo. Loja fora do ar e produto excluído/despublicado ficam
 * de fora; produto indisponível aparece com `disponivel: false`.
 */
export const esquemaDosFavoritos = z.strictObject({
  lojas: z.array(esquemaDaLojaDoFeed),
  produtos: z.array(esquemaDoProdutoFavorito),
});

export type Favoritos = z.infer<typeof esquemaDosFavoritos>;

/** Resposta de favoritar e desfavoritar produto. */
export const esquemaDaMarcaDoProduto = z.strictObject({
  produtoId: z.string(),
  favorito: z.boolean(),
});

/** `GET /v1/feed/recentes`: lojas visitadas na janela, da última visita para trás. */
export const esquemaDosRecentes = z.strictObject({
  lojas: z.array(esquemaDaLojaDoFeed),
  /** A janela usada, em dias. */
  dias: z.number().int().min(1),
  /** O começo da janela, em ISO 8601. */
  desde: z.string(),
});

export type Recentes = z.infer<typeof esquemaDosRecentes>;

// ---------------------------------------------------------------------------
// Configuração do feed da loja (dono)
// ---------------------------------------------------------------------------

/** `GET` e `PUT /v1/lojas/:apelido/feed` */
export const esquemaDaConfiguracaoDoFeed = z.strictObject({
  /** A loja aparece no feed. Padrão: sim. */
  aparecerNoFeed: z.boolean(),
  /** Produto novo já nasce marcado "publicar no feed". Padrão: não. */
  publicarProdutosNovos: z.boolean(),
});

export type ConfiguracaoDoFeed = z.infer<typeof esquemaDaConfiguracaoDoFeed>;

export const esquemaDaEdicaoDaConfiguracaoDoFeed = esquemaDaConfiguracaoDoFeed
  .partial()
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um ajuste do feed.",
  });

// ---------------------------------------------------------------------------
// Rotas do contrato publicado
// ---------------------------------------------------------------------------

const esquemaDoApelido = z.strictObject({
  apelido: z.string().min(1).max(63),
});

const esquemaDoProdutoNoCaminho = z.strictObject({
  produtoId: z.uuid(),
});

export const rotaDosProdutosDoFeed = definirRota({
  metodo: "get",
  caminho: "/v1/feed/produtos",
  etiqueta: "feed",
  resumo: "Produtos publicados no feed",
  descricao:
    "Produtos marcados 'publicar no feed' de lojas ativas. Filtros: tipo (um ou vários tipos de negócio, separados por vírgula), categoria, entrega (entrega|retirada), busca, ordem (relevancia|distancia|preco-menor|preco-maior|recentes), atacado=1 (só com preço de atacado) e pedidoMinimo (até N unidades), lat/lng para distância, pagina e porPagina (até 50). Público.",
  consulta: esquemaDaConsultaDeProdutosDoFeed,
  resposta: esquemaDosProdutosDoFeed,
  errosPossiveis: [400],
});

export const rotaDasLojasDoFeed = definirRota({
  metodo: "get",
  caminho: "/v1/feed/lojas",
  etiqueta: "feed",
  resumo: "Lojas do feed",
  descricao:
    "Lojas ativas que aparecem no feed. Filtros: tipo, entrega, busca, ordem (relevancia|distancia|recentes|nome), lat/lng, pagina e porPagina. Público; com sessão, cada loja diz se é favorita e a última visita.",
  consulta: esquemaDaConsultaDeLojasDoFeed,
  resposta: esquemaDasLojasDoFeed,
  errosPossiveis: [400],
});

export const rotaDosFavoritos = definirRota({
  metodo: "get",
  caminho: "/v1/conta/favoritos",
  etiqueta: "feed",
  resumo: "Lojas favoritas da conta",
  descricao:
    "As lojas ativas que a pessoa favoritou, da mais recente para a mais antiga. Exige sessão.",
  consulta: esquemaDaConsultaDaListaDaConta,
  resposta: esquemaDasLojasDoFeed,
  errosPossiveis: [400, 401],
});

export const rotaDeFavoritar = definirRota({
  metodo: "post",
  caminho: "/v1/conta/favoritos/:apelido",
  etiqueta: "feed",
  resumo: "Favoritar loja",
  descricao:
    "Marca a loja como favorita. Repetir não muda nada. Loja inexistente ou fora do ar: 404.",
  parametros: esquemaDoApelido,
  resposta: esquemaDaMarcaDaLoja,
  errosPossiveis: [401],
});

export const rotaDeDesfavoritar = definirRota({
  metodo: "delete",
  caminho: "/v1/conta/favoritos/:apelido",
  etiqueta: "feed",
  resumo: "Tirar loja dos favoritos",
  parametros: esquemaDoApelido,
  resposta: esquemaDaMarcaDaLoja,
  errosPossiveis: [401],
});

export const rotaDosRecentes = definirRota({
  metodo: "get",
  caminho: "/v1/conta/recentes",
  etiqueta: "feed",
  resumo: "Lojas visitadas recentemente",
  descricao:
    "As lojas ativas que a pessoa visitou nos últimos 30 dias, da última visita para trás, até 20. Exige sessão.",
  consulta: esquemaDaConsultaDaListaDaConta,
  resposta: esquemaDasLojasDoFeed,
  errosPossiveis: [400, 401],
});

export const rotaDeRegistrarVisita = definirRota({
  metodo: "post",
  caminho: "/v1/conta/recentes/:apelido",
  etiqueta: "feed",
  resumo: "Registrar visita à loja",
  descricao:
    "Registra que a pessoa abriu a loja (vai para os recentes). O site chama ao abrir a vitrine com sessão. Loja inexistente ou fora do ar: 404.",
  parametros: esquemaDoApelido,
  resposta: esquemaDaVisitaRegistrada,
  errosPossiveis: [401],
});

export const rotaDaListaDeFavoritos = definirRota({
  metodo: "get",
  caminho: "/v1/feed/favoritos",
  etiqueta: "feed",
  resumo: "Lojas e produtos favoritos da conta",
  descricao:
    "As lojas (até 50) e os produtos (até 100) que a pessoa favoritou, do mais novo para o mais antigo. Loja fora do ar e produto excluído ou despublicado ficam de fora; produto indisponível vem com disponivel=false. Favorito não expira. Exige sessão.",
  resposta: esquemaDosFavoritos,
  errosPossiveis: [401],
});

export const rotaDeFavoritarProduto = definirRota({
  metodo: "post",
  caminho: "/v1/feed/favoritos/produtos/:produtoId",
  etiqueta: "feed",
  resumo: "Favoritar produto",
  descricao:
    "Marca o produto como favorito. Repetir não muda nada. Produto inexistente, despublicado ou de loja fora do ar: 404. O mesmo vale em /v1/conta/favoritos/produtos/:produtoId.",
  parametros: esquemaDoProdutoNoCaminho,
  resposta: esquemaDaMarcaDoProduto,
  errosPossiveis: [400, 401],
});

export const rotaDeDesfavoritarProduto = definirRota({
  metodo: "delete",
  caminho: "/v1/feed/favoritos/produtos/:produtoId",
  etiqueta: "feed",
  resumo: "Tirar produto dos favoritos",
  descricao:
    "Tira o produto dos favoritos (funciona mesmo se ele saiu do ar). O mesmo vale em /v1/conta/favoritos/produtos/:produtoId.",
  parametros: esquemaDoProdutoNoCaminho,
  resposta: esquemaDaMarcaDoProduto,
  errosPossiveis: [400, 401],
});

export const rotaDosRecentesDoFeed = definirRota({
  metodo: "get",
  caminho: "/v1/feed/recentes",
  etiqueta: "feed",
  resumo: "Lojas visitadas recentemente (com janela)",
  descricao:
    "As lojas ativas que a pessoa visitou nos últimos `dias` (padrão 30, até 90), da última visita para trás, até 20, sem repetir. Não são favoritos. Exige sessão.",
  consulta: esquemaDaConsultaDosRecentes,
  resposta: esquemaDosRecentes,
  errosPossiveis: [400, 401],
});

/** Um tipo de negócio, como o feed e o cadastro de lojista o mostram. */
export const esquemaDoTipoDeNegocioPublico = z.strictObject({
  codigo: z.string(),
  nome: z.string(),
  /** O ramo serve comida (lanchonete, restaurante, açaí). */
  alimentacao: z.boolean(),
});

export const esquemaDosTiposDeNegocioPublicos = z.strictObject({
  tipos: z.array(esquemaDoTipoDeNegocioPublico),
});

export const rotaDosTiposDeNegocio = definirRota({
  metodo: "get",
  caminho: "/v1/tipos-de-negocio",
  etiqueta: "feed",
  resumo: "Tipos de negócio",
  descricao:
    "A lista de tipos de negócio da plataforma, na ordem de exibição: os filtros do feed e o cadastro de lojista usam os códigos daqui. Público.",
  resposta: esquemaDosTiposDeNegocioPublicos,
});

export const ROTAS_DO_FEED = [
  rotaDosTiposDeNegocio,
  rotaDosProdutosDoFeed,
  rotaDasLojasDoFeed,
  rotaDosFavoritos,
  rotaDeFavoritar,
  rotaDeDesfavoritar,
  rotaDosRecentes,
  rotaDeRegistrarVisita,
  rotaDaListaDeFavoritos,
  rotaDeFavoritarProduto,
  rotaDeDesfavoritarProduto,
  rotaDosRecentesDoFeed,
] as const;

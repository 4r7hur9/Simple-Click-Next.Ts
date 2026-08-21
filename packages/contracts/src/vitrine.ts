/**
 * Contrato da vitrine pública.
 *
 * É a primeira rota de negócio da API, e a que o site inteiro espera: sem ela,
 * a tabela de fronteiras deixa o site sem caminho até o banco, e nenhuma página
 * de loja tem de onde carregar nada.
 *
 * O ESQUEMA DA RESPOSTA É ESTRITO, e isso não é preciosismo. A projeção pública
 * já filtra o que sai (AC-904), mas um esquema frouxo aqui aceitaria um campo a
 * mais no dia em que alguém acrescentasse um — e a chave PIX mora na mesma linha
 * do banco que as boas-vindas. Estrito, o teste de conformidade recusa, e é isso
 * que mantém este arquivo verdadeiro em vez de decorativo.
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";

/** Endereço da loja, para quem vai retirar. Sem CEP e sem coordenada. */
export const esquemaDeEnderecoDaLoja = z.strictObject({
  logradouro: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
});

/** Se a loja está aberta agora, e quando volta a abrir (AC-401). */
export const esquemaDeAbertura = z.strictObject({
  aberta: z.boolean(),
  /** "abre hoje às 18h". Nulo quando não há previsão. */
  proximaAbertura: z.string().nullable(),
  motivo: z.enum([
    "ABERTA",
    "FORA_DO_HORARIO",
    "PAUSA",
    "ENCERRADA",
    "EXCECAO",
  ]),
  /** O que o dono escreveu no feriado, quando é ele que fecha. */
  explicacaoDaExcecao: z.string().nullable().optional(),
});

/** A loja como a vitrine a mostra. */
export const esquemaDeLojaPublica = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  ramo: z.string(),
  fusoHorario: z.string(),
  moeda: z.string(),
  formasDeEntrega: z.array(z.string()),
  boasVindas: z.string().nullable(),
  logo: z.string().nullable(),
  capa: z.string().nullable(),
  cores: z.record(z.string(), z.string()).nullable(),
  enderecoParaRetirada: esquemaDeEnderecoDaLoja.nullable(),
});

export type LojaPublicaNoContrato = z.infer<typeof esquemaDeLojaPublica>;

/** O que a página da loja recebe. */
export const esquemaDaVitrine = z.strictObject({
  loja: esquemaDeLojaPublica,
  abertura: esquemaDeAbertura,
  /**
   * Endereço canônico, quando o usado não é o oficial. A página redireciona,
   * em vez de servir a mesma loja em dois endereços — o que dividiria a
   * relevância dela nos buscadores.
   */
  redirecionarPara: z.string().nullable(),
});

export type Vitrine = z.infer<typeof esquemaDaVitrine>;

/** O apelido da loja no endereço. */
export const esquemaDoApelido = z.strictObject({
  apelido: z
    .string()
    .min(2)
    .max(80)
    // Só o que um apelido de loja pode ter. Sem isto, o valor viaja até a
    // consulta do banco carregando qualquer coisa que caiba numa URL.
    .regex(
      /^[a-z0-9-]+$/,
      "Apelido de loja tem letras minúsculas, números e hífen.",
    ),
});

/**
 * `GET /v1/vitrine/:apelido` — a loja como o público a vê.
 *
 * Responde 404 para loja inexistente E para loja suspensa, com a mesma resposta
 * (AC-402): distinguir as duas contaria a quem perguntasse que aquele endereço
 * já existiu e foi suspenso.
 */
export const rotaDaVitrine = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido",
  etiqueta: "vitrine",
  resumo: "A loja como o público a vê",
  descricao:
    "Devolve o que a vitrine mostra de uma loja: nome, apresentação, cores, endereço para retirada e se ela está aberta agora, no fuso dela. Nunca devolve chave PIX, documento, telefone do dono nem configuração interna. Loja inexistente e loja suspensa respondem igual.",
  parametros: esquemaDoApelido,
  resposta: esquemaDaVitrine,
  errosPossiveis: [400],
});

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/**
 * Um produto, como o cartão da vitrine o mostra.
 *
 * DINHEIRO É CENTAVO INTEIRO (P-005). Preço em ponto flutuante erra em
 * multiplicação: R$ 19,99 três vezes dá R$ 59,969999999999999 em vez de
 * R$ 59,97, e o cliente vê um centavo de diferença entre a vitrine e o cupom.
 */
export const esquemaDeProdutoNaVitrine = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  nome: z.string(),
  /** A frase curta do cartão. Nula quando o dono não escreveu. */
  chamada: z.string().nullable(),
  /** Nulo quando o preço depende de variação e só se sabe no produto. */
  precoCentavos: z.int().nonnegative().nullable(),
  /** O preço "de", para quando há promoção. */
  precoAnteriorCentavos: z.int().nonnegative().nullable(),
  imagem: z.string().nullable(),
  destaque: z.boolean(),
  disponivel: z.boolean(),
});

export type ProdutoNaVitrineNoContrato = z.infer<
  typeof esquemaDeProdutoNaVitrine
>;

/** Uma seção da vitrine, na ordem que o dono definiu. */
export const esquemaDeSecaoDaVitrine = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  nome: z.string(),
  produtos: z.array(esquemaDeProdutoNaVitrine),
});

/**
 * O catálogo público de uma loja.
 *
 * A VERSÃO É TEXTO, e não número. A coluna que a origina é `bigint` no banco, e
 * JSON não tem esse tipo — passá-la como número exigiria confiar que ela nunca
 * passe do limite seguro do JavaScript, o que é verdade hoje e é uma aposta
 * sobre o futuro. Texto não aposta.
 */
export const esquemaDoCatalogo = z.strictObject({
  secoes: z.array(esquemaDeSecaoDaVitrine),
  /** Os destaques, em área própria no topo. */
  destaques: z.array(esquemaDeProdutoNaVitrine),
  versao: z.string(),
});

export type CatalogoDaVitrineNoContrato = z.infer<typeof esquemaDoCatalogo>;

/**
 * `GET /v1/vitrine/:apelido/catalogo` — as seções e os destaques da loja.
 *
 * SEPARADO DA APRESENTAÇÃO de propósito: quem só quer saber se a loja está
 * aberta não deve baixar o cardápio inteiro. As duas telas pedem em paralelo o
 * que cada uma precisa.
 *
 * O que não está publicado não aparece aqui de forma alguma — categoria oculta,
 * categoria removida e produto em rascunho são recusados pela política do
 * banco, e não pelo filtro de quem consulta.
 */
export const rotaDoCatalogo = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/catalogo",
  etiqueta: "vitrine",
  resumo: "As seções e os destaques da loja",
  descricao:
    "Devolve o catálogo público de uma loja: as seções visíveis na ordem que o dono definiu, com os produtos publicados de cada uma, e a lista de destaques. Traz também a versão do catálogo, que muda a cada alteração e serve para saber quando uma cópia guardada venceu. Loja inexistente e loja suspensa respondem igual.",
  parametros: esquemaDoApelido,
  resposta: esquemaDoCatalogo,
  errosPossiveis: [400],
});

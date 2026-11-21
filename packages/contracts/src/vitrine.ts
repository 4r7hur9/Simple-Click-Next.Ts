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

import { esquemaDoAtacadoDoProduto } from "./atacado.ts";
import { esquemaDaMidiaPublica } from "./midia.ts";
import { definirRota } from "./rota.ts";
import { esquemaDoTemaDaLoja } from "./tema.ts";
import { esquemaDeComposicaoDoRamo } from "./vertical.ts";

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

/**
 * As palavras que o RAMO da loja usa (AC-400).
 *
 * LOJA DE ROUPA NÃO TEM CARDÁPIO. A tela que escreve "Cardápio" para todo mundo
 * acerta na lanchonete e erra na loja de roupas, na autopeça e na de
 * eletrônicos — e o dono percebe no primeiro minuto, porque é a palavra que ele
 * usa o dia inteiro.
 *
 * Vem da API, e não de um `if` na tela: o vocabulário mora no banco, um
 * conjunto por ramo, e é isso que permite acrescentar um ramo novo sem tocar em
 * componente nenhum — inclusive nos aplicativos nativos, que leem este mesmo
 * contrato.
 */
export const esquemaDeRotulosDoRamo = z.strictObject({
  /** "Cardápio" na lanchonete, "Catálogo" na loja de roupas. */
  catalogo: z.string(),
  /** "Sabor", "Tamanho", "Aplicação", "Modelo", "Volume". */
  variacao: z.string(),
  /** "Ingredientes", "Acompanhamentos", "Especificações", "Opções". */
  grupoOpcao: z.string(),
  buscaPlaceholder: z.string(),
});

/** A loja como a vitrine a mostra. */
export const esquemaDeLojaPublica = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  ramo: z.string(),
  /**
   * Se o ramo é de ALIMENTAÇÃO (AC-403).
   *
   * PARECE REDUNDANTE COM `ramo`, e não é. Quem consome poderia decidir olhando
   * o código ("começa com FOOD_"), e é justamente isso que este campo evita: a
   * regra sobre ramos passaria a morar em cada tela e em cada aplicativo, e um
   * ramo novo — "Padaria", "Pizzaria" — nasceria classificado errado em todos
   * eles ao mesmo tempo, sem ninguém notar.
   *
   * O banco já sabe (`vertical_presets.is_food`), e o contrato só para de
   * esconder. Quem precisa disso hoje são os dados estruturados: buscador
   * entende `Restaurant` + `Menu` para quem serve comida e `Store` +
   * `OfferCatalog` para quem vende objeto, e mandar o par errado faz o
   * buscador desprezar o bloco inteiro.
   */
  alimentacao: z.boolean(),
  rotulos: esquemaDeRotulosDoRamo,
  blocos: esquemaDeComposicaoDoRamo,
  fusoHorario: z.string(),
  moeda: z.string(),
  formasDeEntrega: z.array(z.string()),
  boasVindas: z.string().nullable(),
  sobre: z.string().nullable(),
  logo: z.string().nullable(),
  capa: z.string().nullable(),
  cores: z.record(z.string(), z.string()).nullable(),
  /**
   * O tema da loja (card #25): cor de destaque (padrão #b7ff00), imagem de
   * fundo da vitrine e do topo do cardápio. O fundo é sempre preto.
   */
  tema: esquemaDoTemaDaLoja.optional(),
  whatsappPublico: z.string().nullable(),
  enderecoParaRetirada: esquemaDeEnderecoDaLoja.nullable(),
  /**
   * Quantas curtidas e quantos comentários APROVADOS feitos na loja tem (card #47). Sem o
   * "curtiu" da pessoa: a vitrine é pública; quem precisa dele lê o feed.
   * A API sempre manda; opcionais só para quem monta à mão.
   */
  curtidas: z.int().nonnegative().optional(),
  comentarios: z.int().nonnegative().optional(),
});

export type LojaPublicaNoContrato = z.infer<typeof esquemaDeLojaPublica>;

/**
 * A grade semanal de funcionamento, para a página "Sobre" mostrar os 7 dias.
 *
 * `abertura` diz se está aberta AGORA; isto diz como é a semana. É o horário que
 * o dono cadastrou, sem exceções datadas: o feriado de hoje já sai em
 * `abertura`. `dia` usa 0 no domingo, como `packages/core`.
 */
export const esquemaDoHorarioPublico = z.strictObject({
  modo: z.enum([
    "SCHEDULE",
    "ALWAYS_OPEN",
    "TEMPORARILY_CLOSED",
    "PERMANENTLY_CLOSED",
  ]),
  semana: z.array(
    z.strictObject({
      dia: z.int().min(0).max(6),
      /** Vazio é dia fechado. "18:00"–"23:30", no fuso da loja. */
      faixas: z.array(z.strictObject({ abre: z.string(), fecha: z.string() })),
    }),
  ),
});

export type HorarioPublicoNoContrato = z.infer<typeof esquemaDoHorarioPublico>;

/**
 * Um banner promocional do cardápio: uma imagem larga para o computador e outra
 * para o celular, porque a mesma arte cortada nas duas proporções perde o texto.
 *
 * `link` é para onde o toque leva (categoria, produto ou endereço externo);
 * `titulo` é texto opcional por cima da imagem. `alt` é obrigatório: banner é
 * conteúdo, e quem não vê a imagem precisa saber da promoção.
 */
export const esquemaDoBannerPublico = z.strictObject({
  id: z.string(),
  imagemDesktop: z.string(),
  imagemMobile: z.string(),
  alt: z.string(),
  link: z.string().nullable().optional(),
  titulo: z.string().nullable().optional(),
});

export type BannerPublicoNoContrato = z.infer<typeof esquemaDoBannerPublico>;

/** O que a página da loja recebe. */
export const esquemaDaVitrine = z.strictObject({
  loja: esquemaDeLojaPublica,
  abertura: esquemaDeAbertura,
  /** Opcional para o cliente antigo continuar aceitando a resposta. */
  horario: esquemaDoHorarioPublico.optional(),
  /**
   * Os banners do cardápio, na ordem de exibição. Opcional e retrocompatível:
   * ausente ou vazio, a seção não aparece.
   */
  banners: z.array(esquemaDoBannerPublico).optional(),
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
 * Por que um produto não pode ser comprado agora (AC-413).
 *
 * SÃO SÓ OS MOTIVOS QUE A API PRODUZ. "Loja fechada" não está aqui de
 * propósito: quem sabe o horário é a rota da apresentação, que já devolve
 * `abertura`, e a página do produto busca as duas. Declarar aqui um valor que a
 * API nunca devolve faria o cliente do aplicativo nativo tratar um caso que não
 * existe — e esconderia que a decisão mora em outro lugar.
 *
 * "Não publicado" também não entra: produto em rascunho responde 404, recusado
 * pela política do banco. Ele não chega a ter resposta em que caber um motivo.
 *
 * `FORA_DO_HORARIO` cobre a pausa datada e a janela semanal do produto
 * (AC-322): para quem está comprando, os dois são "não é vendido agora".
 */
export const esquemaDeIndisponibilidade = z.enum([
  "ESGOTADO",
  "FORA_DO_HORARIO",
]);

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
  /**
   * Por que o cartão não está comprável; nulo quando está (AC-321, AC-322).
   * O mesmo vocabulário da página do produto. Opcional para o cliente antigo,
   * que só lê `disponivel`, continuar aceitando a resposta.
   */
  motivoIndisponivel: esquemaDeIndisponibilidade.nullable().optional(),
  /**
   * O atacado do produto (card #56): as faixas já em preço sobre o varejo do
   * cartão e o pedido mínimo — "Atacado a partir de 10 un.: R$ 9,50". Nulo =
   * só varejo. A API sempre manda; opcional só para quem monta à mão.
   */
  atacado: esquemaDoAtacadoDoProduto.nullable().optional(),
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
  filtros: z
    .array(
      z.strictObject({
        chave: z.string(),
        nome: z.string(),
        valores: z.array(z.string()),
      }),
    )
    .optional(),
  /**
   * Faceta de atacado (card #59): quantos produtos do resultado atual (busca e
   * especificações já aplicadas, sem o próprio filtro de atacado) têm ao menos
   * uma faixa de atacado ativa, e o menor pedido mínimo entre eles. Zero
   * produtos = a tela não oferece o filtro.
   */
  atacado: z
    .strictObject({
      produtos: z.number().int().nonnegative(),
      menorPedidoMinimo: z.number().int().min(2).nullable(),
    })
    .optional(),
});

export type CatalogoDaVitrineNoContrato = z.infer<typeof esquemaDoCatalogo>;

/** `?atacado=1` (ou `true`) liga o filtro; `0`/`false` é o mesmo que ausente. */
export const esquemaDoFiltroDeAtacado = z.enum(["1", "true", "0", "false"]);

/** O filtro de atacado está ligado na consulta. */
export function atacadoLigado(valor: string | undefined): boolean {
  return valor === "1" || valor === "true";
}

/** Pedido mínimo de atacado aceito no filtro, em unidades. */
export const esquemaDoPedidoMinimoDeAtacado = z.coerce
  .number()
  .int()
  .min(2)
  .max(100_000);

/** `?estoque=1` (ou `true`): só o que NÃO está esgotado. `0`/`false` é o mesmo que ausente. */
export const esquemaDoFiltroDeEstoque = z.enum(["1", "true", "0", "false"]);

/** O filtro "em estoque" está ligado na consulta. */
export function estoqueLigado(valor: string | undefined): boolean {
  return valor === "1" || valor === "true";
}

/** O maior preço que o filtro de faixa aceita: R$ 1.000.000,00, em centavos. */
export const TETO_DO_PRECO_DO_FILTRO_EM_CENTAVOS = 100_000_000;

/**
 * Preço do filtro de faixa, em CENTAVOS, escrito só com dígitos.
 *
 * É TEXTO validado por padrão, e não `z.coerce.number()`: o coerce aceitaria
 * "1e3", "0x10", " 12 " e o vazio (que viraria 0 e filtraria pelo preço zero).
 * Também não leva `transform`: este esquema entra no documento OpenAPI, e o
 * gerador publica a forma de SAÍDA (`io: "output"`). Quem usa o valor o converte
 * com `Number()`. O padrão aceita de 1 a 8 dígitos e, exatamente, o teto.
 */
export const esquemaDoPrecoDoFiltro = z
  .string()
  .regex(/^(?:\d{1,8}|100000000)$/);

/** Quantos `?filtro=` uma consulta pode ter, e o tamanho de cada um. */
export const MAXIMO_DE_FILTROS_NA_CONSULTA = 20;
export const MAXIMO_DE_CARACTERES_DO_FILTRO = 120;

const esquemaDeUmFiltro = z.string().max(MAXIMO_DE_CARACTERES_DO_FILTRO);

/**
 * O que a busca da vitrine aceita (AC-408).
 *
 * O TERMO VEM NA CONSULTA, e não no corpo: é assim que ele fica no ENDEREÇO —
 * compartilhável, refazível pelo "voltar" do navegador, e alcançável por um
 * formulário que funciona sem script. A vitrine não pode exigir JavaScript para
 * mostrar produto (AC-415), e busca é mostrar produto.
 */
export const esquemaDaBuscaDoCatalogo = z.strictObject({
  /** Vazio ou ausente é "sem busca", e devolve o catálogo inteiro. */
  busca: z.string().max(60).optional(),
  categoria: z.string().max(80).optional(),
  filtro: z
    .union([
      esquemaDeUmFiltro,
      z.array(esquemaDeUmFiltro).max(MAXIMO_DE_FILTROS_NA_CONSULTA),
    ])
    .optional(),
  /**
   * Só produtos com preço de atacado (card #59): `?atacado=1`. `0` ou ausente
   * não filtra.
   */
  atacado: esquemaDoFiltroDeAtacado.optional(),
  /**
   * Com `atacado=1`: só produtos cujo pedido mínimo de atacado (a menor faixa)
   * é de até N unidades.
   */
  pedidoMinimo: esquemaDoPedidoMinimoDeAtacado.optional(),
  /** Só produtos que não estão esgotados (card #108): `?estoque=1`. */
  estoque: esquemaDoFiltroDeEstoque.optional(),
  /** Preço mínimo, em centavos, inclusive. Só produtos de preço único entram. */
  precoMin: esquemaDoPrecoDoFiltro.optional(),
  /** Preço máximo, em centavos, inclusive. */
  precoMax: esquemaDoPrecoDoFiltro.optional(),
});

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
    "Devolve o catálogo público de uma loja: as seções visíveis na ordem que o dono definiu, com os produtos publicados de cada uma, e a lista de destaques. Traz também a versão do catálogo, que muda a cada alteração e serve para saber quando uma cópia guardada venceu. Aceita os filtros `busca`, `categoria`, `filtro` (até 20), `atacado`, `pedidoMinimo`, `estoque` (só o que não está esgotado) e `precoMin`/`precoMax` (centavos, inclusive, só produtos de preço único). Loja inexistente e loja suspensa respondem igual.",
  parametros: esquemaDoApelido,
  consulta: esquemaDaBuscaDoCatalogo,
  resposta: esquemaDoCatalogo,
  errosPossiveis: [400],
});

// ---------------------------------------------------------------------------
// Catálogo em páginas (card #74)
// ---------------------------------------------------------------------------

/**
 * Como a lista é ordenada. `relevancia` é a ordem do dono (a da seção, quando
 * há categoria; a do produto, quando não há).
 */
export const esquemaDaOrdemDoCatalogo = z.enum([
  "relevancia",
  "menor-preco",
  "maior-preco",
  "a-z",
  /** O maior desconto de atacado, em %, sobre o preço que vale (card #108). */
  "maior-desconto-atacado",
  /** Os mais recentes primeiro, pela data de cadastro (card #108). */
  "lancamentos",
]);

export type OrdemDoCatalogoNoContrato = z.infer<typeof esquemaDaOrdemDoCatalogo>;

/** Quantos produtos cabem numa página, no máximo. */
export const MAXIMO_DA_PAGINA_DO_CATALOGO = 48;

/** Quantos produtos uma página traz quando ninguém pede outro número. */
export const PAGINA_PADRAO_DO_CATALOGO = 24;

/**
 * O que o resumo aceita: os mesmos filtros do catálogo e, em `porSecao`,
 * quantos produtos de cada seção vêm junto (0 = só as contagens).
 *
 * `totalMaximo` reparte um teto entre as seções: com ele, cada seção traz
 * `min(porSecao, totalMaximo / seções)` produtos, nunca menos de 4. Loja de
 * seis seções pequenas vem inteira; loja de quinze seções enormes vem com a
 * vitrine de cada uma.
 */
export const esquemaDaConsultaDoResumo = esquemaDaBuscaDoCatalogo.extend({
  porSecao: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAXIMO_DA_PAGINA_DO_CATALOGO)
    .optional(),
  totalMaximo: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Uma seção no resumo: a contagem e, quando pedidos, os primeiros produtos.
 * `proximoCursor` continua a seção em `/catalogo/produtos?categoria=<apelido>`.
 */
export const esquemaDaSecaoNoResumo = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  nome: z.string(),
  /** Quantos produtos a seção tem com os filtros em vigor. */
  total: z.number().int().nonnegative(),
  produtos: z.array(esquemaDeProdutoNaVitrine),
  proximoCursor: z.string().nullable(),
});

/**
 * O resumo do catálogo: as seções com a contagem de cada uma, os destaques, os
 * filtros e a faceta de atacado — sem o catálogo inteiro. Com filtro (busca,
 * especificação ou atacado), seção sem acerto fica de fora e não há destaques,
 * como no catálogo inteiro.
 */
export const esquemaDoResumoDoCatalogo = z.strictObject({
  versao: z.string(),
  secoes: z.array(esquemaDaSecaoNoResumo),
  destaques: z.array(esquemaDeProdutoNaVitrine),
  filtros: esquemaDoCatalogo.shape.filtros,
  atacado: esquemaDoCatalogo.shape.atacado,
});

export type ResumoDoCatalogoNoContrato = z.infer<
  typeof esquemaDoResumoDoCatalogo
>;

/**
 * O que a página aceita: os filtros do catálogo, a ordem, o cursor devolvido
 * pela página anterior e o tamanho da página.
 */
export const esquemaDaConsultaDaPagina = esquemaDaBuscaDoCatalogo.extend({
  ordem: esquemaDaOrdemDoCatalogo.optional(),
  /** Opaco: é o `proximoCursor` da página anterior, como veio. */
  cursor: z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAXIMO_DA_PAGINA_DO_CATALOGO)
    .optional(),
});

/** Uma página de produtos. `proximoCursor` nulo = acabou. */
export const esquemaDaPaginaDoCatalogo = z.strictObject({
  versao: z.string(),
  produtos: z.array(esquemaDeProdutoNaVitrine),
  /** Quantos produtos a lista inteira tem, com os filtros em vigor. */
  total: z.number().int().nonnegative(),
  proximoCursor: z.string().nullable(),
});

export type PaginaDoCatalogoNoContrato = z.infer<
  typeof esquemaDaPaginaDoCatalogo
>;

/**
 * `GET /v1/vitrine/:apelido/catalogo/resumo` — as seções com contagem, sem o
 * catálogo inteiro. É o que o cardápio pede para desenhar a primeira tela.
 */
export const rotaDoResumoDoCatalogo = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/catalogo/resumo",
  etiqueta: "vitrine",
  resumo: "As seções do catálogo com a contagem de produtos",
  descricao:
    "Devolve as seções visíveis da loja na ordem do dono, com quantos produtos cada uma tem (já com busca, especificações, atacado, estoque e faixa de preço aplicados), os destaques, os filtros e a faceta de atacado. Com `porSecao=N`, cada seção traz também os N primeiros produtos e o cursor para continuar em `/catalogo/produtos`.",
  parametros: esquemaDoApelido,
  consulta: esquemaDaConsultaDoResumo,
  resposta: esquemaDoResumoDoCatalogo,
  errosPossiveis: [400],
});

/**
 * `GET /v1/vitrine/:apelido/catalogo/produtos` — uma página de produtos,
 * filtrada e ordenada no servidor.
 */
export const rotaDaPaginaDoCatalogo = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/catalogo/produtos",
  etiqueta: "vitrine",
  resumo: "Uma página de produtos do catálogo",
  descricao:
    "Devolve até `limite` produtos (padrão 24, máximo 48) com categoria, busca, especificações, atacado, estoque, faixa de preço e ordem aplicados no servidor, o total da lista e o cursor da página seguinte (nulo quando acabou). A ordem pode ser `relevancia`, `menor-preco`, `maior-preco`, `a-z`, `maior-desconto-atacado` ou `lancamentos` (cadastro mais recente primeiro). Sem categoria, a lista junta todas as seções, cada produto uma vez.",
  parametros: esquemaDoApelido,
  consulta: esquemaDaConsultaDaPagina,
  resposta: esquemaDaPaginaDoCatalogo,
  errosPossiveis: [400],
});

// ---------------------------------------------------------------------------
// A página de um produto
// ---------------------------------------------------------------------------

/** Uma imagem do produto, com o espaço dela já conhecido. */
export const esquemaDeImagemDoProduto = z.strictObject({
  url: z.string(),
  /** O que o leitor de tela ouve. Nulo quando o dono não escreveu. */
  texto: z.string().nullable(),
  /**
   * Dimensão em pixels, quando conhecida. Vai para a marcação e é o que impede
   * a página de pular quando a foto chega (AC-416).
   */
  largura: z.int().positive().nullable(),
  altura: z.int().positive().nullable(),
});

/** Uma opção dentro de um grupo de escolha. */
export const esquemaDeOpcao = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  /** Acréscimo em centavos. Negativo quando remover algo dá desconto. */
  acrescimoCentavos: z.int(),
  /** Já vem marcada: o sabor mais pedido aparece selecionado. */
  marcadaPorPadrao: z.boolean(),
  disponivel: z.boolean(),
});

/**
 * Um grupo de escolha do produto.
 *
 * OBRIGATORIEDADE É DERIVADA de `minimo >= 1`, como no banco. Um campo próprio
 * "obrigatorio" seria redundante e abriria a chance de divergir do mínimo — que
 * é exatamente o comentário que a migração 0007 deixou na tabela.
 */
export const esquemaDeGrupoDeEscolha = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  /** `INGREDIENT`, `ADDON`, `VARIATION`, `FRACTION` ou `SPEC`. */
  tipo: z.string(),
  minimo: z.int().nonnegative(),
  maximo: z.int().positive().nullable(),
  permiteRepetir: z.boolean(),
  /** Quando verdadeiro, a escolha deste grupo decide QUAL variante é vendida. */
  eixoDeVariacao: z.boolean(),
  opcoes: z.array(esquemaDeOpcao),
});

/** Uma variante: a unidade que de fato é vendida e que tem estoque. */
export const esquemaDeVariacao = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  precoCentavos: z.int().nonnegative().nullable(),
  precoAnteriorCentavos: z.int().nonnegative().nullable(),
  disponivel: z.boolean(),
  /** A que vem escolhida ao abrir o produto. */
  padrao: z.boolean(),
  /**
   * Qual opção de cada eixo identifica esta variante — "P" em Tamanho, "azul"
   * em Cor. É o que liga a grade de escolhas à peça que tem estoque.
   */
  valoresDosEixos: z.array(
    z.strictObject({ grupoId: z.uuid(), opcaoId: z.uuid() }),
  ),
  /**
   * As faixas de atacado do produto sobre o preço DESTA variante (card #56).
   * Nulo = só varejo. Opcional só para quem monta à mão.
   */
  atacado: esquemaDoAtacadoDoProduto.nullable().optional(),
});

/** O produto como a página dele o mostra (AC-410). */
export const esquemaDoProduto = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  nome: z.string(),
  chamada: z.string().nullable(),
  descricao: z.string().nullable(),
  imagens: z.array(esquemaDeImagemDoProduto),
  /**
   * A galeria do post: fotos E vídeos na ordem do dono (card #46). A API
   * sempre manda; opcional só para quem monta à mão.
   */
  midias: z.array(esquemaDaMidiaPublica).optional(),
  /**
   * As especificações que a loja cadastrou para este produto (card #109,
   * T-10912), já em texto para ler ("195,5 mm", "Sim"). Só o cadastrado: vazio
   * quando a loja não cadastrou nada. A API sempre manda; opcional só para
   * quem monta à mão.
   */
  especificacoes: z
    .array(
      z.strictObject({
        chave: z.string(),
        nome: z.string(),
        valor: z.string(),
      }),
    )
    .optional(),
  /** O preço da variante padrão, ou o do produto quando não há variante. */
  precoCentavos: z.int().nonnegative().nullable(),
  precoAnteriorCentavos: z.int().nonnegative().nullable(),
  /**
   * A próxima QUEDA de preço do produto nos próximos 7 dias (card #140): o
   * preço unitário de varejo que passa a valer em `aPartirDe`. Aumento agendado
   * nunca aparece. A chave só existe com a feature flag
   * FLAG_VITRINE_PROXIMO_PRECO ligada; ligada e sem queda, vem nulo. Opcional
   * porque, desligada, a resposta é a de sempre.
   */
  proximoPreco: z
    .strictObject({
      precoCentavos: z.int().nonnegative(),
      aPartirDe: z.iso.datetime(),
    })
    .nullable()
    .optional(),
  /**
   * O atacado sobre `precoCentavos` (card #56): a tabela de faixas com o
   * preço por unidade e a economia. Nulo = só varejo. Opcional só para quem
   * monta à mão.
   */
  atacado: esquemaDoAtacadoDoProduto.nullable().optional(),
  grupos: z.array(esquemaDeGrupoDeEscolha),
  variacoes: z.array(esquemaDeVariacao),
  disponivel: z.boolean(),
  /** Preenchido só quando `disponivel` é falso. */
  motivoIndisponivel: esquemaDeIndisponibilidade.nullable(),
  /** Se o dono aceita observação escrita neste item. */
  aceitaObservacao: z.boolean(),
  /** A seção a que ele pertence, para a página oferecer o caminho de volta. */
  secao: z
    .strictObject({ id: z.uuid(), apelido: z.string(), nome: z.string() })
    .nullable(),
  /**
   * Quantas curtidas e quantos comentários APROVADOS o produto tem (card #47). Sem o
   * "curtiu" da pessoa: a vitrine é pública; quem precisa dele lê o feed.
   * A API sempre manda; opcionais só para quem monta à mão.
   */
  curtidas: z.int().nonnegative().optional(),
  comentarios: z.int().nonnegative().optional(),
});

export type ProdutoNoContrato = z.infer<typeof esquemaDoProduto>;

/** O identificador do produto no endereço, junto do apelido da loja. */
export const esquemaDoApelidoEProduto = esquemaDoApelido.extend({
  produtoId: z.uuid(),
});

/**
 * `GET /v1/vitrine/:apelido/produto/:produtoId` — a página de um produto.
 *
 * SEPARADA DO CATÁLOGO de propósito. O catálogo devolve o cartão: nome, foto e
 * preço. Aqui vêm as imagens todas, a descrição, os grupos de escolha e as
 * variantes — que é muito mais dado por produto, e que ninguém precisa baixar
 * sessenta vezes só para ver a vitrine.
 *
 * Produto inexistente, em rascunho ou de categoria oculta responde 404, igual a
 * loja inexistente e pelo mesmo motivo: distinguir contaria a quem perguntasse
 * o que existe atrás do que não está publicado.
 */
export const rotaDoProduto = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/produto/:produtoId",
  etiqueta: "vitrine",
  resumo: "A página de um produto",
  descricao:
    "Devolve um produto publicado de uma loja: imagens, descrição, preço, grupos de escolha com o que é obrigatório, e as variantes com preço e disponibilidade. Produto não publicado, de categoria oculta ou de loja suspensa responde 404, sem distinguir os casos.",
  parametros: esquemaDoApelidoEProduto,
  resposta: esquemaDoProduto,
  errosPossiveis: [400],
});

// ---------------------------------------------------------------------------
// O fechamento
// ---------------------------------------------------------------------------

/**
 * A chave PIX da loja (AC-510).
 *
 * ELA SÓ EXISTE NESTA ROTA, e é a única do contrato inteiro que a carrega. O
 * AC-904 manda a chave não aparecer nos dados públicos da vitrine; o AC-510
 * manda ela aparecer quando o cliente escolhe pagar com PIX. Os dois convivem
 * porque são MOMENTOS diferentes: a chave não é segredo de quem vai pagar, é
 * segredo de quem está varrendo a plataforma para juntar chaves.
 */
export const esquemaDaChavePix = z.strictObject({
  chave: z.string(),
  /** `EMAIL`, `CPF`, `CNPJ`, `TELEFONE`, `ALEATORIA`. */
  tipo: z.string().nullable(),
  /** O nome de quem recebe — é o que a pessoa confere antes de pagar. */
  titular: z.string().nullable(),
});

/** O que a loja configurou sobre entrega (AC-506, AC-507). */
export const esquemaDaEntregaDaLoja = z.strictObject({
  aceitaEntrega: z.boolean(),
  aceitaRetirada: z.boolean(),
  /** Zero é taxa zero; NULO é "a combinar". Os dois são diferentes. */
  taxaCentavos: z.int().nonnegative().nullable(),
  nomeDaTaxa: z.string().nullable(),
  gratisAcimaDeCentavos: z.int().nonnegative().nullable(),
  minimoParaEntregaCentavos: z.int().nonnegative().nullable(),
  minimoParaRetiradaCentavos: z.int().nonnegative().nullable(),
  prazoMinutos: z.int().nonnegative().nullable(),
});

/** O que o fechamento da loja oferece. */
export const esquemaDoFechamento = z.strictObject({
  /** `PIX`, `CASH`, `CARD_ON_DELIVERY`, na ordem que o dono definiu. */
  formasDePagamento: z.array(z.string()),
  pix: esquemaDaChavePix.nullable(),
  entrega: esquemaDaEntregaDaLoja,
  aceitaObservacao: z.boolean(),
});

export type FechamentoNoContrato = z.infer<typeof esquemaDoFechamento>;

/**
 * `GET /v1/vitrine/:apelido/fechamento` — o que a loja aceita e como cobra.
 *
 * SEPARADA DA APRESENTAÇÃO PORQUE CARREGA A CHAVE PIX. Juntá-la à vitrine
 * entregaria a chave a todo mundo que abrisse a página da loja, que é
 * exatamente o que o AC-904 proíbe — e ninguém que só quer ver o cardápio
 * precisa saber a forma de pagamento.
 */
export const rotaDoFechamento = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/fechamento",
  etiqueta: "carrinho",
  resumo: "O que a loja aceita no fechamento",
  descricao:
    "Devolve as formas de pagamento que a loja aceita, a chave PIX quando ela aceita PIX, e a configuração de entrega — taxa, mínimo e entrega grátis. É a única rota do contrato que carrega a chave PIX, e ela não aparece nos dados públicos da vitrine.",
  parametros: esquemaDoApelido,
  resposta: esquemaDoFechamento,
  errosPossiveis: [400],
});

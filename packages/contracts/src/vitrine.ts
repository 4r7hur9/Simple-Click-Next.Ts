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
  whatsappPublico: z.string().nullable(),
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
});

export type CatalogoDaVitrineNoContrato = z.infer<typeof esquemaDoCatalogo>;

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
  filtro: z.union([z.string(), z.array(z.string())]).optional(),
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
    "Devolve o catálogo público de uma loja: as seções visíveis na ordem que o dono definiu, com os produtos publicados de cada uma, e a lista de destaques. Traz também a versão do catálogo, que muda a cada alteração e serve para saber quando uma cópia guardada venceu. Loja inexistente e loja suspensa respondem igual.",
  parametros: esquemaDoApelido,
  consulta: esquemaDaBuscaDoCatalogo,
  resposta: esquemaDoCatalogo,
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
});

/** O produto como a página dele o mostra (AC-410). */
export const esquemaDoProduto = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  nome: z.string(),
  chamada: z.string().nullable(),
  descricao: z.string().nullable(),
  imagens: z.array(esquemaDeImagemDoProduto),
  /** O preço da variante padrão, ou o do produto quando não há variante. */
  precoCentavos: z.int().nonnegative().nullable(),
  precoAnteriorCentavos: z.int().nonnegative().nullable(),
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

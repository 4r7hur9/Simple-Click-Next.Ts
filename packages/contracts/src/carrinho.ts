/**
 * Contrato do carrinho do visitante.
 *
 * QUEM É O DONO DO CARRINHO É UM TOKEN DE SESSÃO, e não uma conta. Comprar na
 * vitrine não exige cadastro — é a decisão de produto que separa o SimpleClick
 * do concorrente que pede login antes do cardápio. O token é emitido pela API
 * como cookie no primeiro contato, viaja sozinho a cada requisição e é o que a
 * política do banco confere (migração 0012). Ele NÃO aparece neste contrato:
 * cookie não é campo de corpo, e declará-lo aqui convidaria alguém a mandá-lo
 * por parâmetro — que é exatamente como um visitante alcançaria o carrinho de
 * outro.
 *
 * O PREÇO NÃO ENTRA NO CORPO como valor a cobrar. `totalVistoCentavos` existe
 * só para a API registrar divergência entre o que a tela mostrou e o que ela
 * cobra (P-006, AC-504) — ele jamais compõe a conta. Ler preço do que o
 * navegador manda foi o erro da primeira versão deste produto, e é o que
 * permite fechar um pedido de mil reais por um.
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";
import { esquemaDoApelido } from "./vitrine.ts";

/** Uma escolha marcada num grupo, como o cliente a envia. */
export const esquemaDeEscolhaEnviada = z.strictObject({
  grupoId: z.uuid(),
  opcaoId: z.uuid(),
  /** Quantas vezes. Só passa de 1 em grupo que permite repetir. */
  quantidade: z.int().positive().max(20).default(1),
});

/** O que o cliente manda para acrescentar um item. */
export const esquemaDeItemParaAcrescentar = z.strictObject({
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable().optional(),
  /** Teto de 99 para o dedo escorregado não pedir duzentas coxinhas. */
  quantidade: z.int().positive().max(99),
  observacao: z.string().max(280).nullable().optional(),
  escolhas: z.array(esquemaDeEscolhaEnviada).max(50).default([]),
  /** O total que a tela mostrou. Só serve para registrar divergência. */
  totalVistoCentavos: z.int().nonnegative().nullable().optional(),
});

/** Uma opção escolhida, como o carrinho a guarda. */
export const esquemaDeOpcaoNoCarrinho = z.strictObject({
  grupoNome: z.string(),
  opcaoNome: z.string(),
  quantidade: z.int().positive(),
});

/**
 * Um item do carrinho.
 *
 * NÃO TRAZ NOME NEM PREÇO DO PRODUTO, e isso é desenho, não esquecimento. O
 * carrinho guarda O QUE FOI ESCOLHIDO — identificadores, quantidade, observação
 * e os nomes das opções que a cozinha vai ler. Nome e preço do produto vêm do
 * CATÁLOGO, e vêm no momento de conferir (AC-503): entre montar o carrinho e
 * fechar o pedido, o dono pode ter corrigido um preço ou renomeado o item, e
 * congelar isso aqui faria a tela mostrar um valor que não é mais o da loja.
 *
 * A cópia congelada existe, e nasce no PEDIDO — não no carrinho (AC-506).
 */
export const esquemaDeItemDoCarrinho = z.strictObject({
  id: z.uuid(),
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable(),
  quantidade: z.int().positive(),
  observacao: z.string().nullable(),
  opcoes: z.array(esquemaDeOpcaoNoCarrinho),
});

/** O carrinho inteiro. */
export const esquemaDoCarrinho = z.strictObject({
  itens: z.array(esquemaDeItemDoCarrinho),
  /** Soma das quantidades — é o número do ícone do carrinho. */
  totalDeItens: z.int().nonnegative(),
});

export type CarrinhoNoContrato = z.infer<typeof esquemaDoCarrinho>;
export type ItemParaAcrescentarNoContrato = z.infer<
  typeof esquemaDeItemParaAcrescentar
>;

/** A quantidade nova de um item. Zero remove — é o que a gaveta já faz. */
export const esquemaDeQuantidadeNova = z.strictObject({
  quantidade: z.int().nonnegative().max(99),
});

/** O item no endereço, junto do apelido da loja. */
export const esquemaDoApelidoEItem = esquemaDoApelido.extend({
  itemId: z.uuid(),
});

/**
 * `GET /v1/vitrine/:apelido/carrinho` — o carrinho desta sessão.
 *
 * Sessão sem carrinho responde 200 com lista vazia, e não 404: carrinho vazio é
 * um estado legítimo da tela, e 404 faria a gaveta tratar "ainda não comprei
 * nada" como falha de carregamento.
 */
export const rotaDeVerCarrinho = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/carrinho",
  etiqueta: "carrinho",
  resumo: "O carrinho desta sessão",
  descricao:
    "Devolve o carrinho aberto da sessão do visitante naquela loja. Sessão sem carrinho responde com lista vazia. O dono do carrinho é o token de sessão, emitido pela API como cookie no primeiro contato.",
  parametros: esquemaDoApelido,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400],
});

/**
 * `POST /v1/vitrine/:apelido/carrinho/itens` — acrescenta um item.
 *
 * A API RECALCULA O ITEM antes de guardá-lo, com os preços que ela lê do
 * catálogo, e recusa o que não fecha: grupo obrigatório sem escolha, opção
 * esgotada, escolha que não é do produto. É a mesma função que a tela usa para
 * mostrar o total (`calcularItem`), e é isso que faz o valor conferido no
 * servidor ser o mesmo que a pessoa viu (AC-411).
 */
export const rotaDeAcrescentarItem = definirRota({
  metodo: "post",
  caminho: "/v1/vitrine/:apelido/carrinho/itens",
  etiqueta: "carrinho",
  resumo: "Acrescenta um item ao carrinho",
  descricao:
    "Acrescenta um item ao carrinho da sessão. A API recalcula o preço a partir do catálogo e recusa o item quando falta escolha obrigatória, quando uma opção acabou ou quando a escolha não pertence ao produto. O valor enviado pelo cliente nunca compõe a conta.",
  parametros: esquemaDoApelido,
  corpo: esquemaDeItemParaAcrescentar,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404, 409],
});

/** `PATCH .../itens/:itemId` — muda a quantidade. Zero remove. */
export const rotaDeMudarQuantidade = definirRota({
  metodo: "patch",
  caminho: "/v1/vitrine/:apelido/carrinho/itens/:itemId",
  etiqueta: "carrinho",
  resumo: "Muda a quantidade de um item",
  descricao:
    "Muda a quantidade de um item do carrinho. Zero remove o item, que é o que a gaveta faz quando a pessoa desce a quantidade até o fim.",
  parametros: esquemaDoApelidoEItem,
  corpo: esquemaDeQuantidadeNova,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404],
});

/** `DELETE .../itens/:itemId` — tira o item. */
export const rotaDeRemoverItem = definirRota({
  metodo: "delete",
  caminho: "/v1/vitrine/:apelido/carrinho/itens/:itemId",
  etiqueta: "carrinho",
  resumo: "Tira um item do carrinho",
  descricao:
    "Tira um item do carrinho da sessão. O CARRINHO em si não é apagável pelo visitante: carrinho abandonado é o rastro de quem chegou perto de comprar, e o dono precisa dele para saber onde perde venda.",
  parametros: esquemaDoApelidoEItem,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404],
});

/**
 * Carrinho do visitante (AC-500, AC-501, AC-502).
 *
 * O CARRINHO MORA NO BANCO, e não no navegador. A escolha tem consequência
 * direta no que o critério promete: o carrinho sobrevive a fechar o navegador,
 * o dono enxerga quem chegou perto de comprar e não fechou, e o preço que vale
 * é sempre o do servidor. Guardado só no navegador, ele sumiria na primeira
 * limpeza de dados do site e o dono nunca saberia quanta venda perdeu.
 *
 * QUEM É O DONO DO CARRINHO é o token de sessão que a requisição declara. Ele
 * não identifica pessoa — identifica um carrinho. Sem ele, o visitante
 * enxergaria o carrinho de todos os outros da mesma loja, que foi o que a
 * migração 0012 consertou.
 *
 * As chaves aqui são VIVAS, ao contrário das do pedido: o item aponta para o
 * produto de verdade. É de propósito — é assim que se descobre que o preço
 * mudou entre montar o carrinho e fechar o pedido, que é o assunto da T-501.
 */
import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";

/** Uma escolha guardada no item, como o cliente a fez. */
export interface OpcaoNoCarrinho {
  readonly grupoId?: string | null;
  readonly grupoNome: string;
  readonly opcaoId?: string | null;
  readonly opcaoNome: string;
  readonly quantidade?: number;
}

/** O que o cliente pediu para acrescentar ao carrinho. */
export interface ItemParaAcrescentar {
  readonly produtoId: string;
  readonly variacaoId?: string | null;
  readonly quantidade: number;
  readonly observacao?: string | null;
  readonly opcoes?: readonly OpcaoNoCarrinho[];
}

/** Um item como o carrinho o guarda hoje. */
export interface ItemDoCarrinho {
  readonly id: string;
  readonly produtoId: string;
  readonly variacaoId: string | null;
  readonly quantidade: number;
  readonly observacao: string | null;
  readonly opcoes: readonly OpcaoNoCarrinho[];
}

/** O carrinho inteiro, do jeito que a gaveta na tela o mostra. */
export interface CarrinhoAtual {
  readonly id: string;
  readonly itens: readonly ItemDoCarrinho[];
  /** Soma das quantidades — é o número que aparece no ícone do carrinho. */
  readonly totalDeItens: number;
}

export class ErroDeCarrinho extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeCarrinho";
  }
}

/** A sessão declarada, ou recusa: sem ela o banco não mostraria nada mesmo. */
function exigirSessao(): string {
  const sessao = exigirContexto().sessaoDoCarrinho;
  if (sessao === undefined || sessao === "") {
    throw new ErroDeCarrinho(
      "a sessão do carrinho precisa estar declarada no contexto da requisição",
    );
  }
  return sessao;
}

function exigirLoja(): string {
  const loja = exigirContexto().lojaId;
  if (loja === undefined || loja === "") {
    throw new ErroDeCarrinho("o carrinho exige uma loja no contexto");
  }
  return loja;
}

/** Lê as opções guardadas como texto livre, sem confiar no formato. */
function lerOpcoes(bruto: unknown): OpcaoNoCarrinho[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (item): item is OpcaoNoCarrinho =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as OpcaoNoCarrinho).grupoNome === "string" &&
      typeof (item as OpcaoNoCarrinho).opcaoNome === "string",
  );
}

/**
 * Acha o carrinho aberto desta sessão, ou cria um.
 *
 * Carrinho já convertido em pedido NÃO é reaproveitado: ele saiu do alcance do
 * visitante pela política, e reaproveitá-lo misturaria a compra nova com o
 * rastro da anterior.
 */
async function carrinhoAberto(
  tx: TransacaoDoBanco,
  lojaId: string,
  sessao: string,
): Promise<string> {
  const existente = await tx.cart.findFirst({
    where: { storeId: lojaId, sessionToken: sessao, convertedAt: null },
    select: { id: true },
  });
  if (existente !== null) return existente.id;

  const criado = await tx.cart.create({
    data: { storeId: lojaId, sessionToken: sessao, channel: "ONLINE" },
    select: { id: true },
  });
  return criado.id;
}

/** Devolve o carrinho da sessão, criando um vazio se ainda não houver. */
export async function verCarrinho(): Promise<CarrinhoAtual> {
  const tx = transacaoAtual();
  const carrinhoId = await carrinhoAberto(tx, exigirLoja(), exigirSessao());
  return montarCarrinho(tx, carrinhoId);
}

async function montarCarrinho(
  tx: TransacaoDoBanco,
  carrinhoId: string,
): Promise<CarrinhoAtual> {
  const linhas = await tx.cartItem.findMany({
    where: { cartId: carrinhoId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      variantId: true,
      quantity: true,
      notes: true,
      options: true,
    },
  });

  const itens = linhas.map((linha) => ({
    id: linha.id,
    produtoId: linha.productId,
    variacaoId: linha.variantId,
    quantidade: linha.quantity,
    observacao: linha.notes,
    opcoes: lerOpcoes(linha.options),
  }));

  return {
    id: carrinhoId,
    itens,
    // A soma das QUANTIDADES, e não a contagem de linhas: o ícone precisa dizer
    // "5 itens" para cinco marmitas numa linha só, senão o número mente.
    totalDeItens: itens.reduce((soma, item) => soma + item.quantidade, 0),
  };
}

/**
 * Acrescenta um item, somando à linha igual quando ela já existe.
 *
 * "Linha igual" é mesmo produto, mesma variação, mesma observação e mesmas
 * opções. Criar linha nova a cada toque encheria a gaveta de repetições do
 * mesmo lanche, e o cliente teria de somar de cabeça quantos pediu.
 */
export async function acrescentarItem(
  item: ItemParaAcrescentar,
): Promise<CarrinhoAtual> {
  if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
    throw new ErroDeCarrinho(
      `quantidade precisa ser inteiro positivo, recebeu ${item.quantidade}`,
    );
  }

  const tx = transacaoAtual();
  const lojaId = exigirLoja();
  const carrinhoId = await carrinhoAberto(tx, lojaId, exigirSessao());

  const iguais = await tx.cartItem.findMany({
    where: {
      cartId: carrinhoId,
      productId: item.produtoId,
      variantId: item.variacaoId ?? null,
      notes: item.observacao ?? null,
    },
    select: { id: true, quantity: true, options: true },
  });
  const assinatura = JSON.stringify(item.opcoes ?? []);
  const igual = iguais.find(
    (linha) => JSON.stringify(linha.options ?? []) === assinatura,
  );

  if (igual !== undefined) {
    await tx.cartItem.updateMany({
      where: { id: igual.id },
      data: { quantity: igual.quantity + item.quantidade },
    });
    return montarCarrinho(tx, carrinhoId);
  }

  await tx.cartItem.create({
    data: {
      storeId: lojaId,
      cartId: carrinhoId,
      productId: item.produtoId,
      variantId: item.variacaoId ?? null,
      quantity: item.quantidade,
      notes: item.observacao ?? null,
      options: (item.opcoes ?? []) as never,
    },
  });

  return montarCarrinho(tx, carrinhoId);
}

/**
 * Muda a quantidade de um item. Chegar a zero TIRA o item (AC-501).
 *
 * Zero não é quantidade válida de compra: guardá-la deixaria uma linha inútil
 * na gaveta, contando como item no ícone e somando zero no total.
 */
export async function mudarQuantidade(
  itemId: string,
  quantidade: number,
): Promise<CarrinhoAtual> {
  if (!Number.isInteger(quantidade) || quantidade < 0) {
    throw new ErroDeCarrinho(
      `quantidade precisa ser inteiro não negativo, recebeu ${quantidade}`,
    );
  }

  const tx = transacaoAtual();
  const carrinhoId = await carrinhoAberto(tx, exigirLoja(), exigirSessao());

  if (quantidade === 0) {
    await tx.cartItem.deleteMany({ where: { id: itemId, cartId: carrinhoId } });
  } else {
    await tx.cartItem.updateMany({
      where: { id: itemId, cartId: carrinhoId },
      data: { quantity: quantidade },
    });
  }

  return montarCarrinho(tx, carrinhoId);
}

/** Tira um item do carrinho. */
export async function removerItem(itemId: string): Promise<CarrinhoAtual> {
  return mudarQuantidade(itemId, 0);
}

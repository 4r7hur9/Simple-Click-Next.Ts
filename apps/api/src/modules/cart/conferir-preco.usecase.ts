/**
 * Conferência do carrinho contra o catálogo vivo (AC-503, AC-504, P-006).
 *
 * É o último ponto antes de o pedido existir, e o único lugar do sistema em que
 * o preço é lido do banco para virar dinheiro. Tudo o que veio da tela — total,
 * preço unitário, o que for — é DESCARTADO aqui. O que a tela mandou entra
 * apenas como referência para dizer o que mudou, e para registrar a tentativa
 * quando o número não bate.
 *
 * O carrinho tem chaves VIVAS para o produto, ao contrário do pedido. É de
 * propósito, e é o que torna esta conferência possível: o item aponta para o
 * produto de verdade, então dá para perguntar ao catálogo quanto ele custa
 * agora e se ainda existe.
 */
import { conferirCarrinho } from "@simpleclick/core";
import type { Conferencia, ProdutoAgora } from "@simpleclick/core";

import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";
import { registrador } from "../../core/log.ts";

/** Evento do registro de segurança quando o cliente manda outro total. */
export const EVENTO_DE_DIVERGENCIA = "checkout.total_divergente";

/** O que a tela enviou junto com o pedido de fechamento. */
export interface DeclaracaoDoCliente {
  /** O total que a tela mostrou. Nunca entra na conta (P-006). */
  readonly totalEmCentavos?: number | null;
  /** O preço que a tela mostrou de cada item, por identificador de item. */
  readonly precosVistos?: Readonly<Record<string, number>>;
}

/** Lê do catálogo o estado atual de cada produto do carrinho. */
async function catalogoAgora(
  tx: TransacaoDoBanco,
  produtoIds: readonly string[],
): Promise<ProdutoAgora[]> {
  if (produtoIds.length === 0) return [];

  const produtos = await tx.product.findMany({
    where: { id: { in: [...produtoIds] }, deletedAt: null },
    select: {
      id: true,
      name: true,
      displayPriceCents: true,
      isAvailable: true,
      status: true,
    },
  });

  return produtos.map((produto) => ({
    produtoId: produto.id,
    nome: produto.name,
    // Produto sem preço publicado vale zero e não passa: quem esqueceu de
    // precificar não pode vender por engano.
    precoEmCentavos: Number(produto.displayPriceCents ?? 0n),
    // Rascunho e arquivado não são compráveis, mesmo marcados como disponíveis:
    // o dono pode ter tirado o produto do ar sem mexer no interruptor.
    disponivel: produto.isAvailable && produto.status === "PUBLISHED",
  }));
}

/**
 * Confere o carrinho e devolve o veredito, com os preços do servidor.
 *
 * Quando o total enviado pelo cliente não bate com o calculado, a tentativa é
 * REGISTRADA antes de a conferência voltar. Não é acusação: divergência
 * acontece por tela velha, aba aberta desde ontem, corrida entre o dono mudar o
 * preço e a pessoa clicar. Registrar é o que permite distinguir isso, que é
 * comum, de alguém tentando fechar um pedido de mil reais por um.
 */
export async function conferirAntesDeFechar(
  carrinhoId: string,
  declarado: DeclaracaoDoCliente = {},
): Promise<Conferencia> {
  const tx = transacaoAtual();

  const linhas = await tx.cartItem.findMany({
    where: { cartId: carrinhoId },
    orderBy: { createdAt: "asc" },
    select: { id: true, productId: true, quantity: true },
  });

  const itens = linhas.map((linha) => ({
    itemId: linha.id,
    produtoId: linha.productId,
    quantidade: linha.quantity,
    precoVistoEmCentavos: declarado.precosVistos?.[linha.id] ?? null,
  }));

  const catalogo = await catalogoAgora(
    tx,
    itens.map((item) => item.produtoId),
  );

  const conferido = conferirCarrinho(
    itens,
    catalogo,
    declarado.totalEmCentavos ?? null,
  );

  if (conferido.houveDivergencia) {
    const contexto = exigirContexto();
    registrador().aviso(EVENTO_DE_DIVERGENCIA, {
      // Nada de dado pessoal aqui (P-009): o que interessa é a loja, o
      // carrinho e os dois números.
      lojaId: contexto.lojaId,
      recurso: "carrinho",
      recursoId: carrinhoId,
      quantidade: conferido.itensQueSeguem.length,
      detalhe: {
        totalDoServidorEmCentavos: conferido.subtotalEmCentavos,
        totalEnviadoEmCentavos: conferido.totalQueOClienteEnviouEmCentavos,
      },
    });
  }

  return conferido;
}

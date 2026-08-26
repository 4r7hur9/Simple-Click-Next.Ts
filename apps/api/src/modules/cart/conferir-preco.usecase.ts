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
import { conferirCarrinho, precoQueVale } from "@simpleclick/core";
import type {
  Conferencia,
  ItemParaConferir,
  PrecoCadastrado,
  ProdutoAgora,
} from "@simpleclick/core";

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
    // Produto sem preço publicado vale NULO, e não zero: nulo faz o item ser
    // retirado com explicação; zero o faria seguir de graça, o pedido sair e a
    // cozinha preparar. Quem esqueceu de precificar não vende por engano.
    precoEmCentavos:
      produto.displayPriceCents === null
        ? null
        : Number(produto.displayPriceCents),
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
/** Traduz um preço do banco para o vocabulário da regra do core. */
function comoRegra(linha: {
  readonly kind: string;
  readonly amountCents: bigint;
  readonly minQuantity: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}): PrecoCadastrado {
  return {
    tipo: linha.kind,
    valorEmCentavos: Number(linha.amountCents),
    quantidadeMinima: linha.minQuantity,
    ativo: linha.isActive,
    comecaEm: linha.startsAt,
    terminaEm: linha.endsAt,
  };
}

/**
 * O preço de cada variante do carrinho, AGORA.
 *
 * Pizza P e G são o mesmo produto com preços diferentes, e o preço mora na
 * variante. Sem esta leitura, duas linhas do carrinho com variantes distintas
 * seriam conferidas pelo mesmo valor — e o produto com variantes, cujo preço de
 * vitrine é nulo, seria conferido por zero.
 *
 * Variante que sumiu do cardápio não aparece aqui, e o item que a aponta é
 * retirado com explicação: nulo não é zero.
 */
async function precoDasVariantes(
  tx: TransacaoDoBanco,
  variantIds: readonly string[],
  agora: Date,
): Promise<Map<string, number | null>> {
  const precos = new Map<string, number | null>();
  if (variantIds.length === 0) return precos;

  const variantes = await tx.productVariant.findMany({
    where: { id: { in: [...variantIds] }, deletedAt: null },
    select: {
      id: true,
      isAvailable: true,
      stockQuantity: true,
      precos: {
        select: {
          kind: true,
          amountCents: true,
          minQuantity: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });

  for (const variante of variantes) {
    const vigente = precoQueVale(variante.precos.map(comoRegra), agora);
    precos.set(variante.id, vigente.atualEmCentavos);
  }

  // A variante que a consulta não devolveu (apagada, ou de outra loja) fica
  // registrada como SEM preço — e não simplesmente ausente do mapa, que a
  // faria cair no preço do produto e seguir por um valor que não é dela.
  for (const id of variantIds) {
    if (!precos.has(id)) precos.set(id, null);
  }

  return precos;
}

/**
 * O acréscimo de cada item, somado a partir das opções que ele guarda.
 *
 * O CARRINHO GUARDA A ESCOLHA, e o preço dela mora em `option_items`. Somar
 * daqui, e não do que foi guardado, é o que impede o adicional de sair de graça
 * — e é o que faz a conferência acompanhar o dono que mudou o preço do bacon.
 *
 * Opção sem identificador guardado (item criado antes de a rota existir) conta
 * como zero: não há de onde tirar o preço, e chutar seria inventar dinheiro.
 */
function acrescimoDoItem(
  opcoes: unknown,
  precoPorOpcao: ReadonlyMap<string, number>,
): number {
  if (!Array.isArray(opcoes)) return 0;

  let soma = 0;
  for (const bruta of opcoes) {
    if (typeof bruta !== "object" || bruta === null) continue;
    const opcao = bruta as { opcaoId?: unknown; quantidade?: unknown };
    if (typeof opcao.opcaoId !== "string") continue;
    const delta = precoPorOpcao.get(opcao.opcaoId);
    if (delta === undefined) continue;
    const vezes =
      typeof opcao.quantidade === "number" && opcao.quantidade > 0
        ? Math.trunc(opcao.quantidade)
        : 1;
    soma += delta * vezes;
  }
  return soma;
}

/** O acréscimo de cada opção citada pelo carrinho, lido do catálogo. */
async function precoDasOpcoes(
  tx: TransacaoDoBanco,
  opcaoIds: readonly string[],
): Promise<Map<string, number>> {
  const precos = new Map<string, number>();
  if (opcaoIds.length === 0) return precos;

  const itens = await tx.optionItem.findMany({
    where: { id: { in: [...opcaoIds] } },
    select: { id: true, priceDeltaCents: true },
  });

  for (const item of itens) {
    precos.set(item.id, Number(item.priceDeltaCents));
  }
  return precos;
}

/** Colhe os identificadores de opção guardados numa linha do carrinho. */
function opcaoIdsDe(opcoes: unknown): string[] {
  if (!Array.isArray(opcoes)) return [];
  return opcoes.flatMap((bruta) => {
    if (typeof bruta !== "object" || bruta === null) return [];
    const id = (bruta as { opcaoId?: unknown }).opcaoId;
    return typeof id === "string" ? [id] : [];
  });
}

export async function conferirAntesDeFechar(
  carrinhoId: string,
  declarado: DeclaracaoDoCliente = {},
  agora: Date = new Date(),
): Promise<Conferencia> {
  const tx = transacaoAtual();

  const linhas = await tx.cartItem.findMany({
    where: { cartId: carrinhoId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      variantId: true,
      quantity: true,
      options: true,
    },
  });

  const [precoPorVariante, precoPorOpcao] = await Promise.all([
    precoDasVariantes(
      tx,
      linhas.flatMap((l) => (l.variantId === null ? [] : [l.variantId])),
      agora,
    ),
    precoDasOpcoes(
      tx,
      linhas.flatMap((l) => opcaoIdsDe(l.options)),
    ),
  ]);

  const itens: ItemParaConferir[] = linhas.map((linha) => ({
    itemId: linha.id,
    produtoId: linha.productId,
    quantidade: linha.quantity,
    precoVistoEmCentavos: declarado.precosVistos?.[linha.id] ?? null,
    acrescimosEmCentavos: acrescimoDoItem(linha.options, precoPorOpcao),
    // `undefined` (e não `null`) quando a linha não tem variante: aí vale o
    // preço do produto. A diferença entre os dois é o que separa "não se
    // aplica" de "procurei e não achei".
    ...(linha.variantId === null
      ? {}
      : { precoBaseEmCentavos: precoPorVariante.get(linha.variantId) ?? null }),
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

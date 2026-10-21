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
import {
  conferirCarrinho,
  estaNaJanelaDeDisponibilidade,
  lerJanelasDeDisponibilidade,
  precoAplicavel,
  precoValeAgora,
} from "@simpleclick/core";
import type {
  AtacadoDoItem,
  Conferencia,
  ExplicacaoDoPreco,
  ItemParaConferir,
  PrecoAplicado,
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

/**
 * A faixa de preço por quantidade que valeu para um item, como o pedido a
 * congela (card #57). Nula no varejo.
 */
export interface FaixaQueValeu {
  /** A partir de quantas unidades a faixa vale. */
  readonly quantidadeMinima: number;
  /** Nulo no atacado antigo, de preço fixo, que não tinha desconto. */
  readonly tipoDeDesconto: "PERCENTUAL" | "VALOR" | null;
  readonly desconto: number | null;
  readonly rotulo: string | null;
}

/**
 * O preço de um item com a explicação completa: o tipo, o varejo riscado e o
 * atacado (faixa que valeu, próxima e quanto falta). É o que a tela precisa
 * para "faltam 4 peças para o próximo desconto" e o pedido, para o histórico.
 */
export interface PrecoDoItemConferido {
  /** `BASE`, `PROMO` ou `WHOLESALE`. */
  readonly tipo: string;
  /**
   * O preço de varejo por unidade (já com as opções), quando o cobrado é
   * menor: é o riscado ao lado. Nulo no preço normal.
   */
  readonly varejoUnitarioEmCentavos: number | null;
  readonly faixa: FaixaQueValeu | null;
  /** O atacado do produto, quando ele tem faixas com desconto valendo. */
  readonly atacado: AtacadoDoItem | null;
}

/** A conferência, com o preço explicado de cada item que segue. */
export interface ConferenciaComAtacado extends Conferencia {
  /** Por identificador do item do carrinho. */
  readonly precosDosItens: ReadonlyMap<string, PrecoDoItemConferido>;
}

/** Os campos de `product_prices` que a regra lê. */
const CAMPOS_DO_PRECO = {
  kind: true,
  label: true,
  amountCents: true,
  minQuantity: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  discountKind: true,
  discountValue: true,
} as const;

/** Uma linha de `product_prices`, como a consulta devolve. */
interface LinhaDePreco {
  readonly kind: string;
  readonly label?: string | null;
  readonly amountCents: bigint;
  readonly minQuantity: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly discountKind?: string | null;
  readonly discountValue?: bigint | null;
}

/** O preço escolhido para um item: o número e a explicação. */
interface PrecoEscolhido {
  readonly centavos: number | null;
  readonly explicacao: ExplicacaoDoPreco | null;
  readonly detalhe: Omit<PrecoDoItemConferido, "varejoUnitarioEmCentavos"> & {
    /** O varejo por unidade, SEM as opções (elas entram na conferência). */
    readonly varejoEmCentavos: number | null;
  };
}

/**
 * Qual faixa valeu, a partir do preço que a regra escolheu.
 *
 * Faixa com desconto vem pronta da regra. O atacado antigo, de preço fixo, não
 * diz de qual linha veio: é a linha WHOLESALE sem desconto, valendo agora, com
 * esse valor e a maior quantidade mínima que a quantidade alcança.
 */
function faixaDe(
  aplicado: PrecoAplicado,
  regras: readonly PrecoCadastrado[],
  agora: Date,
  quantidade: number,
): FaixaQueValeu | null {
  if (aplicado.tipo !== "WHOLESALE") return null;
  const daRegra = aplicado.atacado?.faixaAplicada ?? null;
  if (
    daRegra !== null &&
    daRegra.unitarioEmCentavos === aplicado.unitarioEmCentavos
  ) {
    return {
      quantidadeMinima: daRegra.quantidadeMinima,
      tipoDeDesconto: daRegra.tipoDeDesconto,
      desconto: daRegra.desconto,
      rotulo: daRegra.rotulo,
    };
  }
  const fixa = regras
    .filter(
      (p) =>
        p.tipo === "WHOLESALE" &&
        (p.tipoDeDesconto ?? null) === null &&
        p.valorEmCentavos === aplicado.unitarioEmCentavos &&
        precoValeAgora(p, agora, quantidade),
    )
    .sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)[0];
  if (fixa === undefined) return null;
  const rotulo = fixa.rotulo?.trim();
  return {
    quantidadeMinima: fixa.quantidadeMinima,
    tipoDeDesconto: null,
    desconto: null,
    rotulo: rotulo === undefined || rotulo === "" ? null : rotulo,
  };
}

/** Escolhe o preço de um item pela regra do core, com a explicação toda. */
function escolherPreco(
  linhas: readonly LinhaDePreco[],
  agora: Date,
  quantidade: number,
): PrecoEscolhido {
  const regras = linhas.map(comoRegra);
  const aplicado = precoAplicavel(regras, agora, quantidade);
  if (aplicado === null) {
    return {
      centavos: null,
      explicacao: null,
      detalhe: {
        tipo: "BASE",
        varejoEmCentavos: null,
        faixa: null,
        atacado: null,
      },
    };
  }
  const varejo = aplicado.anteriorEmCentavos;
  return {
    centavos: aplicado.unitarioEmCentavos,
    explicacao: explicacaoDe(aplicado),
    detalhe: {
      tipo: aplicado.tipo,
      varejoEmCentavos:
        varejo !== null && varejo > aplicado.unitarioEmCentavos ? varejo : null,
      faixa: faixaDe(aplicado, regras, agora, quantidade),
      atacado: aplicado.atacado ?? null,
    },
  };
}

/** Lê do catálogo o estado atual de cada produto do carrinho. */
async function catalogoAgora(
  tx: TransacaoDoBanco,
  produtoIds: readonly string[],
  quantidades: ReadonlyMap<string, number>,
  agora: Date,
  precosDosProdutos: Map<string, PrecoEscolhido>,
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
      unavailableUntil: true,
      saleWindows: true,
    },
  });

  // A JANELA DE VENDA VALE NO FECHAMENTO TAMBÉM (AC-322): o item posto no
  // carrinho no sábado e fechado na terça sai com explicação, como o que
  // acabou. O fuso é o da loja, lido pela política pública da própria loja.
  const loja = await tx.store.findFirst({ select: { timezone: true } });
  const fusoHorario = loja?.timezone ?? "America/Sao_Paulo";
  const vendeAgora = (produto: (typeof produtos)[number]): boolean =>
    // Rascunho e arquivado não são compráveis, mesmo marcados como
    // disponíveis: o dono pode ter tirado o produto do ar sem mexer no
    // interruptor. Esgotado vence a janela (AC-321).
    produto.isAvailable &&
    produto.status === "PUBLISHED" &&
    (produto.unavailableUntil === null || produto.unavailableUntil <= agora) &&
    estaNaJanelaDeDisponibilidade(
      lerJanelasDeDisponibilidade(produto.saleWindows),
      agora,
      fusoHorario,
    );

  const precos = await tx.productPrice.findMany({
    where: { productId: { in: [...produtoIds] }, variantId: null },
    select: { productId: true, ...CAMPOS_DO_PRECO },
  });
  const porProduto = new Map<string, typeof precos>();
  for (const preco of precos) {
    const doProduto = porProduto.get(preco.productId) ?? [];
    doProduto.push(preco);
    porProduto.set(preco.productId, doProduto);
  }

  return produtos.map((produto) => {
    let precosDoProduto = porProduto.get(produto.id);

    // Só faixas de atacado, sem preço de varejo na tabela: o varejo é a
    // projeção gravada no produto, e a faixa incide sobre ele.
    if (
      precosDoProduto !== undefined &&
      precosDoProduto.every((p) => p.discountKind !== null) &&
      produto.displayPriceCents !== null
    ) {
      precosDoProduto = [
        ...precosDoProduto,
        {
          productId: produto.id,
          kind: "BASE",
          label: null,
          amountCents: produto.displayPriceCents,
          minQuantity: 1,
          isActive: true,
          startsAt: null,
          endsAt: null,
          discountKind: null,
          discountValue: null,
        },
      ];
    }

    if (precosDoProduto === undefined) {
      // Produto de antes da tabela de preços: vale a projeção gravada nele.
      // Produto sem preço publicado vale NULO, e não zero: nulo faz o item ser
      // retirado com explicação; zero o faria seguir de graça, o pedido sair e
      // a cozinha preparar. Quem esqueceu de precificar não vende por engano.
      return {
        produtoId: produto.id,
        nome: produto.name,
        precoEmCentavos:
          produto.displayPriceCents === null
            ? null
            : Number(produto.displayPriceCents),
        disponivel: vendeAgora(produto),
      };
    }

    // A QUANTIDADE ENTRA NA ESCOLHA (AC-310): seis unidades do mesmo produto,
    // somadas por todas as linhas dele, alcançam o preço de atacado que uma
    // unidade não alcança.
    const escolhido = escolherPreco(
      precosDoProduto,
      agora,
      quantidades.get(produto.id) ?? 1,
    );
    precosDosProdutos.set(produto.id, escolhido);
    return {
      produtoId: produto.id,
      nome: produto.name,
      precoEmCentavos: escolhido.centavos,
      precoAplicado: escolhido.explicacao,
      disponivel: vendeAgora(produto),
    };
  });
}

/**
 * O que a tela precisa saber do preço escolhido: nome e motivo (AC-310).
 *
 * Preço normal não tem explicação — "custa o que custa" não precisa de frase,
 * e explicar toda linha ensinaria a pessoa a não ler nenhuma.
 */
function explicacaoDe(
  aplicado: PrecoAplicado | null,
): ExplicacaoDoPreco | null {
  if (aplicado === null || aplicado.motivo === null) return null;
  return { rotulo: aplicado.rotulo, motivo: aplicado.motivo };
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
/**
 * Traduz um preço do banco para o vocabulário da regra do core.
 *
 * A FAIXA COM DESCONTO PRECISA CHEGAR COMO FAIXA. Ela guarda `amount_cents = 0`
 * (0064); lida sem `discount_kind`, viraria um atacado de preço fixo de ZERO, e
 * o item sairia de graça.
 */
export function comoRegra(linha: LinhaDePreco): PrecoCadastrado {
  const tipoDeDesconto =
    linha.discountKind === "PERCENT"
      ? "PERCENTUAL"
      : linha.discountKind === "AMOUNT"
        ? "VALOR"
        : null;
  return {
    tipo: linha.kind,
    valorEmCentavos: Number(linha.amountCents),
    quantidadeMinima: linha.minQuantity,
    // Tipo de desconto que esta versão não conhece: a linha fica de fora, e
    // não vira preço fixo de zero.
    ativo:
      linha.isActive &&
      !(
        linha.discountKind !== undefined &&
        linha.discountKind !== null &&
        tipoDeDesconto === null
      ),
    comecaEm: linha.startsAt,
    terminaEm: linha.endsAt,
    rotulo: linha.label ?? null,
    tipoDeDesconto,
    desconto:
      linha.discountValue === undefined || linha.discountValue === null
        ? null
        : Number(linha.discountValue),
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
  quantidadePorVariante: ReadonlyMap<string, number>,
  quantidadePorProduto: ReadonlyMap<string, number>,
  agora: Date,
): Promise<Map<string, PrecoEscolhido>> {
  const precos = new Map<string, PrecoEscolhido>();
  const variantIds = [...quantidadePorVariante.keys()];
  if (variantIds.length === 0) return precos;

  const variantes = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, deletedAt: null },
    select: {
      id: true,
      productId: true,
      isAvailable: true,
      stockQuantity: true,
      precos: { select: CAMPOS_DO_PRECO },
    },
  });

  // As FAIXAS COM DESCONTO moram no produto (0064) e valem para todas as
  // variações, cada uma sobre o seu próprio preço de varejo.
  const faixas = await tx.productPrice.findMany({
    where: {
      productId: { in: [...new Set(variantes.map((v) => v.productId))] },
      variantId: null,
      kind: "WHOLESALE",
      discountKind: { not: null },
    },
    select: { productId: true, ...CAMPOS_DO_PRECO },
  });
  const faixasPorProduto = new Map<string, LinhaDePreco[]>();
  for (const faixa of faixas) {
    const doProduto = faixasPorProduto.get(faixa.productId) ?? [];
    doProduto.push(faixa);
    faixasPorProduto.set(faixa.productId, doProduto);
  }

  for (const variante of variantes) {
    const doProduto = faixasPorProduto.get(variante.productId) ?? [];
    // A faixa do produto conta as PEÇAS do produto, somadas em todas as
    // variações: 6 camisetas P e 4 G são 10 peças para a faixa de 10. O atacado
    // antigo, de preço fixo na variante, continua contando só as unidades
    // DELA — seis camisetas G alcançam o preço da G, e não o da P.
    const quantidade =
      doProduto.length > 0
        ? (quantidadePorProduto.get(variante.productId) ?? 1)
        : (quantidadePorVariante.get(variante.id) ?? 1);
    precos.set(
      variante.id,
      escolherPreco([...variante.precos, ...doProduto], agora, quantidade),
    );
  }

  // A variante que a consulta não devolveu (apagada, ou de outra loja) fica
  // registrada como SEM preço — e não simplesmente ausente do mapa, que a
  // faria cair no preço do produto e seguir por um valor que não é dela.
  for (const id of variantIds) {
    if (!precos.has(id))
      precos.set(id, {
        centavos: null,
        explicacao: null,
        detalhe: {
          tipo: "BASE",
          varejoEmCentavos: null,
          faixa: null,
          atacado: null,
        },
      });
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
): Promise<ConferenciaComAtacado> {
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

  // As quantidades SOMAM as linhas: seis coxinhas em duas linhas (uma com
  // molho, outra sem) são seis coxinhas para o preço de atacado (AC-310).
  const quantidades = new Map<string, number>();
  const quantidadePorVariante = new Map<string, number>();
  for (const linha of linhas) {
    quantidades.set(
      linha.productId,
      (quantidades.get(linha.productId) ?? 0) + linha.quantity,
    );
    if (linha.variantId !== null) {
      quantidadePorVariante.set(
        linha.variantId,
        (quantidadePorVariante.get(linha.variantId) ?? 0) + linha.quantity,
      );
    }
  }

  const [precoPorVariante, precoPorOpcao] = await Promise.all([
    precoDasVariantes(tx, quantidadePorVariante, quantidades, agora),
    precoDasOpcoes(
      tx,
      linhas.flatMap((l) => opcaoIdsDe(l.options)),
    ),
  ]);

  const itens: ItemParaConferir[] = linhas.map((linha) => {
    const daVariante =
      linha.variantId === null
        ? undefined
        : precoPorVariante.get(linha.variantId);
    return {
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
        : {
            precoBaseEmCentavos: daVariante?.centavos ?? null,
            precoAplicado: daVariante?.explicacao ?? null,
          }),
    };
  });

  const precosDosProdutos = new Map<string, PrecoEscolhido>();
  const catalogo = await catalogoAgora(
    tx,
    itens.map((item) => item.produtoId),
    quantidades,
    agora,
    precosDosProdutos,
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

  // O preço explicado de cada item que segue: a faixa que valeu, o varejo
  // riscado (com as opções, como o unitário) e quanto falta para a próxima.
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));
  const precosDosItens = new Map<string, PrecoDoItemConferido>();
  for (const item of conferido.itensQueSeguem) {
    const linha = linhaPorId.get(item.itemId);
    const escolhido =
      linha === undefined
        ? undefined
        : linha.variantId === null
          ? precosDosProdutos.get(linha.productId)
          : precoPorVariante.get(linha.variantId);
    if (escolhido === undefined) continue;
    const { varejoEmCentavos, ...resto } = escolhido.detalhe;
    precosDosItens.set(item.itemId, {
      ...resto,
      varejoUnitarioEmCentavos:
        varejoEmCentavos === null
          ? null
          : varejoEmCentavos + item.acrescimosEmCentavos,
    });
  }

  return { ...conferido, precosDosItens };
}

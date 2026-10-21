/**
 * Criação do pedido (AC-514, AC-516, AC-517, AC-518).
 *
 * Tudo aqui acontece DENTRO da transação da requisição, que já carrega o
 * contexto da loja. É o que faz o isolamento por linha valer para cada inserção
 * sem ninguém precisar lembrar de filtrar por loja — e é também o que garante
 * que um pedido pela metade não sobreviva a um erro no meio do caminho: ou
 * entram o pedido, o contato, os itens e o primeiro passo do histórico, ou não
 * entra nada.
 *
 * O QUE ESTE CASO DE USO NÃO FAZ. Ele não calcula preço. Os valores chegam
 * prontos de quem somou o carrinho com os preços do servidor (P-006): o valor
 * que o cliente enviou é descartado antes de chegar aqui. Ele também não decide
 * se a loja está aberta — recebe a resposta pronta, porque calcular isso a
 * partir do horário cadastrado é assunto da configuração da loja, e depende do
 * fuso que a loja escolheu.
 */
import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";
import { codigoDoPedido } from "./numero-pedido.ts";

/** Item já precificado pelo servidor, pronto para virar cópia congelada. */
export interface ItemParaCriar {
  readonly produtoId?: string | null;
  readonly variacaoId?: string | null;
  readonly nomeDoProduto: string;
  readonly nomeDaVariacao?: string | null;
  readonly sku?: string | null;
  readonly quantidade: number;
  readonly precoUnitarioEmCentavos: number;
  readonly opcoesEmCentavos?: number;
  readonly totalDaLinhaEmCentavos: number;
  readonly observacao?: string | null;
  readonly opcoes?: readonly OpcaoParaCriar[];
  /** Qual preço valeu: `BASE`, `PROMO` ou `WHOLESALE` (card #57). */
  readonly tipoDePreco?: string | null;
  /** O varejo por unidade da época, quando o cobrado foi menor (o riscado). */
  readonly precoDeVarejoEmCentavos?: number | null;
  /** A faixa de atacado que valeu; nula no varejo. */
  readonly faixaDeAtacado?: FaixaDeAtacadoCongelada | null;
}

/**
 * A faixa de atacado que valeu na compra, copiada (card #57, migração 0066):
 * o dono muda a faixa amanhã e o pedido de hoje continua dizendo qual era.
 */
export interface FaixaDeAtacadoCongelada {
  readonly quantidadeMinima: number;
  /** Nulo no atacado antigo, de preço fixo. */
  readonly tipoDeDesconto: "PERCENTUAL" | "VALOR" | null;
  /** Percentual inteiro ou centavos por unidade; nulo no preço fixo. */
  readonly desconto: number | null;
  readonly rotulo: string | null;
}

/** O nome de cada tipo de desconto em `order_items`. */
const TIPO_DE_DESCONTO_NO_BANCO = {
  PERCENTUAL: "PERCENT",
  VALOR: "AMOUNT",
} as const;

/** Escolha registrada num item, como texto do momento da compra. */
export interface OpcaoParaCriar {
  readonly grupoId?: string | null;
  readonly opcaoId?: string | null;
  readonly nomeDoGrupo: string;
  readonly nomeDaOpcao: string;
  readonly quantidade?: number;
  readonly acrescimoEmCentavos?: number;
}

/** Quem pediu. Convidado chega aqui igual a cliente com conta (AC-518). */
export interface ContatoParaCriar {
  readonly nome: string;
  readonly telefoneE164: string;
  readonly email?: string | null;
  readonly logradouro?: string | null;
  readonly numero?: string | null;
  readonly complemento?: string | null;
  readonly bairro?: string | null;
  readonly cidade?: string | null;
  readonly estado?: string | null;
  readonly cep?: string | null;
}

/** Se a loja aceita pedido agora, e quando volta a aceitar (AC-517). */
export interface SituacaoDaLoja {
  readonly aberta: boolean;
  /** Texto pronto para a tela: "abre amanhã às 18h". */
  readonly proximaAbertura?: string | null;
  readonly fusoHorario?: string;
}

/** O pedido inteiro, já conferido e precificado pelo servidor. */
export interface PedidoParaCriar {
  readonly lojaId: string;
  readonly clienteDaLojaId?: string | null;
  readonly contato: ContatoParaCriar;
  readonly itens: readonly ItemParaCriar[];
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly canal?: "ONLINE" | "MANUAL";
  readonly formaDePagamento?: string | null;
  readonly chavePixCopiada?: string | null;
  readonly tipoDaChavePixCopiado?: string | null;
  readonly nomeDoRecebedorCopiado?: string | null;
  readonly trocoParaEmCentavos?: number | null;
  readonly subtotalEmCentavos: number;
  readonly taxaDeEntregaEmCentavos: number;
  readonly modoDaTaxaDeEntrega?: string | null;
  readonly descontoEmCentavos?: number;
  readonly totalEmCentavos: number;
  readonly observacaoDoCliente?: string | null;
  /** Mesma chave, mesmo pedido de volta — nunca um segundo (AC-516). */
  readonly chaveDeIdempotencia?: string | null;
}

/** O pedido criado, com o que a tela precisa mostrar em seguida. */
export interface PedidoCriado {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly tokenPublico: string;
  readonly status: string;
  /** Verdadeiro quando este envio encontrou um pedido que já existia. */
  readonly jaExistia: boolean;
}

/** Recusa da criação, com a frase que a tela mostra ao cliente. */
export interface RecusaDaCriacao {
  readonly causa: "LOJA_FECHADA" | "PEDIDO_SEM_ITENS";
  readonly explicacao: string;
  /** O carrinho continua intacto — a recusa nunca o apaga (AC-517). */
  readonly carrinhoPreservado: true;
}

export type ResultadoDaCriacao =
  | { readonly ok: true; readonly pedido: PedidoCriado }
  | { readonly ok: false; readonly recusa: RecusaDaCriacao };

const STATUS_INICIAL = "PENDING";

/**
 * Pede ao banco o próximo número desta loja.
 *
 * A função é `SECURITY DEFINER` e faz `INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING` numa tacada. Ler o último número e somar 1 aqui pareceria
 * equivalente e não é: dois pedidos simultâneos leriam o mesmo valor, e o
 * segundo bateria no índice único (loja, número) — o cliente veria um erro por
 * ter tido azar de milissegundo.
 */
async function proximoNumero(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<number> {
  const linhas = await tx.$queryRaw<
    { proximo_numero_de_pedido: bigint }[]
  >`SELECT app.proximo_numero_de_pedido(${lojaId}::uuid)`;

  const bruto = linhas[0]?.proximo_numero_de_pedido;
  if (bruto === undefined) {
    throw new Error(
      `o banco não devolveu número de pedido para a loja ${lojaId}`,
    );
  }
  return Number(bruto);
}

/**
 * Procura um pedido já criado com a mesma chave de idempotência (AC-516).
 *
 * A busca é por `findFirst` e não por `findUnique` de propósito: no banco a
 * unicidade é PARCIAL (`WHERE idempotency_key IS NOT NULL`), e declarar no
 * esquema uma unicidade cheia faria o esquema afirmar sobre o banco uma coisa
 * que não é verdade.
 */
async function pedidoJaCriado(
  tx: TransacaoDoBanco,
  lojaId: string,
  chave: string,
): Promise<PedidoCriado | null> {
  const existente = await tx.order.findFirst({
    where: { storeId: lojaId, idempotencyKey: chave },
    select: {
      id: true,
      number: true,
      code: true,
      publicToken: true,
      status: true,
    },
  });

  if (existente === null) return null;
  return {
    id: existente.id,
    numero: Number(existente.number),
    codigo: existente.code,
    tokenPublico: existente.publicToken,
    status: existente.status,
    jaExistia: true,
  };
}

/** O preço que valeu e a faixa de atacado, nas colunas de `order_items`. */
export function colunasDoPreco(item: ItemParaCriar) {
  const faixa = item.faixaDeAtacado ?? null;
  const tipoDeDesconto =
    faixa === null || faixa.tipoDeDesconto === null
      ? null
      : TIPO_DE_DESCONTO_NO_BANCO[faixa.tipoDeDesconto];
  return {
    priceKindSnapshot: item.tipoDePreco ?? null,
    compareAtCents:
      item.precoDeVarejoEmCentavos === undefined ||
      item.precoDeVarejoEmCentavos === null
        ? null
        : BigInt(item.precoDeVarejoEmCentavos),
    wholesaleMinQuantity: faixa?.quantidadeMinima ?? null,
    wholesaleDiscountKind: tipoDeDesconto,
    wholesaleDiscountValue:
      tipoDeDesconto === null || faixa?.desconto === null || faixa === null
        ? null
        : BigInt(faixa.desconto),
    wholesaleLabel: faixa?.rotulo ?? null,
  };
}

/** Grava os itens e as escolhas de cada um, como cópia congelada (P-010). */
async function gravarItens(
  tx: TransacaoDoBanco,
  pedidoId: string,
  lojaId: string,
  itens: readonly ItemParaCriar[],
): Promise<void> {
  // A posição de cada item (e de cada escolha) vira o sortOrder: quem lê o
  // pedido de volta (fila, acompanhamento, histórico, repetir, cupom) ordena
  // por ele, e sem isso todos empatariam em 0 e a ordem ficaria ao acaso.
  for (const [posicao, item] of itens.entries()) {
    const gravado = await tx.orderItem.create({
      data: {
        storeId: lojaId,
        orderId: pedidoId,
        productId: item.produtoId ?? null,
        variantId: item.variacaoId ?? null,
        productName: item.nomeDoProduto,
        variantName: item.nomeDaVariacao ?? null,
        skuSnapshot: item.sku ?? null,
        quantity: item.quantidade,
        unitPriceCents: BigInt(item.precoUnitarioEmCentavos),
        ...colunasDoPreco(item),
        optionsTotalCents: BigInt(item.opcoesEmCentavos ?? 0),
        lineTotalCents: BigInt(item.totalDaLinhaEmCentavos),
        note: item.observacao ?? null,
        sortOrder: posicao,
      },
      select: { id: true },
    });

    for (const [posicaoDaOpcao, opcao] of (item.opcoes ?? []).entries()) {
      await tx.orderItemOption.create({
        data: {
          storeId: lojaId,
          orderItemId: gravado.id,
          optionGroupId: opcao.grupoId ?? null,
          optionItemId: opcao.opcaoId ?? null,
          groupNameSnapshot: opcao.nomeDoGrupo,
          optionNameSnapshot: opcao.nomeDaOpcao,
          quantity: opcao.quantidade ?? 1,
          priceDeltaCents: BigInt(opcao.acrescimoEmCentavos ?? 0),
          sortOrder: posicaoDaOpcao,
        },
      });
    }
  }
}

/**
 * Cria o pedido, ou devolve o que já existia para a mesma chave.
 *
 * A ordem importa: a conferência de idempotência vem ANTES de qualquer
 * gravação, e antes até de pedir um número. Pedir o número primeiro gastaria
 * uma posição da sequência a cada toque duplo, e a loja veria buracos na
 * numeração sem ter cancelado nada.
 */
export async function criarPedido(
  entrada: PedidoParaCriar,
  situacao: SituacaoDaLoja,
): Promise<ResultadoDaCriacao> {
  const tx = transacaoAtual();

  const contexto = exigirContexto();

  if (entrada.chaveDeIdempotencia) {
    // A chave também precisa estar DECLARADA no contexto: é ela que autoriza a
    // leitura do pedido criado por uma tentativa anterior (migração 0010).
    // Divergir aqui não daria erro — a busca simplesmente não acharia nada, e a
    // proteção contra duplicata falharia em silêncio.
    if (contexto.chaveDoFechamento !== entrada.chaveDeIdempotencia) {
      throw new Error(
        "a chave de fechamento do pedido precisa estar declarada no contexto da requisição",
      );
    }
    const existente = await pedidoJaCriado(
      tx,
      entrada.lojaId,
      entrada.chaveDeIdempotencia,
    );
    if (existente !== null) return { ok: true, pedido: existente };
  }

  if (entrada.itens.length === 0) {
    return {
      ok: false,
      recusa: {
        causa: "PEDIDO_SEM_ITENS",
        explicacao: "Seu carrinho está vazio.",
        carrinhoPreservado: true,
      },
    };
  }

  if (!situacao.aberta) {
    // O carrinho NÃO é tocado: quem tentou pedir com a loja fechada volta mais
    // tarde e encontra tudo como deixou. Limpar aqui seria perder a venda.
    return {
      ok: false,
      recusa: {
        causa: "LOJA_FECHADA",
        explicacao: situacao.proximaAbertura
          ? `A loja está fechada agora. Ela ${situacao.proximaAbertura}.`
          : "A loja está fechada agora e ainda não informou o próximo horário de funcionamento.",
        carrinhoPreservado: true,
      },
    };
  }

  // O ENDEREÇO PÚBLICO VEM DO CONTEXTO, e não é sorteado aqui. O motivo é o
  // isolamento por linha: quem autoriza o cliente a criar este pedido é o token
  // que ele declarou na transação (migração 0009). Sortear o token aqui dentro
  // deixaria a declaração e a linha divergentes, e o banco recusaria a escrita
  // — corretamente, porque nada teria provado que aquele pedido é dele.
  const token = contexto.tokenDoPedido;
  if (token === undefined || token === "") {
    throw new Error(
      "criarPedido exige o endereço público do pedido no contexto da requisição",
    );
  }

  const numero = await proximoNumero(tx, entrada.lojaId);
  const codigo = codigoDoPedido(numero);

  const criado = await tx.order.create({
    data: {
      storeId: entrada.lojaId,
      number: BigInt(numero),
      code: codigo,
      publicToken: token,
      storeCustomerId: entrada.clienteDaLojaId ?? null,
      status: STATUS_INICIAL,
      channel: entrada.canal ?? "ONLINE",
      fulfillment: entrada.entrega,
      paymentMethod: entrada.formaDePagamento ?? null,
      changeForCents:
        entrada.trocoParaEmCentavos === null ||
        entrada.trocoParaEmCentavos === undefined
          ? null
          : BigInt(entrada.trocoParaEmCentavos),
      pixKeySnapshot: entrada.chavePixCopiada ?? null,
      pixKeyTypeSnapshot: entrada.tipoDaChavePixCopiado ?? null,
      pixHolderSnapshot: entrada.nomeDoRecebedorCopiado ?? null,
      subtotalCents: BigInt(entrada.subtotalEmCentavos),
      itemsTotalCents: BigInt(entrada.subtotalEmCentavos),
      deliveryFeeCents: BigInt(entrada.taxaDeEntregaEmCentavos),
      deliveryFeeMode: entrada.modoDaTaxaDeEntrega ?? null,
      discountCents: BigInt(entrada.descontoEmCentavos ?? 0),
      totalCents: BigInt(entrada.totalEmCentavos),
      customerNote: entrada.observacaoDoCliente ?? null,
      idempotencyKey: entrada.chaveDeIdempotencia ?? null,
      storeTimezone: situacao.fusoHorario ?? "America/Sao_Paulo",
    },
    select: { id: true },
  });

  // O dado pessoal mora em outra linha, e é isso que torna o apagamento a
  // pedido do titular uma alteração de uma linha só (P-009).
  await tx.orderContact.create({
    data: {
      orderId: criado.id,
      storeId: entrada.lojaId,
      name: entrada.contato.nome,
      phoneE164: entrada.contato.telefoneE164,
      email: entrada.contato.email ?? null,
      street: entrada.contato.logradouro ?? null,
      number: entrada.contato.numero ?? null,
      complement: entrada.contato.complemento ?? null,
      neighborhood: entrada.contato.bairro ?? null,
      city: entrada.contato.cidade ?? null,
      uf: entrada.contato.estado ?? null,
      zip: entrada.contato.cep ?? null,
    },
  });

  await gravarItens(tx, criado.id, entrada.lojaId, entrada.itens);

  // O primeiro passo do histórico nasce junto com o pedido. Sem ele, a fila do
  // dono mostraria um pedido sem saber desde quando ele está esperando. Quem
  // lançou é quem está no contexto: o pedido manual (AC-707) nasce pelas mãos
  // da equipe da loja, e o histórico diz isso; o do site, pelas do cliente.
  const lancadoPelaLoja =
    contexto.papel === "OWNER" || contexto.papel === "STAFF";
  await tx.orderStatusEntry.create({
    data: {
      storeId: entrada.lojaId,
      orderId: criado.id,
      fromStatus: null,
      toStatus: STATUS_INICIAL,
      actorRole: lancadoPelaLoja ? contexto.papel : "CUSTOMER",
      ...(lancadoPelaLoja && contexto.usuarioId
        ? { changedByIdentityId: contexto.usuarioId }
        : {}),
    },
  });

  // O cupom entra na fila de impressão NA MESMA transação (decisão de 17/08):
  // não existe pedido salvo sem cupom enfileirado, nem cupom de pedido que não
  // chegou a existir. Quem decide se a loja imprime pelo agente é a função do
  // banco (migração 0034), que lê a configuração de impressão — este módulo
  // não conhece a fila nem importa o módulo de impressão. Com a impressão
  // térmica desligada pela administração (`auto_print`, T-207 — AC-212), nada
  // entra na fila: senão o agente, ao voltar, imprimiria de uma vez os pedidos
  // do período desligado.
  await tx.$executeRaw`
    SELECT app.enfileirar_impressao(${criado.id}::uuid)
     WHERE app.store_feature_enabled('auto_print')`;

  return {
    ok: true,
    pedido: {
      id: criado.id,
      numero,
      codigo,
      tokenPublico: token,
      status: STATUS_INICIAL,
      jaExistia: false,
    },
  };
}

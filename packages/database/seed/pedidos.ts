/**
 * Os pedidos do cenário de exemplo — em TODOS os status possíveis (AC-036).
 *
 * "Todos" é literal e é a razão de este arquivo gerar os pedidos em vez de
 * listá-los à mão: a lista de status é declarada uma vez, e o cenário produz um
 * pedido para cada item dela. Acrescentar um status novo ao domínio passa a
 * acrescentar um pedido de exemplo sozinho — e a carga deixa de poder ficar
 * desatualizada em silêncio.
 *
 * Dois casos que a especificação nomeia explicitamente ganham tratamento
 * próprio:
 *
 * - **Cancelado.** Vem por um caminho diferente do recusado: recusado é o dono
 *   dizendo não logo na entrada; cancelado é a desistência depois de já ter
 *   sido aceito. O histórico de transições dos dois é diferente, e é o
 *   histórico que a página de acompanhamento mostra.
 * - **Aguardando confirmação no WhatsApp.** NÃO é um status do pedido, e essa é
 *   a parte que engana: o pedido está `PENDING` e o que falta é o cliente
 *   confirmar que enviou a mensagem. O clique no botão não é confirmação — por
 *   isso `whatsapp_clicked_at` está preenchido e `whatsapp_confirmed_at` está
 *   nulo. Um status novo para isso confundiria a fila da cozinha.
 *
 * Todo item do pedido é SNAPSHOT: nome, preço e opção escolhida são cópia
 * congelada do momento da compra (P-010). Mudar o produto amanhã não pode
 * reescrever o pedido de ontem — por isso nada aqui é lido por chave viva na
 * hora de exibir.
 */

import {
  type ConjuntoDeExemplo,
  idDeExemplo,
  instanteDeExemplo,
  json,
  type LinhaDeExemplo,
  tokenDeExemplo,
} from "./deterministico.ts";
import {
  custoDaVariante,
  precoVigente,
  type ProdutoDeExemplo,
  produtosDaLoja,
  idDaOpcao,
  idDaVariante,
  idDoProduto,
  varianteDoPedido,
} from "./catalogo.ts";
import { type ClienteDeExemplo, type LojaDeExemplo, LOJAS } from "./lojas.ts";

// ---------------------------------------------------------------------------
// Os status
// ---------------------------------------------------------------------------

/**
 * Todos os status que um pedido pode ter. É a lista do modelo de dados, e é a
 * fonte da cobertura: o cenário planta um pedido para cada um.
 */
export const STATUS_DE_PEDIDO = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export type StatusDePedido = (typeof STATUS_DE_PEDIDO)[number];

/**
 * O caminho que o pedido percorreu até o status atual.
 *
 * Guardar só o status atual tornaria impossível calcular tempo médio de preparo
 * e de entrega, e deixaria a página de acompanhamento sem o que mostrar. Por
 * isso cada pedido do cenário carrega o histórico inteiro, e não só o fim.
 */
function caminhoAte(status: StatusDePedido): readonly StatusDePedido[] {
  switch (status) {
    case "PENDING":
      return ["PENDING"];
    case "ACCEPTED":
      return ["PENDING", "ACCEPTED"];
    case "PREPARING":
      return ["PENDING", "ACCEPTED", "PREPARING"];
    case "OUT_FOR_DELIVERY":
      return ["PENDING", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY"];
    case "READY_FOR_PICKUP":
      return ["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"];
    case "COMPLETED":
      return [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "OUT_FOR_DELIVERY",
        "COMPLETED",
      ];
    // Recusa acontece na entrada: o dono nunca aceitou.
    case "REJECTED":
      return ["PENDING", "REJECTED"];
    // Cancelamento acontece DEPOIS do aceite — é o que o distingue da recusa.
    case "CANCELLED":
      return ["PENDING", "ACCEPTED", "CANCELLED"];
  }
}

// ---------------------------------------------------------------------------
// Descrição de um pedido
// ---------------------------------------------------------------------------

/** Uma escolha congelada dentro do item do pedido. */
interface EscolhaDoItem {
  readonly grupo: string;
  readonly grupoNome: string;
  readonly opcao: string;
  readonly opcaoNome: string;
  readonly kind: string;
  readonly acao: "ADD" | "REMOVE";
  readonly acrescimoCents: number;
}

/** Um item do pedido, já resolvido em produto, variante e escolhas. */
interface ItemDoPedido {
  readonly produto: ProdutoDeExemplo;
  readonly varianteChave: string;
  readonly varianteNome: string;
  readonly sku: string | null;
  readonly tipoDePreco: string;
  readonly precoUnitarioCents: number;
  readonly custoUnitarioCents: number;
  readonly quantidade: number;
  readonly escolhas: readonly EscolhaDoItem[];
}

/** Um pedido do cenário, com tudo que as linhas precisam. */
export interface PedidoDeExemplo {
  readonly loja: LojaDeExemplo;
  readonly chave: string;
  readonly codigo: string;
  readonly status: StatusDePedido;
  /** Pedido feito, mensagem aberta e ainda não confirmada pelo cliente. */
  readonly aguardandoConfirmacaoNoWhatsapp: boolean;
  readonly cliente: ClienteDeExemplo | null;
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly formaDePagamento: "PIX" | "CASH" | "CARD_ON_DELIVERY";
  readonly itens: readonly ItemDoPedido[];
  /** Quantos minutos antes da referência o pedido foi feito. */
  readonly minutosAntes: number;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/** Os produtos que um pedido pode conter: só os publicados da loja. */
function produtosVendaveis(loja: LojaDeExemplo): readonly ProdutoDeExemplo[] {
  return produtosDaLoja(loja).filter(
    (produto) => produto.status === "PUBLISHED",
  );
}

/**
 * As escolhas congeladas de um item.
 *
 * Na loja de comida vêm do grupo de ingredientes e do de adicionais — inclusive
 * uma REMOÇÃO ("sem cebola"), que é o caso que obriga a guardar a ação junto da
 * escolha. Na loja de roupa vêm dos eixos de variação, e é por isso que o mesmo
 * mecanismo serve aos dois.
 */
function escolhasDoItem(
  produto: ProdutoDeExemplo,
  varianteChave: string,
  comAdicional: boolean,
): readonly EscolhaDoItem[] {
  const escolhas: EscolhaDoItem[] = [];

  for (const grupo of produto.grupos) {
    if (grupo.eixoDeVariacao) {
      const variante = produto.variantes.find(
        (candidata) => candidata.chave === varianteChave,
      );
      const par = variante?.combinacao.find(([eixo]) => eixo === grupo.chave);
      if (par === undefined) continue;
      const escolhida = grupo.opcoes.find((item) => item.chave === par[1]);
      if (escolhida === undefined) continue;
      escolhas.push({
        grupo: grupo.chave,
        grupoNome: grupo.nome,
        opcao: escolhida.chave,
        opcaoNome: escolhida.nome,
        kind: grupo.kind,
        acao: "ADD",
        acrescimoCents: escolhida.acrescimoCents,
      });
      continue;
    }

    for (const opcaoDoGrupo of grupo.opcoes) {
      const vemMarcada = opcaoDoGrupo.marcadaPorPadrao;
      const ehAdicionalEscolhido =
        comAdicional && grupo.kind === "ADDON" && opcaoDoGrupo.disponivel;
      if (!vemMarcada && !ehAdicionalEscolhido) continue;

      // "Sem cebola": a opção vinha marcada e o cliente a retirou. Sem guardar
      // a ação, o cupom impresso não teria como dizer isso.
      const retirada = vemMarcada && opcaoDoGrupo.chave === "cebola";
      escolhas.push({
        grupo: grupo.chave,
        grupoNome: grupo.nome,
        opcao: opcaoDoGrupo.chave,
        opcaoNome: opcaoDoGrupo.nome,
        kind: grupo.kind,
        acao: retirada ? "REMOVE" : "ADD",
        acrescimoCents: retirada ? 0 : opcaoDoGrupo.acrescimoCents,
      });
    }
  }

  return escolhas;
}

/** Os itens de um pedido, escolhidos por rodízio para variar o cenário. */
function itensDoPedido(
  loja: LojaDeExemplo,
  indice: number,
): readonly ItemDoPedido[] {
  const vendaveis = produtosVendaveis(loja);
  const quantosItens = indice % 2 === 0 ? 2 : 1;

  return Array.from({ length: quantosItens }, (_vazio, posicao) => {
    const produto = vendaveis[(indice + posicao) % vendaveis.length];
    if (produto === undefined) {
      throw new Error(
        `A loja ${loja.chave} do cenário não tem produto publicado, e pedido sem item não existe.`,
      );
    }

    // A variante escolhida também é por rodízio, para que a grade da loja de
    // roupa apareça em mais de um tamanho ao longo dos pedidos.
    const variante =
      produto.variantes[(indice + posicao) % produto.variantes.length] ??
      varianteDoPedido(produto);
    const preco = precoVigente(variante);

    return {
      produto,
      varianteChave: variante.chave,
      varianteNome: variante.nome,
      sku: variante.sku,
      tipoDePreco: preco.kind,
      precoUnitarioCents: preco.valorCents,
      custoUnitarioCents: custoDaVariante(variante),
      quantidade: 1 + ((indice + posicao) % 3),
      escolhas: escolhasDoItem(produto, variante.chave, posicao === 0),
    };
  });
}

/** Acréscimo somado a parte do preço base, por unidade do item. */
function acrescimoDoItem(item: ItemDoPedido): number {
  return item.escolhas.reduce(
    (soma, escolha) => soma + escolha.acrescimoCents,
    0,
  );
}

/** Total da linha: preço unitário mais acréscimos, vezes a quantidade. */
function totalDoItem(item: ItemDoPedido): number {
  return (item.precoUnitarioCents + acrescimoDoItem(item)) * item.quantidade;
}

/** Soma dos itens do pedido, em centavos. */
function subtotal(pedido: PedidoDeExemplo): number {
  return pedido.itens.reduce((soma, item) => soma + totalDoItem(item), 0);
}

/** Custo congelado do pedido — sem ele não existe margem histórica. */
function custoTotal(pedido: PedidoDeExemplo): number {
  return pedido.itens.reduce(
    (soma, item) => soma + item.custoUnitarioCents * item.quantidade,
    0,
  );
}

/** Taxa de entrega da loja, ou zero quando o cliente retira no balcão. */
function taxaDeEntrega(pedido: PedidoDeExemplo): number {
  if (pedido.entrega === "PICKUP") return 0;
  return pedido.loja.ehComida ? 700 : 1500;
}

/** Total do pedido: subtotal mais a taxa. Inteiro em centavos (P-005). */
function total(pedido: PedidoDeExemplo): number {
  return subtotal(pedido) + taxaDeEntrega(pedido);
}

/**
 * Os pedidos de uma loja: um para cada status, mais o que espera confirmação
 * no WhatsApp.
 */
function pedidosDaLoja(loja: LojaDeExemplo): readonly PedidoDeExemplo[] {
  const clientes = loja.clientes;
  const prefixo = loja.ehComida ? "A" : "B";

  const porStatus = STATUS_DE_PEDIDO.map((status, indice): PedidoDeExemplo => ({
    loja,
    chave: `${loja.chave}:${status.toLowerCase()}`,
    codigo: `${prefixo}-${1000 + indice}`,
    status,
    aguardandoConfirmacaoNoWhatsapp: false,
    // Um pedido de cada loja é de convidado: comprar sem conta é a maioria
    // dos pedidos reais do público-alvo, e o cenário precisa do caso.
    cliente: indice === 2 ? null : (clientes[indice % clientes.length] ?? null),
    entrega: status === "READY_FOR_PICKUP" ? "PICKUP" : "DELIVERY",
    formaDePagamento:
      indice % 3 === 0 ? "PIX" : indice % 3 === 1 ? "CASH" : "CARD_ON_DELIVERY",
    itens: itensDoPedido(loja, indice),
    minutosAntes: -(600 - indice * 45),
  }));

  const aguardando: PedidoDeExemplo = {
    loja,
    chave: `${loja.chave}:aguardando-whatsapp`,
    codigo: `${prefixo}-${1000 + STATUS_DE_PEDIDO.length}`,
    status: "PENDING",
    aguardandoConfirmacaoNoWhatsapp: true,
    cliente: clientes[0] ?? null,
    entrega: "DELIVERY",
    formaDePagamento: "PIX",
    itens: itensDoPedido(loja, STATUS_DE_PEDIDO.length),
    minutosAntes: -20,
  };

  return [...porStatus, aguardando];
}

/** Todos os pedidos do cenário, na ordem de inserção. */
export const PEDIDOS: readonly PedidoDeExemplo[] = LOJAS.flatMap((loja) =>
  pedidosDaLoja(loja),
);

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

const idDoPedido = (pedido: PedidoDeExemplo): string =>
  idDeExemplo(`pedido:${pedido.chave}`);

const idDoItem = (pedido: PedidoDeExemplo, posicao: number): string =>
  idDeExemplo(`item:${pedido.chave}:${posicao}`);

function linhaDoPedido(
  pedido: PedidoDeExemplo,
  referencia: Date,
): LinhaDeExemplo {
  const feitoEm = instanteDeExemplo(referencia, pedido.minutosAntes);
  const caminho = caminhoAte(pedido.status);
  const aceito = caminho.includes("ACCEPTED")
    ? instanteDeExemplo(referencia, pedido.minutosAntes + 5)
    : null;
  const concluido =
    pedido.status === "COMPLETED"
      ? instanteDeExemplo(referencia, pedido.minutosAntes + 45)
      : null;

  const cliqueNoWhatsapp = instanteDeExemplo(
    referencia,
    pedido.minutosAntes + 1,
  );

  return {
    id: idDoPedido(pedido),
    store_id: pedido.loja.id,
    code: pedido.codigo,
    public_token: tokenDeExemplo(pedido.chave),
    channel: "ONLINE",
    status: pedido.status,
    fulfillment: pedido.entrega,
    store_customer_id: pedido.cliente?.id ?? null,
    subtotal_cents: subtotal(pedido),
    coupon_discount_cents: 0,
    delivery_fee_cents: taxaDeEntrega(pedido),
    delivery_fee_mode: pedido.entrega === "PICKUP" ? "FREE" : "VALUE",
    pickup_discount_cents: 0,
    total_cents: total(pedido),
    cost_total_cents: custoTotal(pedido),
    currency: "BRL",
    payment_method: pedido.formaDePagamento,
    payment_status:
      pedido.status === "COMPLETED"
        ? "CONFIRMED"
        : pedido.formaDePagamento === "PIX"
          ? "AWAITING_PROOF"
          : "PENDING",
    // A chave PIX é congelada no pedido: trocar a chave amanhã não pode mudar
    // o comprovante de ontem.
    pix_key_snapshot:
      pedido.formaDePagamento === "PIX" ? pedido.loja.chavePix : null,
    pix_key_type_snapshot: pedido.formaDePagamento === "PIX" ? "EMAIL" : null,
    pix_account_name_snapshot:
      pedido.formaDePagamento === "PIX" ? pedido.loja.dona.nome : null,
    pix_brcode_snapshot: null,
    change_for_cents: null,
    coupon_id: null,
    coupon_code_snapshot: null,
    customer_note: pedido.loja.ehComida
      ? "Caprichar no ponto da fritura."
      : null,
    store_note:
      pedido.status === "REJECTED" ? "Fora da área de entrega." : null,
    idempotency_key: `exemplo-${pedido.chave}`,
    whatsapp_clicked_at: cliqueNoWhatsapp,
    // O clique NÃO é confirmação de envio: é exatamente essa distinção que o
    // pedido "aguardando confirmação no WhatsApp" existe para exercitar.
    whatsapp_confirmed_at: pedido.aguardandoConfirmacaoNoWhatsapp
      ? null
      : instanteDeExemplo(referencia, pedido.minutosAntes + 2),
    whatsapp_message_chars: 320 + pedido.itens.length * 40,
    scheduled_for: null,
    placed_at: feitoEm,
    accepted_at: aceito,
    completed_at: concluido,
    store_timezone: pedido.loja.fusoHorario,
    created_at: feitoEm,
    updated_at: instanteDeExemplo(
      referencia,
      pedido.minutosAntes + caminho.length * 5,
    ),
  };
}

function linhaDoContato(
  pedido: PedidoDeExemplo,
  referencia: Date,
): LinhaDeExemplo {
  const quem = pedido.cliente;
  return {
    order_id: idDoPedido(pedido),
    store_id: pedido.loja.id,
    // Convidado também tem contato: é o que permite entregar o pedido de quem
    // comprou sem conta.
    name: quem?.nome ?? "Cliente convidado",
    phone_e164: quem?.telefone ?? "+5511966660000",
    phone_hmac: null,
    email: quem?.email ?? null,
    doc_number: null,
    recipient_name: quem?.nome ?? "Cliente convidado",
    street: "Rua das Palmeiras",
    number: "45",
    complement: pedido.entrega === "PICKUP" ? null : "Apto 12",
    neighborhood: "Vila Nova",
    city: "São Paulo",
    uf: "SP",
    zip: "03110000",
    reference_point: "Portão azul",
    lat: null,
    lng: null,
    anonymized_at: null,
    created_at: instanteDeExemplo(referencia, pedido.minutosAntes),
  };
}

function linhasDosItens(
  pedido: PedidoDeExemplo,
  referencia: Date,
): readonly LinhaDeExemplo[] {
  return pedido.itens.map((item, posicao) => ({
    id: idDoItem(pedido, posicao),
    store_id: pedido.loja.id,
    order_id: idDoPedido(pedido),
    // Referência FRACA ao produto: serve para "pedir de novo" e para o ranking
    // do painel. O que o cupom mostra é o texto copiado abaixo.
    product_id: idDoProduto(item.produto),
    variant_id: idDaVariante(item.produto, item.varianteChave),
    product_name: item.produto.nome,
    variant_name: item.varianteNome,
    sku_snapshot: item.sku,
    price_kind_snapshot: item.tipoDePreco,
    unit_price_cents: item.precoUnitarioCents,
    compare_at_cents: null,
    unit_cost_cents: item.custoUnitarioCents,
    quantity: item.quantidade,
    options_total_cents: acrescimoDoItem(item) * item.quantidade,
    line_total_cents: totalDoItem(item),
    note: null,
    attributes_snapshot: json(
      Object.fromEntries(
        item.produto.especificacoes.map((valor) => [
          valor.especificacao,
          valor.texto ?? valor.numero ?? valor.booleano ?? null,
        ]),
      ),
    ),
    fraction_index: null,
    sort_order: posicao,
    created_at: instanteDeExemplo(referencia, pedido.minutosAntes),
  }));
}

function linhasDasEscolhas(pedido: PedidoDeExemplo): readonly LinhaDeExemplo[] {
  return pedido.itens.flatMap((item, posicao) =>
    item.escolhas.map((escolha, ordem) => ({
      id: idDeExemplo(`escolha:${pedido.chave}:${posicao}:${escolha.opcao}`),
      store_id: pedido.loja.id,
      order_item_id: idDoItem(pedido, posicao),
      option_item_id: idDaOpcao(item.produto, escolha.grupo, escolha.opcao),
      // Nome por extenso, e não chave viva: o dono pode renomear ou apagar o
      // grupo depois, e o cupom precisa continuar reproduzível.
      group_name_snapshot: escolha.grupoNome,
      option_name_snapshot: escolha.opcaoNome,
      kind_snapshot: escolha.kind,
      action: escolha.acao,
      price_delta_cents: escolha.acrescimoCents,
      quantity: 1,
      external_code_snapshot: null,
      sort_order: ordem,
    })),
  );
}

function linhasDoHistorico(
  pedido: PedidoDeExemplo,
  referencia: Date,
): readonly LinhaDeExemplo[] {
  const caminho = caminhoAte(pedido.status);

  return caminho.map((estado, passo) => ({
    id: idDeExemplo(`historico:${pedido.chave}:${estado}`),
    store_id: pedido.loja.id,
    order_id: idDoPedido(pedido),
    from_status: passo === 0 ? null : (caminho[passo - 1] ?? null),
    to_status: estado,
    // A criação é do cliente; o resto é a loja movendo a fila.
    changed_by_identity_id: passo === 0 ? null : pedido.loja.dona.id,
    actor_role: passo === 0 ? "CUSTOMER" : "OWNER",
    reason:
      estado === "REJECTED"
        ? "Endereço fora da área de entrega."
        : estado === "CANCELLED"
          ? "Cliente desistiu depois do aceite."
          : null,
    occurred_at: instanteDeExemplo(referencia, pedido.minutosAntes + passo * 5),
  }));
}

/**
 * Os pedidos inteiros, na ordem de inserção que as chaves estrangeiras exigem:
 * pedido, contato, item, escolha do item e histórico.
 */
export function montarPedidos(referencia: Date): readonly ConjuntoDeExemplo[] {
  return [
    {
      tabela: "orders",
      linhas: PEDIDOS.map((pedido) => linhaDoPedido(pedido, referencia)),
    },
    {
      tabela: "order_contacts",
      linhas: PEDIDOS.map((pedido) => linhaDoContato(pedido, referencia)),
    },
    {
      tabela: "order_items",
      linhas: PEDIDOS.flatMap((pedido) => linhasDosItens(pedido, referencia)),
    },
    {
      tabela: "order_item_options",
      linhas: PEDIDOS.flatMap((pedido) => linhasDasEscolhas(pedido)),
    },
    {
      tabela: "order_status_history",
      linhas: PEDIDOS.flatMap((pedido) =>
        linhasDoHistorico(pedido, referencia),
      ),
    },
  ];
}

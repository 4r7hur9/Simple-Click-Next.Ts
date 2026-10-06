/**
 * O que acontece depois que o pedido foi fechado (AC-516, AC-524; dívida 95).
 *
 * Duas coisas, que andam juntas:
 *
 * - O CARRINHO QUE VIROU O PEDIDO SAI DE CENA, na mesma transação do pedido.
 *   Sem isso o cliente voltava ao fechamento com os mesmos itens, e um segundo
 *   "Fechar pedido" (chave nova) criava outro pedido igual. Quem marca é uma
 *   função do banco (`app.converter_carrinho`, migração 0043) — a política do
 *   visitante não deixa a aplicação gravar `converted_at`, e este módulo não
 *   importa o do carrinho. É o mesmo desenho da fila de impressão.
 *
 * - A NOVA TENTATIVA COM A MESMA CHAVE (resposta perdida na rede) recebe o
 *   pedido GUARDADO. O carrinho daquela sessão já foi convertido, então reler
 *   o carrinho daria um carrinho vazio: subtotal zero, mínimo "não alcançado"
 *   e mensagem sem itens. Os valores e o texto vêm do próprio pedido — que é,
 *   de qualquer jeito, o registro do que foi comprado (AC-515).
 */
import type { PedidoParaTexto } from "@simpleclick/core";

import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import type { PedidoCriado } from "./criar-pedido.usecase.ts";

/** O token público do pedido que esta chave de fechamento já criou, ou nulo. */
export async function pedidoDaChaveDeFechamento(
  lojaId: string,
  chave: string,
): Promise<{ readonly tokenPublico: string } | null> {
  // A busca é autorizada pela chave DECLARADA no contexto (migração 0010).
  const existente = await transacaoAtual().order.findFirst({
    where: { storeId: lojaId, idempotencyKey: chave },
    select: { publicToken: true },
  });
  return existente === null ? null : { tokenPublico: existente.publicToken };
}

/**
 * Marca o carrinho da sessão como convertido no pedido do token da transação.
 *
 * Falso quando o carrinho já tinha virado pedido — é o que faz a corrida de
 * dois fechamentos do mesmo carrinho perder um deles: quem chama desfaz a
 * transação, e o pedido duplicado não chega a existir.
 */
export async function converterCarrinhoNoPedido(
  carrinhoId: string,
  pedidoId: string,
): Promise<boolean> {
  const linhas = await transacaoAtual().$queryRaw<{ convertido: boolean }[]>`
    SELECT app.converter_carrinho(${carrinhoId}::uuid, ${pedidoId}::uuid) AS convertido`;
  return linhas[0]?.convertido === true;
}

/** O pedido guardado, como a resposta do fechamento o devolve. */
export interface PedidoGuardado {
  readonly pedido: PedidoCriado;
  readonly subtotalEmCentavos: number;
  readonly taxaDeEntregaEmCentavos: number;
  readonly totalEmCentavos: number;
  /** O texto da mensagem, menos o link — quem sabe o endereço do site é a rota. */
  readonly paraTexto: Omit<PedidoParaTexto, "linkDeAcompanhamento">;
}

/**
 * Lê o pedido do token declarado no contexto, com tudo que a mensagem usa.
 *
 * `nomeDaTaxa` é o nome que o dono deu à linha da entrega (a configuração de
 * agora): o pedido guarda o valor e o modo da taxa, não o nome.
 */
export async function pedidoGuardado(
  nomeDaTaxa: string | null,
): Promise<PedidoGuardado | null> {
  const token = exigirContexto().tokenDoPedido;
  if (token === undefined || token === "") return null;

  const o = await transacaoAtual().order.findFirst({
    where: { publicToken: token },
    select: {
      id: true,
      number: true,
      code: true,
      publicToken: true,
      status: true,
      fulfillment: true,
      paymentMethod: true,
      changeForCents: true,
      pixKeySnapshot: true,
      pixKeyTypeSnapshot: true,
      pixHolderSnapshot: true,
      subtotalCents: true,
      deliveryFeeCents: true,
      deliveryFeeMode: true,
      totalCents: true,
      customerNote: true,
      contato: {
        select: {
          name: true,
          phoneE164: true,
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          zip: true,
        },
      },
      itens: {
        orderBy: { sortOrder: "asc" },
        select: {
          productName: true,
          quantity: true,
          lineTotalCents: true,
          note: true,
          opcoes: {
            orderBy: { sortOrder: "asc" },
            select: {
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              quantity: true,
            },
          },
        },
      },
    },
  });
  if (o === null) return null;

  const contato = o.contato;
  const retirada = o.fulfillment === "PICKUP";
  const taxa = Number(o.deliveryFeeCents);

  return {
    pedido: {
      id: o.id,
      numero: Number(o.number),
      codigo: o.code,
      tokenPublico: o.publicToken,
      status: o.status,
      jaExistia: true,
    },
    subtotalEmCentavos: Number(o.subtotalCents),
    taxaDeEntregaEmCentavos: taxa,
    totalEmCentavos: Number(o.totalCents),
    paraTexto: {
      codigo: o.code,
      cliente: {
        nome: contato?.name ?? "Cliente",
        telefone: contato?.phoneE164 ?? "",
      },
      itens: o.itens.map((item) => ({
        nome: item.productName,
        quantidade: item.quantity,
        totalDaLinhaEmCentavos: Number(item.lineTotalCents),
        observacao: item.note,
        opcoes: item.opcoes.map((opcao) => ({
          grupo: opcao.groupNameSnapshot,
          opcao: opcao.optionNameSnapshot,
          quantidade: opcao.quantity,
        })),
      })),
      observacao: o.customerNote,
      entrega: retirada
        ? { tipo: "PICKUP" }
        : {
            tipo: "DELIVERY",
            endereco: {
              logradouro: contato?.street ?? "",
              numero: contato?.number ?? null,
              complemento: contato?.complement ?? null,
              bairro: contato?.neighborhood ?? null,
              cidade: contato?.city ?? null,
              cep: contato?.zip ?? null,
            },
          },
      taxaDeEntrega: {
        modo: (o.deliveryFeeMode ?? "FREE") as never,
        valorEmCentavos: taxa,
        // Retirada não tem linha de entrega: o cálculo devolve nome nulo.
        nome: retirada ? null : nomeDaTaxa,
      },
      pagamento: {
        forma: (o.paymentMethod ?? "CASH") as never,
        chavePix: o.pixKeySnapshot,
        tipoDaChavePix: o.pixKeyTypeSnapshot,
        nomeDoRecebedor: o.pixHolderSnapshot,
        trocoParaEmCentavos:
          o.changeForCents === null ? null : Number(o.changeForCents),
      },
      subtotalEmCentavos: Number(o.subtotalCents),
      totalEmCentavos: Number(o.totalCents),
    },
  };
}

/**
 * Leitura da fila operacional do dono (T-600).
 *
 * A fila não altera pedido nenhum. Ela lê os pedidos em aberto da loja do
 * contexto e devolve uma projeção pequena — sem endereço, sem telefone, sem
 * item —, porque a tela da fila fica aberta o dia inteiro no balcão e o que ela
 * não recebe ela não tem como mostrar a quem passa.
 *
 * A LEITURA É SEMPRE A FILA INTEIRA, e não "o que mudou desde a última vez".
 * É essa escolha que faz a reconexão recuperar o que entrou durante a queda
 * (AC-602) sem a tela precisar lembrar de nada: a regra que compara duas
 * leituras mora em `packages/core/src/fila-de-pedidos.ts`, e a tela a usa.
 */
import { STATUS_FORA_DA_FILA, type PedidoDaFila } from "@simpleclick/core";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

/** A linha do pedido como o banco a devolve para a fila. */
export interface LinhaDaFila {
  readonly id: string;
  readonly number: bigint;
  readonly code: string;
  readonly status: string;
  readonly channel: string;
  readonly fulfillment: string;
  readonly totalCents: bigint;
  readonly placedAt: Date;
  readonly whatsappClickedAt: Date | null;
  readonly whatsappConfirmedAt: Date | null;
  readonly contato: { readonly name: string } | null;
}

/**
 * Converte a linha do banco na projeção da fila.
 *
 * O pedido "aguardando o WhatsApp" é o que ABRIU a conversa e não confirmou o
 * envio (AC-609). Pedido que nunca abriu — a loja sem número, por exemplo — não
 * é marcado: marcar todo pedido sem confirmação faria a loja sem WhatsApp ver
 * a fila inteira como suspeita.
 */
export function projetarPedidoDaFila(linha: LinhaDaFila): PedidoDaFila {
  return {
    id: linha.id,
    numero: Number(linha.number),
    codigo: linha.code,
    status: linha.status,
    canal: linha.channel,
    entrega: linha.fulfillment,
    cliente: linha.contato?.name ?? "Cliente sem nome",
    totalCentavos: Number(linha.totalCents),
    criadoEm: linha.placedAt.toISOString(),
    aguardandoConfirmacaoWhatsapp:
      linha.whatsappClickedAt !== null && linha.whatsappConfirmedAt === null,
  };
}

/**
 * Os pedidos em aberto da loja do contexto, do mais antigo para o mais novo.
 *
 * O mais antigo primeiro porque é a ordem de atendimento: quem espera há mais
 * tempo aparece no topo de cada grupo.
 */
export async function lerFilaDaLoja(): Promise<PedidoDaFila[]> {
  const lojaId = exigirLojaDoContexto();
  const linhas = await transacaoAtual().order.findMany({
    where: { storeId: lojaId, status: { notIn: [...STATUS_FORA_DA_FILA] } },
    orderBy: [{ placedAt: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      code: true,
      status: true,
      channel: true,
      fulfillment: true,
      totalCents: true,
      placedAt: true,
      whatsappClickedAt: true,
      whatsappConfirmedAt: true,
      contato: { select: { name: true } },
    },
  });
  return linhas.map(projetarPedidoDaFila);
}

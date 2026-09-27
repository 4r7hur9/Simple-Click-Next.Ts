/**
 * O pedido anda pelos status (T-601): aceitar, preparar, entregar, concluir —
 * ou recusar e cancelar, com motivo (AC-604..AC-608).
 *
 * QUEM DECIDE SE O CAMINHO EXISTE é a máquina de status de `packages/core`; a
 * tela só mostra os botões que ela oferece, e esta função recusa o resto. Botão
 * escondido não é regra: é a API que diz "esse caminho não existe" (AC-606).
 *
 * A MUDANÇA E A LINHA DO TEMPO ANDAM JUNTAS, na mesma transação. Não existe
 * pedido que mudou sem registro de quem mudou e quando, nem registro de uma
 * mudança que não aconteceu (AC-608). E o registro só se acrescenta: o banco não
 * concede alteração nem remoção na tabela do histórico (migração 0008, guarda G8).
 */
import { decidirTransicao, type StatusDoPedido } from "@simpleclick/core";

import { exigirContexto, exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { devolverEstoqueDoPedido } from "./devolver-estoque.ts";

export class ErroDeTransicaoDoPedido extends Error {
  readonly explicacao: string;

  constructor(explicacao: string) {
    super(explicacao);
    this.explicacao = explicacao;
    this.name = "ErroDeTransicaoDoPedido";
  }
}

export class PedidoNaoEncontrado extends Error {
  constructor() {
    super("Pedido não encontrado.");
    this.name = "PedidoNaoEncontrado";
  }
}

export interface ResultadoDaMudancaDeStatus {
  readonly id: string;
  readonly status: StatusDoPedido;
  readonly motivo: string | null;
}

/** Dita quando dois aparelhos mudam o mesmo pedido ao mesmo tempo. */
export const EXPLICACAO_DE_MUDANCA_CONCORRENTE =
  "O pedido mudou enquanto você decidia. Confira o status atual antes de seguir.";

const FORMATO_DE_IDENTIDADE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quem fez a mudança, do jeito que a linha do tempo pode guardar.
 *
 * Em produção o token carrega o identificador da identidade, e é ele que fica
 * registrado. O usuário local de desenvolvimento não é uma identidade do banco
 * — o identificador dele não é um identificador de linha —, e gravá-lo faria a
 * mudança inteira falhar. Nesse caso a trilha guarda o PAPEL de quem agiu e
 * deixa o autor vazio, em vez de impedir o dono de trabalhar.
 */
export function autorDaMudanca(usuarioId: string | undefined): string | null {
  return usuarioId !== undefined && FORMATO_DE_IDENTIDADE.test(usuarioId)
    ? usuarioId
    : null;
}

/** Muda o pedido e acrescenta uma linha de histórico na mesma transação. */
export async function mudarStatusDoPedido(
  pedidoId: string,
  proximoStatus: string,
  motivo?: string | null,
  agora = new Date(),
): Promise<ResultadoDaMudancaDeStatus> {
  const contexto = exigirContexto();
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const pedido = await tx.order.findFirst({
    where: { id: pedidoId, storeId: lojaId },
    select: { id: true, status: true, fulfillment: true },
  });
  if (pedido === null) throw new PedidoNaoEncontrado();

  const decisao = decidirTransicao(
    pedido.status,
    proximoStatus,
    pedido.fulfillment,
    motivo,
  );
  if (!decisao.ok) throw new ErroDeTransicaoDoPedido(decisao.explicacao);

  // A MUDANÇA SÓ VALE SOBRE O STATUS QUE FOI LIDO. Dois aparelhos da loja
  // aceitando o mesmo pedido no mesmo segundo leriam os dois "aguardando"; sem
  // esta condição, os dois gravariam e a linha do tempo teria duas aceitações.
  // Com ela, o segundo espera o primeiro terminar, relê a linha e não a
  // encontra mais naquele status — e a recusa diz o que houve.
  const alterados = await tx.order.updateMany({
    where: { id: pedido.id, storeId: lojaId, status: pedido.status },
    data: {
      status: decisao.para,
      updatedAt: agora,
      ...(decisao.para === "ACCEPTED" ? { acceptedAt: agora } : {}),
      ...(decisao.para === "COMPLETED" ? { completedAt: agora } : {}),
      ...(decisao.para === "CANCELLED"
        ? { cancelledAt: agora, cancelReason: decisao.motivo }
        : {}),
    },
  });
  if (alterados.count !== 1) {
    throw new ErroDeTransicaoDoPedido(EXPLICACAO_DE_MUDANCA_CONCORRENTE);
  }

  // O que a baixa tirou volta ao estoque na MESMA transação (AC-334).
  if (decisao.para === "CANCELLED")
    await devolverEstoqueDoPedido(pedido.id, agora);

  await tx.orderStatusEntry.create({
    data: {
      storeId: lojaId,
      orderId: pedido.id,
      fromStatus: decisao.de,
      toStatus: decisao.para,
      changedByIdentityId: autorDaMudanca(contexto.usuarioId),
      actorRole: contexto.papel,
      reason: decisao.motivo,
      occurredAt: agora,
    },
  });

  return {
    id: pedido.id,
    status: decisao.para,
    motivo: decisao.motivo,
  };
}

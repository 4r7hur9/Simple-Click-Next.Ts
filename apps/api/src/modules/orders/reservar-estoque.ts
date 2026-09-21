/**
 * Baixa as variações de um pedido dentro da transação do checkout (T-308).
 *
 * A decisão de concorrência não fica num `read` seguido de `update`: a função
 * SQL faz o `UPDATE ... stock_quantity >= quantidade RETURNING` sob trava de
 * linha e só devolve uma linha quando a reserva foi realmente feita. Se uma
 * variação falhar, o erro desfaz também o pedido que acabou de ser criado.
 */
import { erroDeDominio } from "../../core/erros.ts";
import { transacaoAtual } from "../../core/db.ts";

export interface ItemParaReservarEstoque {
  readonly variacaoId?: string | null;
  readonly quantidade: number;
}

export interface EntradaDaReservaDeEstoque {
  readonly lojaId: string;
  readonly pedidoId: string;
  readonly itens: readonly ItemParaReservarEstoque[];
}

export interface MovimentoDeEstoqueReservado {
  readonly variacaoId: string;
  readonly quantidade: number;
  readonly quantidadeAntes: number;
  readonly quantidadeDepois: number;
}

interface RetornoDaFuncaoDeEstoque {
  readonly quantity_before: number;
  readonly quantity_after: number;
}

interface ExecutorDaFuncaoDeEstoque {
  $queryRaw(...args: unknown[]): Promise<unknown>;
}

/**
 * Reserva todas as unidades controladas do pedido.
 *
 * `tx` é opcional para manter o mesmo caso de uso alcançável pela API e por
 * testes de unidade. Em produção ele sempre é a transação da requisição.
 */
export async function reservarEstoque(
  entrada: EntradaDaReservaDeEstoque,
  tx?: ExecutorDaFuncaoDeEstoque,
): Promise<readonly MovimentoDeEstoqueReservado[]> {
  const banco =
    tx ?? (transacaoAtual() as unknown as ExecutorDaFuncaoDeEstoque);
  const porVariacao = new Map<string, number>();

  for (const item of entrada.itens) {
    if (item.variacaoId === null || item.variacaoId === undefined) continue;
    if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
      throw erroDeDominio("entrada_invalida", {
        recurso: "quantidade_do_item",
      });
    }
    porVariacao.set(
      item.variacaoId,
      (porVariacao.get(item.variacaoId) ?? 0) + item.quantidade,
    );
  }

  const movimentos: MovimentoDeEstoqueReservado[] = [];
  for (const [variacaoId, quantidade] of porVariacao) {
    const linhas = (await banco.$queryRaw`
      SELECT quantity_before, quantity_after
        FROM app.reservar_estoque_do_pedido(
          ${entrada.lojaId}::uuid,
          ${variacaoId}::uuid,
          ${quantidade},
          ${entrada.pedidoId}::uuid
        )
    `) as RetornoDaFuncaoDeEstoque[];
    const linha = linhas[0];
    if (linha === undefined) {
      throw erroDeDominio("conflito", {
        recurso: "estoque",
        motivo: "variacao_indisponivel",
      });
    }
    movimentos.push({
      variacaoId,
      quantidade,
      quantidadeAntes: linha.quantity_before,
      quantidadeDepois: linha.quantity_after,
    });
  }

  return movimentos;
}

/**
 * Devolve ao estoque o que um pedido cancelado tinha baixado (T-307, AC-334).
 *
 * A FONTE É O HISTÓRICO, e não os itens do pedido. O que volta é exatamente o
 * que a baixa do checkout TIROU (movimentos `PEDIDO` deste pedido), menos o que
 * já foi devolvido (`CANCELAMENTO`). Ler os itens devolveria também a variação
 * que não controlava estoque na hora da compra — e criaria unidades do nada.
 *
 * NÃO DEVOLVE DUAS VEZES. A conta desconta as devoluções anteriores, então
 * chamar de novo, por repetição ou por engano, não mexe em nada.
 *
 * MORA FORA DE `mudar-status.usecase.ts` de propósito: o caso de uso só a chama
 * quando o destino é cancelado. A regra de estoque fica num lugar só, e o caso
 * de uso da máquina de status não precisa saber como o estoque é contado.
 */
import { exigirContexto, exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

export const MOTIVO_DA_DEVOLUCAO = "Devolução do pedido cancelado";

export interface MovimentoDeDevolucao {
  readonly variacaoId: string;
  readonly quantidade: number;
  readonly quantidadeAntes: number;
  readonly quantidadeDepois: number;
}

const FORMATO_DE_IDENTIDADE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SaldoDevolvido {
  readonly antes: number;
  readonly depois: number;
}

/**
 * Devolve, na transação atual, as unidades que o pedido ainda não devolveu.
 *
 * Variação que deixou de controlar estoque depois da compra (estoque nulo) não
 * recebe nada: somar unidades a "não controla" inventaria uma contagem.
 */
export async function devolverEstoqueDoPedido(
  pedidoId: string,
  agora: Date = new Date(),
): Promise<readonly MovimentoDeDevolucao[]> {
  const lojaId = exigirLojaDoContexto();
  const { usuarioId } = exigirContexto();
  const tx = transacaoAtual();

  const historico = await tx.stockMovement.findMany({
    where: {
      storeId: lojaId,
      orderId: pedidoId,
      origin: { in: ["PEDIDO", "CANCELAMENTO"] },
    },
    select: { variantId: true, quantityDelta: true },
  });

  // Baixa é delta negativo, devolução é positivo: o que falta devolver é o
  // oposto da soma.
  const pendentePorVariacao = new Map<string, number>();
  for (const movimento of historico) {
    pendentePorVariacao.set(
      movimento.variantId,
      (pendentePorVariacao.get(movimento.variantId) ?? 0) -
        movimento.quantityDelta,
    );
  }

  const autorId =
    usuarioId !== undefined && FORMATO_DE_IDENTIDADE.test(usuarioId)
      ? usuarioId
      : null;

  const devolvidos: MovimentoDeDevolucao[] = [];
  for (const [variacaoId, quantidade] of pendentePorVariacao) {
    if (quantidade <= 0) continue;

    // Somar no próprio UPDATE, e não ler e depois gravar: uma venda da mesma
    // variação acontecendo agora não pode apagar a devolução, nem o contrário.
    const linhas = await tx.$queryRaw<SaldoDevolvido[]>`
      UPDATE app.product_variants
         SET stock_quantity = stock_quantity + ${quantidade}::int,
             updated_at = ${agora}
       WHERE id = ${variacaoId}::uuid
         AND store_id = ${lojaId}::uuid
         AND stock_quantity IS NOT NULL
      RETURNING stock_quantity - ${quantidade}::int AS antes,
                stock_quantity AS depois
    `;
    const saldo = linhas[0];
    if (saldo === undefined) continue;

    await tx.stockMovement.create({
      data: {
        storeId: lojaId,
        variantId: variacaoId,
        quantityBefore: saldo.antes,
        quantityDelta: quantidade,
        quantityAfter: saldo.depois,
        reason: MOTIVO_DA_DEVOLUCAO,
        origin: "CANCELAMENTO",
        orderId: pedidoId,
        actorId: autorId,
        createdAt: agora,
      },
    });
    devolvidos.push({
      variacaoId,
      quantidade,
      quantidadeAntes: saldo.antes,
      quantidadeDepois: saldo.depois,
    });
  }

  return devolvidos;
}

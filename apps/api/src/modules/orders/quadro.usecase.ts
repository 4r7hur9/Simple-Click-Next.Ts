/**
 * O quadro de pedidos de UM DIA (kanban do painel — card #33).
 *
 * Diferente da fila (`fila.usecase.ts`), que só traz o que está em aberto, o
 * quadro traz tudo o que entrou no dia da loja — concluído e cancelado
 * incluídos —, com o que o cartão mostra: itens resumidos, forma de
 * pagamento e motivo do cancelamento.
 *
 * O DIA É O DIA DA LOJA (`stores.timezone`), nunca o do servidor: do primeiro
 * instante do dia ao primeiro do seguinte (exclusivo), a mesma régua das
 * métricas. No dia de hoje, pedido de dia anterior que ainda está em aberto
 * dos últimos dias também entra, marcado `deOutroDia` — pedido esquecido na
 * cozinha não pode sumir da tela só porque a data virou.
 */
import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

/** Quantos itens o cartão resume antes de dizer "e mais N". */
export const ITENS_NO_RESUMO = 3;

const FUSO_PADRAO = "America/Sao_Paulo";

/** Até quantos dias para trás o pedido em aberto ainda aparece em "hoje". */
export const DIAS_DE_SOBRA = 3;

export interface ItemResumido {
  readonly quantidade: number;
  readonly nome: string;
}

export interface PedidoDoQuadro {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly canal: string;
  readonly entrega: string;
  readonly cliente: string;
  /**
   * Só os dígitos do telefone do contato, para a BUSCA do painel (card #77).
   * O cartão nunca o mostra: continua sem campo `telefone` no quadro.
   */
  readonly buscaTelefone: string | null;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
  readonly pagamento: string | null;
  readonly itens: readonly ItemResumido[];
  readonly itensAMais: number;
  readonly motivoCancelamento: string | null;
  /** Aberto desde um dia anterior ao que o quadro mostra. */
  readonly deOutroDia: boolean;
}

export interface QuadroDoDia {
  readonly dia: string;
  readonly hoje: string;
  readonly fuso: string;
  readonly pedidos: readonly PedidoDoQuadro[];
}

export interface LinhaDoQuadro {
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
  readonly paymentMethod: string | null;
  readonly cancelReason: string | null;
  readonly contato: {
    readonly name: string;
    readonly phoneE164?: string | null;
  } | null;
  readonly itens: readonly {
    readonly productName: string;
    readonly quantity: number;
  }[];
}

/** A linha do banco no cartão do quadro. */
export function projetarPedidoDoQuadro(
  linha: LinhaDoQuadro,
  inicioDoDia: Date,
): PedidoDoQuadro {
  return {
    id: linha.id,
    numero: Number(linha.number),
    codigo: linha.code,
    status: linha.status,
    canal: linha.channel,
    entrega: linha.fulfillment,
    cliente: linha.contato?.name ?? "Cliente sem nome",
    buscaTelefone: linha.contato?.phoneE164?.replace(/\D/g, "") || null,
    totalCentavos: Number(linha.totalCents),
    criadoEm: linha.placedAt.toISOString(),
    aguardandoConfirmacaoWhatsapp:
      linha.whatsappClickedAt !== null && linha.whatsappConfirmedAt === null,
    pagamento: linha.paymentMethod,
    itens: linha.itens.slice(0, ITENS_NO_RESUMO).map((item) => ({
      quantidade: item.quantity,
      nome: item.productName,
    })),
    itensAMais: Math.max(0, linha.itens.length - ITENS_NO_RESUMO),
    motivoCancelamento: linha.cancelReason,
    deOutroDia: linha.placedAt < inicioDoDia,
  };
}

interface LinhaDoDia {
  readonly tz: string;
  readonly alvo: string;
  readonly hoje: string;
  readonly inicio: Date;
  readonly fim: Date;
  readonly limite_de_sobra: Date;
}

/**
 * O dia da loja, calculado PELO BANCO no fuso dela (`stores.timezone`): o que
 * é "hoje" e onde o dia começa e termina. A conta fica no banco para a API
 * não repetir aritmética de fuso e horário de verão — e porque é o mesmo
 * relógio que grava `placed_at`.
 */
async function lerODiaDaLoja(
  lojaId: string,
  dia: string | undefined,
): Promise<LinhaDoDia | null> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDoDia[]>`
    WITH base AS (
      SELECT s.timezone AS tz,
             coalesce(${dia ?? null}::date, (now() AT TIME ZONE s.timezone)::date) AS alvo,
             (now() AT TIME ZONE s.timezone)::date AS hoje
        FROM app.stores s
       WHERE s.id = ${lojaId}::uuid)
    SELECT tz,
           to_char(alvo, 'YYYY-MM-DD') AS alvo,
           to_char(hoje, 'YYYY-MM-DD') AS hoje,
           (alvo::timestamp AT TIME ZONE tz) AS inicio,
           ((alvo + 1)::timestamp AT TIME ZONE tz) AS fim,
           ((alvo - ${DIAS_DE_SOBRA}::int)::timestamp AT TIME ZONE tz) AS limite_de_sobra
      FROM base`;
  return linhas[0] ?? null;
}

/** O quadro do dia da loja do contexto; `dia` ausente é hoje. */
export async function lerQuadroDoDia(dia?: string): Promise<QuadroDoDia> {
  const lojaId = exigirLojaDoContexto();
  const intervalo = await lerODiaDaLoja(lojaId, dia);
  if (intervalo === null) {
    return { dia: dia ?? "", hoje: "", fuso: FUSO_PADRAO, pedidos: [] };
  }
  const { alvo, hoje, inicio, fim } = intervalo;

  const linhas = await transacaoAtual().order.findMany({
    where: {
      storeId: lojaId,
      OR: [
        { placedAt: { gte: inicio, lt: fim } },
        ...(alvo === hoje
          ? [
              {
                placedAt: { gte: intervalo.limite_de_sobra, lt: inicio },
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
            ]
          : []),
      ],
    },
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
      paymentMethod: true,
      cancelReason: true,
      contato: { select: { name: true, phoneE164: true } },
      itens: {
        orderBy: { sortOrder: "asc" },
        select: { productName: true, quantity: true },
      },
    },
  });

  return {
    dia: alvo,
    hoje,
    fuso: intervalo.tz,
    pedidos: linhas.map((linha) => projetarPedidoDoQuadro(linha, inicio)),
  };
}

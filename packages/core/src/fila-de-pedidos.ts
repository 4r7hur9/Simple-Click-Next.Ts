/**
 * A fila de pedidos do dono (T-600): onde cada pedido aparece e o que é
 * novidade desde a última leitura.
 *
 * MORA AQUI, e não no painel nem na API, porque as duas pontas precisam da
 * MESMA resposta. A API decide o que entra na fila; o painel decide onde cada
 * pedido aparece e quando o alerta dispara. Se cada ponta escrevesse a sua
 * versão, a prova de uma não diria nada sobre a outra — foi exatamente o que a
 * primeira fatia desta tarefa deixou: a regra testada na API não era a que a
 * tela usava.
 *
 * A fila não altera pedido nenhum. Ela só lê uma projeção pequena e agrupa.
 */

/** Status que saem da fila: o pedido já terminou, de um jeito ou de outro. */
export const STATUS_FORA_DA_FILA = ["COMPLETED", "CANCELLED"] as const;

/** Um pedido como a fila o enxerga — sem endereço, sem telefone, sem item. */
export interface PedidoDaFila {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  /** `ONLINE` (site) ou `MANUAL` (lançado no balcão). */
  readonly canal: string;
  /** `DELIVERY` ou `PICKUP`. */
  readonly entrega: string;
  readonly cliente: string;
  readonly totalCentavos: number;
  /** Instante em que o pedido entrou, em ISO 8601. */
  readonly criadoEm: string;
  /** Abriu a conversa do WhatsApp e ainda não confirmou o envio (AC-609). */
  readonly aguardandoConfirmacaoWhatsapp: boolean;
}

/**
 * A fila dividida pelo que o dono precisa fazer.
 *
 * `aguardandoConfirmacao` vem primeiro por ser o único grupo que exige uma
 * decisão dele (AC-601). O pedido que abriu o WhatsApp sem confirmar fica em
 * grupo PRÓPRIO (AC-609): ele pode ser um pedido fantasma, e misturá-lo aos
 * confirmados faria o dono preparar comida que ninguém pediu de fato.
 */
export interface GruposDaFila<P extends PedidoDaFila = PedidoDaFila> {
  readonly aguardandoConfirmacao: readonly P[];
  readonly aguardandoWhatsapp: readonly P[];
  readonly emPreparo: readonly P[];
  readonly prontoParaRetirada: readonly P[];
  readonly emEntrega: readonly P[];
}

/**
 * Agrupa sem perder a ordem da leitura — a API entrega do mais antigo para o
 * mais novo, e é essa a ordem em que o dono deve atender.
 *
 * Status que a regra não conhece cai em `aguardandoConfirmacao`, e não some:
 * pedido que desaparece da tela é venda perdida, e um status novo esquecido
 * aqui precisa aparecer para alguém, não ser engolido em silêncio.
 */
export function agruparPedidosDaFila<P extends PedidoDaFila>(
  pedidos: readonly P[],
): GruposDaFila<P> {
  const aguardandoConfirmacao: P[] = [];
  const aguardandoWhatsapp: P[] = [];
  const emPreparo: P[] = [];
  const prontoParaRetirada: P[] = [];
  const emEntrega: P[] = [];

  for (const pedido of pedidos) {
    switch (pedido.status) {
      case "COMPLETED":
      case "CANCELLED":
        break;
      case "ACCEPTED":
      case "PREPARING":
        emPreparo.push(pedido);
        break;
      case "READY_FOR_PICKUP":
        prontoParaRetirada.push(pedido);
        break;
      case "OUT_FOR_DELIVERY":
        emEntrega.push(pedido);
        break;
      default:
        // Só o pedido que ainda espera o dono é separado pelo WhatsApp: depois
        // de aceito, a decisão já foi tomada e ele segue o fluxo normal.
        if (pedido.status === "PENDING" && pedido.aguardandoConfirmacaoWhatsapp)
          aguardandoWhatsapp.push(pedido);
        else aguardandoConfirmacao.push(pedido);
    }
  }

  return {
    aguardandoConfirmacao,
    aguardandoWhatsapp,
    emPreparo,
    prontoParaRetirada,
    emEntrega,
  };
}

/**
 * Compara duas leituras completas da fila.
 *
 * A leitura nova SUBSTITUI a antiga, em vez de ser somada a ela. É isso que
 * faz a reconexão recuperar o que entrou durante a queda (AC-602): a API
 * devolve a fila aberta inteira, então o que chegou no intervalo vem junto,
 * sem depender de a tela ter visto cada pedido chegar.
 *
 * A primeira leitura não tem novidade nenhuma — tudo já estava lá quando a
 * tela abriu, e tocar o alerta para a fila inteira ensinaria o dono a ignorar
 * o som.
 */
export function atualizarFila<P extends PedidoDaFila>(
  anterior: readonly P[],
  atual: readonly P[],
  inicializada: boolean,
): { readonly pedidos: readonly P[]; readonly novos: readonly P[] } {
  if (!inicializada) return { pedidos: atual, novos: [] };

  const idsAnteriores = new Set(anterior.map((pedido) => pedido.id));
  return {
    pedidos: atual,
    novos: atual.filter((pedido) => !idsAnteriores.has(pedido.id)),
  };
}

/**
 * O som depende da escolha do dono; o alerta VISUAL não (AC-603).
 *
 * Silenciar é para o ambiente onde o som incomoda, e não para deixar de ver o
 * pedido: por isso esta função só responde sobre o som.
 */
export function deveTocarAlerta(
  novos: readonly PedidoDaFila[],
  somSilenciado: boolean,
): boolean {
  return novos.length > 0 && !somSilenciado;
}

/** Minutos inteiros desde que o pedido entrou. Relógio adiantado vira zero. */
export function minutosDeEspera(criadoEm: string, agora: Date): number {
  const entrada = Date.parse(criadoEm);
  if (Number.isNaN(entrada)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - entrada) / 60_000));
}

/** A espera em linguagem de balcão: "agora", "há 1 min", "há 1 h 05 min". */
export function descreverEspera(minutos: number): string {
  if (minutos <= 0) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = String(minutos % 60).padStart(2, "0");
  return `há ${horas} h ${resto} min`;
}

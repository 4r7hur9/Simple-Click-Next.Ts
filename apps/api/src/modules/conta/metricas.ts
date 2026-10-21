/**
 * As métricas do cliente, calculadas a partir dos pedidos e dos itens que a
 * conta enxerga (card #35). Função pura: recebe as linhas e devolve o contrato.
 * Pedido cancelado fica só na contagem de cancelados.
 */
import type { MetricasDaContaNoContrato } from "@simpleclick/contracts";

export const FUSO_DAS_METRICAS = "America/Sao_Paulo";

export interface PedidoParaMetricas {
  readonly id: string;
  readonly lojaApelido: string;
  readonly lojaNome: string;
  readonly status: string;
  readonly entrega: string;
  readonly totalCentavos: number;
  readonly criadoEm: Date;
}

export interface ItemParaMetricas {
  readonly pedidoId: string;
  readonly produto: string;
  readonly quantidade: number;
  readonly totalCentavos: number;
}

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DAS_METRICAS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const DIAS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partes(instante: Date) {
  const p = Object.fromEntries(PARTES.formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    dia: `${p["year"]}-${p["month"]}-${p["day"]}`,
    hora: Number(p["hour"]),
    semana: DIAS[p["weekday"] ?? ""] ?? 0,
  };
}

export function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
}

/** O mês `aaaa-mm` deslocado de `meses` (negativo volta). */
function somarMeses(mes: string, meses: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const n = a * 12 + (m - 1) + meses;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}

export function hojeNasMetricas(agora: Date): string {
  return partes(agora).dia;
}

interface Resumo {
  pedidos: number;
  gastoCentavos: number;
  ticketMedioCentavos: number;
}

function resumir(pedidos: readonly PedidoParaMetricas[]): Resumo {
  const gasto = pedidos.reduce((s, p) => s + p.totalCentavos, 0);
  return {
    pedidos: pedidos.length,
    gastoCentavos: gasto,
    ticketMedioCentavos: pedidos.length === 0 ? 0 : Math.round(gasto / pedidos.length),
  };
}

export function calcularMetricasDaConta(
  pedidos: readonly PedidoParaMetricas[],
  itens: readonly ItemParaMetricas[],
  de: string,
  ate: string,
): MetricasDaContaNoContrato {
  const tamanho = diasEntre(de, ate);
  const anteriorAte = somarDiasIso(de, -1);
  const anteriorDe = somarDiasIso(de, -tamanho);

  const comDia = pedidos.map((p) => ({ p, ...partes(p.criadoEm) }));
  const validos = comDia.filter((x) => x.p.status !== "CANCELLED");
  const noPeriodo = validos.filter((x) => x.dia >= de && x.dia <= ate);
  const noAnterior = validos.filter((x) => x.dia >= anteriorDe && x.dia <= anteriorAte);
  const cancelados = comDia.filter((x) => x.p.status === "CANCELLED" && x.dia >= de && x.dia <= ate).length;

  const idsDoPeriodo = new Set(noPeriodo.map((x) => x.p.id));
  const lojaDoPedido = new Map(noPeriodo.map((x) => [x.p.id, x.p]));

  const lojas = new Map<string, { apelido: string; nome: string; pedidos: number; gastoCentavos: number }>();
  for (const { p } of noPeriodo) {
    const l = lojas.get(p.lojaApelido) ?? { apelido: p.lojaApelido, nome: p.lojaNome, pedidos: 0, gastoCentavos: 0 };
    l.pedidos += 1;
    l.gastoCentavos += p.totalCentavos;
    lojas.set(p.lojaApelido, l);
  }

  const produtos = new Map<string, { nome: string; loja: { nome: string; apelido: string }; vezes: number; gastoCentavos: number }>();
  for (const item of itens) {
    if (!idsDoPeriodo.has(item.pedidoId)) continue;
    const loja = lojaDoPedido.get(item.pedidoId);
    if (loja === undefined) continue;
    const chave = `${loja.lojaApelido}\u0000${item.produto}`;
    const x = produtos.get(chave) ?? {
      nome: item.produto,
      loja: { nome: loja.lojaNome, apelido: loja.lojaApelido },
      vezes: 0,
      gastoCentavos: 0,
    };
    x.vezes += item.quantidade;
    x.gastoCentavos += item.totalCentavos;
    produtos.set(chave, x);
  }

  // Os 6 meses terminam no mês do fim do período.
  const mesFinal = ate.slice(0, 7);
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(mesFinal, i - 5));
  const gastoPorMes = meses.map((mes) => {
    const doMes = validos.filter((x) => x.dia.slice(0, 7) === mes);
    return { mes, gastoCentavos: doMes.reduce((s, x) => s + x.p.totalCentavos, 0), pedidos: doMes.length };
  });

  const porDia = Array.from({ length: 7 }, () => 0);
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const x of noPeriodo) {
    porDia[x.semana] = (porDia[x.semana] ?? 0) + 1;
    porHora[x.hora] = (porHora[x.hora] ?? 0) + 1;
  }

  return {
    periodo: { de, ate, fuso: FUSO_DAS_METRICAS },
    anterior: { de: anteriorDe, ate: anteriorAte },
    resumo: {
      ...resumir(noPeriodo.map((x) => x.p)),
      cancelados,
      lojasDistintas: lojas.size,
      entregues: noPeriodo.filter((x) => x.p.entrega === "DELIVERY").length,
      retiradas: noPeriodo.filter((x) => x.p.entrega === "PICKUP").length,
    },
    resumoAnterior: resumir(noAnterior.map((x) => x.p)),
    topProdutos: [...produtos.values()]
      .sort((a, b) => b.vezes - a.vezes || b.gastoCentavos - a.gastoCentavos)
      .slice(0, 5),
    topLojas: [...lojas.values()]
      .sort((a, b) => b.pedidos - a.pedidos || b.gastoCentavos - a.gastoCentavos)
      .slice(0, 5),
    gastoPorMes,
    pedidosPorDiaDaSemana: porDia,
    pedidosPorHora: porHora,
  };
}

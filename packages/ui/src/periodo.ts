/**
 * Datas do seletor de período, sem depender do fuso do computador.
 *
 * Toda data aqui é um texto ISO `yyyy-mm-dd` (dia civil, sem hora). A conta é
 * feita em UTC ao meio-dia só para somar dias e achar o dia da semana; nunca
 * se lê `getDate()` local, que é onde nascem os bugs de "ontem às 23h". O
 * "hoje" vem do fuso informado (padrão `America/Fortaleza`) via `Intl`.
 */

export const FUSO_PADRAO = "America/Fortaleza";

export type PeriodoIso = { inicio: string; fim: string };

export type IdDoAtalho =
  | "hoje"
  | "ontem"
  | "ultimos-7"
  | "ultimos-30"
  | "este-mes"
  | "mes-passado";

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export const MESES_ABREVIADOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** Domingo primeiro: a semana do seletor começa no domingo. */
export const DIAS_DA_SEMANA = [
  { curto: "D", longo: "domingo" },
  { curto: "S", longo: "segunda-feira" },
  { curto: "T", longo: "terça-feira" },
  { curto: "Q", longo: "quarta-feira" },
  { curto: "Q", longo: "quinta-feira" },
  { curto: "S", longo: "sexta-feira" },
  { curto: "S", longo: "sábado" },
] as const;

function paraUtc(iso: string): Date {
  const partes = FORMATO_ISO.exec(iso);
  if (partes === null) throw new RangeError(`Data inválida: ${iso}`);
  return new Date(
    Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), 12),
  );
}

function deUtc(data: Date): string {
  const ano = String(data.getUTCFullYear()).padStart(4, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Verdadeiro para `yyyy-mm-dd` que existe no calendário (rejeita 2026-02-30). */
export function ehDataIso(valor: string): boolean {
  if (!FORMATO_ISO.test(valor)) return false;
  return deUtc(paraUtc(valor)) === valor;
}

/** Soma (ou subtrai) dias corridos. */
export function somarDias(iso: string, dias: number): string {
  const data = paraUtc(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return deUtc(data);
}

/** Soma meses mantendo o dia, limitado ao último dia do mês de destino. */
export function somarMeses(iso: string, meses: number): string {
  const data = paraUtc(iso);
  const dia = data.getUTCDate();
  data.setUTCDate(1);
  data.setUTCMonth(data.getUTCMonth() + meses);
  data.setUTCDate(Math.min(dia, diasNoMes(data.getUTCFullYear(), data.getUTCMonth())));
  return deUtc(data);
}

/** `mes` de 0 a 11. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0, 12)).getUTCDate();
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso: string): number {
  return paraUtc(iso).getUTCDay();
}

export function primeiroDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function ultimoDoMes(iso: string): string {
  const data = paraUtc(iso);
  return `${iso.slice(0, 7)}-${String(
    diasNoMes(data.getUTCFullYear(), data.getUTCMonth()),
  ).padStart(2, "0")}`;
}

export function compararDatas(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Diferença em dias de `a` até `b` (positiva se `b` é depois). */
export function diasEntre(a: string, b: string): number {
  return Math.round((paraUtc(b).getTime() - paraUtc(a).getTime()) / 86_400_000);
}

/** Dia civil de hoje no fuso dado. */
export function hojeNoFuso(
  fuso: string = FUSO_PADRAO,
  agora: Date = new Date(),
): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const pega = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${pega("year")}-${pega("month")}-${pega("day")}`;
}

/** Põe início e fim na ordem certa. */
export function ordenarPeriodo(a: string, b: string): PeriodoIso {
  return compararDatas(a, b) <= 0 ? { inicio: a, fim: b } : { inicio: b, fim: a };
}

/** Encosta a data dentro de `min` e `max`, quando existirem. */
export function limitarData(iso: string, min?: string, max?: string): string {
  if (min !== undefined && iso < min) return min;
  if (max !== undefined && iso > max) return max;
  return iso;
}

export function dataBloqueada(iso: string, min?: string, max?: string): boolean {
  return (min !== undefined && iso < min) || (max !== undefined && iso > max);
}

/** Período do mesmo tamanho, imediatamente antes (para "comparar com"). */
export function periodoAnterior(periodo: PeriodoIso): PeriodoIso {
  const tamanho = diasEntre(periodo.inicio, periodo.fim) + 1;
  return {
    inicio: somarDias(periodo.inicio, -tamanho),
    fim: somarDias(periodo.inicio, -1),
  };
}

export const ATALHOS: readonly { id: IdDoAtalho; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "ultimos-7", rotulo: "Últimos 7 dias" },
  { id: "ultimos-30", rotulo: "Últimos 30 dias" },
  { id: "este-mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
];

/** Período de um atalho, a partir do dia de hoje. */
export function periodoDoAtalho(id: IdDoAtalho, hoje: string): PeriodoIso {
  switch (id) {
    case "hoje":
      return { inicio: hoje, fim: hoje };
    case "ontem": {
      const ontem = somarDias(hoje, -1);
      return { inicio: ontem, fim: ontem };
    }
    case "ultimos-7":
      return { inicio: somarDias(hoje, -6), fim: hoje };
    case "ultimos-30":
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case "este-mes":
      return { inicio: primeiroDoMes(hoje), fim: hoje };
    case "mes-passado": {
      const anterior = somarMeses(primeiroDoMes(hoje), -1);
      return { inicio: anterior, fim: ultimoDoMes(anterior) };
    }
  }
}

/** Atalho cujo período é exatamente este, se houver. */
export function atalhoDoPeriodo(
  periodo: PeriodoIso,
  hoje: string,
): IdDoAtalho | undefined {
  return ATALHOS.find((atalho) => {
    const alvo = periodoDoAtalho(atalho.id, hoje);
    return alvo.inicio === periodo.inicio && alvo.fim === periodo.fim;
  })?.id;
}

function partesDaData(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return { ano, mes: mes - 1, dia };
}

/** "15 out 2026" */
export function formatarData(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso);
  return `${dia} ${MESES_ABREVIADOS[mes]} ${ano}`;
}

/** "Outubro de 2026" (sem o "de", como cabeçalho do mês: "outubro 2026"). */
export function nomeDoMes(ano: number, mes: number): string {
  return `${MESES[mes]?.replace(/^./, (c) => c.toUpperCase())} de ${ano}`;
}

/** "Hoje", "Últimos 7 dias", "12 a 18 out 2026", "28 set a 3 out 2026". */
export function descreverPeriodo(periodo: PeriodoIso, hoje: string): string {
  const atalho = atalhoDoPeriodo(periodo, hoje);
  if (atalho !== undefined && atalho !== "este-mes" && atalho !== "mes-passado") {
    return ATALHOS.find((item) => item.id === atalho)?.rotulo ?? "";
  }
  return descreverIntervalo(periodo);
}

/** Só as datas, sem atalho: usado também para o período de comparação. */
export function descreverIntervalo({ inicio, fim }: PeriodoIso): string {
  const a = partesDaData(inicio);
  const b = partesDaData(fim);
  if (inicio === fim) return formatarData(inicio);
  if (a.ano === b.ano && a.mes === b.mes) {
    return `${a.dia} a ${b.dia} ${MESES_ABREVIADOS[b.mes]} ${b.ano}`;
  }
  if (a.ano === b.ano) {
    return `${a.dia} ${MESES_ABREVIADOS[a.mes]} a ${b.dia} ${MESES_ABREVIADOS[b.mes]} ${b.ano}`;
  }
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

/** Nome completo para leitor de tela: "quinta-feira, 15 de outubro de 2026". */
export function descreverDiaPorExtenso(iso: string): string {
  const { ano, mes, dia } = partesDaData(iso);
  return `${DIAS_DA_SEMANA[diaDaSemana(iso)]?.longo}, ${dia} de ${MESES[mes]} de ${ano}`;
}

/**
 * As 6 semanas (42 dias) que desenham o mês, domingo a sábado. Dias de fora do
 * mês vêm com `foraDoMes` para aparecerem apagados.
 */
export function semanasDoMes(
  ano: number,
  mes: number,
): { iso: string; foraDoMes: boolean }[][] {
  const primeiro = `${String(ano).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-01`;
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  const semanas: { iso: string; foraDoMes: boolean }[][] = [];
  for (let s = 0; s < 6; s++) {
    const semana: { iso: string; foraDoMes: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = somarDias(inicio, s * 7 + d);
      semana.push({ iso, foraDoMes: iso.slice(0, 7) !== primeiro.slice(0, 7) });
    }
    semanas.push(semana);
  }
  return semanas;
}

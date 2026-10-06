/**
 * O período das métricas, no fuso da loja (T-800; AC-800, AC-803, AC-804,
 * AC-805).
 *
 * "HOJE" É O HOJE DA LOJA, e não o do servidor. A API pode rodar em qualquer
 * fuso — e a pastelaria de Manaus fecha o dia uma hora depois da de São Paulo.
 * Por isso toda conta de data aqui recebe o fuso por parâmetro e o servidor
 * nunca usa o relógio local para decidir o que é "o dia de hoje".
 *
 * O INTERVALO ESCOLHIDO COBRE OS DOIS DIAS DAS PONTAS POR INTEIRO: do primeiro
 * instante do dia inicial ao último do dia final (AC-804). Por isso o período
 * resolvido carrega `inicio` (inclusivo) e `fim` (EXCLUSIVO, o primeiro
 * instante do dia seguinte). Comparar `placed_at < fim` é o que evita perder o
 * pedido das 23:59:59.999 — o erro clássico de `<= '23:59:59'`.
 *
 * SEM BIBLIOTECA DE DATA (P-014). A conversão para o fuso é feita com o
 * `Intl.DateTimeFormat` do próprio Node, que carrega a mesma base de fusos que
 * o PostgreSQL. Nenhum somatório de horas "na mão": o deslocamento é
 * PERGUNTADO ao fuso para cada instante, o que cobre horário de verão onde ele
 * existir.
 */

/** Atalhos de período que a tela oferece (AC-803). */
export const ATALHOS_DE_PERIODO = [
  "hoje",
  "3d",
  "7d",
  "personalizado",
] as const;

export type AtalhoDePeriodo = (typeof ATALHOS_DE_PERIODO)[number];

/**
 * Até quantos dias um intervalo escolhido a dedo pode ter (ASM-804).
 *
 * Um ano — 366 para o bissexto caber inteiro. Acima disso a consulta pesa no
 * plano gratuito, e "os últimos dois anos" é relatório, não painel.
 */
export const LIMITE_DE_DIAS = 366;

/** O fuso que vale quando a loja não informou um que o Node conheça. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** Data civil, sem hora: `2026-09-27`. */
export type DataCivil = string;

/** O que a tela pede: um atalho e, no intervalo a dedo, as duas pontas. */
export interface PedidoDePeriodo {
  readonly atalho: AtalhoDePeriodo;
  readonly de?: string | undefined;
  readonly ate?: string | undefined;
}

/** O período já decidido, com as pontas em instantes de verdade. */
export interface PeriodoResolvido {
  readonly atalho: AtalhoDePeriodo;
  /** Primeiro dia, inclusivo, no fuso da loja. */
  readonly de: DataCivil;
  /** Último dia, inclusivo, no fuso da loja. */
  readonly ate: DataCivil;
  readonly dias: number;
  readonly fuso: string;
  /** Primeiro instante do dia `de`. */
  readonly inicio: Date;
  /** Primeiro instante do dia SEGUINTE a `ate` — a ponta exclusiva. */
  readonly fim: Date;
}

export type ResultadoDoPeriodo =
  | { readonly ok: true; readonly periodo: PeriodoResolvido }
  | { readonly ok: false; readonly explicacao: string };

const MS_POR_DIA = 86_400_000;
const FORMA_DA_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------------------------------------------------------------------------
// Fuso
// ---------------------------------------------------------------------------

const formatadores = new Map<string, Intl.DateTimeFormat>();

/** Um formatador por fuso: criá-los é caro, e a mesma loja pergunta sempre. */
function formatadorDo(fuso: string): Intl.DateTimeFormat {
  let formatador = formatadores.get(fuso);
  if (formatador === undefined) {
    formatador = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadores.set(fuso, formatador);
  }
  return formatador;
}

/** Verdadeiro quando o Node conhece o fuso. */
export function fusoConhecido(fuso: string): boolean {
  try {
    formatadorDo(fuso);
    return true;
  } catch {
    return false;
  }
}

/** O fuso informado, ou o padrão quando ele não serve. */
export function fusoOuPadrao(fuso: string | null | undefined): string {
  if (fuso === null || fuso === undefined || fuso.trim() === "") {
    return FUSO_PADRAO;
  }
  return fusoConhecido(fuso) ? fuso : FUSO_PADRAO;
}

/** Relógio de parede de um instante, visto do fuso. */
export interface RelogioLocal {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
}

/** O que o relógio da loja marca naquele instante. */
export function relogioNoFuso(instante: Date, fuso: string): RelogioLocal {
  const partes = formatadorDo(fuso).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    // `h23` deveria bastar, mas alguma versão do ICU devolve "24" à meia-noite.
    hora: valor("hour") % 24,
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/** Quanto o relógio da loja está à frente do UTC naquele instante, em ms. */
function deslocamentoEmMs(instante: Date, fuso: string): number {
  const local = relogioNoFuso(instante, fuso);
  const comoSeFosseUtc = Date.UTC(
    local.ano,
    local.mes - 1,
    local.dia,
    local.hora,
    local.minuto,
    local.segundo,
  );
  // Os milissegundos não aparecem no relógio de parede; tirá-los dos dois
  // lados deixa a conta exata.
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Data civil
// ---------------------------------------------------------------------------

function paraDois(numero: number): string {
  return String(numero).padStart(2, "0");
}

/** `2026-09-27` a partir das partes. */
export function dataCivil(ano: number, mes: number, dia: number): DataCivil {
  return `${String(ano).padStart(4, "0")}-${paraDois(mes)}-${paraDois(dia)}`;
}

/** As partes de uma data civil, ou `null` quando o texto não é uma data. */
export function lerDataCivil(
  texto: string,
): { ano: number; mes: number; dia: number } | null {
  const achado = FORMA_DA_DATA.exec(texto.trim());
  if (achado === null) return null;
  const ano = Number(achado[1]);
  const mes = Number(achado[2]);
  const dia = Number(achado[3]);
  // O calendário decide se 31 de fevereiro existe: `Date.UTC` avança o mês,
  // e a volta pelo mesmo caminho denuncia a data inventada.
  const utc = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    utc.getUTCFullYear() !== ano ||
    utc.getUTCMonth() !== mes - 1 ||
    utc.getUTCDate() !== dia
  ) {
    return null;
  }
  return { ano, mes, dia };
}

/** A data civil com `n` dias somados (ou subtraídos, com `n` negativo). */
export function somarDias(data: DataCivil, n: number): DataCivil {
  const partes = lerDataCivil(data);
  if (partes === null) throw new Error(`"${data}" não é uma data civil`);
  const utc = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia + n));
  return dataCivil(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
  );
}

/** Quantos dias há de `de` a `ate`, com as duas pontas contadas. */
export function diasEntre(de: DataCivil, ate: DataCivil): number {
  const a = lerDataCivil(de);
  const b = lerDataCivil(ate);
  if (a === null || b === null) throw new Error("data civil inválida");
  const inicio = Date.UTC(a.ano, a.mes - 1, a.dia);
  const fim = Date.UTC(b.ano, b.mes - 1, b.dia);
  return Math.round((fim - inicio) / MS_POR_DIA) + 1;
}

/** O dia da loja em que aquele instante cai. */
export function diaNoFuso(instante: Date, fuso: string): DataCivil {
  const relogio = relogioNoFuso(instante, fuso);
  return dataCivil(relogio.ano, relogio.mes, relogio.dia);
}

/**
 * O primeiro instante daquele dia, no fuso da loja.
 *
 * O palpite é "meia-noite UTC daquela data"; o deslocamento do fuso NAQUELE
 * instante corrige o palpite, e uma segunda pergunta confirma que a correção
 * não atravessou uma virada de horário de verão. Duas perguntas bastam: o
 * deslocamento só muda na transição, e nenhuma transição acontece à
 * meia-noite mais de uma vez por dia.
 */
export function inicioDoDiaNoFuso(data: DataCivil, fuso: string): Date {
  const partes = lerDataCivil(data);
  if (partes === null) throw new Error(`"${data}" não é uma data civil`);
  const palpite = Date.UTC(partes.ano, partes.mes - 1, partes.dia);
  const primeiro = deslocamentoEmMs(new Date(palpite), fuso);
  let instante = palpite - primeiro;
  const segundo = deslocamentoEmMs(new Date(instante), fuso);
  if (segundo !== primeiro) instante = palpite - segundo;
  return new Date(instante);
}

// ---------------------------------------------------------------------------
// O período
// ---------------------------------------------------------------------------

function periodoDe(
  atalho: AtalhoDePeriodo,
  de: DataCivil,
  ate: DataCivil,
  fuso: string,
): PeriodoResolvido {
  return {
    atalho,
    de,
    ate,
    dias: diasEntre(de, ate),
    fuso,
    inicio: inicioDoDiaNoFuso(de, fuso),
    fim: inicioDoDiaNoFuso(somarDias(ate, 1), fuso),
  };
}

/**
 * Decide o período a partir do que a tela pediu.
 *
 * Os atalhos terminam SEMPRE no dia de hoje da loja: "7 dias" é hoje e os
 * seis anteriores. O intervalo a dedo é recusado com explicação — e nunca
 * "corrigido" em silêncio — quando a ponta final vem antes da inicial ou o
 * intervalo passa do limite (AC-805): a tela mantém o período anterior.
 */
export function resolverPeriodo(
  pedido: PedidoDePeriodo,
  agora: Date,
  fuso: string,
): ResultadoDoPeriodo {
  const hoje = diaNoFuso(agora, fuso);

  if (pedido.atalho === "hoje") {
    return { ok: true, periodo: periodoDe("hoje", hoje, hoje, fuso) };
  }
  if (pedido.atalho === "3d") {
    return {
      ok: true,
      periodo: periodoDe("3d", somarDias(hoje, -2), hoje, fuso),
    };
  }
  if (pedido.atalho === "7d") {
    return {
      ok: true,
      periodo: periodoDe("7d", somarDias(hoje, -6), hoje, fuso),
    };
  }

  const de = pedido.de?.trim() ?? "";
  const ate = pedido.ate?.trim() ?? "";
  if (de === "" || ate === "") {
    return {
      ok: false,
      explicacao: "Informe a data inicial e a data final do intervalo.",
    };
  }
  if (lerDataCivil(de) === null || lerDataCivil(ate) === null) {
    return {
      ok: false,
      explicacao: "As datas do intervalo precisam ser datas válidas.",
    };
  }
  const dias = diasEntre(de, ate);
  if (dias < 1) {
    return {
      ok: false,
      explicacao: "A data final precisa ser igual ou posterior à data inicial.",
    };
  }
  if (dias > LIMITE_DE_DIAS) {
    return {
      ok: false,
      explicacao: `O intervalo pode ter no máximo ${LIMITE_DE_DIAS} dias (um ano). Escolha datas mais próximas.`,
    };
  }
  return { ok: true, periodo: periodoDe("personalizado", de, ate, fuso) };
}

/** O período anterior, com a indicação de que foi cortado no meio. */
export interface PeriodoAnterior extends PeriodoResolvido {
  /** Verdadeiro quando `fim` foi trazido para antes do fim do último dia. */
  readonly parcial: boolean;
}

/**
 * O período anterior EQUIVALENTE: mesmo tamanho, terminando na véspera do
 * início (AC-802). "Hoje" compara com ontem; "7 dias" com os sete anteriores.
 *
 * PERÍODO EM CURSO COMPARA COM O MESMO PEDAÇO DO ANTERIOR (decisão de
 * 03/10/2026). Às 14h32, "hoje" tem catorze horas e meia de movimento; o
 * "ontem" inteiro tem vinte e quatro, e a comparação acusaria queda todo dia
 * até a noite. Por isso, quando `agora` cai dentro do período, o anterior é
 * cortado no mesmo ponto do relógio da loja no último dia dele: ontem até as
 * 14h32. A conta é feita sobre o início de cada dia NO FUSO, e não somando 24
 * horas, para que a virada de horário de verão não desloque o corte.
 */
export function periodoAnterior(
  periodo: PeriodoResolvido,
  agora?: Date,
): PeriodoAnterior {
  const ate = somarDias(periodo.de, -1);
  const de = somarDias(ate, -(periodo.dias - 1));
  const inteiro = periodoDe(periodo.atalho, de, ate, periodo.fuso);
  if (
    agora === undefined ||
    agora.getTime() <= periodo.inicio.getTime() ||
    agora.getTime() >= periodo.fim.getTime()
  ) {
    return { ...inteiro, parcial: false };
  }

  const decorridoNoUltimoDia =
    agora.getTime() - inicioDoDiaNoFuso(periodo.ate, periodo.fuso).getTime();
  const corte =
    inicioDoDiaNoFuso(ate, periodo.fuso).getTime() +
    Math.max(0, decorridoNoUltimoDia);
  if (corte >= inteiro.fim.getTime()) return { ...inteiro, parcial: false };
  return { ...inteiro, fim: new Date(corte), parcial: true };
}

/** Cada dia do período, do primeiro ao último — inclusive os sem venda. */
export function diasDoPeriodo(periodo: PeriodoResolvido): DataCivil[] {
  const dias: DataCivil[] = [];
  let dia = periodo.de;
  for (let indice = 0; indice < periodo.dias; indice += 1) {
    dias.push(dia);
    dia = somarDias(dia, 1);
  }
  return dias;
}

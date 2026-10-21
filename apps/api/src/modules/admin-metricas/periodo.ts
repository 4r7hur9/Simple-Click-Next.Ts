/**
 * Contas de calendário do painel de crescimento. Os dias são texto
 * `yyyy-mm-dd` do fuso de Fortaleza; a conta é feita em UTC sobre o texto,
 * sem passar pelo relógio do servidor, para não escorregar um dia.
 */
import { MAXIMO_DE_DIAS_DO_PAINEL_DO_ADMIN } from "@simpleclick/contracts";

export interface IntervaloDeDias {
  readonly inicio: string;
  readonly fim: string;
}

const MS_DO_DIA = 86_400_000;

function paraMs(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`);
}

function paraTexto(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `yyyy-mm-dd` que existe de verdade no calendário (31/02 não passa). */
export function diaValido(dia: string): boolean {
  const ms = paraMs(dia);
  return Number.isFinite(ms) && paraTexto(ms) === dia;
}

export function somarDias(dia: string, dias: number): string {
  return paraTexto(paraMs(dia) + dias * MS_DO_DIA);
}

export function contarDias({ inicio, fim }: IntervaloDeDias): number {
  return Math.round((paraMs(fim) - paraMs(inicio)) / MS_DO_DIA) + 1;
}

/** `null` quando o intervalo é inválido, invertido ou longo demais. */
export function validarIntervalo(
  intervalo: IntervaloDeDias,
): "invalido" | "invertido" | "longo_demais" | null {
  if (!diaValido(intervalo.inicio) || !diaValido(intervalo.fim)) {
    return "invalido";
  }
  if (intervalo.fim < intervalo.inicio) return "invertido";
  if (contarDias(intervalo) > MAXIMO_DE_DIAS_DO_PAINEL_DO_ADMIN) {
    return "longo_demais";
  }
  return null;
}

/** O período de mesma duração que termina um dia antes do início. */
export function periodoAnterior(intervalo: IntervaloDeDias): IntervaloDeDias {
  const dias = contarDias(intervalo);
  return {
    inicio: somarDias(intervalo.inicio, -dias),
    fim: somarDias(intervalo.inicio, -1),
  };
}

/** Variação percentual; `null` quando não há base para comparar. */
export function variacaoPercentual(
  atual: number,
  anterior: number | null,
): number | null {
  if (anterior === null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

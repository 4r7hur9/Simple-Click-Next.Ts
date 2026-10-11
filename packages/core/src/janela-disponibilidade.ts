/**
 * Janela semanal em que um produto pode ser vendido (T-311).
 *
 * A hora é sempre interpretada no fuso da loja. Sem janela cadastrada, o
 * produto não ganha uma restrição nova; a disponibilidade manual continua
 * sendo a decisão do dono.
 */
import { momentoNaLoja } from "./horario-loja.ts";

export interface JanelaDeDisponibilidade {
  /** 0 = domingo, como no JavaScript. */
  readonly diaDaSemana: number;
  readonly abre: string;
  readonly fecha: string;
}

/** "HH:MM" em minutos desde a meia-noite; hora fora do relógio vira `null`. */
function minutos(hora: string): number | null {
  const partes = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (partes === null) return null;
  const h = Number(partes[1]);
  const m = Number(partes[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** A janela em minutos, ou `null` se o dia, as horas ou a ordem não fecham. */
function janelaValida(janela: JanelaDeDisponibilidade): {
  readonly abre: number;
  readonly fecha: number;
} | null {
  if (
    !Number.isInteger(janela.diaDaSemana) ||
    janela.diaDaSemana < 0 ||
    janela.diaDaSemana > 6
  ) {
    return null;
  }
  const abre = minutos(janela.abre);
  const fecha = minutos(janela.fecha);
  if (abre === null || fecha === null || fecha <= abre) return null;
  return { abre, fecha };
}

/**
 * Lê as janelas como o banco as guarda (coluna JSON, migração 0028).
 *
 * A LEITURA É DEFENSIVA porque a coluna aceita qualquer forma: uma chave
 * renomeada por engano viraria `undefined` e faria toda janela ser ignorada
 * em silêncio — e o produto de fim de semana passaria a vender na terça. Aqui
 * só entra o que tem a forma inteira e fecha (dia de 0 a 6, hora do relógio,
 * fecha depois de abrir); o resto é descartado.
 */
export function lerJanelasDeDisponibilidade(
  bruto: unknown,
): JanelaDeDisponibilidade[] {
  if (!Array.isArray(bruto)) return [];
  const janelas: JanelaDeDisponibilidade[] = [];
  for (const item of bruto) {
    if (item === null || typeof item !== "object") continue;
    const { diaDaSemana, abre, fecha } = item as Record<string, unknown>;
    if (
      typeof diaDaSemana !== "number" ||
      typeof abre !== "string" ||
      typeof fecha !== "string"
    ) {
      continue;
    }
    if (janelaValida({ diaDaSemana, abre, fecha }) === null) continue;
    janelas.push({ diaDaSemana, abre, fecha });
  }
  return janelas;
}

/** Retorna se o instante cai em ao menos uma janela válida do produto. */
export function estaNaJanelaDeDisponibilidade(
  janelas: readonly JanelaDeDisponibilidade[],
  agora: Date,
  fusoHorario: string,
): boolean {
  if (janelas.length === 0) return true;
  const momento = momentoNaLoja(agora, fusoHorario);

  return janelas.some((janela) => {
    const valida = janelaValida(janela);
    return (
      valida !== null &&
      janela.diaDaSemana === momento.diaDaSemana &&
      momento.minutosDoDia >= valida.abre &&
      momento.minutosDoDia < valida.fecha
    );
  });
}

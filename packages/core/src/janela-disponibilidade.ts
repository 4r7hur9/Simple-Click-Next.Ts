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

function minutos(hora: string): number | null {
  const partes = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (partes === null) return null;
  const h = Number(partes[1]);
  const m = Number(partes[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

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

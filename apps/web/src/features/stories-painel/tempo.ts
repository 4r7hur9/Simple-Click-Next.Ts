/**
 * Quanto falta para o story sumir, em palavras curtas: "23 h 12 min",
 * "45 min", "menos de 1 min". Vencido: "saindo do ar".
 */
export function tempoQueFalta(expiraEm: string, agora: number): string {
  const restanteMs = new Date(expiraEm).getTime() - agora;
  if (!Number.isFinite(restanteMs) || restanteMs <= 0) return "saindo do ar";
  const minutos = Math.floor(restanteMs / 60_000);
  if (minutos < 1) return "menos de 1 min";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** A fração das 24 horas que já passou (0 a 1), para a barrinha do cartão. */
export function fracaoPassada(
  criadoEm: string,
  expiraEm: string,
  agora: number,
): number {
  const inicio = new Date(criadoEm).getTime();
  const fim = new Date(expiraEm).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) {
    return 1;
  }
  return Math.min(1, Math.max(0, (agora - inicio) / (fim - inicio)));
}

/** "1 visualização", "12 visualizações", "Ninguém viu ainda". */
export function textoDasVisualizacoes(quantas: number): string {
  if (quantas === 0) return "Ninguém viu ainda";
  return quantas === 1 ? "1 visualização" : `${quantas} visualizações`;
}

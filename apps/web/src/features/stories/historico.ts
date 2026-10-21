/**
 * Pilha de desfazer e refazer do editor de Stories (card #84).
 *
 * Guarda fotografias do estado (o estado é imutável, então guardar é barato).
 * Um gesto longo (arrastar um texto) muda o estado ao vivo, sem encher a
 * pilha: só quando ele termina vira UM passo do desfazer.
 */

export interface Historico<T> {
  readonly passado: readonly T[];
  readonly presente: T;
  readonly futuro: readonly T[];
}

export const LIMITE_DO_HISTORICO = 100;

export function criarHistorico<T>(inicial: T): Historico<T> {
  return { passado: [], presente: inicial, futuro: [] };
}

/** Um passo completo: o estado de antes vai para o passado e o futuro se perde. */
export function registrar<T>(
  historico: Historico<T>,
  novo: T,
  limite = LIMITE_DO_HISTORICO,
): Historico<T> {
  if (Object.is(novo, historico.presente)) return historico;
  const passado = [...historico.passado, historico.presente];
  return {
    passado: passado.length > limite ? passado.slice(-limite) : passado,
    presente: novo,
    futuro: [],
  };
}

/** Muda o presente sem criar passo (durante um gesto). */
export function alterarAoVivo<T>(historico: Historico<T>, novo: T): Historico<T> {
  return Object.is(novo, historico.presente)
    ? historico
    : { ...historico, presente: novo };
}

/**
 * Fecha um gesto: `anterior` é o estado de ANTES do gesto começar. Se nada
 * mudou, não vira passo.
 */
export function fecharAlteracao<T>(
  historico: Historico<T>,
  anterior: T,
  limite = LIMITE_DO_HISTORICO,
): Historico<T> {
  if (Object.is(anterior, historico.presente)) return historico;
  const passado = [...historico.passado, anterior];
  return {
    passado: passado.length > limite ? passado.slice(-limite) : passado,
    presente: historico.presente,
    futuro: [],
  };
}

export function podeDesfazer<T>(historico: Historico<T>): boolean {
  return historico.passado.length > 0;
}

export function podeRefazer<T>(historico: Historico<T>): boolean {
  return historico.futuro.length > 0;
}

export function desfazer<T>(historico: Historico<T>): Historico<T> {
  const anterior = historico.passado[historico.passado.length - 1];
  if (anterior === undefined) return historico;
  return {
    passado: historico.passado.slice(0, -1),
    presente: anterior,
    futuro: [historico.presente, ...historico.futuro],
  };
}

export function refazer<T>(historico: Historico<T>): Historico<T> {
  const proximo = historico.futuro[0];
  if (proximo === undefined) return historico;
  return {
    passado: [...historico.passado, historico.presente],
    presente: proximo,
    futuro: historico.futuro.slice(1),
  };
}

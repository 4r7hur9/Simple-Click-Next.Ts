// Máscara e formato do código de leitura (AC-931): as oito fórmulas de máscara, os
// bits de formato com correção BCH e o falso localizador que a penalidade procura.

/** Bits de formato do nível M. */
const BITS_DO_NIVEL_M = 0b00;

const PADRAO_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0] as const;
const PADRAO_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1] as const;

/** Se o trecho de 11 módulos imita um localizador (1011101 com quatro claros de um lado). */
export function ehFalsoLocalizador(trecho: readonly boolean[]): boolean {
  const bate = (padrao: readonly number[]): boolean =>
    padrao.every((esperado, i) => (trecho[i] ?? false) === (esperado === 1));
  return bate(PADRAO_A) || bate(PADRAO_B);
}

/** Os 15 bits de formato: nível, máscara e a correção BCH deles. */
export function bitsDeFormato(mascara: number): number {
  const dado = (BITS_DO_NIVEL_M << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}

/** Se a máscara inverte o módulo em (x, y). As oito fórmulas do documento. */
export function mascaraInverte(mascara: number, x: number, y: number): boolean {
  switch (mascara) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new Error(`máscara inexistente: ${String(mascara)}`);
  }
}

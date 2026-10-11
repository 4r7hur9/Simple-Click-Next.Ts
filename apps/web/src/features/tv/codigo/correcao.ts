// Correção de erro do código de leitura (AC-931): Reed-Solomon sobre GF(256) com o
// polinômio 0x11D, que permite à câmera ler o código mesmo com parte dele danificada.

/** Produto em GF(256), reduzido pelo polinômio 0x11D bit a bit. */
function multiplicar(a: number, b: number): number {
  let resultado = 0;
  for (let i = 7; i >= 0; i--) {
    resultado = (resultado << 1) ^ ((resultado >>> 7) * 0x11d);
    resultado ^= ((b >>> i) & 1) * a;
  }
  return resultado;
}

/** O polinômio gerador do grau pedido, sem o coeficiente líder. */
export function polinomioGerador(grau: number): number[] {
  const resultado: number[] = new Array<number>(grau).fill(0);
  resultado[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < grau; j++) {
      resultado[j] = multiplicar(resultado[j] ?? 0, raiz);
      if (j + 1 < grau)
        resultado[j] = (resultado[j] ?? 0) ^ (resultado[j + 1] ?? 0);
    }
    raiz = multiplicar(raiz, 2);
  }
  return resultado;
}

/** Os bytes de correção de um bloco de dados. */
export function bytesDeCorrecao(
  dados: readonly number[],
  gerador: readonly number[],
): number[] {
  const resto: number[] = new Array<number>(gerador.length).fill(0);
  for (const byte of dados) {
    const fator = byte ^ (resto.shift() ?? 0);
    resto.push(0);
    gerador.forEach((coeficiente, i) => {
      resto[i] = (resto[i] ?? 0) ^ multiplicar(coeficiente, fator);
    });
  }
  return resto;
}

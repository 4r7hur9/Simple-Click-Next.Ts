// Geometria do código de leitura (AC-931): lado de cada versão, módulos livres para
// dado, capacidade no nível M e posição dos padrões de alinhamento (ISO/IEC 18004).

/** A maior versão que este gerador produz. */
export const VERSAO_MAXIMA = 10;

/**
 * Nível de correção M nas tabelas do documento.
 *
 * Índice = versão. Primeiro: quantos bytes de correção por bloco. Segundo:
 * quantos blocos. A quantidade total de bytes vem da geometria (função
 * `bytesBrutos`), e o que sobra é dado.
 */
export const CORRECAO_POR_BLOCO_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
export const BLOCOS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/** Módulos de lado da versão: 21 na versão 1, e cada versão soma 4. */
export function tamanhoDaVersao(versao: number): number {
  return versao * 4 + 17;
}

/**
 * Quantos módulos de dado a versão tem, descontados os padrões fixos.
 *
 * Vem da geometria: o quadrado inteiro menos localizadores, separadores,
 * tempo, alinhamentos, formato e (a partir da 7) a informação de versão.
 */
export function bytesBrutos(versao: number): number {
  let modulos = (16 * versao + 128) * versao + 64;
  if (versao >= 2) {
    const alinhamentos = Math.floor(versao / 7) + 2;
    modulos -= (25 * alinhamentos - 10) * alinhamentos - 55;
    if (versao >= 7) modulos -= 36;
  }
  return Math.floor(modulos / 8);
}

/** Quantos bytes de DADO cabem na versão, no nível M. */
export function capacidadeEmBytes(versao: number): number {
  const correcao = CORRECAO_POR_BLOCO_M[versao] ?? 0;
  const blocos = BLOCOS_M[versao] ?? 0;
  const dados = bytesBrutos(versao) - correcao * blocos;
  // Cabeçalho do modo de bytes: 4 bits de modo e o tamanho (8 ou 16 bits).
  const cabecalho = 4 + (versao >= 10 ? 16 : 8);
  return Math.floor((dados * 8 - cabecalho) / 8);
}

/**
 * As coordenadas dos padrões de alinhamento, nos dois eixos.
 *
 * A fórmula reproduz a tabela do documento: o primeiro fica em 6, o último a
 * 7 módulos da borda, e os do meio espaçados por um passo par.
 */
export function posicoesDeAlinhamento(versao: number): number[] {
  if (versao === 1) return [];
  const quantos = Math.floor(versao / 7) + 2;
  const tamanho = tamanhoDaVersao(versao);
  const passo =
    Math.trunc((versao * 4 + quantos * 2 + 1) / (quantos * 2 - 2)) * 2;
  const posicoes: number[] = [];
  for (let i = 0, pos = tamanho - 7; i < quantos - 1; i++, pos -= passo) {
    posicoes.unshift(pos);
  }
  posicoes.unshift(6);
  return posicoes;
}

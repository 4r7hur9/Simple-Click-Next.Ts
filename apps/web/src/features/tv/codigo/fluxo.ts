// Fluxo de bits do código de leitura (AC-931): escolhe a versão, monta os bytes de
// dado no modo de bytes e os intercala com a correção, na ordem que a câmera espera.
import { bytesDeCorrecao, polinomioGerador } from "./correcao.ts";
import {
  BLOCOS_M,
  bytesBrutos,
  capacidadeEmBytes,
  CORRECAO_POR_BLOCO_M,
  VERSAO_MAXIMA,
} from "./geometria.ts";

/** Modo de bytes, na cabeça do fluxo de bits. */
const MODO_DE_BYTES = 0b0100;

/** Bytes de enchimento, alternados até completar a capacidade. */
const ENCHIMENTO = [0xec, 0x11] as const;

/** Escolhe a menor versão em que os bytes cabem. */
export function versaoPara(quantosBytes: number): number {
  for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
    if (capacidadeEmBytes(versao) >= quantosBytes) return versao;
  }
  throw new Error(
    `o texto tem ${String(quantosBytes)} bytes e não cabe num código de leitura até a versão ${String(VERSAO_MAXIMA)}`,
  );
}

/** Monta os bytes de dado: cabeçalho, conteúdo, terminador e enchimento. */
export function bytesDeDado(conteudo: Uint8Array, versao: number): number[] {
  const bits: number[] = [];
  const anexar = (valor: number, quantidade: number): void => {
    for (let i = quantidade - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };

  anexar(MODO_DE_BYTES, 4);
  anexar(conteudo.length, versao >= 10 ? 16 : 8);
  for (const byte of conteudo) anexar(byte, 8);

  const correcao = CORRECAO_POR_BLOCO_M[versao] ?? 0;
  const blocos = BLOCOS_M[versao] ?? 0;
  const capacidade = (bytesBrutos(versao) - correcao * blocos) * 8;

  // Terminador de até quatro zeros, e depois até a fronteira do byte.
  anexar(0, Math.min(4, capacidade - bits.length));
  anexar(0, (8 - (bits.length % 8)) % 8);

  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    bytes.push(byte);
  }
  for (let i = 0; bytes.length * 8 < capacidade; i++) {
    bytes.push(ENCHIMENTO[i % 2] ?? 0);
  }
  return bytes;
}

/** Divide em blocos, calcula a correção de cada um e intercala tudo. */
export function intercalarComCorrecao(
  dados: readonly number[],
  versao: number,
): number[] {
  const quantosBlocos = BLOCOS_M[versao] ?? 1;
  const correcaoPorBloco = CORRECAO_POR_BLOCO_M[versao] ?? 0;
  const brutos = bytesBrutos(versao);
  const blocosCurtos = quantosBlocos - (brutos % quantosBlocos);
  const tamanhoCurto = Math.floor(brutos / quantosBlocos);
  const gerador = polinomioGerador(correcaoPorBloco);

  const blocos: number[][] = [];
  for (let i = 0, k = 0; i < quantosBlocos; i++) {
    const quantosDados =
      tamanhoCurto - correcaoPorBloco + (i < blocosCurtos ? 0 : 1);
    const dadosDoBloco = dados.slice(k, k + quantosDados);
    k += quantosDados;
    const correcao = bytesDeCorrecao(dadosDoBloco, gerador);
    // O bloco curto ganha um espaço vazio para a intercalação ficar regular.
    const alinhado =
      i < blocosCurtos ? [...dadosDoBloco, 0] : [...dadosDoBloco];
    blocos.push([...alinhado, ...correcao]);
  }

  const resultado: number[] = [];
  const comprimento = blocos[0]?.length ?? 0;
  for (let i = 0; i < comprimento; i++) {
    blocos.forEach((bloco, j) => {
      // O espaço vazio dos blocos curtos não sai.
      if (i !== tamanhoCurto - correcaoPorBloco || j >= blocosCurtos) {
        resultado.push(bloco[i] ?? 0);
      }
    });
  }
  return resultado;
}

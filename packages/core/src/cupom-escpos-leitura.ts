/**
 * Leitura do papel: os bytes ESC/POS de volta em linhas do cupom (T-610).
 *
 * É o caminho inverso de `compilarEscPos`, e existe UMA vez: o teste do
 * gerador (`cupom-escpos.test.ts`) e o emulador de impressora do agente
 * (`apps/agente-impressao/src/emulador.ts`) leem os bytes por esta função.
 * Antes ela morava dentro do teste; com duas implementações, o emulador
 * poderia aceitar um byte que o teste reprova, e a prova sem hardware
 * deixaria de valer.
 *
 * Só entende os comandos que a saída promete emitir (`COMANDOS_ESCPOS`).
 * Qualquer outro byte de controle é recusado: se a compilação um dia emitir
 * algo a mais — ou deixar passar um ESC vindo do texto do cliente, que
 * abriria a gaveta ou cortaria o papel no meio —, a leitura acusa.
 */

import type { LinhaDoCupom } from "./cupom-blocos.ts";
import { NUMERO_DA_TABELA_NO_ESCPOS } from "./cupom-escpos.ts";
import { caractereDoByte, type TabelaDeCaracteres } from "./cupom-largura.ts";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** O papel como a impressora o desenharia. */
export interface PapelLido {
  /** A tabela que o `ESC t n` do começo escolheu. */
  readonly tabela: TabelaDeCaracteres;
  /** O número cru do `ESC t n`, para quem confere o comando em si. */
  readonly tabelaSelecionada: number;
  /** Linha por linha: texto, negrito, tamanho e os cortes. */
  readonly linhas: LinhaDoCupom[];
}

/** Os bytes não são um cupom que `compilarEscPos` emitiria. */
export class ErroDaLeituraEscPos extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDaLeituraEscPos";
  }
}

/** A tabela de caracteres pelo número do `ESC t n`, ou `undefined`. */
function tabelaDoNumero(numero: number): TabelaDeCaracteres | undefined {
  const achada = Object.entries(NUMERO_DA_TABELA_NO_ESCPOS).find(
    ([, n]) => n === numero,
  );
  return achada?.[0] as TabelaDeCaracteres | undefined;
}

/**
 * Lê os bytes como a impressora os leria.
 *
 * O cupom começa por `ESC @` (iniciar) e `ESC t n` (tabela); quem não começa
 * assim é recusado, porque imprimiria com a tabela de fábrica — o acento
 * corrompido do AC-620. `tabela` confere que a escolhida é a esperada; sem
 * ela, vale a que o próprio comando diz.
 */
export function lerEscPos(
  bytes: Uint8Array,
  tabela?: TabelaDeCaracteres,
): PapelLido {
  if (bytes[0] !== ESC || bytes[1] !== 0x40) {
    throw new ErroDaLeituraEscPos("o cupom não começa por ESC @ (iniciar)");
  }
  if (bytes[2] !== ESC || bytes[3] !== 0x74 || bytes[4] === undefined) {
    throw new ErroDaLeituraEscPos(
      "o cupom não escolhe a tabela de caracteres (ESC t n) antes do texto",
    );
  }
  const tabelaSelecionada = bytes[4];
  const doComando = tabelaDoNumero(tabelaSelecionada);
  if (doComando === undefined) {
    throw new ErroDaLeituraEscPos(
      `ESC t ${String(tabelaSelecionada)} escolhe uma tabela que o cupom não usa`,
    );
  }
  if (tabela !== undefined && doComando !== tabela) {
    throw new ErroDaLeituraEscPos(
      `o cupom escolheu a tabela ${doComando}, e a esperada era ${tabela}`,
    );
  }

  const linhas: LinhaDoCupom[] = [];
  let negrito = false;
  let tamanho: "normal" | "duplo" = "normal";
  let atual = "";
  let i = 5;
  while (i < bytes.length) {
    const byte = bytes[i] ?? 0;
    const comando = bytes[i + 1];
    const argumento = bytes[i + 2];
    if (byte === ESC && comando === 0x45 && argumento !== undefined) {
      if (argumento !== 0 && argumento !== 1) {
        throw new ErroDaLeituraEscPos(
          `ESC E com argumento ${String(argumento)} na posição ${String(i)}`,
        );
      }
      negrito = argumento === 1;
      i += 3;
    } else if (byte === GS && comando === 0x21 && argumento !== undefined) {
      if (argumento !== 0x00 && argumento !== 0x11) {
        throw new ErroDaLeituraEscPos(
          `GS ! com tamanho 0x${argumento.toString(16)} na posição ${String(i)}`,
        );
      }
      tamanho = argumento === 0x11 ? "duplo" : "normal";
      i += 3;
    } else if (byte === GS && comando === 0x56 && argumento !== undefined) {
      if (atual !== "") {
        throw new ErroDaLeituraEscPos(
          `corte no meio de uma linha na posição ${String(i)}`,
        );
      }
      linhas.push({ tipo: "corte" });
      i += 3;
    } else if (byte === LF) {
      linhas.push({ tipo: "texto", texto: atual, negrito, tamanho });
      atual = "";
      i += 1;
    } else {
      const caractere = caractereDoByte(byte, doComando);
      if (caractere === undefined) {
        throw new ErroDaLeituraEscPos(
          `byte 0x${byte.toString(16)} inesperado na posição ${String(i)}`,
        );
      }
      atual += caractere;
      i += 1;
    }
  }
  if (atual !== "") {
    throw new ErroDaLeituraEscPos("o cupom termina no meio de uma linha");
  }
  return { tabela: doComando, tabelaSelecionada, linhas };
}

/**
 * O papel em texto corrido, para ler com os olhos: o emulador mostra isto no
 * terminal. Linha em tamanho duplo ganha `[2x]`, negrito ganha `*`, e o corte
 * vira uma linha de tesoura.
 */
export function previaDoPapel(linhas: readonly LinhaDoCupom[]): string {
  return linhas
    .map((linha) => {
      if (linha.tipo === "corte") return "-- corte --";
      const marcas =
        (linha.negrito ? "*" : " ") + (linha.tamanho === "duplo" ? "2x" : "  ");
      return `${marcas}|${linha.texto}`;
    })
    .join("\n");
}

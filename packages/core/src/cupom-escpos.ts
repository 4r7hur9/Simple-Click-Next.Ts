/**
 * Saída da impressora: as linhas do cupom em bytes ESC/POS (T-605 — AC-620).
 *
 * É a segunda saída do mesmo cupom — a primeira é o HTML da impressão pelo
 * navegador (T-606). As duas recebem as MESMAS linhas de `diagramarCupom`, e
 * nenhuma decide conteúdo: aqui só se traduz cada linha para os comandos da
 * impressora e cada caractere para o byte da tabela dela.
 *
 * O acento correto (AC-620) mora em dois lugares, e os dois são necessários:
 *
 * - `ESC t n` no começo diz à impressora QUAL tabela usar. Sem ele, ela usa a
 *   de fábrica — que em muita impressora é a 437 (inglês), onde o byte do "ã"
 *   da tabela portuguesa desenha outra letra.
 * - cada caractere sai como o byte daquela tabela, e nunca como UTF-8. "í" em
 *   UTF-8 são dois bytes, e a impressora desenharia dois símbolos estranhos.
 *
 * É também a implementação de referência do agente de impressão (T-609): o
 * agente em outra linguagem gera exatamente estes bytes para as mesmas linhas.
 */

import type { LinhaDoCupom, TamanhoDoTexto } from "./cupom-blocos.ts";
import { byteNaTabela, type TabelaDeCaracteres } from "./cupom-largura.ts";

/** Como a impressora corta o papel no fim do cupom. */
export type CorteDoPapel = "parcial" | "total" | "nenhum";

/** O que a saída precisa saber da impressora da loja. */
export interface PerfilDaImpressora {
  /** Tabela em que o cupom foi diagramado — tem de ser a mesma. */
  readonly tabela: TabelaDeCaracteres;
  /** Padrão: parcial, que é o que as guilhotinas térmicas fazem melhor. */
  readonly corte?: CorteDoPapel;
}

/**
 * Número de cada tabela no comando `ESC t n` do padrão ESC/POS: 2 é a 850
 * (multilíngue), 3 é a 860 (português).
 */
export const NUMERO_DA_TABELA_NO_ESCPOS: Readonly<
  Record<TabelaDeCaracteres, number>
> = {
  cp850: 2,
  cp860: 3,
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Os comandos que esta saída emite — e nenhum outro. */
export const COMANDOS_ESCPOS = {
  iniciar: [ESC, 0x40],
  tabela: (numero: number) => [ESC, 0x74, numero],
  negrito: (ligado: boolean) => [ESC, 0x45, ligado ? 1 : 0],
  tamanho: (tamanho: TamanhoDoTexto) => [
    GS,
    0x21,
    tamanho === "duplo" ? 0x11 : 0x00,
  ],
  cortar: (corte: Exclude<CorteDoPapel, "nenhum">) => [
    GS,
    0x56,
    corte === "total" ? 0x00 : 0x01,
  ],
  novaLinha: [LF],
} as const;

/** Erro de uso: a linha não pode ser escrita na tabela da impressora. */
export class ErroDaSaidaEscPos extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDaSaidaEscPos";
  }
}

/**
 * Um caractere, como o byte da tabela.
 *
 * Caractere fora da tabela aqui é erro de USO, e não de dado: a diagramação
 * já trocou ou tirou tudo que a tabela não tem. Chegar aqui com um deles
 * significa que as linhas foram diagramadas para OUTRA tabela — e imprimir
 * assim era justamente o acento corrompido que o AC-620 proíbe. Por isso a
 * recusa, e não um "?" silencioso.
 */
function byteDe(caractere: string, tabela: TabelaDeCaracteres): number {
  const byte = byteNaTabela(caractere, tabela);
  if (byte === undefined) {
    throw new ErroDaSaidaEscPos(
      `"${caractere}" não existe na tabela ${tabela}; diagrame o cupom com a mesma tabela da impressora`,
    );
  }
  return byte;
}

/**
 * Compila as linhas do cupom para os bytes da impressora térmica.
 *
 * Negrito e tamanho são declarados EM TODA linha, e não só quando mudam: se a
 * impressora perder um byte no meio (cabo, papel acabando), o estado errado
 * dura uma linha, e não o resto do cupom.
 */
export function compilarEscPos(
  linhas: readonly LinhaDoCupom[],
  perfil: PerfilDaImpressora,
): Uint8Array {
  const bytes: number[] = [
    ...COMANDOS_ESCPOS.iniciar,
    ...COMANDOS_ESCPOS.tabela(NUMERO_DA_TABELA_NO_ESCPOS[perfil.tabela]),
  ];
  const corte = perfil.corte ?? "parcial";

  for (const linha of linhas) {
    if (linha.tipo === "corte") {
      if (corte !== "nenhum") bytes.push(...COMANDOS_ESCPOS.cortar(corte));
      continue;
    }
    bytes.push(
      ...COMANDOS_ESCPOS.negrito(linha.negrito),
      ...COMANDOS_ESCPOS.tamanho(linha.tamanho),
    );
    for (const caractere of linha.texto) {
      bytes.push(byteDe(caractere, perfil.tabela));
    }
    bytes.push(...COMANDOS_ESCPOS.novaLinha);
  }
  return Uint8Array.from(bytes);
}

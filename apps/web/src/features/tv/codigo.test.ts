/**
 * Prova do código de leitura (AC-931).
 *
 * A PROVA É LER O CÓDIGO DE VOLTA. Um gerador que produz um quadrado bonito e
 * ilegível passaria em qualquer teste de forma; o que interessa é se uma
 * câmera decodifica. Não há câmera aqui, então este arquivo faz o que o
 * leitor de uma câmera faz — e faz do zero, sem reaproveitar o gerador:
 * acha a máscara pela informação de formato, desmascara, percorre os módulos
 * na ordem do documento, separa os blocos, confere a correção de erro com uma
 * aritmética própria (tabelas de logaritmo, e não a multiplicação bit a bit
 * do gerador) e lê o texto. Se qualquer passo do gerador estiver errado, o
 * texto lido não é o texto escrito.
 */
import { describe, expect, it } from "vitest";

import {
  caminhoDosModulos,
  capacidadeEmBytes,
  enderecoCurto,
  enderecoParaOCelular,
  gerarCodigo,
  MARGEM_SILENCIOSA,
  ORIGEM_DA_TV,
  type CodigoDeLeitura,
} from "./codigo.ts";

// ---------------------------------------------------------------------------
// O leitor: tabelas do documento, escritas à mão para não depender do gerador
// ---------------------------------------------------------------------------

/** Posições dos padrões de alinhamento, versões 1 a 10 (tabela E.1). */
const ALINHAMENTOS: Record<number, readonly number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Nível M: [bytes de correção por bloco, quantidade de blocos] (tabela 9). */
const BLOCOS_M: Record<number, readonly [number, number]> = {
  1: [10, 1],
  2: [16, 1],
  3: [26, 1],
  4: [18, 2],
  5: [24, 2],
  6: [16, 4],
  7: [18, 4],
  8: [22, 4],
  9: [22, 5],
  10: [26, 5],
};

/** Total de bytes (dado + correção) por versão (tabela 9). */
const TOTAL_DE_BYTES: Record<number, number> = {
  1: 26,
  2: 44,
  3: 70,
  4: 100,
  5: 134,
  6: 172,
  7: 196,
  8: 242,
  9: 292,
  10: 346,
};

type Matriz = ReadonlyArray<ReadonlyArray<boolean>>;

/** Quais módulos são de padrão fixo (e não de dado), pela geometria. */
function mapaDeFixos(versao: number, tamanho: number): boolean[][] {
  const fixo = Array.from({ length: tamanho }, () =>
    new Array<boolean>(tamanho).fill(false),
  );
  const marcar = (x: number, y: number): void => {
    const linha = fixo[y];
    if (linha !== undefined && x >= 0 && x < tamanho) linha[x] = true;
  };

  // Localizadores com separador e área de formato: três cantos de 9×9.
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      marcar(i, j);
      if (i < 8) marcar(tamanho - 1 - i, j);
      if (j < 8) marcar(i, tamanho - 1 - j);
    }
  }
  // Padrões de tempo.
  for (let i = 0; i < tamanho; i++) {
    marcar(6, i);
    marcar(i, 6);
  }
  // Alinhamentos, fora dos três cantos.
  const posicoes = ALINHAMENTOS[versao] ?? [];
  const ultimo = posicoes[posicoes.length - 1];
  const marcarAlinhamento = (cx: number, cy: number): void => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) marcar(cx + dx, cy + dy);
  };
  for (const cx of posicoes) {
    for (const cy of posicoes) {
      const noCanto =
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === ultimo) ||
        (cx === ultimo && cy === 6);
      if (!noCanto) marcarAlinhamento(cx, cy);
    }
  }
  // Informação de versão.
  if (versao >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        marcar(tamanho - 11 + j, i);
        marcar(i, tamanho - 11 + j);
      }
    }
  }
  return fixo;
}

/** Os 15 bits de formato para nível M e a máscara dada (anexo C). */
function formatoEsperado(mascara: number): number {
  const dado = mascara; // nível M é 00, então os cinco bits são só a máscara
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}

/** As oito máscaras (tabela 10). */
function mascaraInverte(mascara: number, x: number, y: number): boolean {
  const formulas = [
    (x + y) % 2 === 0,
    y % 2 === 0,
    x % 3 === 0,
    (x + y) % 3 === 0,
    (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    ((x * y) % 2) + ((x * y) % 3) === 0,
    (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  return formulas[mascara] ?? false;
}

/** Lê os 15 bits de formato das duas cópias e devolve a máscara. */
function lerMascara(modulos: Matriz, tamanho: number): number {
  const bit = (x: number, y: number): number => (modulos[y]?.[x] ? 1 : 0);
  let primeira = 0;
  for (let i = 0; i <= 5; i++) primeira |= bit(8, i) << i;
  primeira |= bit(8, 7) << 6;
  primeira |= bit(8, 8) << 7;
  primeira |= bit(7, 8) << 8;
  for (let i = 9; i < 15; i++) primeira |= bit(14 - i, 8) << i;

  let segunda = 0;
  for (let i = 0; i < 8; i++) segunda |= bit(tamanho - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) segunda |= bit(8, tamanho - 15 + i) << i;

  expect(segunda, "as duas cópias do formato precisam ser iguais").toBe(
    primeira,
  );
  const mascara = [0, 1, 2, 3, 4, 5, 6, 7].find(
    (candidata) => formatoEsperado(candidata) === primeira,
  );
  if (mascara === undefined) throw new Error("informação de formato ilegível");
  return mascara;
}

/** Percorre os módulos de dado na ordem de leitura e devolve os bytes. */
function lerBytes(
  modulos: Matriz,
  fixos: boolean[][],
  tamanho: number,
): number[] {
  const bits: number[] = [];
  const lerLivres = (direita: number, y: number): void => {
    for (const x of [direita, direita - 1]) {
      if (!fixos[y]?.[x]) bits.push(modulos[y]?.[x] ? 1 : 0);
    }
  };
  for (let direita = tamanho - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    const sobe = ((direita + 1) & 2) === 0;
    for (let passo = 0; passo < tamanho; passo++) {
      lerLivres(direita, sobe ? tamanho - 1 - passo : passo);
    }
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    bytes.push(byte);
  }
  return bytes;
}

// Aritmética de GF(256) por tabelas de logaritmo — outro caminho que o do
// gerador, para os dois não errarem juntos.
const EXP: number[] = new Array<number>(512).fill(0);
const LOG: number[] = new Array<number>(256).fill(0);
{
  let valor = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = valor;
    LOG[valor] = i;
    valor <<= 1;
    if (valor & 0x100) valor ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] ?? 0;
}
const multiplicar = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : (EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0);

/** Os bytes de correção de um bloco, por divisão polinomial longa. */
function correcaoDe(dados: readonly number[], quantos: number): number[] {
  let gerador = [1];
  for (let i = 0; i < quantos; i++) {
    const fator = [1, EXP[i] ?? 0];
    const produto = new Array<number>(gerador.length + 1).fill(0);
    gerador.forEach((g, a) => {
      fator.forEach((f, b) => {
        produto[a + b] = (produto[a + b] ?? 0) ^ multiplicar(g, f);
      });
    });
    gerador = produto;
  }
  const saida = [...dados, ...new Array<number>(quantos).fill(0)];
  for (let i = 0; i < dados.length; i++) {
    const coeficiente = saida[i] ?? 0;
    if (coeficiente === 0) continue;
    for (let j = 1; j < gerador.length; j++) {
      saida[i + j] =
        (saida[i + j] ?? 0) ^ multiplicar(gerador[j] ?? 0, coeficiente);
    }
  }
  return saida.slice(dados.length);
}

/** Separa os blocos intercalados, confere a correção e devolve só o dado. */
function desintercalarEConferir(
  bytes: readonly number[],
  versao: number,
): number[] {
  const [correcaoPorBloco, quantosBlocos] = BLOCOS_M[versao] ?? [0, 1];
  const total = TOTAL_DE_BYTES[versao] ?? 0;
  expect(bytes.length).toBe(total);

  const curtos = quantosBlocos - (total % quantosBlocos);
  const tamanhoCurto = Math.floor(total / quantosBlocos);
  const tamanhosDeDado = Array.from(
    { length: quantosBlocos },
    (_, i) => tamanhoCurto - correcaoPorBloco + (i < curtos ? 0 : 1),
  );

  const dados: number[][] = tamanhosDeDado.map(() => []);
  const correcoes: number[][] = tamanhosDeDado.map(() => []);
  let posicao = 0;
  const maior = Math.max(...tamanhosDeDado);
  for (let i = 0; i < maior; i++) {
    tamanhosDeDado.forEach((tamanho, bloco) => {
      if (i < tamanho) dados[bloco]?.push(bytes[posicao++] ?? 0);
    });
  }
  for (let i = 0; i < correcaoPorBloco; i++) {
    for (let bloco = 0; bloco < quantosBlocos; bloco++) {
      correcoes[bloco]?.push(bytes[posicao++] ?? 0);
    }
  }

  dados.forEach((dado, bloco) => {
    expect(
      correcoes[bloco],
      `correção do bloco ${String(bloco)} não confere`,
    ).toEqual(correcaoDe(dado, correcaoPorBloco));
  });

  return dados.flat();
}

/** Lê o texto do fluxo de dados: modo de bytes, tamanho e conteúdo. */
function lerTexto(dados: readonly number[], versao: number): string {
  let posicao = 0;
  const lerBits = (quantos: number): number => {
    let valor = 0;
    for (let i = 0; i < quantos; i++) {
      const byte = dados[posicao >>> 3] ?? 0;
      valor = (valor << 1) | ((byte >>> (7 - (posicao & 7))) & 1);
      posicao++;
    }
    return valor;
  };
  const modo = lerBits(4);
  expect(modo, "o modo precisa ser o de bytes").toBe(0b0100);
  const tamanho = lerBits(versao >= 10 ? 16 : 8);
  const conteudo = new Uint8Array(tamanho);
  for (let i = 0; i < tamanho; i++) conteudo[i] = lerBits(8);
  return new TextDecoder().decode(conteudo);
}

/** O leitor inteiro: da matriz ao texto. */
function ler(codigo: CodigoDeLeitura): string {
  const { versao, tamanho, modulos } = codigo;
  const fixos = mapaDeFixos(versao, tamanho);
  const mascara = lerMascara(modulos, tamanho);
  const desmascarado = modulos.map((linha, y) =>
    linha.map((escuro, x) =>
      !fixos[y]?.[x] && mascaraInverte(mascara, x, y) ? !escuro : escuro,
    ),
  );
  const bytes = lerBytes(desmascarado, fixos, tamanho);
  return lerTexto(desintercalarEConferir(bytes, versao), versao);
}

// ---------------------------------------------------------------------------
// As provas
// ---------------------------------------------------------------------------

const VITRINE = "https://simpleclick.app/l/sabor-e-cia/catalogo";

describe("o código leva ao endereço da vitrine (AC-931)", () => {
  it("@spec:AC-931 um leitor independente decodifica o endereço da vitrine", () => {
    const endereco = enderecoParaOCelular(VITRINE);
    const codigo = gerarCodigo(endereco);

    expect(ler(codigo)).toBe(endereco);
  });

  it("@spec:AC-931 a decodificação vale para textos de todos os tamanhos até a versão 10", () => {
    // Cada versão troca a geometria (alinhamentos, blocos, bits de tamanho);
    // um erro em qualquer tabela apareceria aqui.
    for (let versao = 1; versao <= 10; versao++) {
      const texto = "x".repeat(capacidadeEmBytes(versao));
      const codigo = gerarCodigo(texto);
      expect(codigo.versao, `capacidade da versão ${String(versao)}`).toBe(
        versao,
      );
      expect(ler(codigo)).toBe(texto);
    }
  });

  it("@spec:AC-931 acentos sobrevivem: o texto vai em UTF-8", () => {
    const texto = "https://simpleclick.app/l/pão-de-açúcar?origem=tv";
    expect(ler(gerarCodigo(texto))).toBe(texto);
  });

  it("@spec:AC-931 o endereço da vitrine cabe num código pequeno, que a câmera lê de longe", () => {
    // Quanto menor a versão, maior cada módulo na tela — e é o módulo que a
    // câmera precisa distinguir a três metros.
    const codigo = gerarCodigo(enderecoParaOCelular(VITRINE));

    expect(codigo.versao).toBeLessThanOrEqual(5);
  });

  it("@spec:AC-931 os três localizadores estão nos cantos, com o separador claro", () => {
    const { modulos, tamanho } = gerarCodigo(enderecoParaOCelular(VITRINE));
    const linhaDoLocalizador = [true, true, true, true, true, true, true];

    expect(modulos[0]?.slice(0, 7)).toEqual(linhaDoLocalizador);
    expect(modulos[0]?.slice(tamanho - 7)).toEqual(linhaDoLocalizador);
    expect(modulos[tamanho - 1]?.slice(0, 7)).toEqual(linhaDoLocalizador);
    // O separador: a oitava linha e coluna de cada canto são claras.
    expect(modulos[7]?.slice(0, 8).some(Boolean)).toBe(false);
    expect(modulos[7]?.slice(tamanho - 8).some(Boolean)).toBe(false);
    expect(modulos[tamanho - 8]?.slice(0, 8).some(Boolean)).toBe(false);
  });

  it("@spec:AC-931 texto que não cabe é recusado, em vez de virar um código ilegível", () => {
    expect(() => gerarCodigo("x".repeat(capacidadeEmBytes(10) + 1))).toThrow(
      /não cabe/,
    );
  });

  it("@spec:AC-931 o desenho deixa a margem silenciosa que a câmera exige", () => {
    const codigo = gerarCodigo(enderecoParaOCelular(VITRINE));
    const caminho = caminhoDosModulos(codigo);

    // O primeiro módulo escuro é o canto do localizador: (0,0) deslocado
    // pela margem.
    expect(
      caminho.startsWith(
        `M${String(MARGEM_SILENCIOSA)} ${String(MARGEM_SILENCIOSA)}h1v1h-1z`,
      ),
    ).toBe(true);
    // Um caminho só, e não um retângulo por módulo.
    expect(caminho).not.toContain("<");
  });
});

describe("o endereço que o código carrega", () => {
  it("@spec:AC-931 leva à vitrine da loja e diz que veio da televisão", () => {
    const endereco = new URL(enderecoParaOCelular(VITRINE));

    expect(endereco.origin + endereco.pathname).toBe(VITRINE);
    expect(endereco.searchParams.get("origem")).toBe(ORIGEM_DA_TV);
  });

  it("@spec:AC-931 o endereço curto é o que se digita: sem esquema, sem www, sem marca de origem", () => {
    expect(
      enderecoCurto("https://www.simpleclick.app/l/sabor-e-cia/catalogo/"),
    ).toBe("simpleclick.app/l/sabor-e-cia/catalogo");
  });
});

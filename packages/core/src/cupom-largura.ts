/**
 * Largura do cupom: papel, colunas, tabela de caracteres e texto que cabe
 * (T-605 — AC-618, AC-620).
 *
 * O cupom térmico é uma grade de colunas, e não uma página. A impressora não
 * mede texto em milímetro: ela imprime UM caractere por coluna, com a letra que
 * a TABELA DE CARACTERES dela tem naquela posição. Dois erros clássicos nascem
 * de esquecer isso, e este arquivo existe para impedir os dois:
 *
 * 1. **Acento corrompido (AC-620).** "Açaí" enviado como UTF-8 vira "AÃ§aÃ­" no
 *    papel, porque a impressora lê cada byte como uma letra da tabela dela. O
 *    texto precisa sair na tabela que a impressora usa — aqui, a 860
 *    (português) por padrão, ou a 850 (multilíngue).
 * 2. **Coluna desalinhada (AC-618).** Contar `texto.length` numa string que
 *    chegou do navegador engana: "ç" pode vir como "c" mais a cedilha solta
 *    (dois pontos de código, UMA coluna), e emoji ocupa dois. Por isso o texto
 *    é NORMALIZADO antes de ser medido — e, depois de normalizado, cada ponto
 *    de código é exatamente uma coluna, na tela e no papel.
 *
 * Função pura, sem dependência nenhuma: é a mesma régua para a impressão pelo
 * navegador e para a do agente de impressão.
 */

/** Largura do papel que a configuração da loja aceita (T-906, AC-919). */
export type LarguraDoPapel = 58 | 80;

/** Tabelas de caracteres que o cupom sabe usar. */
export type TabelaDeCaracteres = "cp860" | "cp850";

/**
 * A tabela padrão. A 860 é a tabela portuguesa da família PC: tem todas as
 * vogais acentuadas do português, maiúsculas e minúsculas, e o "ç". É a que as
 * impressoras térmicas vendidas no Brasil trazem de fábrica.
 */
export const TABELA_PADRAO: TabelaDeCaracteres = "cp860";

/**
 * Colunas da fonte padrão (12 × 24 pontos) em cada papel.
 *
 * O papel de 80 mm tem 72 mm de área impressa (576 pontos a 203 dpi) e o de
 * 58 mm tem 48 mm (384 pontos). Divididos por 12 pontos por caractere, dão 48 e
 * 32 colunas — os números que toda impressora térmica ESC/POS usa.
 */
export const COLUNAS_DO_PAPEL: Readonly<Record<LarguraDoPapel, number>> = {
  58: 32,
  80: 48,
};

/** Área que a cabeça de impressão alcança, em milímetros, em cada papel. */
export const AREA_IMPRESSA_EM_MM: Readonly<Record<LarguraDoPapel, number>> = {
  58: 48,
  80: 72,
};

/** Número de colunas do papel configurado. */
export function colunasDoPapel(larguraMm: LarguraDoPapel): number {
  return COLUNAS_DO_PAPEL[larguraMm];
}

/** Verdadeiro para as duas larguras que o cupom conhece. */
export function ehLarguraDoPapel(valor: unknown): valor is LarguraDoPapel {
  return valor === 58 || valor === 80;
}

/** Verdadeiro para as tabelas que o cupom sabe codificar. */
export function ehTabelaDeCaracteres(
  valor: unknown,
): valor is TabelaDeCaracteres {
  return valor === "cp860" || valor === "cp850";
}

/**
 * Metade superior (bytes 0x80 a 0xFF) de cada tabela, como pontos de código.
 *
 * A metade de baixo (0x20 a 0x7E) é ASCII nas duas. Os valores são os da
 * definição das tabelas IBM 860 e 850, conferidos contra o decodificador da
 * biblioteca padrão do Python — e o teste deste arquivo repete, byte a byte,
 * as posições que o português usa.
 */
const METADE_SUPERIOR: Readonly<Record<TabelaDeCaracteres, readonly number[]>> =
  {
    cp860: [
      0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e3, 0x00e0, 0x00c1, 0x00e7, 0x00ea,
      0x00ca, 0x00e8, 0x00cd, 0x00d4, 0x00ec, 0x00c3, 0x00c2, 0x00c9, 0x00c0,
      0x00c8, 0x00f4, 0x00f5, 0x00f2, 0x00da, 0x00f9, 0x00cc, 0x00d5, 0x00dc,
      0x00a2, 0x00a3, 0x00d9, 0x20a7, 0x00d3, 0x00e1, 0x00ed, 0x00f3, 0x00fa,
      0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x00d2, 0x00ac, 0x00bd, 0x00bc,
      0x00a1, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561,
      0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b,
      0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
      0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567, 0x2568,
      0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518,
      0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, 0x03b1, 0x00df, 0x0393,
      0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, 0x03a6, 0x0398, 0x03a9, 0x03b4,
      0x221e, 0x03c6, 0x03b5, 0x2229, 0x2261, 0x00b1, 0x2265, 0x2264, 0x2320,
      0x2321, 0x00f7, 0x2248, 0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2,
      0x25a0, 0x00a0,
    ],
    cp850: [
      0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, 0x00ea,
      0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5, 0x00c9, 0x00e6,
      0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, 0x00ff, 0x00d6, 0x00dc,
      0x00f8, 0x00a3, 0x00d8, 0x00d7, 0x0192, 0x00e1, 0x00ed, 0x00f3, 0x00fa,
      0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x00ae, 0x00ac, 0x00bd, 0x00bc,
      0x00a1, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00c1,
      0x00c2, 0x00c0, 0x00a9, 0x2563, 0x2551, 0x2557, 0x255d, 0x00a2, 0x00a5,
      0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x00e3, 0x00c3,
      0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x00a4, 0x00f0,
      0x00d0, 0x00ca, 0x00cb, 0x00c8, 0x0131, 0x00cd, 0x00ce, 0x00cf, 0x2518,
      0x250c, 0x2588, 0x2584, 0x00a6, 0x00cc, 0x2580, 0x00d3, 0x00df, 0x00d4,
      0x00d2, 0x00f5, 0x00d5, 0x00b5, 0x00fe, 0x00de, 0x00da, 0x00db, 0x00d9,
      0x00fd, 0x00dd, 0x00af, 0x00b4, 0x00ad, 0x00b1, 0x2017, 0x00be, 0x00b6,
      0x00a7, 0x00f7, 0x00b8, 0x00b0, 0x00a8, 0x00b7, 0x00b9, 0x00b3, 0x00b2,
      0x25a0, 0x00a0,
    ],
  };

/** Ponto de código → byte, uma vez por tabela. */
const BYTE_DO_PONTO: Readonly<
  Record<TabelaDeCaracteres, ReadonlyMap<number, number>>
> = {
  cp860: new Map(METADE_SUPERIOR.cp860.map((ponto, i) => [ponto, 0x80 + i])),
  cp850: new Map(METADE_SUPERIOR.cp850.map((ponto, i) => [ponto, 0x80 + i])),
};

/** ASCII imprimível: espaço (0x20) até til (0x7E). */
function ehAsciiImprimivel(ponto: number): boolean {
  return ponto >= 0x20 && ponto <= 0x7e;
}

/**
 * O byte que representa este caractere na tabela, ou `undefined` se a tabela
 * não tem a letra. O espaço rígido (0xA0 nas duas tabelas) nunca é usado: a
 * normalização o troca por espaço comum antes.
 */
export function byteNaTabela(
  caractere: string,
  tabela: TabelaDeCaracteres,
): number | undefined {
  const ponto = caractere.codePointAt(0);
  if (ponto === undefined || [...caractere].length !== 1) return undefined;
  if (ehAsciiImprimivel(ponto)) return ponto;
  return BYTE_DO_PONTO[tabela].get(ponto);
}

/**
 * O caractere que a impressora desenha para este byte — a leitura do papel.
 * Serve ao teste de equivalência e ao emulador de impressora (T-610).
 */
export function caractereDoByte(
  byte: number,
  tabela: TabelaDeCaracteres,
): string | undefined {
  if (ehAsciiImprimivel(byte)) return String.fromCodePoint(byte);
  if (byte < 0x80 || byte > 0xff) return undefined;
  const ponto = METADE_SUPERIOR[tabela][byte - 0x80];
  return ponto === undefined ? undefined : String.fromCodePoint(ponto);
}

/**
 * Troca tipográfica para o que não existe em nenhuma das tabelas.
 *
 * O teclado do celular produz aspas curvas, travessão e reticências sozinho, e
 * o cliente não escolheu nenhum deles. Trocar por um equivalente de uma coluna
 * (ou três, nas reticências) preserva o sentido; deixar de fora apagaria
 * pontuação que muda a leitura ("sem cebola - com tomate").
 */
const EQUIVALENTES: ReadonlyMap<number, string> = new Map([
  // aspas duplas curvas e baixas, e o sinal de segundo
  [0x201c, '"'],
  [0x201d, '"'],
  [0x201e, '"'],
  [0x201f, '"'],
  [0x2033, '"'],
  // aspas simples curvas e baixas, e o sinal de minuto
  [0x2018, "'"],
  [0x2019, "'"],
  [0x201a, "'"],
  [0x201b, "'"],
  [0x2032, "'"],
  // hífens, travessões e o sinal de menos
  [0x2010, "-"],
  [0x2011, "-"],
  [0x2012, "-"],
  [0x2013, "-"],
  [0x2014, "-"],
  [0x2015, "-"],
  [0x2212, "-"],
  // reticências, marcadores de lista, sinal de vezes, euro e marca
  [0x2026, "..."],
  [0x2022, "*"],
  [0x25cf, "*"],
  [0x25e6, "*"],
  [0x00d7, "x"],
  [0x20ac, "EUR"],
  [0x2122, "TM"],
]);

/**
 * Espaço de qualquer largura (tabulação, quebra de linha, espaço rígido, os
 * espaços tipográficos): vira espaço comum, de uma coluna. `\s` já cobre todos
 * eles; o 0xFEFF fica de fora porque não é espaço de verdade — é marca de
 * ordem de bytes, e sai junto dos caracteres sem coluna.
 */
function ehEspaco(caractere: string, ponto: number): boolean {
  return ponto !== 0xfeff && /\s/u.test(caractere);
}

/**
 * Caracteres que não ocupam coluna e que não podem chegar à impressora.
 *
 * Os de controle são a razão de segurança desta lista: o byte 0x1B (ESC)
 * começa um comando ESC/POS. Um cliente que escrevesse ESC na observação do
 * pedido conseguiria cortar o papel, trocar a tabela de caracteres ou abrir a
 * gaveta do caixa da loja. Nenhum controle sobrevive à normalização.
 *
 * Comparação por ponto de código, e não por expressão regular: controle
 * escrito dentro de expressão é exatamente o que o ESLint desconfia, com razão.
 */
function naoOcupaColuna(ponto: number): boolean {
  return (
    ponto < 0x20 ||
    (ponto >= 0x7f && ponto <= 0x9f) ||
    ponto === 0xad ||
    (ponto >= 0x200b && ponto <= 0x200f) ||
    (ponto >= 0x2060 && ponto <= 0x2064) ||
    ponto === 0xfeff
  );
}

/** Marcas combinantes (acento solto), que a decomposição separa da letra. */
const MARCA_COMBINANTE = /\p{M}/gu;

/** Um caractere que não está na tabela, trocado pelo que a impressora tem. */
function equivalenteNaTabela(
  caractere: string,
  tabela: TabelaDeCaracteres,
): string {
  const tipografico = EQUIVALENTES.get(caractere.codePointAt(0) ?? 0);
  if (tipografico !== undefined) return tipografico;

  // Letra com acento que a tabela não tem ("ẽ", "ā"): fica a letra sem o
  // acento, que é o que uma pessoa escreveria à mão no papel. Só vale se TODO
  // o resultado couber na tabela; senão o caractere sai inteiro.
  const semAcento = caractere.normalize("NFD").replace(MARCA_COMBINANTE, "");
  if (
    semAcento !== caractere &&
    semAcento.length > 0 &&
    [...semAcento].every((letra) => byteNaTabela(letra, tabela) !== undefined)
  ) {
    return semAcento;
  }

  // Emoji, ideograma, símbolo: nada que a impressora saiba desenhar. Sai do
  // texto em vez de virar "?" — um ponto de interrogação no meio do pedido é o
  // "símbolo estranho no lugar" que o AC-620 proíbe.
  return "";
}

/**
 * Normaliza o texto para o papel: uma letra por coluna, todas na tabela.
 *
 * Nesta ordem, e por motivos diferentes:
 *
 * 1. `NFC` junta letra e acento num ponto de código só — "c" + cedilha solta
 *    vira "ç", que é UMA coluna e UM byte na tabela.
 * 2. Qualquer espaço (tabulação, quebra, espaço rígido) vira espaço comum.
 * 3. Controle e caractere de largura zero saem (ver `naoOcupaColuna`).
 * 4. O que não está na tabela é trocado pelo equivalente ou sai.
 * 5. Espaços repetidos viram um só, e as pontas são aparadas — o que sobrou de
 *    um emoji retirado não deixa buraco duplo no meio da frase.
 *
 * Depois disto, `larguraNoPapel(texto) === [...texto].length`, e cada
 * caractere tem byte na tabela. É esta garantia que alinha a coluna de valores
 * (AC-618) e que impede o acento corrompido (AC-620).
 */
export function normalizarParaImpressao(
  texto: string,
  tabela: TabelaDeCaracteres = TABELA_PADRAO,
): string {
  let resultado = "";
  for (const caractere of texto.normalize("NFC")) {
    const ponto = caractere.codePointAt(0) ?? 0;
    if (ehEspaco(caractere, ponto)) {
      resultado += " ";
    } else if (naoOcupaColuna(ponto)) {
      continue;
    } else if (byteNaTabela(caractere, tabela) !== undefined) {
      resultado += caractere;
    } else {
      resultado += equivalenteNaTabela(caractere, tabela);
    }
  }
  return resultado.replace(/ {2,}/g, " ").trim();
}

/**
 * Quantas colunas o texto ocupa no papel.
 *
 * Só é confiável para texto já normalizado — e é por isso que a diagramação
 * normaliza antes de medir, nunca depois.
 */
export function larguraNoPapel(texto: string): number {
  return [...texto].length;
}

/** Corta uma palavra maior que a linha em pedaços do tamanho da linha. */
function partirPalavra(palavra: string, largura: number): string[] {
  const letras = [...palavra];
  const pedacos: string[] = [];
  for (let i = 0; i < letras.length; i += largura) {
    pedacos.push(letras.slice(i, i + largura).join(""));
  }
  return pedacos;
}

/**
 * As palavras do texto, com o símbolo da moeda colado ao valor.
 *
 * "R$" e o número são uma coisa só para quem lê: "(+R$" numa linha e "4,00)"
 * na outra parece dois valores. Por isso a palavra que termina em "R$" leva a
 * seguinte junto, e a quebra de linha nunca passa entre as duas.
 */
function palavrasDoTexto(texto: string): string[] {
  const palavras: string[] = [];
  for (const palavra of texto.split(" ").filter((p) => p !== "")) {
    const anterior = palavras.at(-1);
    if (anterior?.endsWith("R$")) {
      palavras[palavras.length - 1] = `${anterior} ${palavra}`;
    } else {
      palavras.push(palavra);
    }
  }
  return palavras;
}

/**
 * Quebra o texto em linhas que cabem, sem cortar palavra que caiba inteira.
 *
 * A primeira linha pode ter largura diferente das demais: é o que a linha de
 * item precisa, porque ela reserva espaço para o valor à direita só na
 * primeira linha. Palavra maior que a linha inteira (um código de rastreio, um
 * endereço de e-mail) é partida — perder o fim dela no papel seria pior.
 *
 * Espera texto já normalizado.
 */
export function quebrarEmLinhas(
  texto: string,
  larguraDaPrimeira: number,
  larguraDasDemais: number = larguraDaPrimeira,
): string[] {
  if (larguraDaPrimeira < 1 || larguraDasDemais < 1) {
    throw new RangeError("a linha do cupom precisa de ao menos uma coluna");
  }
  const linhas: string[] = [];
  let atual = "";
  const larguraDaVez = () =>
    linhas.length === 0 ? larguraDaPrimeira : larguraDasDemais;

  for (const palavra of palavrasDoTexto(texto)) {
    const candidata = atual === "" ? palavra : `${atual} ${palavra}`;
    if (larguraNoPapel(candidata) <= larguraDaVez()) {
      atual = candidata;
      continue;
    }
    if (atual !== "") linhas.push(atual);
    // Palavra maior que a linha sai em pedaços; o último pedaço (ou a palavra
    // inteira, quando ela cabe) fica aberto para receber a próxima palavra,
    // como qualquer linha.
    let resto = palavra;
    while (larguraNoPapel(resto) > larguraDaVez()) {
      const [pedaco] = partirPalavra(resto, larguraDaVez());
      if (pedaco === undefined) break;
      linhas.push(pedaco);
      resto = [...resto].slice(larguraNoPapel(pedaco)).join("");
    }
    atual = resto;
  }
  if (atual !== "") linhas.push(atual);
  return linhas;
}

/** Posição do texto dentro da linha. */
export type Alinhamento = "esquerda" | "centro" | "direita";

/**
 * Posiciona um texto que cabe na largura, completando com espaço à ESQUERDA.
 *
 * Nunca há espaço à direita: a linha termina no último caractere visível. Os
 * dois destinos — o HTML com `white-space: pre` e a impressora — mostram a
 * mesma coisa com ou sem espaço sobrando, e sem ele a comparação entre as duas
 * saídas é exata.
 */
export function alinharNaLinha(
  texto: string,
  largura: number,
  alinhamento: Alinhamento,
): string {
  const sobra = Math.max(0, largura - larguraNoPapel(texto));
  if (alinhamento === "direita") return " ".repeat(sobra) + texto;
  if (alinhamento === "centro") {
    return " ".repeat(Math.floor(sobra / 2)) + texto;
  }
  return texto;
}

/**
 * Rótulo à esquerda e valor encostado na margem direita, numa linha só.
 *
 * O valor termina SEMPRE na última coluna. É o que faz os valores formarem uma
 * coluna alinhada à direita (AC-618) em qualquer largura de papel.
 */
export function juntarNaLinha(
  esquerda: string,
  direita: string,
  largura: number,
): string {
  const vazio = largura - larguraNoPapel(esquerda) - larguraNoPapel(direita);
  if (vazio < 0) {
    throw new RangeError(
      `"${esquerda}" e "${direita}" não cabem juntos em ${String(largura)} colunas`,
    );
  }
  return esquerda + " ".repeat(vazio) + direita;
}

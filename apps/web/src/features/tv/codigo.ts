/**
 * O código que a câmera do celular lê na parede (AC-931).
 *
 * É UM GERADOR DE QR CODE ESCRITO AQUI, e não uma biblioteca — decisão tomada
 * com o P-014 na mão. As bibliotecas disponíveis trazem, junto do gerador,
 * escrita de PNG, linha de comando e dependências para tudo isso; o que a
 * televisão precisa é uma matriz de quadrados para desenhar em SVG, e isso é
 * o que está abaixo, com a prova de que a matriz é decodificável ao lado
 * (`codigo.test.ts` lê o código de volta com um leitor independente).
 *
 * O QUE ELE GERA: código no modo de bytes, nível de correção M (recupera até
 * 15% de dano — o padrão para endereço em tela), versões 1 a 10. Um endereço
 * de vitrine tem cerca de sessenta caracteres e cabe na versão 4; a versão 10
 * aguenta 213 bytes, que é mais do que qualquer endereço razoável. Acima disso
 * o gerador recusa, em vez de produzir um código que a câmera não lê a três
 * metros.
 *
 * A REFERÊNCIA é a ISO/IEC 18004. Os nomes aqui são os do documento, em
 * português: padrão localizador, padrão de alinhamento, padrão de tempo,
 * informação de formato, máscara.
 */

/** O código pronto para desenhar: `modulos[linha][coluna]`, escuro = `true`. */
export interface CodigoDeLeitura {
  readonly versao: number;
  /** Quantos módulos de lado. Versão 1 tem 21, e cada versão soma 4. */
  readonly tamanho: number;
  readonly modulos: ReadonlyArray<ReadonlyArray<boolean>>;
  /** A máscara escolhida, de 0 a 7. Sai para a prova conferir o formato. */
  readonly mascara: number;
}

/**
 * A margem silenciosa: quatro módulos claros em volta do código.
 *
 * A câmera precisa dela para achar onde o código começa. Sem margem, o código
 * encostado numa borda escura da tela simplesmente não é reconhecido.
 */
export const MARGEM_SILENCIOSA = 4;

/** A maior versão que este gerador produz. */
export const VERSAO_MAXIMA = 10;

/**
 * Nível de correção M nas tabelas do documento.
 *
 * Índice = versão. Primeiro: quantos bytes de correção por bloco. Segundo:
 * quantos blocos. A quantidade total de bytes vem da geometria (função
 * `bytesBrutos`), e o que sobra é dado.
 */
const CORRECAO_POR_BLOCO_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCOS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/** Bits de formato do nível M. */
const BITS_DO_NIVEL_M = 0b00;

/** Modo de bytes, na cabeça do fluxo de bits. */
const MODO_DE_BYTES = 0b0100;

/** Bytes de enchimento, alternados até completar a capacidade. */
const ENCHIMENTO = [0xec, 0x11] as const;

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

function tamanhoDaVersao(versao: number): number {
  return versao * 4 + 17;
}

/**
 * Quantos módulos de dado a versão tem, descontados os padrões fixos.
 *
 * Vem da geometria: o quadrado inteiro menos localizadores, separadores,
 * tempo, alinhamentos, formato e (a partir da 7) a informação de versão.
 */
function bytesBrutos(versao: number): number {
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
function posicoesDeAlinhamento(versao: number): number[] {
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

// ---------------------------------------------------------------------------
// Correção de erro (Reed-Solomon sobre GF(256), polinômio 0x11D)
// ---------------------------------------------------------------------------

function multiplicar(a: number, b: number): number {
  let resultado = 0;
  for (let i = 7; i >= 0; i--) {
    resultado = (resultado << 1) ^ ((resultado >>> 7) * 0x11d);
    resultado ^= ((b >>> i) & 1) * a;
  }
  return resultado;
}

/** O polinômio gerador do grau pedido, sem o coeficiente líder. */
function polinomioGerador(grau: number): number[] {
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
function bytesDeCorrecao(
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

// ---------------------------------------------------------------------------
// Fluxo de bits
// ---------------------------------------------------------------------------

/** Escolhe a menor versão em que os bytes cabem. */
function versaoPara(quantosBytes: number): number {
  for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
    if (capacidadeEmBytes(versao) >= quantosBytes) return versao;
  }
  throw new Error(
    `o texto tem ${String(quantosBytes)} bytes e não cabe num código de leitura até a versão ${String(VERSAO_MAXIMA)}`,
  );
}

/** Monta os bytes de dado: cabeçalho, conteúdo, terminador e enchimento. */
function bytesDeDado(conteudo: Uint8Array, versao: number): number[] {
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
function intercalarComCorrecao(
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

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

class Quadro {
  readonly tamanho: number;
  readonly modulos: boolean[][];
  readonly fixos: boolean[][];

  constructor(readonly versao: number) {
    this.tamanho = tamanhoDaVersao(versao);
    this.modulos = Array.from({ length: this.tamanho }, () =>
      new Array<boolean>(this.tamanho).fill(false),
    );
    this.fixos = Array.from({ length: this.tamanho }, () =>
      new Array<boolean>(this.tamanho).fill(false),
    );
  }

  fixar(x: number, y: number, escuro: boolean): void {
    const linha = this.modulos[y];
    const fixa = this.fixos[y];
    if (linha === undefined || fixa === undefined) return;
    linha[x] = escuro;
    fixa[x] = true;
  }

  ler(x: number, y: number): boolean {
    return this.modulos[y]?.[x] ?? false;
  }

  ehFixo(x: number, y: number): boolean {
    return this.fixos[y]?.[x] ?? false;
  }

  desenharPadroesFixos(): void {
    // Padrões de tempo: a linha e a coluna 6, alternadas.
    for (let i = 0; i < this.tamanho; i++) {
      this.fixar(6, i, i % 2 === 0);
      this.fixar(i, 6, i % 2 === 0);
    }
    // Os três localizadores, com o separador claro em volta.
    this.desenharLocalizador(3, 3);
    this.desenharLocalizador(this.tamanho - 4, 3);
    this.desenharLocalizador(3, this.tamanho - 4);

    const posicoes = posicoesDeAlinhamento(this.versao);
    const ultimo = posicoes.length - 1;
    posicoes.forEach((x, i) => {
      posicoes.forEach((y, j) => {
        // Os três cantos já têm localizador.
        const canto =
          (i === 0 && j === 0) ||
          (i === 0 && j === ultimo) ||
          (i === ultimo && j === 0);
        if (!canto) this.desenharAlinhamento(x, y);
      });
    });

    // Reserva as áreas de formato e de versão; o valor entra depois.
    this.desenharFormato(0);
    this.desenharVersao();
  }

  private desenharLocalizador(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distancia = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.tamanho && yy >= 0 && yy < this.tamanho) {
          this.fixar(xx, yy, distancia !== 2 && distancia !== 4);
        }
      }
    }
  }

  private desenharAlinhamento(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.fixar(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /** A informação de formato (nível e máscara), nas duas cópias. */
  desenharFormato(mascara: number): void {
    const bits = bitsDeFormato(mascara);
    const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
    const fim = this.tamanho;

    for (let i = 0; i <= 5; i++) this.fixar(8, i, bit(i));
    this.fixar(8, 7, bit(6));
    this.fixar(8, 8, bit(7));
    this.fixar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.fixar(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.fixar(fim - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.fixar(8, fim - 15 + i, bit(i));
    // O módulo sempre escuro, ao lado do localizador de baixo.
    this.fixar(8, fim - 8, true);
  }

  private desenharVersao(): void {
    if (this.versao < 7) return;
    let resto = this.versao;
    for (let i = 0; i < 12; i++)
      resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (this.versao << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const escuro = ((bits >>> i) & 1) === 1;
      const a = this.tamanho - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.fixar(a, b, escuro);
      this.fixar(b, a, escuro);
    }
  }

  private escrever(x: number, y: number, escuro: boolean): void {
    const linha = this.modulos[y];
    if (linha !== undefined) linha[x] = escuro;
  }

  /**
   * As posições de dado, na ordem em que os bits entram.
   *
   * Zigue-zague em pares de colunas, da direita para a esquerda, subindo e
   * descendo alternadamente — e pulando a coluna 6, que é o padrão de tempo.
   */
  private posicoesDeDado(): [number, number][] {
    const posicoes: [number, number][] = [];
    const acrescentarLivres = (direita: number, y: number): void => {
      for (const x of [direita, direita - 1]) {
        if (!this.ehFixo(x, y)) posicoes.push([x, y]);
      }
    };
    for (let direita = this.tamanho - 1; direita >= 1; direita -= 2) {
      if (direita === 6) direita = 5;
      const sobe = ((direita + 1) & 2) === 0;
      for (let vertical = 0; vertical < this.tamanho; vertical++) {
        acrescentarLivres(
          direita,
          sobe ? this.tamanho - 1 - vertical : vertical,
        );
      }
    }
    return posicoes;
  }

  /** Escreve os bytes nas posições de dado. */
  escreverBytes(bytes: readonly number[]): void {
    const totalDeBits = bytes.length * 8;
    this.posicoesDeDado().forEach(([x, y], i) => {
      if (i >= totalDeBits) return;
      const byte = bytes[i >>> 3] ?? 0;
      this.escrever(x, y, ((byte >>> (7 - (i & 7))) & 1) === 1);
    });
  }

  /** Aplica (ou desfaz, porque é XOR) uma máscara nos módulos de dado. */
  aplicarMascara(mascara: number): void {
    for (let y = 0; y < this.tamanho; y++) {
      for (let x = 0; x < this.tamanho; x++) {
        if (this.ehFixo(x, y) || !mascaraInverte(mascara, x, y)) continue;
        this.escrever(x, y, !this.ler(x, y));
      }
    }
  }

  /**
   * A penalidade da máscara, pelas quatro regras do documento.
   *
   * Sequências longas de uma cor, blocos 2×2, falsos localizadores e
   * desequilíbrio entre claro e escuro — tudo o que confunde a câmera.
   */
  penalidade(): number {
    let total = 0;
    const n = this.tamanho;

    const avaliarLinha = (ler: (i: number) => boolean): void => {
      let corrida = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && ler(i) === ler(i - 1)) {
          corrida++;
          continue;
        }
        if (corrida >= 5) total += 3 + (corrida - 5);
        corrida = 1;
      }
      // Falso localizador: 1011101 com quatro claros de um dos lados.
      for (let i = 0; i + 11 <= n; i++) {
        const trecho = Array.from({ length: 11 }, (_, k) => ler(i + k));
        if (ehFalsoLocalizador(trecho)) total += 40;
      }
    };

    for (let y = 0; y < n; y++) avaliarLinha((x) => this.ler(x, y));
    for (let x = 0; x < n; x++) avaliarLinha((y) => this.ler(x, y));

    const blocoUniforme = (x: number, y: number): boolean => {
      const cor = this.ler(x, y);
      return (
        cor === this.ler(x + 1, y) &&
        cor === this.ler(x, y + 1) &&
        cor === this.ler(x + 1, y + 1)
      );
    };
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        if (blocoUniforme(x, y)) total += 3;
      }
    }

    const escuros = this.modulos.reduce(
      (soma, linha) => soma + linha.filter(Boolean).length,
      0,
    );
    const totalDeModulos = n * n;
    const desvio =
      Math.ceil(Math.abs(escuros * 20 - totalDeModulos * 10) / totalDeModulos) -
      1;
    total += desvio * 10;

    return total;
  }
}

const PADRAO_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0] as const;
const PADRAO_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1] as const;

function ehFalsoLocalizador(trecho: readonly boolean[]): boolean {
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
function mascaraInverte(mascara: number, x: number, y: number): boolean {
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

// ---------------------------------------------------------------------------
// A porta de entrada
// ---------------------------------------------------------------------------

/** Gera o código de leitura de um texto, em UTF-8. */
export function gerarCodigo(texto: string): CodigoDeLeitura {
  const conteudo = new TextEncoder().encode(texto);
  const versao = versaoPara(conteudo.length);
  const quadro = new Quadro(versao);
  quadro.desenharPadroesFixos();
  quadro.escreverBytes(
    intercalarComCorrecao(bytesDeDado(conteudo, versao), versao),
  );

  // A máscara com a menor penalidade é a que a câmera lê com mais folga.
  let melhor = 0;
  let menorPenalidade = Number.POSITIVE_INFINITY;
  for (let mascara = 0; mascara < 8; mascara++) {
    quadro.aplicarMascara(mascara);
    quadro.desenharFormato(mascara);
    const penalidade = quadro.penalidade();
    if (penalidade < menorPenalidade) {
      menorPenalidade = penalidade;
      melhor = mascara;
    }
    quadro.aplicarMascara(mascara);
  }
  quadro.aplicarMascara(melhor);
  quadro.desenharFormato(melhor);

  return {
    versao,
    tamanho: quadro.tamanho,
    modulos: quadro.modulos.map((linha) => [...linha]),
    mascara: melhor,
  };
}

/**
 * O caminho SVG dos módulos escuros, já deslocado pela margem silenciosa.
 *
 * Um `path` só, e não um `rect` por módulo: um código de versão 4 tem mais de
 * mil módulos, e mil elementos no DOM por tela do rodízio é peso à toa.
 */
export function caminhoDosModulos(
  codigo: CodigoDeLeitura,
  margem: number = MARGEM_SILENCIOSA,
): string {
  const partes: string[] = [];
  codigo.modulos.forEach((linha, y) => {
    linha.forEach((escuro, x) => {
      if (escuro)
        partes.push(`M${String(x + margem)} ${String(y + margem)}h1v1h-1z`);
    });
  });
  return partes.join("");
}

/** O nome do parâmetro que diz de onde a pessoa veio. */
export const PARAMETRO_DE_ORIGEM = "origem";

/** O valor que a televisão carrega nele. */
export const ORIGEM_DA_TV = "tv";

/**
 * O endereço que o código carrega: a vitrine da loja, marcada como vinda da TV.
 *
 * A marca é o que permite ao dono saber, depois, que a televisão converteu —
 * sem ela, o pedido de quem leu o código é igual ao de quem chegou pelo
 * buscador.
 */
export function enderecoParaOCelular(enderecoDaVitrine: string): string {
  const endereco = new URL(enderecoDaVitrine);
  endereco.searchParams.set(PARAMETRO_DE_ORIGEM, ORIGEM_DA_TV);
  return endereco.toString();
}

/**
 * O endereço como se lê em voz alta, para quem prefere digitar.
 *
 * Sem esquema, sem `www.`, sem a marca de origem e sem barra no fim: é o que
 * cabe numa linha grande ao lado do código.
 */
export function enderecoCurto(enderecoDaVitrine: string): string {
  const endereco = new URL(enderecoDaVitrine);
  const maquina = endereco.host.replace(/^www\./, "");
  const caminho = endereco.pathname.replace(/\/+$/, "");
  return `${maquina}${caminho}`;
}

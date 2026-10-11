// O quadro de módulos do código de leitura (AC-931): desenha os padrões fixos, escreve
// os bytes em zigue-zague, aplica a máscara e mede a penalidade que decide qual usar.
import { posicoesDeAlinhamento, tamanhoDaVersao } from "./geometria.ts";
import {
  bitsDeFormato,
  ehFalsoLocalizador,
  mascaraInverte,
} from "./mascara.ts";

/** A matriz em construção: `modulos` guarda a cor, `fixos` marca o que é padrão e não dado. */
export class Quadro {
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

  /*
   * Acesso a um módulo: `fixar` pinta e marca como padrão (a máscara não toca),
   * `ler` devolve a cor e `ehFixo` diz se é padrão. Fora do quadro, ler dá claro.
   */
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

  /** Tempo, localizadores e alinhamentos, e reserva o lugar do formato e da versão. */
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

  /** Localizador 7×7 centrado em (x, y), com o separador claro em volta, cortado na borda. */
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

  /** Alinhamento 5×5 centrado em (x, y): anel escuro, anel claro e centro escuro. */
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

  /** A informação de versão (a partir da 7), com correção BCH, nas duas cópias. */
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

  /** Pinta um módulo de dado sem marcá-lo como fixo, para a máscara poder invertê-lo. */
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

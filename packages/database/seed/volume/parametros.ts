/**
 * Parâmetros do perfil de VOLUME (#138): +100.000 pedidos sintéticos sobre as
 * 100 lojas do seed de simulação (#135), sempre na base `simpleclick_simulacao`.
 *
 * Tudo aqui é puro. Semente e referência são obrigatórias (nada depende do
 * relógio) e o tamanho do perfil é fixo: não há `--pedidos` nem `--lote`.
 */

/** O único banco em que o volume escreve. Nome exato, sem sufixo. */
export const BANCO_DO_VOLUME = "simpleclick_simulacao";

export const PEDIDOS_DO_VOLUME = 100_000;
export const LOJAS_DO_VOLUME = 100;
export const MINIMO_POR_LOJA = 200;
export const MAXIMO_POR_LOJA = 4_000;

/** Pedidos da base do #135: `number` 1001..1010. O volume começa em 1011. */
export const ULTIMO_NUMERO_DA_BASE = 1_010;
export const PRIMEIRO_NUMERO_DO_VOLUME = ULTIMO_NUMERO_DA_BASE + 1;
export const PEDIDOS_DA_BASE_POR_LOJA = 10;

/** As lojas do #135 são aprovadas entre 20 e 29 dias antes da referência. */
export const JANELA_EM_DIAS = 19;

/** Pedidos ainda em andamento (fila não vazia) por loja, nas últimas 6 h. */
export const PEDIDOS_RECENTES_POR_LOJA = 10;

export const COMANDOS = ["carregar", "validar", "explicar"] as const;
export type Comando = (typeof COMANDOS)[number];

export class ErroDeParametros extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeParametros";
  }
}

export interface ParametrosDoVolume {
  readonly comando: Comando;
  readonly semente: string;
  /** Instante de referência: nenhum evento do volume é posterior a ele. */
  readonly referencia: Date;
  /** `carregar --ensaio`: carrega a 1ª loja, confere e desfaz (ROLLBACK). */
  readonly ensaio: boolean;
  /** `carregar --falhar-na-loja N`: erro induzido na loja N, antes do COMMIT. */
  readonly falharNaLoja: number | null;
}

const PADRAO_DA_SEMENTE = /^[A-Za-z0-9._-]{1,64}$/;
/** ISO 8601 com fuso explícito: sem fuso, a referência dependeria da máquina. */
const PADRAO_DA_REFERENCIA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function valorDe(argv: readonly string[], i: number, nome: string): string {
  const valor = argv[i + 1];
  if (valor === undefined || valor.startsWith("--")) {
    throw new ErroDeParametros(`${nome} precisa de um valor.`);
  }
  return valor;
}

/** Lê `carregar|validar|explicar --semente S --referencia ISO [...]`. */
export function lerParametros(argv: readonly string[]): ParametrosDoVolume {
  const comando = argv[0];
  if (comando === undefined || !(COMANDOS as readonly string[]).includes(comando)) {
    throw new ErroDeParametros(
      `Informe o comando: ${COMANDOS.join(" | ")}. Recebido: ${comando ?? "(nada)"}.`,
    );
  }
  let semente: string | null = null;
  let referencia: string | null = null;
  let ensaio = false;
  let falhar: string | null = null;

  for (let i = 1; i < argv.length; i++) {
    const argumento = argv[i]!;
    switch (argumento) {
      case "--semente":
        semente = valorDe(argv, i++, "--semente");
        break;
      case "--referencia":
        referencia = valorDe(argv, i++, "--referencia");
        break;
      case "--ensaio":
        ensaio = true;
        break;
      case "--falhar-na-loja":
        falhar = valorDe(argv, i++, "--falhar-na-loja");
        break;
      default:
        throw new ErroDeParametros(`Argumento desconhecido: ${argumento}.`);
    }
  }

  if (semente === null || !PADRAO_DA_SEMENTE.test(semente)) {
    throw new ErroDeParametros(
      "--semente é obrigatória (1 a 64 caracteres entre letras, números, ponto, hífen e sublinhado).",
    );
  }
  if (referencia === null || !PADRAO_DA_REFERENCIA.test(referencia)) {
    throw new ErroDeParametros(
      "--referencia é obrigatória, em ISO 8601 com fuso (ex.: 2026-11-01T18:00:00-03:00).",
    );
  }
  const data = new Date(referencia);
  if (Number.isNaN(data.getTime())) {
    throw new ErroDeParametros(`--referencia inválida: ${referencia}.`);
  }

  if ((ensaio || falhar !== null) && comando !== "carregar") {
    throw new ErroDeParametros("--ensaio e --falhar-na-loja só valem em 'carregar'.");
  }
  if (ensaio && falhar !== null) {
    throw new ErroDeParametros("--ensaio e --falhar-na-loja não se combinam.");
  }
  let falharNaLoja: number | null = null;
  if (falhar !== null) {
    if (!/^\d{1,3}$/.test(falhar) || Number(falhar) >= LOJAS_DO_VOLUME) {
      throw new ErroDeParametros(
        `--falhar-na-loja precisa ser um índice de 0 a ${LOJAS_DO_VOLUME - 1}.`,
      );
    }
    falharNaLoja = Number(falhar);
  }

  return {
    comando: comando as Comando,
    semente,
    referencia: data,
    ensaio,
    falharNaLoja,
  };
}

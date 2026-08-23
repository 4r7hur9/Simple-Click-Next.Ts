export type ResultadoDaProtecaoContraTentativas =
  | { readonly status: "PERMITIDA" }
  | {
      readonly status: "CONTA_BLOQUEADA";
      readonly bloqueadoAte: Date;
      readonly esperaEmMs: number;
    }
  | { readonly status: "ORIGEM_LIMITADA"; readonly statusHttp: 429 };

export interface DependenciasDaProtecaoContraTentativas {
  /** Relógio injetável para que a regra não dependa do relógio da máquina. */
  readonly agora?: () => Date;
  /** Chamado sem e-mail ou outro dado pessoal: a entrega cabe ao adaptador. */
  readonly avisarDono?: (entrada: {
    readonly contaId: string;
    readonly bloqueadoAte: Date;
    readonly esperaEmMs: number;
  }) => Promise<void>;
  readonly limitePorOrigemPorMinuto?: number;
}

interface EstadoDaConta {
  falhas: Date[];
  quantidadeDeBloqueios: number;
  bloqueadoAte?: Date;
}

const FALHAS_PARA_BLOQUEAR = 10;
const JANELA_DE_FALHAS_EM_MS = 15 * 60_000;
const ESPERA_INICIAL_EM_MS = 60_000;
const LIMITE_PADRAO_POR_ORIGEM_POR_MINUTO = 60;

/**
 * Guarda a proteção de login. Em produção, uma implementação compartilhada
 * desta mesma porta deve ser usada para que os limites valham entre instâncias.
 */
export class ProtecaoContraTentativas {
  private readonly agora: () => Date;
  private readonly avisarDono: NonNullable<
    DependenciasDaProtecaoContraTentativas["avisarDono"]
  >;
  private readonly limitePorOrigemPorMinuto: number;
  private readonly contas = new Map<string, EstadoDaConta>();
  private readonly tentativasPorOrigem = new Map<string, Date[]>();

  constructor(dependencias: DependenciasDaProtecaoContraTentativas = {}) {
    this.agora = dependencias.agora ?? (() => new Date());
    this.avisarDono = dependencias.avisarDono ?? (async () => undefined);
    this.limitePorOrigemPorMinuto =
      dependencias.limitePorOrigemPorMinuto ?? LIMITE_PADRAO_POR_ORIGEM_POR_MINUTO;
  }

  verificar(entrada: {
    readonly contaId: string;
    readonly enderecoDaBorda: string;
    /** Só deve ser preenchido pela borda já autenticada pela infraestrutura. */
    readonly enderecoRealInformadoPelaBorda?: string;
  }): ResultadoDaProtecaoContraTentativas {
    const agora = this.agora();
    const origem = entrada.enderecoRealInformadoPelaBorda ?? entrada.enderecoDaBorda;
    const tentativasDaOrigem = this.tentativasRecentes(this.tentativasPorOrigem, origem, agora, 60_000);
    if (tentativasDaOrigem.length >= this.limitePorOrigemPorMinuto) {
      return { status: "ORIGEM_LIMITADA", statusHttp: 429 };
    }

    const estado = this.contas.get(entrada.contaId);
    if (estado?.bloqueadoAte !== undefined && estado.bloqueadoAte > agora) {
      return {
        status: "CONTA_BLOQUEADA",
        bloqueadoAte: estado.bloqueadoAte,
        esperaEmMs: estado.bloqueadoAte.getTime() - agora.getTime(),
      };
    }

    tentativasDaOrigem.push(agora);
    this.tentativasPorOrigem.set(origem, tentativasDaOrigem);
    return { status: "PERMITIDA" };
  }

  async registrarFalha(contaId: string): Promise<ResultadoDaProtecaoContraTentativas> {
    const agora = this.agora();
    const estado = this.contas.get(contaId) ?? { falhas: [], quantidadeDeBloqueios: 0 };
    estado.falhas = estado.falhas.filter((falha) => agora.getTime() - falha.getTime() < JANELA_DE_FALHAS_EM_MS);
    estado.falhas.push(agora);

    if (estado.falhas.length < FALHAS_PARA_BLOQUEAR) {
      this.contas.set(contaId, estado);
      return { status: "PERMITIDA" };
    }

    const esperaEmMs = ESPERA_INICIAL_EM_MS * 2 ** estado.quantidadeDeBloqueios;
    const bloqueadoAte = new Date(agora.getTime() + esperaEmMs);
    estado.quantidadeDeBloqueios += 1;
    estado.falhas = [];
    estado.bloqueadoAte = bloqueadoAte;
    this.contas.set(contaId, estado);
    await this.avisarDono({ contaId, bloqueadoAte, esperaEmMs });
    return { status: "CONTA_BLOQUEADA", bloqueadoAte, esperaEmMs };
  }

  private tentativasRecentes(
    tentativasPorChave: Map<string, Date[]>,
    chave: string,
    agora: Date,
    janelaEmMs: number,
  ): Date[] {
    return (tentativasPorChave.get(chave) ?? []).filter(
      (tentativa) => agora.getTime() - tentativa.getTime() < janelaEmMs,
    );
  }
}

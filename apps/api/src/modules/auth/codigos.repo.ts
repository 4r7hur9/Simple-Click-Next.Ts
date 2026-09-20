/**
 * Fronteira de persistência dos links de verificação.
 *
 * O token nunca atravessa esta fronteira em texto: só o seu resumo
 * criptográfico. A implementação de produção deve fazer as operações abaixo
 * na mesma transação; assim duas abas não conseguem consumir o mesmo link.
 */

export interface IdentidadeDeVerificacao {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly emailVerificadoEm: Date | null;
}

export interface CodigoDeVerificacao {
  readonly id: string;
  readonly identidadeId: string;
  readonly resumoDoToken: string;
  readonly expiraEm: Date;
  readonly usadoEm: Date | null;
  readonly enviadoEm: Date;
}

export type ResultadoDoConsumoDoCodigo =
  | {
      readonly situacao: "verificado";
      readonly identidade: IdentidadeDeVerificacao;
    }
  | { readonly situacao: "expirado" }
  | { readonly situacao: "invalido" };

export type ResultadoDaAutorizacaoDeReenvio =
  | {
      readonly situacao: "liberado";
      readonly identidade: IdentidadeDeVerificacao;
    }
  | { readonly situacao: "limite_atingido"; readonly disponivelEm: Date }
  | { readonly situacao: "invalido" };

export interface CodigosRepo {
  /** Consome e marca o e-mail da identidade em uma única operação atômica. */
  consumirVerificacao(
    resumoDoToken: string,
    agora: Date,
  ): Promise<ResultadoDoConsumoDoCodigo>;
  /**
   * Autoriza reenvio apenas para o link expirado apresentado e contabiliza a
   * tentativa dentro da janela. A contagem também precisa ser atômica.
   */
  autorizarReenvioDeLinkExpirado(
    resumoDoToken: string,
    agora: Date,
    limite: number,
    janelaEmMs: number,
  ): Promise<ResultadoDaAutorizacaoDeReenvio>;
  criarVerificacao(codigo: CodigoDeVerificacao): Promise<void>;
}

/** Implementação pequena para a composição local e para provas de unidade. */
export class CodigosRepoEmMemoria implements CodigosRepo {
  private readonly codigos: CodigoDeVerificacao[];
  private readonly identidades: Map<string, IdentidadeDeVerificacao>;
  private readonly reenvios: Date[] = [];

  constructor(
    identidades: readonly IdentidadeDeVerificacao[],
    codigos: readonly CodigoDeVerificacao[] = [],
  ) {
    this.identidades = new Map(
      identidades.map((identidade) => [identidade.id, identidade]),
    );
    this.codigos = [...codigos];
  }

  async consumirVerificacao(
    resumoDoToken: string,
    agora: Date,
  ): Promise<ResultadoDoConsumoDoCodigo> {
    const indice = this.codigos.findIndex(
      (codigo) =>
        codigo.resumoDoToken === resumoDoToken && codigo.usadoEm === null,
    );
    if (indice < 0) return { situacao: "invalido" };

    const codigo = this.codigos.at(indice);
    if (codigo === undefined) return { situacao: "invalido" };
    if (codigo.expiraEm.getTime() <= agora.getTime())
      return { situacao: "expirado" };

    const identidade = this.identidades.get(codigo.identidadeId);
    if (identidade === undefined) return { situacao: "invalido" };

    this.codigos[indice] = { ...codigo, usadoEm: agora };
    const verificada = {
      ...identidade,
      emailVerificadoEm: identidade.emailVerificadoEm ?? agora,
    };
    this.identidades.set(verificada.id, verificada);
    return { situacao: "verificado", identidade: verificada };
  }

  async autorizarReenvioDeLinkExpirado(
    resumoDoToken: string,
    agora: Date,
    limite: number,
    janelaEmMs: number,
  ): Promise<ResultadoDaAutorizacaoDeReenvio> {
    const codigo = this.codigos.find(
      (item) => item.resumoDoToken === resumoDoToken,
    );
    if (
      codigo === undefined ||
      codigo.usadoEm !== null ||
      codigo.expiraEm.getTime() > agora.getTime()
    ) {
      return { situacao: "invalido" };
    }
    const identidade = this.identidades.get(codigo.identidadeId);
    if (identidade === undefined) return { situacao: "invalido" };

    const inicioDaJanela = agora.getTime() - janelaEmMs;
    const tentativasNaJanela = this.reenvios.filter(
      (envio) => envio.getTime() > inicioDaJanela,
    );
    this.reenvios.splice(0, this.reenvios.length, ...tentativasNaJanela);
    const primeiraTentativa = tentativasNaJanela[0];
    if (
      primeiraTentativa !== undefined &&
      tentativasNaJanela.length >= limite
    ) {
      return {
        situacao: "limite_atingido",
        disponivelEm: new Date(primeiraTentativa.getTime() + janelaEmMs),
      };
    }

    this.reenvios.push(agora);
    return { situacao: "liberado", identidade };
  }

  async criarVerificacao(codigo: CodigoDeVerificacao): Promise<void> {
    this.codigos.push(codigo);
  }
}

/**
 * O erro de quem passou do limite da loja ou do dono (card #25). Mora sozinho
 * para o manipulador de erros conhecê-lo sem importar o acesso ao banco.
 */

import {
  mensagemDoLimiteAtingido,
  type RecursoLimitado,
} from "@simpleclick/contracts";

/** Criar passaria do limite. */
export class ErroDeLimiteAtingido extends Error {
  readonly recurso: RecursoLimitado;
  readonly limite: number;
  readonly uso: number;

  constructor(recurso: RecursoLimitado, limite: number, uso: number) {
    super(mensagemDoLimiteAtingido(recurso, limite));
    this.name = "ErroDeLimiteAtingido";
    this.recurso = recurso;
    this.limite = limite;
    this.uso = uso;
  }

  /** O corpo da resposta 409. */
  corpo() {
    return {
      erro: "limite_atingido" as const,
      recurso: this.recurso,
      limite: this.limite,
      uso: this.uso,
      mensagem: this.message,
    };
  }
}

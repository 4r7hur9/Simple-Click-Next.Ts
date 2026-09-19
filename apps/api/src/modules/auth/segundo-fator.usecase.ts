/**
 * Confirma o desafio que nasceu depois da senha.
 *
 * A porta do repositório executa a comparação, a contagem e o consumo como
 * uma única operação atômica. Assim duas requisições concorrentes não conseguem
 * transformar o mesmo código em duas sessões.
 */

export type ResultadoDaValidacaoDoDesafio =
  | { readonly status: "ACEITO"; readonly identidadeId: string }
  | {
      readonly status: "CODIGO_INCORRETO";
      readonly tentativasRestantes: number;
    }
  | { readonly status: "BLOQUEADO" }
  | { readonly status: "EXPIRADO" }
  | { readonly status: "INVALIDO" };

export interface RepositorioDeDesafiosDeSegundoFator {
  validarEConsumir(entrada: {
    readonly desafioId: string;
    readonly codigo: string;
  }): Promise<ResultadoDaValidacaoDoDesafio>;
}

export interface DependenciasDoSegundoFator {
  readonly desafios: RepositorioDeDesafiosDeSegundoFator;
  readonly criarSessao: (entrada: {
    readonly identidadeId: string;
  }) => Promise<{ readonly sessaoId: string }>;
}

export type ResultadoDoSegundoFator =
  | { readonly status: "SESSAO_CRIADA"; readonly sessaoId: string }
  | {
      readonly status: "CODIGO_INCORRETO";
      readonly tentativasRestantes: number;
    }
  | {
      readonly status: "BLOQUEADO";
      readonly mensagem: "A tentativa foi bloqueada. Comece o login de novo.";
    }
  | { readonly status: "DESAFIO_EXPIRADO" }
  | { readonly status: "DESAFIO_INVALIDO" };

export async function confirmarSegundoFator(
  entrada: { readonly desafioId: string; readonly codigo: string },
  dependencias: DependenciasDoSegundoFator,
): Promise<ResultadoDoSegundoFator> {
  const validacao = await dependencias.desafios.validarEConsumir(entrada);

  if (validacao.status === "ACEITO") {
    const sessao = await dependencias.criarSessao({
      identidadeId: validacao.identidadeId,
    });
    return { status: "SESSAO_CRIADA", sessaoId: sessao.sessaoId };
  }
  if (validacao.status === "CODIGO_INCORRETO") {
    return {
      status: "CODIGO_INCORRETO",
      tentativasRestantes: validacao.tentativasRestantes,
    };
  }
  if (validacao.status === "BLOQUEADO") {
    return {
      status: "BLOQUEADO",
      mensagem: "A tentativa foi bloqueada. Comece o login de novo.",
    };
  }
  if (validacao.status === "EXPIRADO") return { status: "DESAFIO_EXPIRADO" };
  return { status: "DESAFIO_INVALIDO" };
}

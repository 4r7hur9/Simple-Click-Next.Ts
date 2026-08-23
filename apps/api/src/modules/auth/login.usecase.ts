/**
 * Primeiro passo do acesso por senha.
 *
 * O caso de uso não conhece banco, algoritmo de senha nem a forma da sessão.
 * Essas decisões ficam nas portas injetadas, para que a regra importante fique
 * explícita: quem exige segundo fator jamais ganha uma sessão neste passo.
 */

export type PapelNoLogin = "CLIENTE" | "DONO" | "ADMINISTRADOR";

export interface IdentidadeParaLogin {
  readonly id: string;
  readonly email: string;
  readonly senhaHash: string;
  readonly emailVerificado: boolean;
  readonly papel: PapelNoLogin;
  /** Escolha do cliente final; donos e administradores sempre usam fator extra. */
  readonly segundoFatorAtivado: boolean;
}

export interface RepositorioDeIdentidadesParaLogin {
  buscarPorEmail(emailNormalizado: string): Promise<IdentidadeParaLogin | null>;
}

export interface DependenciasDoLogin {
  readonly identidades: RepositorioDeIdentidadesParaLogin;
  readonly conferirSenha: (
    senhaInformada: string,
    senhaHash: string,
  ) => Promise<boolean>;
  readonly criarDesafioDeSegundoFator: (entrada: {
    readonly identidadeId: string;
  }) => Promise<{ readonly desafioId: string }>;
  readonly criarSessao: (entrada: {
    readonly identidadeId: string;
  }) => Promise<{ readonly sessaoId: string }>;
}

export type ResultadoDoLogin =
  | { readonly status: "CREDENCIAIS_INVALIDAS" }
  | { readonly status: "EMAIL_NAO_VERIFICADO" }
  | {
      readonly status: "DESAFIO_DE_SEGUNDO_FATOR";
      readonly desafioId: string;
    }
  | { readonly status: "SESSAO_CRIADA"; readonly sessaoId: string };

function normalizarEmail(email: string): string {
  return email.trim().toLocaleLowerCase("pt-BR");
}

/** Dono e administrador não podem desligar o segundo fator. */
export function exigeSegundoFator(identidade: IdentidadeParaLogin): boolean {
  return identidade.papel !== "CLIENTE" || identidade.segundoFatorAtivado;
}

export async function entrarComSenha(
  entrada: { readonly email: string; readonly senha: string },
  dependencias: DependenciasDoLogin,
): Promise<ResultadoDoLogin> {
  const identidade = await dependencias.identidades.buscarPorEmail(
    normalizarEmail(entrada.email),
  );

  // A resposta não informa se foi o e-mail ou a senha que falhou.
  if (identidade === null) return { status: "CREDENCIAIS_INVALIDAS" };

  const senhaConfere = await dependencias.conferirSenha(
    entrada.senha,
    identidade.senhaHash,
  );
  if (!senhaConfere) return { status: "CREDENCIAIS_INVALIDAS" };

  if (!identidade.emailVerificado) return { status: "EMAIL_NAO_VERIFICADO" };

  if (exigeSegundoFator(identidade)) {
    const desafio = await dependencias.criarDesafioDeSegundoFator({
      identidadeId: identidade.id,
    });
    return { status: "DESAFIO_DE_SEGUNDO_FATOR", desafioId: desafio.desafioId };
  }

  const sessao = await dependencias.criarSessao({
    identidadeId: identidade.id,
  });
  return { status: "SESSAO_CRIADA", sessaoId: sessao.sessaoId };
}

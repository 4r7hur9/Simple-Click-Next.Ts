import { createHash, randomBytes } from "node:crypto";

/** A mensagem não varia: é a barreira contra enumeração de contas. */
export const CONFIRMACAO_DE_RECUPERACAO =
  "Se existir uma conta para este e-mail, enviaremos as instruções para redefinir sua senha.";

export type IdentidadeParaRecuperacao = {
  id: string;
  email: string;
};

export type PedidoDeRecuperacao = {
  identidadeId: string;
  resumoDoToken: string;
  expiraEm: Date;
};

/**
 * A implementação desta porta deve salvar apenas `resumoDoToken`. O token em
 * texto é uma credencial de uso único e só pode existir entre esta função e o
 * e-mail transacional.
 */
export type RepositorioDeRecuperacaoDeSenha = {
  encontrarPorEmailNormalizado(
    emailNormalizado: string,
  ): Promise<IdentidadeParaRecuperacao | null>;
  criarPedido(pedido: PedidoDeRecuperacao): Promise<void>;
  /**
   * Consome o link, altera a senha e revoga sessões na MESMA transação.
   * Retornar `false` significa token inexistente, expirado ou já consumido.
   */
  consumirPedidoERedefinirSenha(dados: {
    resumoDoToken: string;
    hashDaSenha: string;
    agora: Date;
  }): Promise<boolean>;
};

export type DependenciasDeRecuperacaoDeSenha = {
  repositorio: RepositorioDeRecuperacaoDeSenha;
  enviarLinkDeRecuperacao(dados: {
    para: string;
    token: string;
    expiraEm: Date;
  }): Promise<void>;
  validarNovaSenha(senha: string): Promise<void>;
  gerarHashDaSenha(senha: string): Promise<string>;
  agora(): Date;
  gerarToken(): string;
  resumirToken(token: string): string;
};

export type ResultadoDaRedefinicao =
  { ok: true } | { ok: false; motivo: "SENHA_INVALIDA" | "LINK_INVALIDO" };

const DURACAO_DO_LINK_EM_MS = 60 * 60 * 1000;

export function normalizarEmail(email: string): string {
  return email.trim().toLocaleLowerCase("pt-BR");
}

/**
 * Aceita o pedido sem expor se a identidade existe. Falhas de e-mail e de
 * persistência também não são devolvidas à pessoa, pois permitiriam comparar
 * os dois caminhos.
 */
export async function pedirRecuperacaoDeSenha(
  email: string,
  dependencias: DependenciasDeRecuperacaoDeSenha,
): Promise<{ confirmacao: typeof CONFIRMACAO_DE_RECUPERACAO }> {
  try {
    const identidade =
      await dependencias.repositorio.encontrarPorEmailNormalizado(
        normalizarEmail(email),
      );

    if (identidade !== null) {
      const agora = dependencias.agora();
      const token = dependencias.gerarToken();
      const expiraEm = new Date(agora.getTime() + DURACAO_DO_LINK_EM_MS);

      await dependencias.repositorio.criarPedido({
        identidadeId: identidade.id,
        resumoDoToken: dependencias.resumirToken(token),
        expiraEm,
      });
      await dependencias.enviarLinkDeRecuperacao({
        para: identidade.email,
        token,
        expiraEm,
      });
    }
  } catch {
    // A confirmação continua idêntica para não transformar indisponibilidade
    // de um caminho em sinal de que o endereço pertence a uma conta.
  }

  return { confirmacao: CONFIRMACAO_DE_RECUPERACAO };
}

/** Redefine a senha uma única vez e derruba todas as sessões anteriores. */
export async function definirNovaSenha(
  dados: { token: string; senha: string },
  dependencias: DependenciasDeRecuperacaoDeSenha,
): Promise<ResultadoDaRedefinicao> {
  try {
    await dependencias.validarNovaSenha(dados.senha);
  } catch {
    return { ok: false, motivo: "SENHA_INVALIDA" };
  }

  const aplicada = await dependencias.repositorio.consumirPedidoERedefinirSenha(
    {
      resumoDoToken: dependencias.resumirToken(dados.token),
      hashDaSenha: await dependencias.gerarHashDaSenha(dados.senha),
      agora: dependencias.agora(),
    },
  );

  return aplicada ? { ok: true } : { ok: false, motivo: "LINK_INVALIDO" };
}

/** Utilitários seguros para a adaptação HTTP; os testes injetam valores fixos. */
export function gerarTokenDeRecuperacao(): string {
  return randomBytes(32).toString("base64url");
}

export function resumirTokenDeRecuperacao(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

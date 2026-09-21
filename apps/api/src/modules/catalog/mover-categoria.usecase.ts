/**
 * Preserva especificações quando um produto troca de categoria (T-310).
 *
 * O valor preenchido pertence à definição da categoria de origem. A mudança
 * não reescreve nem apaga esse histórico: apenas informa que ele não é usado
 * na categoria atual e devolve as definições novas que ainda podem ser
 * preenchidas.
 */

export interface ValorDeEspecificacao {
  readonly id: string;
  readonly produtoId: string;
  readonly definicaoId: string;
  readonly categoriaId: string;
  readonly valor: unknown;
}

export interface DefinicaoDeEspecificacao {
  readonly id: string;
  readonly categoriaId: string;
  readonly chave: string;
  readonly rotulo: string;
  readonly obrigatoria: boolean;
}

export interface ValorPreservado extends ValorDeEspecificacao {
  readonly usadoNaCategoriaAtual: boolean;
}

export interface ResultadoDaMudancaDeCategoria {
  readonly valoresPreservados: readonly ValorPreservado[];
  readonly especificacoesParaPreencher: readonly DefinicaoDeEspecificacao[];
}

export interface EntradaDaMudancaDeCategoria {
  readonly categoriaAtualId: string;
  readonly valores: readonly ValorDeEspecificacao[];
  readonly especificacoesDaNovaCategoria: readonly DefinicaoDeEspecificacao[];
}

/**
 * Calcula o estado da edição sem mutar a lista recebida.
 *
 * A definição nova já preenchida não volta para a fila de preenchimento; uma
 * definição antiga, mesmo com valor válido, continua preservada e recebe a
 * marca explícita de que não pertence à categoria atual.
 */
export function moverProdutoDeCategoria(
  entrada: EntradaDaMudancaDeCategoria,
): ResultadoDaMudancaDeCategoria {
  const valoresPreservados = entrada.valores.map((valor) => ({
    ...valor,
    usadoNaCategoriaAtual: valor.categoriaId === entrada.categoriaAtualId,
  }));

  const definicoesPreenchidas = new Set(
    valoresPreservados
      .filter((valor) => valor.usadoNaCategoriaAtual)
      .map((valor) => valor.definicaoId),
  );

  const especificacoesParaPreencher =
    entrada.especificacoesDaNovaCategoria.filter(
      (definicao) => !definicoesPreenchidas.has(definicao.id),
    );

  return { valoresPreservados, especificacoesParaPreencher };
}

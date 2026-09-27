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

/** Um vínculo do produto com uma categoria, como a tabela N:M o guarda. */
export interface VinculoDoProduto {
  readonly id: string;
  readonly categoriaId: string;
  readonly principal: boolean;
}

export type PlanoDaTroca =
  | { readonly tipo: "nada" }
  | {
      readonly tipo: "trocar";
      /** O vínculo com a categoria principal antiga: o produto sai dela. */
      readonly apagar: readonly string[];
      /** O produto já estava na nova como secundária: ela vira a principal. */
      readonly tornarPrincipal: string | null;
      /** Ou ele entra na nova agora, já como principal. */
      readonly criarNaCategoria: string | null;
    };

/**
 * Mover o produto troca SÓ a categoria principal (AC-329). As outras seções
 * em que ele aparece — "Promoções", por exemplo — continuam como estavam, e
 * salvar o formulário sem mudar a categoria não mexe em vínculo nenhum.
 */
export function planejarTrocaDeCategoria(
  vinculos: readonly VinculoDoProduto[],
  novaCategoriaId: string,
): PlanoDaTroca {
  const principal = vinculos.find((vinculo) => vinculo.principal);
  if (principal?.categoriaId === novaCategoriaId) return { tipo: "nada" };
  const jaNaNova = vinculos.find(
    (vinculo) => vinculo.categoriaId === novaCategoriaId,
  );
  return {
    tipo: "trocar",
    apagar: principal === undefined ? [] : [principal.id],
    tornarPrincipal: jaNaNova?.id ?? null,
    criarNaCategoria: jaNaNova === undefined ? novaCategoriaId : null,
  };
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

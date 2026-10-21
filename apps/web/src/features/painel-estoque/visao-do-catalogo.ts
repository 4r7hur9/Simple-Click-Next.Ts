/**
 * A visão geral do catálogo que as páginas Estoque, Variações e Opções e
 * adicionais leem (card #52): os produtos, com as variações (preço que vale
 * agora, saldo e aviso de mínimo) e os grupos de escolha.
 *
 * Desde o card #76 as páginas leem UMA PÁGINA (`lerPaginaDaVisao`): busca,
 * filtros, ordem, total e os números do topo vêm do servidor, e loja com dez
 * mil produtos abre tão rápido quanto a de vinte. As contas daqui (situação,
 * indicadores, filtro) seguem valendo para a linha que a pessoa acabou de
 * ajustar. Toda mudança vai pelas rotas do produto, com as regras delas.
 */

export interface VariacaoNaVisao {
  readonly id: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly padrao: boolean;
  readonly disponivel: boolean;
  readonly precoCentavos: number | null;
  /** Nulo: a variação não controla estoque. */
  readonly quantidade: number | null;
  readonly reservado: number | null;
  /** "Avisar abaixo de"; nulo = sem aviso. */
  readonly minimoAlerta: number | null;
  readonly estoqueBaixo: boolean;
}

export interface OpcaoDoGrupoNaVisao {
  readonly nome: string;
  readonly acrescimoCentavos: number;
  readonly disponivel: boolean;
}

export interface GrupoNaVisao {
  readonly id: string;
  readonly nome: string;
  /** `INGREDIENT`, `ADDON` ou `VARIATION`. */
  readonly tipo: string;
  readonly minimo: number;
  readonly maximo: number | null;
  /** O grupo resolve qual variação é vendida (Tamanho, Cor…). */
  readonly eixoDeVariacao: boolean;
  readonly ativo: boolean;
  readonly opcoes: readonly OpcaoDoGrupoNaVisao[];
}

export interface ProdutoNaVisao {
  readonly id: string;
  readonly nome: string;
  readonly status: string;
  readonly disponivel: boolean;
  /** O preço de vitrine (vale para o produto sem variação). */
  readonly precoCentavos?: number | null;
  readonly categoriaId: string | null;
  readonly categoriaNome: string | null;
  readonly variacoes: readonly VariacaoNaVisao[];
  readonly grupos: readonly GrupoNaVisao[];
}

export const ENDERECO_DA_VISAO_GERAL = "/api/catalogo/visao-geral";

// ---------------------------------------------------------------------------
// Página da visão (card #76): o servidor filtra, ordena, conta e pagina
// ---------------------------------------------------------------------------

export type RecorteDaVisao = "estoque" | "variacoes" | "opcoes";

export interface OpcaoDeCategoria {
  readonly valor: string;
  readonly rotulo: string;
}

/** Uma linha da página de Estoque, como o servidor a escolheu. */
export interface LinhaDaPagina {
  readonly produtoId: string;
  /** Nulo: o produto ainda não tem variação nenhuma. */
  readonly variacaoId: string | null;
  readonly unica: boolean;
  readonly situacao: SituacaoDoEstoque;
}

export interface PaginaDaVisao {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly totalDePaginas: number;
  readonly produtos: readonly ProdutoNaVisao[];
  /** As categorias da loja para o filtro (com "Sem categoria" se houver). */
  readonly categorias: readonly OpcaoDeCategoria[];
  /** Os números do topo, da loja toda (não mudam com o filtro). */
  readonly indicadores: Readonly<Record<string, number>>;
  /** Só no Estoque: as linhas da página, na ordem. */
  readonly linhas?: readonly LinhaDaPagina[];
  /** Sem filtro nenhum: linhas (Estoque) ou produtos (Variações, Opções). */
  readonly totalDaLoja?: number;
}

/** Lê uma página; erro de leitura vira exceção (a tela mostra o erro). */
export async function lerPaginaDaVisao(
  recorte: RecorteDaVisao,
  consulta: URLSearchParams,
): Promise<PaginaDaVisao> {
  const parametros = new URLSearchParams(consulta);
  parametros.set("recorte", recorte);
  const resposta = await fetch(
    `${ENDERECO_DA_VISAO_GERAL}?${parametros.toString()}`,
    { cache: "no-store" },
  );
  if (!resposta.ok) throw new Error(`visao_geral_${resposta.status}`);
  return (await resposta.json()) as PaginaDaVisao;
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

export type SituacaoDoEstoque = "falta" | "baixo" | "normal" | "sem-controle";

export const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoDoEstoque, string>> = {
  falta: "Em falta",
  baixo: "Estoque baixo",
  normal: "Normal",
  "sem-controle": "Sem controle",
};

/** A mesma regra da API (`estaAcabando`): no mínimo ou abaixo dele avisa. */
export function estaAcabando(
  quantidade: number | null,
  minimoAlerta: number | null,
): boolean {
  if (quantidade === null || minimoAlerta === null) return false;
  return quantidade <= minimoAlerta;
}

export function situacaoDoEstoque(variacao: {
  readonly quantidade: number | null;
  readonly minimoAlerta: number | null;
}): SituacaoDoEstoque {
  if (variacao.quantidade === null) return "sem-controle";
  if (variacao.quantidade <= 0) return "falta";
  if (estaAcabando(variacao.quantidade, variacao.minimoAlerta)) return "baixo";
  return "normal";
}

/** A linha do produto que ainda não tem variação (nem estoque). */
function semVariacao(produto: ProdutoNaVisao): VariacaoNaVisao {
  return {
    id: "",
    nome: "",
    sku: null,
    padrao: true,
    disponivel: produto.disponivel,
    precoCentavos: produto.precoCentavos ?? null,
    quantidade: null,
    reservado: null,
    minimoAlerta: null,
    estoqueBaixo: false,
  };
}

/** Uma linha da página de Estoque: a variação com o produto dela. */
export interface LinhaDeEstoque {
  readonly chave: string;
  readonly produto: ProdutoNaVisao;
  readonly variacao: VariacaoNaVisao;
  /** O produto só tem a variação padrão (não aparece o nome dela). */
  readonly unica: boolean;
  readonly situacao: SituacaoDoEstoque;
}

export function linhasDeEstoque(
  produtos: readonly ProdutoNaVisao[],
): LinhaDeEstoque[] {
  return produtos.flatMap((produto) =>
    // Produto sem variação nenhuma não conta unidades, mas aparece na lista.
    (produto.variacoes.length > 0
      ? produto.variacoes
      : [semVariacao(produto)]
    ).map((variacao) => ({
      chave: `${produto.id}:${variacao.id}`,
      produto,
      variacao,
      unica: produto.variacoes.length <= 1,
      situacao: situacaoDoEstoque(variacao),
    })),
  );
}

/** As linhas da página do servidor, com o produto e a variação de cada uma. */
export function linhasDaPagina(
  linhas: readonly LinhaDaPagina[],
  produtos: readonly ProdutoNaVisao[],
): LinhaDeEstoque[] {
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  return linhas.flatMap((linha) => {
    const produto = porId.get(linha.produtoId);
    if (produto === undefined) return [];
    const variacao =
      linha.variacaoId === null
        ? semVariacao(produto)
        : produto.variacoes.find((v) => v.id === linha.variacaoId);
    if (variacao === undefined) return [];
    return [
      {
        chave: `${produto.id}:${variacao.id}`,
        produto,
        variacao,
        unica: linha.unica,
        // Depois de um ajuste na linha a conta é a da tela, com o número novo.
        situacao: situacaoDoEstoque(variacao),
      },
    ];
  });
}

export interface IndicadoresDoEstoque {
  readonly emFalta: number;
  readonly estoqueBaixo: number;
  /** Unidades somadas de tudo que controla estoque. */
  readonly totalDeItens: number;
  /** Unidades × preço de venda de agora (sem preço não entra). */
  readonly valorEstimadoCentavos: number;
}

export function indicadoresDoEstoque(
  linhas: readonly LinhaDeEstoque[],
): IndicadoresDoEstoque {
  let emFalta = 0;
  let estoqueBaixo = 0;
  let totalDeItens = 0;
  let valorEstimadoCentavos = 0;
  for (const { variacao, situacao } of linhas) {
    if (situacao === "falta") emFalta += 1;
    if (situacao === "baixo") estoqueBaixo += 1;
    const quantidade = Math.max(variacao.quantidade ?? 0, 0);
    totalDeItens += quantidade;
    valorEstimadoCentavos += quantidade * (variacao.precoCentavos ?? 0);
  }
  return { emFalta, estoqueBaixo, totalDeItens, valorEstimadoCentavos };
}

export type OrdemDoEstoque =
  "nome" | "menor-estoque" | "maior-estoque" | "categoria" | "situacao";

export const ORDENS_DO_ESTOQUE: readonly (readonly [OrdemDoEstoque, string])[] =
  [
    ["situacao", "O que precisa de atenção"],
    ["nome", "Nome (A a Z)"],
    ["menor-estoque", "Menor estoque"],
    ["maior-estoque", "Maior estoque"],
    ["categoria", "Categoria"],
  ];

/** "Avisar abaixo de" do produto: o mesmo em todas, ou nulo se diferem. */
export function minimoDoProduto(produto: ProdutoNaVisao): number | null {
  const controladas = produto.variacoes.filter((v) => v.quantidade !== null);
  const primeiro = controladas[0]?.minimoAlerta ?? null;
  return controladas.every((v) => v.minimoAlerta === primeiro)
    ? primeiro
    : null;
}

// ---------------------------------------------------------------------------
// Variações e opções
// ---------------------------------------------------------------------------

/** Tem grade de verdade: mais de uma variação, ou uma que não é a padrão. */
export function temVariacoes(produto: ProdutoNaVisao): boolean {
  return (
    produto.variacoes.length > 1 ||
    produto.variacoes.some((variacao) => !variacao.padrao)
  );
}

/** Os grupos que o cliente escolhe no item (o eixo da variação fica fora). */
export function gruposDeOpcoes(produto: ProdutoNaVisao): GrupoNaVisao[] {
  return produto.grupos.filter((grupo) => !grupo.eixoDeVariacao);
}

/** O tipo do grupo como o dono lê: nunca o enum em inglês da API. */
export const ROTULO_DO_TIPO_DE_GRUPO: Readonly<Record<string, string>> = {
  ADDON: "Adicional",
  INGREDIENT: "Ingrediente",
  VARIATION: "Variação",
};

/** "Obrigatório, escolha 1" / "Opcional, até 3". */
export function regraDoGrupo(grupo: GrupoNaVisao): string {
  const obrigatorio = grupo.minimo > 0 ? "Obrigatório" : "Opcional";
  if (grupo.maximo === null) return `${obrigatorio}, sem limite`;
  if (grupo.minimo > 0 && grupo.minimo === grupo.maximo) {
    return `${obrigatorio}, escolha ${grupo.maximo}`;
  }
  return `${obrigatorio}, até ${grupo.maximo}`;
}

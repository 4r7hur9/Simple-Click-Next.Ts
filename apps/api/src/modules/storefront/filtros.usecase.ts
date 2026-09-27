/**
 * Filtros públicos por especificação da categoria (T-312, AC-328).
 *
 * SÓ A ESPECIFICAÇÃO MARCADA COMO FILTRÁVEL VIRA FILTRO — e isso vale nos dois
 * sentidos: ela não é oferecida na tela, e escolhê-la pelo endereço não filtra
 * nada. Um `?filtro=marca=X` com Marca não filtrável é ignorado; se não fosse,
 * o cliente veria uma vitrine vazia por causa de um filtro que nem existe.
 *
 * O QUE O CLIENTE NÃO VÊ NÃO VIRA OPÇÃO. As consultas correm no contexto
 * público da loja, com o isolamento por linha ligado: valor de produto em
 * rascunho, de categoria oculta ou de outra loja nem chega aqui, porque a
 * política do banco recusa a linha antes.
 */
import { transacaoAtual } from "../../core/db.ts";

export interface FiltroDeEspecificacao {
  readonly chave: string;
  readonly nome: string;
  readonly valores: readonly string[];
}

interface LinhaDeFiltro {
  readonly produto_id: string;
  readonly chave: string;
  readonly nome: string;
  readonly valor: string;
}

export interface ConsultaDeFiltros {
  readonly categoria?: string | null | undefined;
  readonly filtros?: readonly string[] | undefined;
}

export function valoresSatisfazemFiltros(
  valores: ReadonlySet<string>,
  filtros: readonly string[],
): boolean {
  return filtros
    .map(partesDoFiltro)
    .filter((item): item is [string, string] => item !== null)
    .every(([chave, valor]) => valores.has(`${chave}=${valor}`));
}

function partesDoFiltro(filtro: string): readonly [string, string] | null {
  const separador = filtro.indexOf("=");
  if (separador <= 0) return null;
  const chave = filtro.slice(0, separador).trim();
  const valor = filtro.slice(separador + 1).trim();
  return chave === "" || valor === "" ? null : [chave, valor];
}

/**
 * Das seleções que chegaram, as que podem filtrar: bem formadas e de uma
 * especificação filtrável. O resto é descartado em silêncio — não é erro do
 * cliente, é endereço velho ou digitado à mão.
 */
export function filtrosAplicaveis(
  selecionados: readonly string[],
  chavesFiltraveis: ReadonlySet<string>,
): string[] {
  return selecionados.filter((filtro) => {
    const partes = partesDoFiltro(filtro);
    return partes !== null && chavesFiltraveis.has(partes[0]);
  });
}

/** Retorna somente valores preenchidos e definições marcadas para filtrar. */
export async function filtrosDaVitrine(
  consulta: ConsultaDeFiltros = {},
): Promise<readonly FiltroDeEspecificacao[]> {
  const tx = transacaoAtual();
  const categoria = consulta.categoria ?? null;
  const linhas = await tx.$queryRaw<LinhaDeFiltro[]>`
    SELECT pa.product_id AS produto_id,
           ad.key AS chave,
           ad.label AS nome,
           COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) AS valor
      FROM app.attribute_definitions ad
      JOIN app.product_attributes pa ON pa.definition_id = ad.id
      JOIN app.products p ON p.id = pa.product_id
      JOIN app.product_categories pc
        ON pc.product_id = p.id AND pc.category_id = ad.category_id
      JOIN app.categories c ON c.id = ad.category_id
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) IS NOT NULL
       AND (${categoria}::text IS NULL OR c.slug = ${categoria})
     ORDER BY ad.sort_order ASC, ad.label ASC,
              pa.value_num ASC NULLS LAST, valor ASC
  `;

  const porChave = new Map<string, { nome: string; valores: Set<string> }>();
  for (const linha of linhas) {
    const atual = porChave.get(linha.chave) ?? {
      nome: linha.nome,
      valores: new Set<string>(),
    };
    atual.valores.add(linha.valor);
    porChave.set(linha.chave, atual);
  }
  return [...porChave].map(([chave, filtro]) => ({
    chave,
    nome: filtro.nome,
    valores: [...filtro.valores],
  }));
}

/**
 * IDs de produtos que satisfazem todos os filtros selecionados, ou
 * `undefined` quando nenhuma seleção pode filtrar — e aí o catálogo sai
 * inteiro, como se o filtro não tivesse sido pedido.
 */
export async function produtosQueCasamComEspecificacoes(
  consulta: ConsultaDeFiltros = {},
): Promise<readonly string[] | undefined> {
  const pedidos = (consulta.filtros ?? []).filter(
    (filtro) => partesDoFiltro(filtro) !== null,
  );
  if (pedidos.length === 0) return undefined;

  const tx = transacaoAtual();
  const categoria = consulta.categoria ?? null;
  const filtraveis = await tx.$queryRaw<{ chave: string }[]>`
    SELECT DISTINCT ad.key AS chave
      FROM app.attribute_definitions ad
      JOIN app.categories c ON c.id = ad.category_id
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND (${categoria}::text IS NULL OR c.slug = ${categoria})
  `;
  const aplicaveis = filtrosAplicaveis(
    pedidos,
    new Set(filtraveis.map((linha) => linha.chave)),
  );
  if (aplicaveis.length === 0) return undefined;

  const linhas = await tx.$queryRaw<LinhaDeFiltro[]>`
    SELECT pa.product_id AS produto_id,
           ad.key AS chave,
           ad.label AS nome,
           COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) AS valor
      FROM app.attribute_definitions ad
      JOIN app.product_attributes pa ON pa.definition_id = ad.id
      JOIN app.products p ON p.id = pa.product_id
      JOIN app.product_categories pc
        ON pc.product_id = p.id AND pc.category_id = ad.category_id
      JOIN app.categories c ON c.id = ad.category_id
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND (${categoria}::text IS NULL OR c.slug = ${categoria})
       AND COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) IS NOT NULL
  `;
  const porProduto = new Map<string, Set<string>>();
  for (const linha of linhas) {
    const conjunto = porProduto.get(linha.produto_id) ?? new Set<string>();
    conjunto.add(`${linha.chave}=${linha.valor}`);
    porProduto.set(linha.produto_id, conjunto);
  }
  return [...porProduto]
    .filter(([, valores]) => valoresSatisfazemFiltros(valores, aplicaveis))
    .map(([produtoId]) => produtoId);
}

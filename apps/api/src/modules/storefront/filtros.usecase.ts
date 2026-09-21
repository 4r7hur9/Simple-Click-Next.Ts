/** Filtros públicos por especificação da categoria (AC-328). */
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
  readonly categoria_slug: string;
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

/** Retorna somente valores preenchidos e definições marcadas para filtrar. */
export async function filtrosDaVitrine(
  consulta: ConsultaDeFiltros = {},
): Promise<readonly FiltroDeEspecificacao[]> {
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaDeFiltro[]>`
    SELECT pa.product_id,
           ad.key AS chave,
           ad.label AS nome,
           COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) AS valor,
           c.slug AS categoria_slug
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
       AND (${consulta.categoria ?? null}::text IS NULL OR c.slug = ${consulta.categoria ?? null})
     ORDER BY ad.sort_order ASC, ad.label ASC, valor ASC
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

/** IDs de produtos que satisfazem todos os filtros selecionados. */
export async function produtosQueCasamComEspecificacoes(
  consulta: ConsultaDeFiltros = {},
): Promise<readonly string[] | undefined> {
  const selecionados = (consulta.filtros ?? [])
    .map(partesDoFiltro)
    .filter((item): item is [string, string] => item !== null);
  if (selecionados.length === 0) return undefined;

  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaDeFiltro[]>`
    SELECT pa.product_id,
           ad.key AS chave,
           ad.label AS nome,
           COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                    pa.value_date::text) AS valor,
           c.slug AS categoria_slug
      FROM app.attribute_definitions ad
      JOIN app.product_attributes pa ON pa.definition_id = ad.id
      JOIN app.products p ON p.id = pa.product_id
      JOIN app.product_categories pc ON pc.product_id = p.id AND pc.category_id = ad.category_id
      JOIN app.categories c ON c.id = ad.category_id
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND (${consulta.categoria ?? null}::text IS NULL OR c.slug = ${consulta.categoria ?? null})
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
    .filter(([, valores]) =>
      valoresSatisfazemFiltros(valores, consulta.filtros ?? []),
    )
    .map(([produtoId]) => produtoId);
}

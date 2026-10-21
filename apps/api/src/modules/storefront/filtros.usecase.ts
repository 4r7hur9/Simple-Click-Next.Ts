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
  // AGRUPADO NO BANCO e com o vínculo produto–categoria ligando a definição ao
  // valor pela chave (loja, produto, definição): numa loja de dez mil
  // produtos, devolver uma linha por produto e deixar o planejador escolher a
  // junção sob o isolamento por linha levava segundos (card #74).
  const linhas = await tx.$queryRaw<Omit<LinhaDeFiltro, "produto_id">[]>`
    SELECT ad.key AS chave,
           min(ad.label) AS nome,
           v.valor
      FROM app.attribute_definitions ad
      JOIN app.categories c ON c.id = ad.category_id
      JOIN app.product_categories pc
        ON pc.category_id = ad.category_id AND pc.store_id = ad.store_id
      JOIN app.product_attributes pa
        ON pa.store_id = pc.store_id
       AND pa.product_id = pc.product_id
       AND pa.definition_id = ad.id
      JOIN app.products p ON p.id = pa.product_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                        pa.value_date::text) AS valor
      ) v
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND v.valor IS NOT NULL
       AND (${categoria}::text IS NULL OR c.slug = ${categoria})
     GROUP BY ad.key, v.valor
     ORDER BY min(ad.sort_order) ASC, min(ad.label) ASC,
              min(pa.value_num) ASC NULLS LAST, v.valor ASC
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
  // Só as especificações pedidas: as outras não decidem quem casa.
  const chavesPedidas = [
    ...new Set(aplicaveis.flatMap((filtro) => partesDoFiltro(filtro)?.[0] ?? [])),
  ];

  const linhas = await tx.$queryRaw<LinhaDeFiltro[]>`
    SELECT pa.product_id AS produto_id,
           ad.key AS chave,
           ad.label AS nome,
           v.valor
      FROM app.attribute_definitions ad
      JOIN app.categories c ON c.id = ad.category_id
      JOIN app.product_categories pc
        ON pc.category_id = ad.category_id AND pc.store_id = ad.store_id
      JOIN app.product_attributes pa
        ON pa.store_id = pc.store_id
       AND pa.product_id = pc.product_id
       AND pa.definition_id = ad.id
      JOIN app.products p ON p.id = pa.product_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(pa.value_text, pa.value_num::text, pa.value_bool::text,
                        pa.value_date::text) AS valor
      ) v
     WHERE ad.is_filterable = true
       AND ad.deprecated_at IS NULL
       AND (${categoria}::text IS NULL OR c.slug = ${categoria})
       AND v.valor IS NOT NULL
       AND ad.key = ANY(${chavesPedidas}::text[])
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

// ---------------------------------------------------------------------------
// Atacado (card #59)
// ---------------------------------------------------------------------------

/** Um produto com preço de atacado e o pedido mínimo dele (a menor faixa). */
export interface ProdutoComAtacado {
  readonly id: string;
  readonly pedidoMinimo: number;
}

/**
 * Os produtos da loja do contexto com AO MENOS UMA faixa de atacado ativa
 * agora: linha `WHOLESALE` ligada e dentro da janela de vigência. Vale a faixa
 * nova (com desconto, card #53) e o atacado antigo de preço fixo.
 *
 * UMA consulta agrupada, apoiada no índice `product_prices_do_produto_idx`
 * (loja, produto, tipo, quantidade). O isolamento por linha faz o resto:
 * produto em rascunho, de outra loja ou de categoria oculta não chega aqui.
 */
export async function produtosComAtacado(
  agora: Date = new Date(),
): Promise<readonly ProdutoComAtacado[]> {
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<{ id: string; minimo: number }[]>`
    SELECT pp.product_id::text AS id, min(pp.min_quantity)::int AS minimo
      FROM app.product_prices pp
      JOIN app.products p
        ON p.id = pp.product_id AND p.store_id = pp.store_id
     WHERE pp.kind = 'WHOLESALE'
       AND pp.is_active
       AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
       AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})
       -- Como a regra do core: faixa que não baixa o preço não é atacado
       -- (desconto em reais >= preço, ou preço fixo >= varejo).
       AND NOT coalesce(
             (pp.discount_kind = 'AMOUNT'
                AND pp.discount_value >= p.display_price_cents)
             OR (pp.discount_kind IS NULL
                AND pp.amount_cents >= p.display_price_cents),
             false)
     GROUP BY pp.product_id
  `;
  return linhas.map((linha) => ({
    id: linha.id,
    pedidoMinimo: Number(linha.minimo),
  }));
}

/**
 * Dos produtos com atacado, os que passam no pedido mínimo pedido: quem quer
 * comprar até N unidades só vê o que já dá atacado com N. Sem limite, todos.
 */
export function atacadoDentroDoPedidoMinimo(
  produtos: readonly ProdutoComAtacado[],
  pedidoMinimo?: number | undefined,
): readonly string[] {
  return produtos
    .filter(
      (produto) =>
        pedidoMinimo === undefined || produto.pedidoMinimo <= pedidoMinimo,
    )
    .map((produto) => produto.id);
}

/**
 * A faceta de atacado: quantos dos produtos que já casam com a busca e as
 * especificações (`acertos`, ou o catálogo inteiro quando `undefined`) têm
 * atacado, e o menor pedido mínimo entre eles — para a tela dizer "Atacado (12)"
 * antes de o cliente ligar o filtro.
 */
export function facetaDeAtacado(
  produtos: readonly ProdutoComAtacado[],
  acertos: readonly string[] | undefined,
): { produtos: number; menorPedidoMinimo: number | null } {
  const permitidos = acertos === undefined ? undefined : new Set(acertos);
  const dentro = produtos.filter(
    (produto) => permitidos === undefined || permitidos.has(produto.id),
  );
  return {
    produtos: dentro.length,
    menorPedidoMinimo:
      dentro.length === 0
        ? null
        : Math.min(...dentro.map((produto) => produto.pedidoMinimo)),
  };
}

/**
 * O catálogo público em pedaços (card #74).
 *
 * POR QUE EXISTE. O catálogo inteiro (`catalogo.usecase.ts`) monta todas as
 * seções com todos os produtos numa resposta só. Numa loja de autopeças com dez
 * mil itens isso dá quase 4 MB — passa do que o cache do site guarda, e a tela
 * de UMA categoria baixava as dez mil para descartar quase tudo. Aqui o banco
 * filtra, ordena e corta; a resposta tem o tamanho do que a tela mostra.
 *
 * DUAS PERGUNTAS:
 * - o RESUMO: quais seções existem, quantos produtos cada uma tem com os
 *   filtros em vigor e, se pedido, os primeiros N de cada uma;
 * - a PÁGINA: os próximos N produtos de uma lista (uma categoria, ou todas),
 *   na ordem pedida, com o cursor da página seguinte.
 *
 * O ISOLAMENTO CONTINUA SENDO DO BANCO, como no catálogo inteiro: as consultas
 * correm no contexto público da loja e juntam `products` e `categories`, cujas
 * políticas recusam rascunho, categoria oculta e linha de outra loja. Por isso
 * nenhum filtro de status aparece aqui.
 *
 * O CURSOR É OPACO. Hoje ele guarda a posição na lista; quem chama só devolve o
 * que recebeu. Cursor ilegível volta ao começo em vez de errar: é endereço
 * velho, e o pior que acontece é a lista recomeçar.
 */
import {
  PAGINA_PADRAO_DO_CATALOGO,
  type OrdemDoCatalogoNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import {
  cartoesDosProdutos,
  type ProdutoNaVitrine,
} from "./catalogo.usecase.ts";

/** Quantos destaques o resumo traz, no máximo. */
export const MAXIMO_DE_DESTAQUES = PAGINA_PADRAO_DO_CATALOGO;

/** Escreve a posição como cursor (base64url de JSON). */
export function codificarCursor(posicao: number): string {
  return Buffer.from(JSON.stringify({ p: posicao })).toString("base64url");
}

/** Lê o cursor. Ausente, ilegível ou negativo volta ao começo da lista. */
export function lerCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  try {
    const lido: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    const posicao =
      typeof lido === "object" && lido !== null && "p" in lido
        ? (lido as { p: unknown }).p
        : null;
    return typeof posicao === "number" &&
      Number.isSafeInteger(posicao) &&
      posicao >= 0
      ? posicao
      : 0;
  } catch {
    return 0;
  }
}

/**
 * O cursor da página seguinte, ou nulo quando a lista acabou.
 */
export function proximoCursor(
  posicao: number,
  quantos: number,
  total: number,
): string | null {
  const seguinte = posicao + quantos;
  return quantos > 0 && seguinte < total ? codificarCursor(seguinte) : null;
}

/** Os filtros que já viraram lista de produtos (busca, especificação, atacado). */
interface Acertos {
  /** `undefined` = sem filtro; lista vazia = filtro sem acerto. */
  readonly apenasProdutos?: readonly string[] | undefined;
  /**
   * A lista acima já vem na ordem de relevância (busca, card #75): a ordem
   * "relevancia" segue a lista, e não a do dono.
   */
  readonly ordenarPelosAcertos?: boolean | undefined;
}

export interface SecaoNoResumo {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly total: number;
  readonly produtos: readonly ProdutoNaVitrine[];
  readonly proximoCursor: string | null;
}

export interface ResumoDoCatalogo {
  readonly secoes: readonly SecaoNoResumo[];
  readonly destaques: readonly ProdutoNaVitrine[];
}

export interface PedidoDoResumo extends Acertos {
  /** Quantos produtos de cada seção vêm junto. Zero = só as contagens. */
  readonly porSecao?: number | undefined;
  /** Teto somando as seções; reparte `porSecao` entre elas. */
  readonly totalMaximo?: number | undefined;
}

/** O menor número de produtos por seção quando há teto. */
export const MINIMO_POR_SECAO = 4;

/**
 * Quantos produtos cada seção traz: `porSecao`, apertado pelo teto repartido
 * entre as seções, mas nunca abaixo de `MINIMO_POR_SECAO` (nem acima do pedido).
 */
export function produtosPorSecao(
  porSecao: number,
  secoes: number,
  totalMaximo?: number | undefined,
): number {
  if (porSecao <= 0) return 0;
  if (totalMaximo === undefined || secoes <= 0) return porSecao;
  const repartido = Math.floor(totalMaximo / secoes);
  return Math.min(porSecao, Math.max(MINIMO_POR_SECAO, repartido));
}

/**
 * As seções com a contagem e, se pedido, os primeiros produtos de cada uma.
 *
 * UMA consulta para todas as seções, com a numeração por seção feita pelo
 * banco (`row_number`): doze seções não viram doze idas ao banco.
 */
export async function resumoDoCatalogo(
  {
    apenasProdutos,
    ordenarPelosAcertos = false,
    porSecao: pedido = 0,
    totalMaximo,
  }: PedidoDoResumo,
  agora: Date = new Date(),
): Promise<ResumoDoCatalogo> {
  const tx = transacaoAtual();
  const filtrando = apenasProdutos !== undefined;
  const ids = [...(apenasProdutos ?? [])];
  const categorias = await tx.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true },
  });
  // Com filtro, o teto se reparte só entre as seções que tiveram acerto (as
  // outras somem): lê-se até `pedido` de cada uma e corta-se depois de saber
  // quantas sobraram. Sem filtro, todas as seções aparecem.
  const porSecaoSemFiltro = produtosPorSecao(
    pedido,
    categorias.length,
    totalMaximo,
  );
  const corte = Math.max(filtrando ? pedido : porSecaoSemFiltro, 1);

  // Os acertos entram por junção, e não por `= ANY(lista)`: uma busca larga
  // traz milhares de ids, e comparar cada vínculo com a lista inteira custa
  // milhares × milhares.
  const linhas = await tx.$queryRaw<
    { categoria: string; produto: string; posicao: number; total: number }[]
  >`
    WITH acerto AS (
      SELECT a.id, a.pos
        FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS a(id, pos)
    )
    SELECT x.category_id::text AS categoria,
           x.product_id::text AS produto,
           x.posicao::int AS posicao,
           x.total::int AS total
      FROM (
        SELECT pc.category_id,
               pc.product_id,
               row_number() OVER (
                 PARTITION BY pc.category_id
                 ORDER BY CASE WHEN ${ordenarPelosAcertos} THEN r.pos END,
                          pc.sort_order, p.name, p.id
               ) AS posicao,
               count(*) OVER (PARTITION BY pc.category_id) AS total
          FROM app.product_categories pc
          JOIN app.products p ON p.id = pc.product_id
          JOIN app.categories c ON c.id = pc.category_id
          LEFT JOIN acerto r ON r.id = pc.product_id
         WHERE (NOT ${filtrando} OR r.id IS NOT NULL)
      ) x
     WHERE x.posicao <= ${corte}
     ORDER BY x.category_id, x.posicao
  `;

  const totalPorSecao = new Map<string, number>();
  for (const linha of linhas) {
    totalPorSecao.set(linha.categoria, Number(linha.total));
  }
  const porSecao = filtrando
    ? produtosPorSecao(pedido, totalPorSecao.size, totalMaximo)
    : porSecaoSemFiltro;
  const idsPorSecao = new Map<string, string[]>();
  for (const linha of linhas) {
    if (porSecao > 0 && linha.posicao <= porSecao) {
      const lista = idsPorSecao.get(linha.categoria) ?? [];
      lista.push(linha.produto);
      idsPorSecao.set(linha.categoria, lista);
    }
  }

  // COM FILTRO NÃO HÁ DESTAQUES, como no catálogo inteiro: quem buscou pediu
  // outra coisa. Sem filtro, os primeiros da ordem do dono.
  const idsDosDestaques = filtrando
    ? []
    : (
        await tx.product.findMany({
          where: { isFeatured: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true },
          take: MAXIMO_DE_DESTAQUES,
        })
      ).map((linha) => linha.id);

  // Os cartões de todas as seções e dos destaques numa leitura só.
  const todos = [
    ...new Set([...[...idsPorSecao.values()].flat(), ...idsDosDestaques]),
  ];
  const cartoes = new Map(
    (await cartoesDosProdutos(todos, agora)).map((c) => [c.id, c]),
  );
  const emCartoes = (lista: readonly string[]) =>
    lista.flatMap((id) => {
      const cartao = cartoes.get(id);
      return cartao === undefined ? [] : [cartao];
    });

  const secoes = categorias
    .map((categoria) => {
      const total = totalPorSecao.get(categoria.id) ?? 0;
      const produtos = emCartoes(idsPorSecao.get(categoria.id) ?? []);
      return {
        id: categoria.id,
        apelido: categoria.slug,
        nome: categoria.name,
        total,
        produtos,
        proximoCursor:
          porSecao > 0 ? proximoCursor(0, produtos.length, total) : null,
      };
    })
    // Com filtro, seção sem acerto some (AC-408); sem filtro, fica — o dono a
    // criou e a tela explica que está sendo montada.
    .filter((secao) => !filtrando || secao.total > 0);

  return {
    secoes,
    destaques: emCartoes(idsDosDestaques),
  };
}

export interface PedidoDaPagina extends Acertos {
  /** Apelido da categoria; ausente = todas as seções, cada produto uma vez. */
  readonly categoria?: string | null | undefined;
  readonly ordem?: OrdemDoCatalogoNoContrato | undefined;
  readonly cursor?: string | undefined;
  readonly limite?: number | undefined;
}

export interface PaginaDoCatalogo {
  readonly produtos: readonly ProdutoNaVitrine[];
  readonly total: number;
  readonly proximoCursor: string | null;
}

/**
 * Uma página de produtos, filtrada e ordenada pelo banco.
 *
 * SÓ ENTRA PRODUTO QUE ESTÁ NUMA SEÇÃO VISÍVEL (a da categoria pedida, ou
 * qualquer uma), como no catálogo inteiro: produto sem categoria só aparece
 * nos destaques.
 *
 * A ORDEM POR PREÇO usa o preço que o cartão mostra — a promoção vigente, se
 * houver; senão o preço base vigente; sem preço cadastrado, o de exibição. Sem
 * preço único ("Ver opções") vai para o fim nas duas direções. Empate fica na
 * ordem do dono. Com busca, a ordem "relevancia" é a dos acertos (card #75).
 */
export async function paginaDoCatalogo(
  {
    apenasProdutos,
    ordenarPelosAcertos = false,
    categoria = null,
    ordem = "relevancia",
    cursor,
    limite = PAGINA_PADRAO_DO_CATALOGO,
  }: PedidoDaPagina,
  agora: Date = new Date(),
): Promise<PaginaDoCatalogo> {
  const tx = transacaoAtual();
  const filtrando = apenasProdutos !== undefined;
  const ids = [...(apenasProdutos ?? [])];
  const posicao = lerCursor(cursor);
  const apelido = categoria === "" ? null : categoria;

  // O preço do cartão, em SQL. Só é calculado quando a ordem usa preço: o CASE
  // não avalia a subconsulta nas outras ordens.
  //
  // A LISTA COMEÇA PELOS VÍNCULOS, e não pelos produtos: com categoria, o
  // índice (loja, categoria, ordem) entrega só os dela; sem categoria, cada
  // produto entra uma vez, com a menor posição entre as seções.
  const linhas = await tx.$queryRaw<{ id: string; total: number }[]>`
    WITH acerto AS (
      SELECT a.id, a.pos
        FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS a(id, pos)
    ),
    lista AS (
      SELECT pc.product_id, min(pc.sort_order) AS ordem
        FROM app.product_categories pc
        JOIN app.categories c ON c.id = pc.category_id
       WHERE (${apelido}::text IS NULL OR c.slug = ${apelido}::text)
       GROUP BY pc.product_id
    )
    SELECT p.id::text AS id, count(*) OVER ()::int AS total
      FROM lista l
      JOIN app.products p ON p.id = l.product_id
      LEFT JOIN acerto r ON r.id = p.id
      -- O preço que vale, UMA vez por produto e só nas ordens que o usam. É por
      -- produto (sonda o índice de preços) e NÃO uma agregação da loja inteira:
      -- a agregação depende de estatística do banco, e numa loja que acabou de
      -- importar o catálogo (sem ANALYZE) o planejador a refazia por produto.
      LEFT JOIN LATERAL (
        SELECT CASE WHEN ${ordem} IN
                 ('menor-preco', 'maior-preco', 'maior-desconto-atacado')
               THEN (
        -- >>> preco que vale
        SELECT CASE WHEN count(*) = 0 THEN p.display_price_cents
                    ELSE coalesce(
                      min(pp.amount_cents) FILTER (
                        WHERE pp.kind = 'PROMO' AND pp.is_active
                          AND pp.min_quantity <= 1
                          AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
                          AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})),
                      min(pp.amount_cents) FILTER (
                        WHERE pp.kind = 'BASE' AND pp.is_active
                          AND pp.min_quantity <= 1
                          AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
                          AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})))
               END
          FROM app.product_prices pp
         WHERE pp.product_id = p.id
           AND pp.store_id = p.store_id
           AND pp.variant_id IS NULL
        -- <<< preco que vale
               ) END AS varejo
      ) pr ON true
      -- O maior desconto de atacado, em fração do varejo, só nessa ordem. A
      -- conta é em numeric (com bigint a divisão cortaria a fração) e o divisor
      -- nunca é zero. Mesma regra de unitarioNaFaixa (packages/core).
      LEFT JOIN LATERAL (
        SELECT CASE WHEN ${ordem} = 'maior-desconto-atacado' THEN (
          SELECT max((pr.varejo - u.unitario)::numeric / NULLIF(pr.varejo, 0))
            FROM app.product_prices w
           CROSS JOIN LATERAL (
             SELECT CASE w.discount_kind
                      WHEN 'PERCENT'
                        THEN (pr.varejo * (100 - w.discount_value) + 50) / 100
                      WHEN 'AMOUNT' THEN pr.varejo - w.discount_value
                      ELSE w.amount_cents
                    END AS unitario) u
           WHERE w.product_id = p.id
             AND w.store_id = p.store_id
             AND w.variant_id IS NULL
             AND w.kind = 'WHOLESALE'
             AND w.is_active
             AND w.min_quantity >= 2
             AND (w.starts_at IS NULL OR w.starts_at <= ${agora})
             AND (w.ends_at IS NULL OR w.ends_at > ${agora})
             AND pr.varejo > 0
             AND u.unitario >= 1
             AND u.unitario < pr.varejo
        ) END AS desconto
      ) de ON true
     WHERE (NOT ${filtrando} OR r.id IS NOT NULL)
     ORDER BY
       CASE WHEN ${ordem} = 'menor-preco' THEN pr.varejo END ASC NULLS LAST,
       CASE WHEN ${ordem} = 'maior-preco' THEN pr.varejo END DESC NULLS LAST,
       CASE WHEN ${ordem} = 'maior-desconto-atacado' THEN de.desconto END
         DESC NULLS LAST,
       -- Lançamentos: o cadastro mais recente primeiro; o desempate é fixo.
       CASE WHEN ${ordem} = 'lancamentos' THEN p.created_at END DESC,
       CASE WHEN ${ordem} = 'lancamentos' THEN p.id END DESC,
       CASE WHEN ${ordem} = 'a-z' THEN lower(app.sem_acento(p.name)) END ASC,
       CASE WHEN ${ordenarPelosAcertos} AND ${ordem} = 'relevancia'
            THEN r.pos END ASC,
       CASE WHEN ${apelido}::text IS NULL THEN p.sort_order ELSE l.ordem END ASC,
       p.name ASC,
       p.id ASC
     LIMIT ${limite} OFFSET ${posicao}
  `;

  // Página além do fim não traz o total na linha; conta-se à parte.
  const total =
    linhas[0] !== undefined
      ? Number(linhas[0].total)
      : posicao === 0
        ? 0
        : await contarLista(apelido, filtrando, ids);

  const produtos = await cartoesDosProdutos(
    linhas.map((linha) => linha.id),
    agora,
  );
  return {
    produtos,
    total,
    proximoCursor: proximoCursor(posicao, linhas.length, total),
  };
}

/**
 * Os produtos cujo preço que vale cai na faixa pedida, em CENTAVOS e com os
 * dois limites INCLUSIVOS (card #108). `undefined` num limite é "sem limite".
 *
 * SÓ ENTRA PRODUTO DE PREÇO ÚNICO: sem variação, ou com variações do mesmo
 * preço. Produto "Ver opções" (variações de preços diferentes) não entra por um
 * preço que o cartão não mostra — e o preço de exibição dele, que o trecho
 * abaixo usa quando não há linha de preço do produto, não é um preço único.
 *
 * O trecho `preco que vale` é IDÊNTICO ao da ordenação por preço, acima: o
 * cartão, a ordem e o filtro precisam concordar. `preco-que-vale.onp.test.ts`
 * confere que as duas REGRAS (promoção vigente, senão preço base vigente) são o
 * mesmo texto. Aqui os preços são AGREGADOS numa leitura só, porque o filtro
 * olha todos os produtos e a conta por produto custava o dobro (59 ms contra 29
 * ms em 10.000 produtos); na página, com ordenação, a conta é por produto e usa
 * o índice, que não depende de estatística do banco. Sem `agora` fixo a promoção
 * pode virar entre uma leitura e outra, então a rota passa o mesmo instante.
 */
export async function produtosNaFaixaDePreco(
  limites: {
    readonly minimo?: number | undefined;
    readonly maximo?: number | undefined;
  },
  agora: Date = new Date(),
): Promise<readonly string[]> {
  const minimo = limites.minimo ?? null;
  const maximo = limites.maximo ?? null;
  const linhas = await transacaoAtual().$queryRaw<{ id: string }[]>`
    WITH precos AS (
        -- >>> preco que vale
        SELECT pp.store_id, pp.product_id,
               coalesce(
                 min(pp.amount_cents) FILTER (
                   WHERE pp.kind = 'PROMO' AND pp.is_active
                     AND pp.min_quantity <= 1
                     AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
                     AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})),
                 min(pp.amount_cents) FILTER (
                   WHERE pp.kind = 'BASE' AND pp.is_active
                     AND pp.min_quantity <= 1
                     AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
                     AND (pp.ends_at IS NULL OR pp.ends_at > ${agora}))
               ) AS valor
          FROM app.product_prices pp
         WHERE pp.variant_id IS NULL
         GROUP BY pp.store_id, pp.product_id
        -- <<< preco que vale
    )
    SELECT p.id::text AS id
      FROM app.products p
      LEFT JOIN precos pc ON pc.product_id = p.id AND pc.store_id = p.store_id
     CROSS JOIN LATERAL (
       SELECT CASE WHEN pc.product_id IS NULL THEN p.display_price_cents
                   ELSE pc.valor END AS varejo
     ) pr
     WHERE (NOT p.has_variants OR p.price_min_cents = p.price_max_cents)
       AND pr.varejo IS NOT NULL
       AND (${minimo}::bigint IS NULL OR pr.varejo >= ${minimo}::bigint)
       AND (${maximo}::bigint IS NULL OR pr.varejo <= ${maximo}::bigint)
  `;
  return linhas.map((linha) => linha.id);
}

async function contarLista(
  apelido: string | null,
  filtrando: boolean,
  ids: readonly string[],
): Promise<number> {
  const [contagem] = await transacaoAtual().$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total
      FROM app.products p
     WHERE (NOT ${filtrando}
            OR p.id IN (SELECT unnest(${[...ids]}::uuid[])))
       AND EXISTS (
         SELECT 1
           FROM app.product_categories pc
           JOIN app.categories c ON c.id = pc.category_id
          WHERE pc.product_id = p.id
            AND (${apelido}::text IS NULL OR c.slug = ${apelido}::text))
  `;
  return Number(contagem?.total ?? 0);
}

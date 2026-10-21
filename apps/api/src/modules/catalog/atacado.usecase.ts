/**
 * Faixas de atacado do produto no painel (card #54).
 *
 * A FAIXA É DO PRODUTO: uma linha `WHOLESALE` de `app.product_prices` com
 * `discount_kind`/`discount_value`, `variant_id` nulo e `amount_cents = 0`
 * (migração 0064). Ela vale para todas as variações, cada uma com o seu preço
 * de varejo. O painel lê e REGRAVA a lista inteira; lista vazia = só varejo.
 *
 * As colunas novas ainda não estão no `schema.prisma`, por isso a leitura e a
 * gravação das faixas vão por SQL. A RLS da loja vale do mesmo jeito: a
 * transação já roda com o `app.store_id` da requisição.
 *
 * As travas são as do card #53, conferidas aqui antes do banco: quantidade a
 * partir de 2, uma faixa por quantidade, o mesmo tipo de desconto, desconto
 * crescente e desconto em reais menor que o preço. O gatilho da 0064 confere
 * de novo no fim da transação.
 */
import {
  esquemaDasFaixasDeAtacado,
  TIPO_DE_DESCONTO_NO_BANCO,
  type AtacadoDoProdutoNoContrato,
  type FaixaDeAtacadoNoContrato,
  type FaixaGravadaNoContrato,
  type TipoDeDescontoDoAtacado,
} from "@simpleclick/contracts";
import {
  faixasValidas,
  problemasDasFaixas,
  type FaixaDeAtacado,
  type ProblemaDaFaixa,
} from "@simpleclick/core";
import type { z } from "zod";

import type { TransacaoDoBanco } from "../../core/db.ts";

export type { ProblemaDaFaixa };

/** As faixas não passaram nas travas; a tela aponta a linha de cada problema. */
export class ErroDasFaixasDeAtacado extends Error {
  readonly problemas: readonly ProblemaDaFaixa[];

  constructor(problemas: readonly ProblemaDaFaixa[]) {
    super("faixas_invalidas");
    this.name = "ErroDasFaixasDeAtacado";
    this.problemas = problemas;
  }
}

/** O corpo da recusa, igual em todas as rotas que gravam faixa ou preço. */
export function recusaDasFaixas(problemas: readonly ProblemaDaFaixa[]) {
  return { erro: "faixas_invalidas", problemas };
}

/** O nome do banco de volta para o do contrato. */
function tipoDoBanco(valor: string): TipoDeDescontoDoAtacado {
  return valor === TIPO_DE_DESCONTO_NO_BANCO.VALOR ? "VALOR" : "PERCENTUAL";
}

/** A faixa gravada na forma que a regra do core entende. */
export function comoFaixaDoCore(faixa: {
  readonly quantidadeMinima: number;
  readonly tipoDeDesconto: TipoDeDescontoDoAtacado;
  readonly desconto: number;
  readonly rotulo?: string | null | undefined;
}): FaixaDeAtacado {
  return {
    quantidadeMinima: faixa.quantidadeMinima,
    tipoDeDesconto: faixa.tipoDeDesconto,
    desconto: faixa.desconto,
    rotulo: faixa.rotulo ?? null,
  };
}

/**
 * Os problemas de uma lista de faixas: primeiro o formato (o esquema do
 * contrato), depois o preço — desconto em reais tem de ser menor que o menor
 * preço de varejo do produto.
 */
export function conferirFaixas(
  entrada: unknown,
  menorPrecoEmCentavos: number | null,
):
  | { readonly ok: true; readonly faixas: FaixaDeAtacadoNoContrato[] }
  | { readonly ok: false; readonly problemas: ProblemaDaFaixa[] } {
  const lido = esquemaDasFaixasDeAtacado.safeParse(entrada);
  if (!lido.success)
    return { ok: false, problemas: problemasDoZod(lido.error) };
  const problemas = problemasDasFaixas(
    lido.data.map(comoFaixaDoCore),
    menorPrecoEmCentavos,
  );
  return problemas.length > 0
    ? { ok: false, problemas }
    : { ok: true, faixas: lido.data };
}

/** As mensagens do esquema, com a linha de cada uma quando há. */
export function problemasDoZod(erro: z.ZodError): ProblemaDaFaixa[] {
  const vistos = new Set<string>();
  const problemas: ProblemaDaFaixa[] = [];
  for (const problema of erro.issues) {
    // O caminho é [i, campo] na lista, ou ["faixas", i, campo] no corpo.
    const indice = problema.path.find((parte) => typeof parte === "number");
    const item = {
      indice: typeof indice === "number" ? indice : null,
      mensagem: problema.message,
    };
    const chave = `${item.indice}:${item.mensagem}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    problemas.push(item);
  }
  return problemas;
}

/**
 * O atacado para um preço de varejo: as faixas que cabem nele, já em preço, e
 * o pedido mínimo. Nulo = só varejo (sem faixa, sem preço ou nenhuma cabe).
 * Só as faixas ligadas entram.
 */
export function atacadoDoPreco(
  varejoEmCentavos: number | null,
  faixas: readonly FaixaGravadaNoContrato[],
): AtacadoDoProdutoNoContrato | null {
  if (varejoEmCentavos === null || varejoEmCentavos <= 0) return null;
  const validas = faixasValidas(
    varejoEmCentavos,
    faixas.filter((f) => f.ativo).map(comoFaixaDoCore),
  );
  const primeira = validas[0];
  if (primeira === undefined) return null;
  return {
    pedidoMinimo: primeira.quantidadeMinima,
    faixas: validas.map((f) => ({
      quantidadeMinima: f.quantidadeMinima,
      tipoDeDesconto: f.tipoDeDesconto,
      desconto: f.desconto,
      rotulo: f.rotulo,
      unitarioCentavos: f.unitarioEmCentavos,
      descontoPorUnidadeCentavos: f.descontoPorUnidadeEmCentavos,
    })),
  };
}

// ── Banco ──────────────────────────────────────────────────────────────────

type LinhaDaFaixa = {
  readonly id: string;
  readonly produto: string;
  readonly quantidade: number;
  readonly tipo: string;
  readonly valor: bigint | number;
  readonly rotulo: string | null;
  readonly ativo: boolean;
};

function faixaDaLinha(linha: LinhaDaFaixa): FaixaGravadaNoContrato {
  return {
    id: linha.id,
    quantidadeMinima: Number(linha.quantidade),
    tipoDeDesconto: tipoDoBanco(linha.tipo),
    desconto: Number(linha.valor),
    rotulo: linha.rotulo,
    ativo: linha.ativo,
  };
}

/** As faixas de vários produtos de uma vez, em ordem de quantidade. */
export async function lerFaixasDosProdutos(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoIds: readonly string[],
): Promise<Map<string, FaixaGravadaNoContrato[]>> {
  const porProduto = new Map<string, FaixaGravadaNoContrato[]>();
  if (produtoIds.length === 0) return porProduto;
  const linhas = await tx.$queryRaw<LinhaDaFaixa[]>`
    SELECT id::text, product_id::text AS produto, min_quantity AS quantidade,
           discount_kind AS tipo, discount_value AS valor, label AS rotulo,
           is_active AS ativo
      FROM app.product_prices
     WHERE store_id = ${lojaId}::uuid
       AND product_id = ANY(${[...produtoIds]}::uuid[])
       AND kind = 'WHOLESALE' AND discount_kind IS NOT NULL
     ORDER BY min_quantity, created_at`;
  for (const linha of linhas) {
    const doProduto = porProduto.get(linha.produto) ?? [];
    doProduto.push(faixaDaLinha(linha));
    porProduto.set(linha.produto, doProduto);
  }
  return porProduto;
}

/** As faixas de um produto, em ordem de quantidade. */
export async function lerFaixasDeAtacado(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<FaixaGravadaNoContrato[]> {
  return (
    (await lerFaixasDosProdutos(tx, lojaId, [produtoId])).get(produtoId) ?? []
  );
}

/**
 * O pedido mínimo de atacado de cada produto, para a lista do painel: a menor
 * quantidade entre as linhas `WHOLESALE` ligadas e vigentes agora — faixa com
 * desconto ou atacado antigo de preço fixo. A regra é a do filtro "Atacado"
 * da vitrine (card #59): linha que não baixa o preço não conta. Produto fora
 * do mapa só vende no varejo.
 */
export async function pedidoMinimoDosProdutos(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoIds: readonly string[],
  agora: Date = new Date(),
): Promise<Map<string, number>> {
  const porProduto = new Map<string, number>();
  if (produtoIds.length === 0) return porProduto;
  const linhas = await tx.$queryRaw<{ id: string; minimo: number }[]>`
    SELECT pp.product_id::text AS id, min(pp.min_quantity)::int AS minimo
      FROM app.product_prices pp
      JOIN app.products p
        ON p.id = pp.product_id AND p.store_id = pp.store_id
     WHERE pp.store_id = ${lojaId}::uuid
       AND pp.product_id = ANY(${[...produtoIds]}::uuid[])
       AND pp.kind = 'WHOLESALE'
       AND pp.is_active
       AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
       AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})
       AND NOT coalesce(
             (pp.discount_kind = 'AMOUNT'
                AND pp.discount_value >= p.display_price_cents)
             OR (pp.discount_kind IS NULL
                AND pp.amount_cents >= p.display_price_cents),
             false)
     GROUP BY pp.product_id`;
  for (const linha of linhas) porProduto.set(linha.id, Number(linha.minimo));
  return porProduto;
}

/**
 * O menor preço de varejo do produto, como o gatilho da 0064 o vê: o menor
 * preço BASE ligado (do produto ou de qualquer variação); sem tabela de
 * preços, o preço gravado no próprio produto.
 */
export async function menorPrecoDeVarejo(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<number | null> {
  const [linha] = await tx.$queryRaw<{ menor: bigint | number | null }[]>`
    SELECT coalesce(
             (SELECT min(amount_cents)
                FROM app.product_prices
               WHERE store_id = ${lojaId}::uuid
                 AND product_id = ${produtoId}::uuid
                 AND kind = 'BASE' AND is_active),
             (SELECT display_price_cents
                FROM app.products
               WHERE id = ${produtoId}::uuid AND store_id = ${lojaId}::uuid)
           ) AS menor`;
  return linha?.menor === null || linha?.menor === undefined
    ? null
    : Number(linha.menor);
}

/**
 * Confere as faixas JÁ GRAVADAS contra o preço de agora. Quem muda o preço
 * (do produto ou de uma variação) chama isto depois de gravar: o banco não
 * recusa a troca do preço, e uma faixa de R$ 5,00 num produto de R$ 4,00
 * deixaria de valer sem ninguém avisar o dono.
 */
export async function exigirFaixasNoPreco(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<void> {
  const faixas = await lerFaixasDeAtacado(tx, lojaId, produtoId);
  if (!faixas.some((f) => f.tipoDeDesconto === "VALOR")) return;
  const menor = await menorPrecoDeVarejo(tx, lojaId, produtoId);
  const problemas = problemasDasFaixas(faixas.map(comoFaixaDoCore), menor);
  if (problemas.length > 0) throw new ErroDasFaixasDeAtacado(problemas);
}

/**
 * Regrava TODAS as faixas do produto (lista vazia apaga). Confere as travas
 * antes e devolve as faixas como ficaram. O produto já tem de ser da loja.
 *
 * Produto sem nenhuma linha de preço ganha o preço BASE junto, como na rota
 * dos preços: só com a faixa, o carrinho não acharia o preço de varejo.
 */
export async function gravarFaixasDeAtacado(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
  entrada: unknown,
): Promise<FaixaGravadaNoContrato[]> {
  // Uma regravação por vez no mesmo produto: duas abas salvando juntas não
  // colidem no índice de "uma faixa por quantidade".
  await tx.$queryRaw`
    SELECT 1 FROM app.products
     WHERE id = ${produtoId}::uuid AND store_id = ${lojaId}::uuid
       FOR UPDATE`;

  const menor = await menorPrecoDeVarejo(tx, lojaId, produtoId);
  const conferido = conferirFaixas(entrada, menor);
  if (!conferido.ok) throw new ErroDasFaixasDeAtacado(conferido.problemas);

  await tx.$executeRaw`
    DELETE FROM app.product_prices
     WHERE store_id = ${lojaId}::uuid AND product_id = ${produtoId}::uuid
       AND kind = 'WHOLESALE' AND discount_kind IS NOT NULL`;
  if (conferido.faixas.length === 0) return [];

  const doProduto = await tx.productPrice.count({
    where: { storeId: lojaId, productId: produtoId, variantId: null },
  });
  if (doProduto === 0) {
    const produto = await tx.product.findFirst({
      where: { id: produtoId, storeId: lojaId },
      select: { displayPriceCents: true },
    });
    if (produto !== null && produto.displayPriceCents !== null) {
      await tx.productPrice.create({
        data: {
          storeId: lojaId,
          productId: produtoId,
          kind: "BASE",
          label: "Preço base",
          amountCents: produto.displayPriceCents,
        },
      });
    }
  }

  const ordenadas = [...conferido.faixas].sort(
    (a, b) => a.quantidadeMinima - b.quantidadeMinima,
  );
  const ordemInicial = await tx.productPrice.count({
    where: { storeId: lojaId, productId: produtoId, variantId: null },
  });
  for (const [posicao, faixa] of ordenadas.entries()) {
    const rotulo = faixa.rotulo?.trim();
    await tx.$executeRaw`
      INSERT INTO app.product_prices
        (store_id, product_id, kind, label, amount_cents, min_quantity,
         discount_kind, discount_value, sort_order, is_active)
      VALUES
        (${lojaId}::uuid, ${produtoId}::uuid, 'WHOLESALE',
         ${rotulo === undefined || rotulo === "" ? null : rotulo}, 0,
         ${faixa.quantidadeMinima},
         ${TIPO_DE_DESCONTO_NO_BANCO[faixa.tipoDeDesconto]},
         ${faixa.desconto}, ${ordemInicial + posicao}, true)`;
  }
  return lerFaixasDeAtacado(tx, lojaId, produtoId);
}

/** Os ids das linhas de faixa do produto (a rota genérica dos preços as pula). */
export async function idsDasFaixas(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<Set<string>> {
  return new Set(
    (await lerFaixasDeAtacado(tx, lojaId, produtoId)).map((f) => f.id),
  );
}

/**
 * O gatilho da 0064 recusou (corrida entre a conferência e o fim da
 * transação, ou preço trocado por fora): vira a mesma recusa das travas.
 */
export function ehRecusaDoBancoNasFaixas(causa: unknown): boolean {
  const texto = causa instanceof Error ? causa.message : String(causa);
  return /product_prices_(faixas_|desconto_|faixa_|atacado_)|faixa de atacado|faixas de atacado/.test(
    texto,
  );
}

/**
 * Limites da plataforma, de cada loja e de cada dono, pela credencial da
 * administração (card #25). Toda alteração entra na trilha na mesma
 * transação: a de loja em `audit_log`; a da plataforma e a de dono, que não
 * são de loja nenhuma, em `audit_platform`.
 */

import {
  LIMITES_PADRAO,
  RECURSOS_LIMITADOS_DA_LOJA,
  type LimiteDoDonoNoContrato,
  type LimitesDaLojaNoContrato,
  type PadroesDeLimiteNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";

interface LinhaDosPadroes {
  readonly max_stores_per_owner: number;
  readonly max_staff_per_store: number;
  readonly max_products_per_store: number;
  readonly max_categories_per_store: number;
  readonly max_customers_per_store: number;
}

/** Os padrões da plataforma. */
export async function lerPadroesDeLimite(): Promise<PadroesDeLimiteNoContrato> {
  const [linha] = await transacaoAtual().$queryRaw<LinhaDosPadroes[]>`
    SELECT max_stores_per_owner, max_staff_per_store, max_products_per_store,
           max_categories_per_store, max_customers_per_store
      FROM app.platform_limit_defaults WHERE id = 1`;
  if (linha === undefined) return { ...LIMITES_PADRAO };
  return {
    lojasPorDono: linha.max_stores_per_owner,
    staffPorLoja: linha.max_staff_per_store,
    produtosPorLoja: linha.max_products_per_store,
    categoriasPorLoja: linha.max_categories_per_store,
    clientesPorLoja: linha.max_customers_per_store,
  };
}

/** Grava os padrões (só os campos enviados) e registra na trilha. */
export async function gravarPadroesDeLimite(
  edicao: {
    readonly [C in keyof PadroesDeLimiteNoContrato]?: number | undefined;
  },
  administradorId: string,
): Promise<PadroesDeLimiteNoContrato> {
  const antes = await lerPadroesDeLimite();
  const depois: PadroesDeLimiteNoContrato = {
    lojasPorDono: edicao.lojasPorDono ?? antes.lojasPorDono,
    staffPorLoja: edicao.staffPorLoja ?? antes.staffPorLoja,
    produtosPorLoja: edicao.produtosPorLoja ?? antes.produtosPorLoja,
    categoriasPorLoja: edicao.categoriasPorLoja ?? antes.categoriasPorLoja,
    clientesPorLoja: edicao.clientesPorLoja ?? antes.clientesPorLoja,
  };
  const tx = transacaoAtual();
  await tx.$executeRaw`
    INSERT INTO app.platform_limit_defaults
      (id, max_stores_per_owner, max_staff_per_store, max_products_per_store,
       max_categories_per_store, max_customers_per_store, updated_by)
    VALUES (1, ${depois.lojasPorDono}, ${depois.staffPorLoja},
            ${depois.produtosPorLoja}, ${depois.categoriasPorLoja},
            ${depois.clientesPorLoja}, ${administradorId}::uuid)
    ON CONFLICT (id) DO UPDATE SET
      max_stores_per_owner = excluded.max_stores_per_owner,
      max_staff_per_store = excluded.max_staff_per_store,
      max_products_per_store = excluded.max_products_per_store,
      max_categories_per_store = excluded.max_categories_per_store,
      max_customers_per_store = excluded.max_customers_per_store,
      updated_by = excluded.updated_by`;
  await tx.$executeRaw`
    INSERT INTO app.audit_platform
      (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
    VALUES (${administradorId}::uuid, 'ADMIN', 'LIMITES_PADRAO_ALTERADOS',
            'platform_limit_defaults', '1',
            ${JSON.stringify(antes)}::jsonb, ${JSON.stringify(depois)}::jsonb)`;
  return depois;
}

interface LinhaDoAjusteDaLoja {
  readonly max_staff: number | null;
  readonly max_products: number | null;
  readonly max_categories: number | null;
  readonly max_customers: number | null;
}

type AjustesDaLoja = NonNullable<LimitesDaLojaNoContrato["ajustes"]>;

async function ajustesDaLoja(lojaId: string): Promise<AjustesDaLoja> {
  const [linha] = await transacaoAtual().$queryRaw<LinhaDoAjusteDaLoja[]>`
    SELECT max_staff, max_products, max_categories, max_customers
      FROM app.store_limits WHERE store_id = ${lojaId}::uuid`;
  return {
    staff: linha?.max_staff ?? null,
    produtos: linha?.max_products ?? null,
    categorias: linha?.max_categories ?? null,
    clientes: linha?.max_customers ?? null,
  };
}

/** Uso, limite e ajustes da loja; `null` quando a loja não existe. */
export async function lerLimitesDaLoja(
  lojaId: string,
): Promise<LimitesDaLojaNoContrato | null> {
  const tx = transacaoAtual();
  const existe = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM app.stores WHERE id = ${lojaId}::uuid`;
  if (existe.length === 0) return null;
  const linhas = await tx.$queryRaw<
    { recurso: string; limite: number; uso: number }[]
  >`SELECT recurso, limite, uso FROM app.limites_da_loja(${lojaId}::uuid)`;
  const porRecurso = new Map(linhas.map((linha) => [linha.recurso, linha]));
  return {
    limites: RECURSOS_LIMITADOS_DA_LOJA.map((recurso) => {
      const limite = Number(porRecurso.get(recurso)?.limite ?? 0);
      const uso = Number(porRecurso.get(recurso)?.uso ?? 0);
      return { recurso, limite, uso, restante: Math.max(limite - uso, 0) };
    }),
    ajustes: await ajustesDaLoja(lojaId),
  };
}

/** Grava os ajustes da loja (`null` volta ao padrão) e registra na trilha. */
export async function gravarLimitesDaLoja(
  lojaId: string,
  edicao: { readonly [C in keyof AjustesDaLoja]?: number | null | undefined },
  administradorId: string,
): Promise<LimitesDaLojaNoContrato | null> {
  const atual = await lerLimitesDaLoja(lojaId);
  if (atual === null) return null;
  const antes = await ajustesDaLoja(lojaId);
  const depois: AjustesDaLoja = {
    staff: edicao.staff === undefined ? antes.staff : edicao.staff,
    produtos: edicao.produtos === undefined ? antes.produtos : edicao.produtos,
    categorias:
      edicao.categorias === undefined ? antes.categorias : edicao.categorias,
    clientes: edicao.clientes === undefined ? antes.clientes : edicao.clientes,
  };
  const tx = transacaoAtual();
  await tx.$executeRaw`
    INSERT INTO app.store_limits
      (store_id, max_staff, max_products, max_categories, max_customers, updated_by)
    VALUES (${lojaId}::uuid, ${depois.staff}::integer, ${depois.produtos}::integer,
            ${depois.categorias}::integer, ${depois.clientes}::integer,
            ${administradorId}::uuid)
    ON CONFLICT (store_id) DO UPDATE SET
      max_staff = excluded.max_staff,
      max_products = excluded.max_products,
      max_categories = excluded.max_categories,
      max_customers = excluded.max_customers,
      updated_by = excluded.updated_by`;
  await tx.$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (${lojaId}::uuid, ${administradorId}::uuid, 'ADMIN',
            'LIMITES_ALTERADOS', 'store_limits', ${lojaId},
            ${JSON.stringify(antes)}::jsonb, ${JSON.stringify(depois)}::jsonb)`;
  return lerLimitesDaLoja(lojaId);
}

/** O limite de lojas de um dono; `null` quando a conta não existe. */
export async function lerLimiteDoDono(
  identidadeId: string,
): Promise<LimiteDoDonoNoContrato | null> {
  const tx = transacaoAtual();
  const existe = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM app.identities
     WHERE id = ${identidadeId}::uuid AND anonymized_at IS NULL`;
  if (existe.length === 0) return null;
  const [vagas] = await tx.$queryRaw<{ limite: number; uso: number }[]>`
    SELECT limite, uso FROM app.limite_de_lojas_do_dono(${identidadeId}::uuid)`;
  const [ajuste] = await tx.$queryRaw<{ max_stores: number | null }[]>`
    SELECT max_stores FROM app.owner_limits WHERE identity_id = ${identidadeId}::uuid`;
  const limite = Number(vagas?.limite ?? LIMITES_PADRAO.lojasPorDono);
  const uso = Number(vagas?.uso ?? 0);
  return {
    identidadeId,
    limite: {
      recurso: "lojas",
      limite,
      uso,
      restante: Math.max(limite - uso, 0),
    },
    ajuste: ajuste?.max_stores ?? null,
  };
}

/** Grava o limite de lojas do dono (`null` volta ao padrão). */
export async function gravarLimiteDoDono(
  identidadeId: string,
  lojas: number | null,
  administradorId: string,
): Promise<LimiteDoDonoNoContrato | null> {
  const atual = await lerLimiteDoDono(identidadeId);
  if (atual === null) return null;
  const tx = transacaoAtual();
  await tx.$executeRaw`
    INSERT INTO app.owner_limits (identity_id, max_stores, updated_by)
    VALUES (${identidadeId}::uuid, ${lojas}::integer, ${administradorId}::uuid)
    ON CONFLICT (identity_id) DO UPDATE SET
      max_stores = excluded.max_stores,
      updated_by = excluded.updated_by`;
  await tx.$executeRaw`
    INSERT INTO app.audit_platform
      (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
    VALUES (${administradorId}::uuid, 'ADMIN', 'LIMITE_DO_DONO_ALTERADO',
            'owner_limits', ${identidadeId},
            ${JSON.stringify({ lojas: atual.ajuste })}::jsonb,
            ${JSON.stringify({ lojas })}::jsonb)`;
  return lerLimiteDoDono(identidadeId);
}

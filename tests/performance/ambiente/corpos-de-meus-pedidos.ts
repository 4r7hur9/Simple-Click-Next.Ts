/**
 * Os dois corpos de `app.meus_pedidos` (#142): o ANTIGO, lido do arquivo da
 * migração 0029 (a fonte versionada), e o NOVO, literal desta otimização (a
 * 0074 grava exatamente este texto; o teste db-rls da 0074 confere o `prosrc`).
 *
 * - `impressao(corpo)`: sha256 do corpo com o espaço normalizado. É o que o
 *   `explicar-gargalo.ts` lê do `pg_proc.prosrc` para dizer QUAL corpo está
 *   vigente, e o que o `comparar.ts` exige: antes = 0029, depois = 0074.
 * - `paraExplicar(corpo)`: o corpo com a ÚNICA troca `p_order_id` → `NULL::uuid`
 *   (a lista inteira, como `GET /v1/conta/pedidos`). Só estes textos
 *   versionados são executados no EXPLAIN — nunca o texto lido do catálogo.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RAIZ } from "./apoio.ts";

export const MIGRACAO_ANTIGA = "0029_operacao_do_pedido.sql";
export const MIGRACAO_NOVA = "0074_meus_pedidos_por_loja.sql";

/** O corpo entre `AS $$` e `$$;` da função `app.meus_pedidos` num arquivo SQL. */
export function corpoNaMigracao(texto: string): string {
  const inicio = texto.indexOf("CREATE OR REPLACE FUNCTION app.meus_pedidos(");
  if (inicio < 0) throw new Error("A migração não define app.meus_pedidos.");
  const abre = texto.indexOf("AS $$", inicio);
  const fecha = texto.indexOf("$$;", abre + 5);
  if (abre < 0 || fecha < 0) throw new Error("Corpo de app.meus_pedidos sem delimitadores $$.");
  return texto.slice(abre + "AS $$".length, fecha);
}

export const CORPO_ANTIGO = corpoNaMigracao(
  readFileSync(resolve(RAIZ, "packages/database/migrations", MIGRACAO_ANTIGA), "utf8"),
);

/**
 * O corpo novo: o da 0029 com SÓ os dois predicados de loja, para o
 * planejador usar os índices que começam por `store_id`
 * (`orders_do_cliente_idx` e `order_items_do_pedido_idx`).
 */
export const CORPO_NOVO = `
  SELECT o.id,
         o.store_id,
         s.name,
         s.slug,
         o.number,
         o.code,
         o.status,
         o.fulfillment,
         o.total_cents,
         o.placed_at,
         o.updated_at,
         o.public_token,
         (SELECT count(*) FROM app.order_items i
           WHERE i.store_id = o.store_id AND i.order_id = o.id)
    FROM app.orders o
    JOIN app.store_customers c ON c.id = o.store_customer_id AND c.store_id = o.store_id
    JOIN app.stores s ON s.id = o.store_id
   WHERE app.current_role_name() = 'CUSTOMER'
     AND app.current_user_id() IS NOT NULL
     AND c.identity_id = app.current_user_id()
     AND (p_order_id IS NULL OR o.id = p_order_id)
   ORDER BY o.placed_at DESC, o.id DESC
`;

export const normalizar = (corpo: string): string => corpo.replace(/\s+/g, " ").trim();

export function impressao(corpo: string): string {
  return createHash("sha256").update(normalizar(corpo)).digest("hex");
}

export const IMPRESSAO_ANTIGA = impressao(CORPO_ANTIGO);
export const IMPRESSAO_NOVA = impressao(CORPO_NOVO);

/** O corpo pronto para o EXPLAIN da lista inteira (p_order_id nulo). */
export function paraExplicar(corpo: string): string {
  return corpo.replace(/\bp_order_id\b/g, "NULL::uuid");
}

/** Qual corpo está vigente, pela impressão do `prosrc`. */
export function corpoVigente(prosrc: string): "0029" | "0074" | "desconhecido" {
  const i = impressao(prosrc);
  if (i === IMPRESSAO_ANTIGA) return "0029";
  if (i === IMPRESSAO_NOVA) return "0074";
  return "desconhecido";
}

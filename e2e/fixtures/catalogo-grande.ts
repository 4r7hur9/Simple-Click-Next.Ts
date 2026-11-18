/**
 * A loja de catálogo grande (card #114, AC-11418 e AC-11419).
 *
 * 1.000 PRODUTOS (decisão do usuário, Q-11407), numa loja só desta prova:
 * encher a `e2e-lanchonete` mudaria o tempo do critério antigo de desempenho e
 * o fluxo do carrinho, que rodam em paralelo; a UniversoKar tem catálogo vindo
 * de arquivo externo do fornecedor.
 *
 * SÓ MONTA. Idempotente pela contagem de produtos e sob trava: os dois projetos
 * do Playwright chamam ao mesmo tempo, e o segundo encontra a loja pronta.
 * Nunca apaga durante a suíte — apagar no fim de um projeto derrubaria o
 * cenário do outro.
 *
 * Inserção em lote (`generate_series`), numa transação: mil `INSERT`s soltos
 * custariam dezenas de segundos de rede só para montar o cenário.
 */
import { Client } from "pg";

import { abrirODiaInteiro } from "./loja-de-teste.ts";

export const APELIDO_DO_CATALOGO_GRANDE = "e2e-catalogo-grande";
export const PRODUTOS_DO_CATALOGO_GRANDE = 1_000;
/** Dez categorias de cem produtos: a troca de categoria tem o que filtrar. */
export const CATEGORIAS_DO_CATALOGO_GRANDE = 10;

const TRAVA = 8_141_411;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error("o catálogo grande precisa de DATABASE_URL_DIRETA");
  }
  return new Client({ connectionString: url });
}

/** Garante a loja com exatamente 1.000 produtos publicados. */
export async function garantirCatalogoGrande(): Promise<string> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA]);
    const achada = await cliente.query<{ id: string }>(
      `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
      [APELIDO_DO_CATALOGO_GRANDE],
    );
    let lojaId = achada.rows[0]?.id;
    if (lojaId === undefined) {
      const { rows } = await cliente.query<{ id: string }>(
        `INSERT INTO app.stores (code, name, slug, status, vertical_code, fulfillment_modes)
         VALUES ('E2E-CATALOGO-GRANDE', 'Atacarejo do Catálogo Grande', $1,
                 'ACTIVE', 'GROCERY', ARRAY['DELIVERY','PICKUP'])
         RETURNING id`,
        [APELIDO_DO_CATALOGO_GRANDE],
      );
      lojaId = rows[0]?.id;
      if (lojaId === undefined)
        throw new Error("não consegui criar o catálogo grande");
    }
    await cliente.query(
      `UPDATE app.stores SET status = 'ACTIVE' WHERE id = $1`,
      [lojaId],
    );
    await cliente.query(
      `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id) DO NOTHING`,
      [
        lojaId,
        JSON.stringify({ taxaPadraoCents: 500, retiradaNoLocal: true }),
        JSON.stringify({ formas: ["PIX", "CASH"] }),
        JSON.stringify({ numero: "+5585900001411", saudacao: "Olá!" }),
      ],
    );
    await abrirODiaInteiro(cliente, lojaId);

    const { rows: contagem } = await cliente.query<{ n: string }>(
      `SELECT count(*) AS n FROM app.products
        WHERE store_id = $1 AND deleted_at IS NULL AND status = 'PUBLISHED'`,
      [lojaId],
    );
    if (Number(contagem[0]?.n ?? 0) === PRODUTOS_DO_CATALOGO_GRANDE)
      return lojaId;

    await cliente.query("BEGIN");
    await cliente.query(
      `UPDATE app.products SET deleted_at = now()
        WHERE store_id = $1 AND deleted_at IS NULL`,
      [lojaId],
    );
    await cliente.query(
      `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       SELECT $1, 'Corredor ' || c, 'e2e-grande-corredor-' || c, true, c
         FROM generate_series(1, $2::int) AS c
       ON CONFLICT DO NOTHING`,
      [lojaId, CATEGORIAS_DO_CATALOGO_GRANDE],
    );
    // Nome com número e palavra de busca: "Item 0042 arroz" etc. Os termos se
    // repetem em ciclo, para a busca devolver um subconjunto conhecido (100).
    await cliente.query(
      `WITH novos AS (
         INSERT INTO app.products
           (store_id, name, slug, description, short_description, vertical_code,
            status, is_available, display_price_cents)
         SELECT $1,
                'Item ' || lpad(n::text, 4, '0') || ' ' ||
                  (ARRAY['arroz','feijão','café','açúcar','leite','sabão','biscoito','macarrão','óleo','farinha'])[1 + (n % 10)],
                'e2e-grande-' || n || '-' || substr(md5(random()::text), 1, 6),
                'Produto do catálogo grande.', 'Catálogo grande.', 'GROCERY',
                'PUBLISHED', true, 100 + (n * 7) % 9000
           FROM generate_series(1, $2::int) AS n
         RETURNING id, display_price_cents, name
       ), precos AS (
         INSERT INTO app.product_prices (store_id, product_id, kind, amount_cents, min_quantity)
         SELECT $1, id, 'BASE', display_price_cents, 1 FROM novos
       )
       INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
       SELECT $1, novos.id, cat.id, 1
         FROM novos
         JOIN app.categories cat
           ON cat.store_id = $1
          AND cat.slug = 'e2e-grande-corredor-' ||
              (1 + (substring(novos.name from 'Item ([0-9]+)')::int % $3::int))`,
      [lojaId, PRODUTOS_DO_CATALOGO_GRANDE, CATEGORIAS_DO_CATALOGO_GRANDE],
    );
    await cliente.query("COMMIT");
    return lojaId;
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA])
      .catch(() => undefined);
    await cliente.end();
  }
}

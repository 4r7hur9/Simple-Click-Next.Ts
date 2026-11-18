/**
 * As lojas e os clientes das provas do redesign (card #114).
 *
 * LOJAS EXCLUSIVAS, montadas direto no banco (mesmo padrão de `painel.ts` e
 * `loja-de-teste.ts`): idempotentes pelo apelido, sob trava consultiva, e NUNCA
 * apagadas durante a suíte — os dois projetos do Playwright montam a mesma loja
 * ao mesmo tempo, e quem apagasse no fim derrubaria o cenário do outro.
 *
 * - `e2e-jornada`: a jornada de compra com valores fixos (ASM-11406) — um
 *   produto com variação e adicional obrigatório, um com preço de atacado e um
 *   terceiro só para a busca saber separar.
 * - `e2e-vazia`: loja aberta sem nenhum produto (estado vazio, AC-11416).
 *
 * O CLIENTE É UMA IDENTIDADE NOVA POR TESTE: o fechamento pede o telefone só a
 * quem não tem, e a conta sem endereço abre direto no endereço novo. Um cliente
 * compartilhado mudaria a tela do próximo teste. Cada um nasce com os aceites
 * legais vigentes: sem eles, a `JanelaDeNovoAceite` cobriria a tela e a API
 * recusaria o pedido (403 `aceite_pendente`).
 *
 * A SESSÃO É UM TOKEN ASSINADO AQUI (mesmo formato de `tokenDoDono`), agora com
 * o papel CUSTOMER: `clienteDaCompra` aceita a conta logada de qualquer papel.
 * O login de verdade tem um caso próprio na jornada.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { BrowserContext } from "@playwright/test";
import { Client } from "pg";

import { abrirODiaInteiro } from "./loja-de-teste.ts";

export const APELIDO_DA_JORNADA = "e2e-jornada";
export const APELIDO_DA_LOJA_VAZIA = "e2e-vazia";

/** Trava única da montagem destas lojas (`pg_advisory_lock`). */
const TRAVA = 8_141_401;

/**
 * Os valores fixos da jornada (ASM-11406). Tudo em centavos.
 *
 * - Pastel: Médio R$ 10,00 ou Grande R$ 13,00; molho obrigatório (Vinagrete
 *   grátis ou Pimenta + R$ 1,50).
 * - Refri: R$ 5,00 no varejo, R$ 4,00 a partir de 6 unidades (atacado).
 * - Coxinha: R$ 7,00 — só para a busca provar que separa.
 */
export const JORNADA = {
  pastel: {
    nome: "Pastel da Jornada",
    apelido: "e2e-jornada-pastel",
    medio: 1_000,
    grande: 1_300,
    pimenta: 150,
  },
  refri: {
    nome: "Refri da Jornada",
    apelido: "e2e-jornada-refri",
    varejo: 500,
    atacado: 400,
    minimoAtacado: 6,
  },
  coxinha: {
    nome: "Coxinha da Jornada",
    apelido: "e2e-jornada-coxinha",
    preco: 700,
  },
} as const;

/**
 * Lojas da carga de exemplo usadas nas capturas e no contraste (Q-11403):
 * ramos diferentes, nenhuma automotiva. A `pastelaria-da-vila` é da carga base;
 * as outras, da carga demo (`pnpm --filter @simpleclick/database demo`).
 */
export const LOJAS_DA_CARGA_DEMO = [
  { apelido: "pastelaria-da-vila", ramo: "lanchonete" },
  { apelido: "brasa-burger", ramo: "hamburgueria" },
  { apelido: "atelie-mandacaru", ramo: "roupas" },
  { apelido: "mercadinho-bom-preco", ramo: "mercadinho" },
  { apelido: "drogaria-vida-leve", ramo: "farmácia" },
  { apelido: "conecta-cell", ramo: "eletrônicos" },
  { apelido: "bazar-casa-e-cia", ramo: "variedades" },
] as const;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "as provas do redesign precisam de DATABASE_URL_DIRETA para montar as lojas",
    );
  }
  return new Client({ connectionString: url });
}

/** Falha com mensagem clara se alguma loja da carga demo faltar no banco. */
export async function conferirCargaDemo(): Promise<void> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ slug: string }>(
      `SELECT slug FROM app.stores
        WHERE slug = ANY($1::text[]) AND deleted_at IS NULL AND status = 'ACTIVE'`,
      [LOJAS_DA_CARGA_DEMO.map((l) => l.apelido)],
    );
    const achadas = new Set(rows.map((r) => r.slug));
    const faltam = LOJAS_DA_CARGA_DEMO.filter((l) => !achadas.has(l.apelido));
    if (faltam.length > 0) {
      throw new Error(
        `faltam lojas da carga de exemplo: ${faltam.map((l) => l.apelido).join(", ")}. ` +
          "Rode `pnpm --filter @simpleclick/database demo` no banco do e2e.",
      );
    }
  } finally {
    await cliente.end();
  }
}

async function umId(
  cliente: Client,
  sql: string,
  valores: unknown[],
): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(sql, valores);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`não consegui gravar: ${sql}`);
  return id;
}

async function garantirLoja(
  cliente: Client,
  apelido: string,
  nome: string,
  codigo: string,
): Promise<string> {
  const achada = await cliente.query<{ id: string }>(
    `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
    [apelido],
  );
  const lojaId =
    achada.rows[0]?.id ??
    (await umId(
      cliente,
      `INSERT INTO app.stores (code, name, slug, status, vertical_code, fulfillment_modes)
       VALUES ($1, $2, $3, 'ACTIVE', 'FOOD_SNACK', ARRAY['DELIVERY','PICKUP'])
       RETURNING id`,
      [codigo, nome, apelido],
    ));
  await cliente.query(
    `UPDATE app.stores SET status = 'ACTIVE', name = $2 WHERE id = $1`,
    [lojaId, nome],
  );
  await cliente.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      lojaId,
      JSON.stringify({ taxaPadraoCents: 500, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
      JSON.stringify({ numero: "+5585900001401", saudacao: "Olá!" }),
    ],
  );
  await abrirODiaInteiro(cliente, lojaId);
  return lojaId;
}

async function produtoExiste(
  cliente: Client,
  lojaId: string,
  apelido: string,
): Promise<string | undefined> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM app.products WHERE store_id = $1 AND slug = $2 AND deleted_at IS NULL`,
    [lojaId, apelido],
  );
  return rows[0]?.id;
}

async function ligarNaCategoria(
  cliente: Client,
  ligacao: {
    readonly lojaId: string;
    readonly produtoId: string;
    readonly categoriaId: string;
    readonly ordem: number;
  },
): Promise<void> {
  const { lojaId, produtoId, categoriaId, ordem } = ligacao;
  await cliente.query(
    `INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [lojaId, produtoId, categoriaId, ordem],
  );
}

export interface LojaDaJornada {
  readonly id: string;
  readonly pastelId: string;
  readonly refriId: string;
  readonly coxinhaId: string;
}

/** Garante a loja da jornada com os três produtos de valores fixos. */
export async function garantirLojaDaJornada(): Promise<LojaDaJornada> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA]);
    const lojaId = await garantirLoja(
      cliente,
      APELIDO_DA_JORNADA,
      "Lanchonete da Jornada",
      "E2E-JORNADA",
    );

    const categoria = await cliente.query<{ id: string }>(
      `SELECT id FROM app.categories WHERE store_id = $1 AND slug = 'e2e-jornada-lanches'`,
      [lojaId],
    );
    const categoriaId =
      categoria.rows[0]?.id ??
      (await umId(
        cliente,
        `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
         VALUES ($1, 'Lanches', 'e2e-jornada-lanches', true, 1) RETURNING id`,
        [lojaId],
      ));

    // --- Pastel: variação (Médio/Grande) + molho obrigatório -------------
    let pastelId = await produtoExiste(cliente, lojaId, JORNADA.pastel.apelido);
    if (pastelId === undefined) {
      await cliente.query("BEGIN");
      pastelId = await umId(
        cliente,
        `INSERT INTO app.products
           (store_id, name, slug, description, short_description, vertical_code,
            status, is_available, has_variants)
         VALUES ($1, $2, $3, 'Massa fina, recheio de carne.', 'Pastel de carne.',
                 'FOOD_SNACK', 'PUBLISHED', true, true)
         RETURNING id`,
        [lojaId, JORNADA.pastel.nome, JORNADA.pastel.apelido],
      );
      await ligarNaCategoria(cliente, {
        lojaId,
        produtoId: pastelId,
        categoriaId,
        ordem: 1,
      });
      const tamanho = await umId(
        cliente,
        `INSERT INTO app.option_groups
           (store_id, name, kind, min_select, max_select, allow_repeat,
            is_variant_axis, is_active, sort_order)
         VALUES ($1, 'Tamanho', 'VARIATION', 1, 1, false, true, true, 0)
         RETURNING id`,
        [lojaId],
      );
      const molho = await umId(
        cliente,
        `INSERT INTO app.option_groups
           (store_id, name, kind, min_select, max_select, allow_repeat,
            is_variant_axis, is_active, sort_order)
         VALUES ($1, 'Molho', 'ADDON', 1, 1, false, false, true, 1)
         RETURNING id`,
        [lojaId],
      );
      for (const [ordem, grupo] of [tamanho, molho].entries()) {
        await cliente.query(
          `INSERT INTO app.product_option_groups (store_id, product_id, group_id, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [lojaId, pastelId, grupo, ordem],
        );
      }
      const variantes = [
        { nome: "Médio", preco: JORNADA.pastel.medio, padrao: true },
        { nome: "Grande", preco: JORNADA.pastel.grande, padrao: false },
      ];
      for (const [ordem, v] of variantes.entries()) {
        const opcao = await umId(
          cliente,
          `INSERT INTO app.option_items
             (store_id, group_id, name, price_delta_cents, is_default_selected,
              is_available, sort_order)
           VALUES ($1, $2, $3, 0, false, true, $4) RETURNING id`,
          [lojaId, tamanho, v.nome, ordem],
        );
        const variante = await umId(
          cliente,
          `INSERT INTO app.product_variants
             (store_id, product_id, name, sku, is_default, is_available, sort_order)
           VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
          [
            lojaId,
            pastelId,
            v.nome,
            `E2E-JORNADA-PASTEL-${ordem}`,
            v.padrao,
            ordem,
          ],
        );
        await cliente.query(
          `INSERT INTO app.variant_option_values (store_id, variant_id, group_id, option_item_id)
           VALUES ($1, $2, $3, $4)`,
          [lojaId, variante, tamanho, opcao],
        );
        await cliente.query(
          `INSERT INTO app.product_prices
             (store_id, product_id, variant_id, kind, amount_cents, min_quantity)
           VALUES ($1, $2, $3, 'BASE', $4, 1)`,
          [lojaId, pastelId, variante, v.preco],
        );
      }
      for (const [ordem, o] of [
        { nome: "Vinagrete", delta: 0 },
        { nome: "Pimenta", delta: JORNADA.pastel.pimenta },
      ].entries()) {
        await cliente.query(
          `INSERT INTO app.option_items
             (store_id, group_id, name, price_delta_cents, is_default_selected,
              is_available, sort_order)
           VALUES ($1, $2, $3, $4, false, true, $5)`,
          [lojaId, molho, o.nome, o.delta, ordem],
        );
      }
      await cliente.query("COMMIT");
    }

    // --- Refri: varejo + atacado a partir de 6 ---------------------------
    let refriId = await produtoExiste(cliente, lojaId, JORNADA.refri.apelido);
    if (refriId === undefined) {
      refriId = await umId(
        cliente,
        `INSERT INTO app.products
           (store_id, name, slug, description, short_description, vertical_code,
            status, is_available, display_price_cents)
         VALUES ($1, $2, $3, 'Lata 350 ml.', 'Refrigerante lata.', 'FOOD_SNACK',
                 'PUBLISHED', true, $4)
         RETURNING id`,
        [
          lojaId,
          JORNADA.refri.nome,
          JORNADA.refri.apelido,
          JORNADA.refri.varejo,
        ],
      );
      await ligarNaCategoria(cliente, {
        lojaId,
        produtoId: refriId,
        categoriaId,
        ordem: 2,
      });
      await cliente.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, kind, amount_cents, min_quantity, label)
         VALUES ($1, $2, 'BASE', $3, 1, 'Unidade'),
                ($1, $2, 'WHOLESALE', $4, $5, 'Fardo')`,
        [
          lojaId,
          refriId,
          JORNADA.refri.varejo,
          JORNADA.refri.atacado,
          JORNADA.refri.minimoAtacado,
        ],
      );
    }

    // --- Coxinha: só para a busca separar ---------------------------------
    let coxinhaId = await produtoExiste(
      cliente,
      lojaId,
      JORNADA.coxinha.apelido,
    );
    if (coxinhaId === undefined) {
      coxinhaId = await umId(
        cliente,
        `INSERT INTO app.products
           (store_id, name, slug, description, short_description, vertical_code,
            status, is_available, display_price_cents)
         VALUES ($1, $2, $3, 'Massa de batata.', 'Coxinha de frango.', 'FOOD_SNACK',
                 'PUBLISHED', true, $4)
         RETURNING id`,
        [
          lojaId,
          JORNADA.coxinha.nome,
          JORNADA.coxinha.apelido,
          JORNADA.coxinha.preco,
        ],
      );
      await ligarNaCategoria(cliente, {
        lojaId,
        produtoId: coxinhaId,
        categoriaId,
        ordem: 3,
      });
      await cliente.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, kind, amount_cents, min_quantity)
         VALUES ($1, $2, 'BASE', $3, 1)`,
        [lojaId, coxinhaId, JORNADA.coxinha.preco],
      );
    }

    // A descoberta (/explorar) lista o que a loja publicou no feed
    // (`app.feed_produtos`): o pastel e o refri entram; a coxinha fica só no
    // catálogo, para a busca da descoberta provar que separa.
    await cliente.query(
      `UPDATE app.products SET publish_to_feed = (id = ANY($2::uuid[]))
        WHERE store_id = $1`,
      [lojaId, [pastelId, refriId]],
    );
    await cliente.query(
      `INSERT INTO app.feed_posts (store_id, product_id, kind)
       SELECT $1, unnest($2::uuid[]), 'PRODUTO_PUBLICADO'
       ON CONFLICT (store_id, product_id) DO NOTHING`,
      [lojaId, [pastelId, refriId]],
    );

    return { id: lojaId, pastelId, refriId, coxinhaId };
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

/** Garante a loja aberta e sem nenhum produto publicado. */
export async function garantirLojaVazia(): Promise<string> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA]);
    const lojaId = await garantirLoja(
      cliente,
      APELIDO_DA_LOJA_VAZIA,
      "Quiosque Vazio",
      "E2E-VAZIA",
    );
    await cliente.query(
      `UPDATE app.products SET deleted_at = now()
        WHERE store_id = $1 AND deleted_at IS NULL`,
      [lojaId],
    );
    return lojaId;
  } finally {
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA])
      .catch(() => undefined);
    await cliente.end();
  }
}

/**
 * As versões vigentes dos documentos legais, lidas do contrato (fonte única,
 * `packages/contracts/src/legal.ts`): o e2e não depende do pacote, e copiar a
 * data aqui faria a fixture envelhecer em silêncio na próxima revisão.
 */
function versoesDosDocumentos(): Record<string, string> {
  const texto = readFileSync(
    new URL("../../packages/contracts/src/legal.ts", import.meta.url),
    "utf8",
  );
  const bloco = /VERSAO_DOS_DOCUMENTOS_LEGAIS[^=]*=\s*\{([^}]*)\}/.exec(
    texto,
  )?.[1];
  if (bloco === undefined)
    throw new Error("não achei as versões dos documentos legais");
  const versoes: Record<string, string> = {};
  for (const [, doc, versao] of bloco.matchAll(/(\w+):\s*"([^"]+)"/g)) {
    if (doc !== undefined && versao !== undefined) versoes[doc] = versao;
  }
  return versoes;
}

function base64Url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor)).toString("base64url");
}

/** O token de acesso de um cliente, no formato que a API confere. */
export function tokenDoCliente(identidadeId: string): string {
  const segredo = process.env["JWT_SECRET"]?.trim();
  if (segredo === undefined || segredo === "") {
    throw new Error("as provas do redesign precisam de JWT_SECRET");
  }
  const agora = Math.floor(Date.now() / 1_000);
  const conteudo = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({
    sub: identidadeId,
    role: "CUSTOMER",
    sid: randomUUID(),
    fid: randomUUID(),
    iat: agora,
    exp: agora + 15 * 60,
  })}`;
  const assinatura = createHmac("sha256", segredo)
    .update(conteudo)
    .digest("base64url");
  return `${conteudo}.${assinatura}`;
}

export interface ClienteDeTeste {
  readonly identidadeId: string;
  readonly email: string;
  readonly nome: string;
}

/**
 * Uma conta nova de cliente: e-mail único, sem telefone, sem endereço, com os
 * aceites vigentes de toda conta (Termos de Uso e Política de Privacidade).
 */
export async function criarClienteDeTeste(
  nome: string,
): Promise<ClienteDeTeste> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const email = `cliente-${randomUUID().slice(0, 12)}@e2e-redesign.test`;
    const identidadeId = await umId(
      cliente,
      // O tutorial de primeiro acesso (card #39) abriria por cima de tudo
      // numa conta nova: ele tem prova própria, e aqui já vem como visto.
      `INSERT INTO app.identities (email_norm, display_name, email_verified_at, tutorials_seen)
       VALUES (lower($1), $2, now(), ARRAY['cliente']) RETURNING id`,
      [email, nome],
    );
    const versoes = versoesDosDocumentos();
    for (const documento of ["TERMS_OF_USE", "PRIVACY_POLICY"]) {
      const versao = versoes[documento];
      if (versao === undefined) throw new Error(`sem versão de ${documento}`);
      await cliente.query(
        `INSERT INTO app.legal_acceptances (identity_id, document, version, origin)
         VALUES ($1, $2, $3, 'SIGNUP') ON CONFLICT DO NOTHING`,
        [identidadeId, documento, versao],
      );
    }
    return { identidadeId, email, nome };
  } finally {
    await cliente.end();
  }
}

/** Põe a sessão do cliente no navegador do cenário. */
export async function entrarComoCliente(
  contexto: BrowserContext,
  origem: string,
  pessoa: ClienteDeTeste,
): Promise<void> {
  await contexto.addCookies([
    {
      name: "sc_access",
      value: tokenDoCliente(pessoa.identidadeId),
      url: origem,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** Cria a conta e já entra com ela no contexto. */
export async function clienteLogado(
  contexto: BrowserContext,
  origem: string,
  nome: string,
): Promise<ClienteDeTeste> {
  const pessoa = await criarClienteDeTeste(nome);
  await entrarComoCliente(contexto, origem, pessoa);
  return pessoa;
}

/**
 * Deixa uma conta que JÁ EXISTE pronta para a tela: aceites legais vigentes
 * (com os Termos do Lojista quando é dona) e o tutorial do papel já visto. A
 * janela de novo aceite e o tutorial de primeiro acesso têm provas próprias;
 * por cima da tela, só atrapalham o que se mede aqui.
 */
export async function prepararContaParaATela(
  identidadeId: string,
  papel: "cliente" | "dono",
): Promise<void> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const versoes = versoesDosDocumentos();
    const documentos =
      papel === "dono"
        ? ["TERMS_OF_USE", "PRIVACY_POLICY", "MERCHANT_TERMS"]
        : ["TERMS_OF_USE", "PRIVACY_POLICY"];
    for (const documento of documentos) {
      await cliente.query(
        `INSERT INTO app.legal_acceptances (identity_id, document, version, origin)
         VALUES ($1, $2, $3, 'SIGNUP') ON CONFLICT DO NOTHING`,
        [identidadeId, documento, versoes[documento]],
      );
    }
    await cliente.query(
      `UPDATE app.identities
          SET tutorials_seen = array_append(tutorials_seen, $2::text)
        WHERE id = $1 AND NOT ($2::text = ANY (tutorials_seen))`,
      [identidadeId, papel],
    );
  } finally {
    await cliente.end();
  }
}

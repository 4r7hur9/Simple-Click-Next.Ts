/**
 * A montagem do ponta a ponta do PAINEL DO DONO (T-313).
 *
 * UMA LOJA SÓ DO PAINEL, de roupas. As rotas do painel no site falam com a
 * loja de `NEXT_PUBLIC_DEV_STORE_SLUG`, e o `playwright.config.ts` a aponta
 * para esta: assim o que o dono cria aqui não aparece na vitrine da carga de
 * exemplo, que outros cenários medem. Roupa porque o ramo controla estoque
 * (`tracks_stock`), e a prova de estoque precisa disso.
 *
 * Desde a T-115 o site não lê mais essa variável: descobre a loja pela sessão
 * (`GET /v1/eu`). O painel abre nesta loja porque o dono dela só tem ela.
 *
 * A SESSÃO É EMITIDA AQUI, e não pela tela de entrada. O site do ponta a ponta
 * roda em modo produção, e nele o cookie de sessão sai preso ao domínio de
 * produção — em `localhost` ele não pega. A entrada tem prova própria (T-110);
 * o que este pacote prova é o que o dono faz DEPOIS de entrar. O token segue o
 * formato que a API confere (`apps/api/src/modules/auth/token.ts`), assinado
 * com o mesmo segredo do ambiente.
 *
 * O DONO É UMA IDENTIDADE DE VERDADE, membro de verdade da loja. Desde a
 * migração 0041 a equipe só alcança a loja de que é membro: um sujeito
 * inventado no token receberia "não encontrado" em toda porta do painel. A
 * montagem cria a identidade pelo e-mail e o vínculo OWNER aceito, e é o
 * identificador dela que vai no token.
 */
import { createHmac, randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";
import { Client } from "pg";

import { abrirODiaInteiro } from "./loja-de-teste.ts";
import { prepararContaParaATela } from "./redesign-lojas.ts";
import { jaEscolheuOsCookies } from "./redesign.ts";

/** O apelido da loja do painel — o mesmo que o site do ponta a ponta usa. */
export const APELIDO_DO_PAINEL = "e2e-painel";

/** O e-mail do dono da loja do painel. Domínio reservado a teste (RFC 2606). */
const EMAIL_DO_DONO_DO_PAINEL = "dono@e2e-painel.test";

/** O dono da loja do painel, guardado depois da montagem deste processo. */
let donoDoPainel: string | undefined;

/** Mesma chave para todo processo que monta esta loja (`pg_advisory_lock`). */
const TRAVA_DA_MONTAGEM = 8_142_310;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta precisa de DATABASE_URL_DIRETA para montar a loja do painel",
    );
  }
  return new Client({ connectionString: url });
}

function base64Url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor)).toString("base64url");
}

/** O token de acesso de um dono, no formato que a API confere. */
export function tokenDoDono(identidadeId: string): string {
  const segredo = process.env["JWT_SECRET"]?.trim();
  if (segredo === undefined || segredo === "") {
    throw new Error("o ponta a ponta do painel precisa de JWT_SECRET");
  }
  const agora = Math.floor(Date.now() / 1_000);
  const conteudo = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({
    sub: identidadeId,
    role: "OWNER",
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

/**
 * Garante que a loja tem um dono de verdade: a identidade do e-mail informado
 * e o vínculo OWNER aceito com a loja. Devolve o identificador da identidade.
 *
 * Repetível de propósito — o e-mail é único em `identities` e o par (loja,
 * identidade) é único em `store_members` —, porque os dois projetos do
 * Playwright montam a mesma loja ao mesmo tempo, e cada execução volta a
 * montar. Vínculo revogado que sobrou de outra execução volta a valer.
 */
export async function garantirDonoDaLoja(
  cliente: Client,
  lojaId: string,
  email: string,
): Promise<string> {
  const identidade = await cliente.query<{ id: string }>(
    `INSERT INTO app.identities (email_norm, display_name, email_verified_at)
     VALUES (lower(btrim($1)), 'Dono do ponta a ponta', now())
     ON CONFLICT (email_norm) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [email],
  );
  const identidadeId = identidade.rows[0]?.id;
  if (identidadeId === undefined) {
    throw new Error(`não consegui criar a identidade do dono ${email}`);
  }
  await cliente.query(
    `INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
     VALUES ($1, $2, 'OWNER', now())
     ON CONFLICT (store_id, identity_id) DO UPDATE
       SET role = 'OWNER',
           revoked_at = NULL,
           invite_accepted_at = coalesce(store_members.invite_accepted_at, now())`,
    [lojaId, identidadeId],
  );
  // Aceites legais vigentes (com os Termos do Lojista) e o tutorial de
  // primeiro acesso já visto: sem isso a API recusa com 403 `aceite_pendente`
  // e o tutorial cobre a tela. Os dois têm prova própria.
  await prepararContaParaATela(identidadeId, "dono");
  return identidadeId;
}

/** Põe a sessão do dono da loja do painel no navegador do cenário. */
export async function entrarComoDono(
  contexto: BrowserContext,
  enderecoDoSite: string,
): Promise<void> {
  const dono = donoDoPainel ?? (await garantirLojaDoPainel()).donoId;
  // O aviso de cookies não cobre o painel: a escolha já vem dada.
  await jaEscolheuOsCookies(contexto, enderecoDoSite);
  await contexto.addCookies([
    {
      name: "sc_access",
      value: tokenDoDono(dono),
      url: enderecoDoSite,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Um nome que não se repete entre execuções nem entre os dois projetos do
 * Playwright, que rodam o mesmo cenário ao mesmo tempo contra o mesmo banco.
 */
export function nomeUnico(prefixo: string, projeto: string): string {
  return `${prefixo} ${projeto} ${randomUUID().slice(0, 8)}`;
}

/**
 * O fim de um nome feito por `nomeUnico`: o projeto do Playwright e 8 dígitos
 * hexadecimais. É assim que se reconhece o que um cenário gravou.
 */
const FIM_DE_NOME_UNICO = " (publico|celular) [0-9a-f]{8}$";

/**
 * Quanto tempo um dado de cenário precisa ter para contar como SOBRA. Mais
 * que o maior arquivo do painel leva para rodar: o outro projeto (os dois
 * rodam ao mesmo tempo contra a mesma loja) nunca perde o que acabou de
 * gravar.
 */
const IDADE_DE_SOBRA = "15 minutes";

/**
 * Tira da loja do painel o que as RODADAS ANTERIORES deixaram (card #133).
 *
 * A loja é uma só e dura entre rodadas, e cada rodada grava dados novos com
 * nome único. Sem faxina, eles se acumulam até quebrar cenários que nada têm
 * de errado:
 *
 * - categorias: a loja tem limite de 50 (card #25, migração 0051), e passado
 *   dele a criação responde 409 — a tela diz "Não foi possível criar";
 * - pedidos: a lista dos mais vendidos tem dez lugares, e os produtos das
 *   rodadas da semana empurram para fora o de cinco dias atrás.
 *
 * Só sai o que tem nome de `nomeUnico` E foi gravado há mais de
 * `IDADE_DE_SOBRA`. A categoria e os produtos dela saem pela remoção lógica
 * (`deleted_at`), como a tela faz; os pedidos, que não têm remoção lógica,
 * são apagados com os itens (ON DELETE CASCADE).
 */
export async function limparSobrasDoPainel(lojaId: string): Promise<void> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `WITH sobras AS (
         SELECT id FROM app.categories
          WHERE store_id = $1 AND deleted_at IS NULL
            AND name ~ $2 AND created_at < now() - $3::interval
       ), produtos AS (
         UPDATE app.products p SET deleted_at = now()
          WHERE p.store_id = $1 AND p.deleted_at IS NULL AND p.name ~ $2
            AND EXISTS (SELECT 1 FROM app.product_categories pc
                         WHERE pc.product_id = p.id
                           AND pc.category_id IN (SELECT id FROM sobras))
         RETURNING p.id
       )
       UPDATE app.categories SET deleted_at = now()
        WHERE id IN (SELECT id FROM sobras)`,
      [lojaId, FIM_DE_NOME_UNICO, IDADE_DE_SOBRA],
    );
    // O pedido sai só se TODOS os itens forem de cenário: pedido de outra
    // origem na loja do painel continua.
    await cliente.query(
      `DELETE FROM app.orders o
        WHERE o.store_id = $1 AND o.updated_at < now() - $3::interval
          AND EXISTS (SELECT 1 FROM app.order_items i WHERE i.order_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM app.order_items i
                           WHERE i.order_id = o.id AND i.product_name !~ $2)`,
      [lojaId, FIM_DE_NOME_UNICO, IDADE_DE_SOBRA],
    );
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

/**
 * Apaga os pedidos que um cenário gravou em rodadas ANTERIORES, deste mesmo
 * projeto do Playwright, sem olhar a idade (card #133).
 *
 * `limparSobrasDoPainel` só leva o que tem mais de 15 minutos; o cenário que
 * disputa os dez lugares dos mais vendidos não pode esperar isso entre uma
 * rodada e a seguinte. Aqui o recorte é pelo NOME: os prefixos do cenário e o
 * projeto (`nomeUnico` põe o projeto no nome), então o outro projeto, que roda
 * ao mesmo tempo contra a mesma loja, não perde nada. Só serve a cenário que
 * roda num trabalhador só por projeto (`mode: "serial"`).
 */
export async function apagarPedidosDoCenario(
  lojaId: string,
  prefixos: readonly string[],
  projeto: string,
): Promise<void> {
  const escapar = (texto: string) =>
    texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nomes = `^(${prefixos.map(escapar).join("|")}) ${escapar(projeto)} [0-9a-f]{8}$`;
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query(
      `DELETE FROM app.orders o
        WHERE o.store_id = $1
          AND EXISTS (SELECT 1 FROM app.order_items i WHERE i.order_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM app.order_items i
                           WHERE i.order_id = o.id AND i.product_name !~ $2)`,
      [lojaId, nomes],
    );
  } finally {
    await cliente.end();
  }
}

/** A loja do painel montada: o identificador dela e o do dono dela. */
export interface LojaDoPainel {
  readonly id: string;
  readonly donoId: string;
}

/**
 * Garante a loja de roupas do painel, ativa, que vende, sempre aberta — e com
 * o dono dela vinculado.
 */
export async function garantirLojaDoPainel(): Promise<LojaDoPainel> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA_DA_MONTAGEM]);

    const achada = await cliente.query<{ id: string }>(
      `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
      [APELIDO_DO_PAINEL],
    );
    const lojaId =
      achada.rows[0]?.id ??
      (
        await cliente.query<{ id: string }>(
          `INSERT INTO app.stores (code, name, slug, status, vertical_code, fulfillment_modes)
           VALUES ('E2E-PAINEL', 'Malharia do Painel', $1, 'ACTIVE', 'APPAREL',
                   ARRAY['DELIVERY','PICKUP'])
           RETURNING id`,
          [APELIDO_DO_PAINEL],
        )
      ).rows[0]?.id;
    if (lojaId === undefined)
      throw new Error("não consegui criar a loja do painel");

    await cliente.query(
      `UPDATE app.stores SET status = 'ACTIVE', vertical_code = 'APPAREL'
        WHERE id = $1`,
      [lojaId],
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
        JSON.stringify({ numero: "+5511900000001", saudacao: "Olá!" }),
      ],
    );
    // Aberta sempre: o horário tem prova própria (T-903), e o relógio não
    // pode decidir se um cenário do painel passa.
    await abrirODiaInteiro(cliente, lojaId);
    const donoId = await garantirDonoDaLoja(
      cliente,
      lojaId,
      EMAIL_DO_DONO_DO_PAINEL,
    );
    donoDoPainel = donoId;
    return { id: lojaId, donoId };
  } finally {
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA_DA_MONTAGEM])
      .catch(() => undefined);
    await cliente.end();
  }
}

/** Uma camiseta publicada com a grade P/M/G e o estoque de cada tamanho. */
export interface CamisetaComGrade {
  readonly produtoId: string;
  readonly nome: string;
  readonly variacoes: Readonly<Record<"P" | "M" | "G", string>>;
}

/**
 * Cria, direto no banco, uma camiseta com o eixo Tamanho e uma variação por
 * tamanho. A grade tem prova de tela e de API; aqui ela é só o cenário do
 * estoque — montá-la pela tela triplicaria o cenário sem provar nada novo.
 */
export async function criarCamisetaComGrade(
  lojaId: string,
  nome: string,
  estoques: Readonly<Record<"P" | "M" | "G", number>>,
): Promise<CamisetaComGrade> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("BEGIN");
    const umaLinha = async (sql: string, valores: unknown[]) => {
      const { rows } = await cliente.query<{ id: string }>(sql, valores);
      const id = rows[0]?.id;
      if (id === undefined) throw new Error(`não consegui criar: ${sql}`);
      return id;
    };
    const apelido = `e2e-${randomUUID().slice(0, 12)}`;
    const categoriaId = await umaLinha(
      `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       VALUES ($1, $2, $3, true, 1) RETURNING id`,
      [lojaId, `Seção ${nome}`, `${apelido}-secao`],
    );
    const produtoId = await umaLinha(
      `INSERT INTO app.products
         (store_id, name, slug, description, short_description, vertical_code,
          status, is_available, has_variants)
       VALUES ($1, $2, $3, 'Algodão.', 'Camiseta básica.', 'APPAREL',
               'PUBLISHED', true, true)
       RETURNING id`,
      [lojaId, nome, apelido],
    );
    await cliente.query(
      `INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
       VALUES ($1, $2, $3, 1)`,
      [lojaId, produtoId, categoriaId],
    );
    const tamanho = await umaLinha(
      `INSERT INTO app.option_groups
         (store_id, name, kind, min_select, max_select, allow_repeat,
          is_variant_axis, is_active, sort_order)
       VALUES ($1, 'Tamanho', 'VARIATION', 1, 1, false, true, true, 0)
       RETURNING id`,
      [lojaId],
    );
    await cliente.query(
      `INSERT INTO app.product_option_groups (store_id, product_id, group_id, sort_order)
       VALUES ($1, $2, $3, 0)`,
      [lojaId, produtoId, tamanho],
    );
    const variacoes = {} as Record<"P" | "M" | "G", string>;
    let ordem = 0;
    for (const letra of ["P", "M", "G"] as const) {
      const opcao = await umaLinha(
        `INSERT INTO app.option_items
           (store_id, group_id, name, price_delta_cents, is_default_selected,
            is_available, sort_order)
         VALUES ($1, $2, $3, 0, false, true, $4)
         RETURNING id`,
        [lojaId, tamanho, letra, ordem],
      );
      const variacao = await umaLinha(
        `INSERT INTO app.product_variants
           (store_id, product_id, name, sku, stock_quantity, stock_reserved,
            is_default, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, 0, $6, true, $7)
         RETURNING id`,
        [
          lojaId,
          produtoId,
          letra,
          `${apelido}-${letra}`.toUpperCase(),
          estoques[letra],
          letra === "P",
          ordem,
        ],
      );
      await cliente.query(
        `INSERT INTO app.variant_option_values (store_id, variant_id, group_id, option_item_id)
         VALUES ($1, $2, $3, $4)`,
        [lojaId, variacao, tamanho, opcao],
      );
      await cliente.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, variant_id, kind, amount_cents, min_quantity)
         VALUES ($1, $2, $3, 'BASE', 4990, 1)`,
        [lojaId, produtoId, variacao],
      );
      variacoes[letra] = variacao;
      ordem += 1;
    }
    await cliente.query("COMMIT");
    return { produtoId, nome, variacoes };
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

/** Um produto publicado, sem grade, com a seção dele — o ponto de partida das escolhas. */
export async function criarProdutoSimples(
  lojaId: string,
  nome: string,
  precoCentavos: number,
): Promise<string> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const apelido = `e2e-${randomUUID().slice(0, 12)}`;
    const { rows: categoria } = await cliente.query<{ id: string }>(
      `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       VALUES ($1, $2, $3, true, 1) RETURNING id`,
      [lojaId, `Seção ${nome}`, `${apelido}-secao`],
    );
    const { rows: produto } = await cliente.query<{ id: string }>(
      `INSERT INTO app.products
         (store_id, name, slug, description, short_description, vertical_code,
          status, is_available, display_price_cents)
       VALUES ($1, $2, $3, 'Algodão.', 'Camiseta estampada.', 'APPAREL',
               'PUBLISHED', true, $4)
       RETURNING id`,
      [lojaId, nome, apelido, precoCentavos],
    );
    const categoriaId = categoria[0]?.id;
    const produtoId = produto[0]?.id;
    if (categoriaId === undefined || produtoId === undefined) {
      throw new Error("não consegui criar o produto simples");
    }
    await cliente.query(
      `INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
       VALUES ($1, $2, $3, 1)`,
      [lojaId, produtoId, categoriaId],
    );
    await cliente.query(
      `INSERT INTO app.product_prices
         (store_id, product_id, kind, amount_cents, min_quantity)
       VALUES ($1, $2, 'BASE', $3, 1)`,
      [lojaId, produtoId, precoCentavos],
    );
    return produtoId;
  } finally {
    await cliente.end();
  }
}

/** Um item do pedido aceito que o cenário grava: nome, quantas e quanto. */
export interface ItemDoPedidoAceito {
  readonly nome: string;
  readonly quantidade: number;
  readonly totalCentavos: number;
}

/**
 * Grava, direto no banco, um pedido ACEITO da loja no instante pedido — o
 * movimento que as métricas do painel contam (T-809). Fazer o pedido pela
 * vitrine e aceitá-lo pela fila tem ponta a ponta próprio; aqui o pedido é só
 * o cenário dos números, e o instante precisa ser escolhido (ontem, anteontem)
 * para provar a troca de período.
 */
export async function criarPedidoAceito(
  lojaId: string,
  colocadoEm: Date,
  itens: readonly ItemDoPedidoAceito[],
): Promise<string> {
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("BEGIN");
    const { rows: numero } = await cliente.query<{ n: string }>(
      `SELECT app.proximo_numero_de_pedido($1::uuid) AS n`,
      [lojaId],
    );
    const n = Number(numero[0]?.n);
    const total = itens.reduce((soma, item) => soma + item.totalCentavos, 0);
    const { rows: pedido } = await cliente.query<{ id: string }>(
      `INSERT INTO app.orders
         (store_id, number, code, public_token, status, channel, total_cents,
          subtotal_cents, items_total_cents, placed_at)
       VALUES ($1, $2, $3, $4, 'ACCEPTED', 'ONLINE', $5, $5, $5, $6)
       RETURNING id`,
      [
        lojaId,
        n,
        `M-${String(n).padStart(4, "0")}`,
        randomUUID().replaceAll("-", ""),
        total,
        colocadoEm,
      ],
    );
    const pedidoId = pedido[0]?.id;
    if (pedidoId === undefined) throw new Error("o pedido aceito não entrou");
    for (const [ordem, item] of itens.entries()) {
      await cliente.query(
        `INSERT INTO app.order_items
           (store_id, order_id, product_name, quantity, unit_price_cents,
            line_total_cents, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          lojaId,
          pedidoId,
          item.nome,
          item.quantidade,
          Math.round(item.totalCentavos / item.quantidade),
          item.totalCentavos,
          ordem,
        ],
      );
    }
    await cliente.query("COMMIT");
    return pedidoId;
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

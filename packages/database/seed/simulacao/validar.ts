/**
 * A validação do perfil de simulação, em duas camadas (D-9):
 *
 * 1. BANCO — parte da lista das 100 lojas esperadas (LEFT JOIN em `orders`, para
 *    que loja sem pedido também reprove), confere a distribuição de status, os
 *    totais, os vínculos entre lojas, o histórico, o catálogo, as imagens
 *    principais, o pedido-prova de R$ 51,00 e prova o retrato histórico (troca o
 *    preço da marmita dentro de uma transação e desfaz).
 * 2. APLICAÇÃO (`--site` e `--api`, sempre locais) — vitrine, catálogo, páginas
 *    do site, imagens (HTTP 200, `content-type`, decodificação e dimensões do
 *    acervo), acompanhamento de pedido por status e o painel do dono.
 *
 * Saídas em `saida/`: `validacao-banco.json`, `validacao-aplicacao.json` e
 * `relatorio.md`. Nenhuma leva token, e-mail, telefone ou senha — e
 * `varrerSaidas` confere isso antes de o comando terminar.
 */

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ClienteSql } from "../../src/migrate.ts";
import { id } from "../demo/escrita.ts";
import { SENHA_DOS_DONOS } from "../demo/contas.ts";
import {
  conectarAdministracao,
  ErroDeGuarda,
  montarAlvo,
} from "./banco.ts";
import {
  escreverSaida,
  impressoesDoBanco,
  lerSaida,
  type Manifesto,
} from "./manifesto.ts";
import {
  ErroDeParametros,
  lerParametrosDaValidacao,
  mascararUrl,
  validarReferencia,
  validarSemente,
} from "./parametros.ts";
import {
  ATACADO,
  CHAVE_DO_PEDIDO_PROVA,
  fotosDoProduto,
  idsDaLoja,
  montarPlano,
  PEDIDOS_POR_LOJA,
  type PlanoDoPerfil,
  PRODUTOS_POR_LOJA,
  tokenDoPedido,
  TOTAL_DE_LOJAS,
} from "./perfil.ts";
import { proximosStatusDoPedido } from "./transicoes.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// ---------------------------------------------------------------------------
// Resultado de uma verificação
// ---------------------------------------------------------------------------

export interface Verificacao {
  readonly nome: string;
  readonly ok: boolean;
  /** Frase curta, sem dado pessoal, token nem endereço com credencial. */
  readonly detalhe: string;
  /** Até 10 exemplos do que reprovou (apelido, código de pedido…). */
  readonly exemplos?: readonly string[];
}

function verificar(
  nome: string,
  falhas: readonly string[],
  detalheOk: string,
  detalheErro?: string,
): Verificacao {
  return falhas.length === 0
    ? { nome, ok: true, detalhe: detalheOk }
    : {
        nome,
        ok: false,
        detalhe: detalheErro ?? `${falhas.length} reprovada(s)`,
        exemplos: falhas.slice(0, 10),
      };
}

// ---------------------------------------------------------------------------
// Varredura das saídas
// ---------------------------------------------------------------------------

const PADROES_PROIBIDOS: readonly (readonly [string, RegExp])[] = [
  ["arroba (e-mail)", /@/],
  ["+55 (telefone)", /\+55/],
  ["token de 40 hex", /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/i],
  ["JWT (eyJ)", /eyJ/],
  ["Set-Cookie", /set-cookie/i],
];

/** O que, num texto de saída, parece contato, token ou cookie. Vazio = limpo. */
export function varrerSaidas(texto: string): string[] {
  return PADROES_PROIBIDOS.filter(([, padrao]) => padrao.test(texto)).map(
    ([nome]) => nome,
  );
}

// ---------------------------------------------------------------------------
// Camada do banco
// ---------------------------------------------------------------------------

async function linhas(
  cliente: ClienteSql,
  sql: string,
  valores: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  return (await cliente.query(sql, valores)).rows;
}

const contar = (
  cliente: ClienteSql,
  sql: string,
  valores: unknown[] = [],
): Promise<number> =>
  linhas(cliente, sql, valores).then((r) => Number(r[0]?.n ?? 0));

/** A data local de Fortaleza (`2026-11-01`) de um instante. */
export function diaLocal(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

export interface DadosDeApoio {
  /** id do pedido → o que o banco tem (para a camada da aplicação comparar). */
  readonly pedidos: ReadonlyMap<
    string,
    { readonly codigo: string; readonly status: string; readonly total: number; readonly placedAt: Date; readonly loja: string }
  >;
}

export async function validarBanco(
  cliente: ClienteSql,
  plano: PlanoDoPerfil,
): Promise<{ verificacoes: Verificacao[]; apoio: DadosDeApoio }> {
  const v: Verificacao[] = [];
  const codigos = plano.lojas.map((l) => l.codigo);

  // 1. As 100 lojas esperadas, cada uma com 10 pedidos (LEFT JOIN).
  const porLoja = await linhas(
    cliente,
    `SELECT e.code, count(o.id)::int AS n
       FROM (SELECT unnest($1::text[]) AS code) e
       LEFT JOIN app.stores s ON s.code = e.code
       LEFT JOIN app.orders o ON o.store_id = s.id
      GROUP BY e.code ORDER BY e.code`,
    [codigos],
  );
  v.push(
    verificar(
      "100 lojas esperadas, cada uma com exatamente 10 pedidos",
      porLoja.filter((l) => Number(l.n) !== PEDIDOS_POR_LOJA).map((l) => `${String(l.code)}: ${String(l.n)}`),
      `${porLoja.length} lojas × ${PEDIDOS_POR_LOJA} pedidos`,
      "loja com número de pedidos diferente de 10",
    ),
  );
  const totais = await linhas(
    cliente,
    `SELECT (SELECT count(*)::int FROM app.stores) AS lojas,
            (SELECT count(*)::int FROM app.orders) AS pedidos`,
  );
  const totalDeLojas = Number(totais[0]!.lojas);
  const totalDePedidos = Number(totais[0]!.pedidos);
  v.push(
    verificar(
      "só as 100 lojas e os 1.000 pedidos do perfil na base",
      totalDeLojas === TOTAL_DE_LOJAS && totalDePedidos === TOTAL_DE_LOJAS * PEDIDOS_POR_LOJA
        ? []
        : [`${totalDeLojas} lojas, ${totalDePedidos} pedidos`],
      `${totalDeLojas} lojas e ${totalDePedidos} pedidos`,
    ),
  );

  // 2. Distribuição exata de status.
  const distribuicao = await linhas(
    cliente,
    `SELECT s.code, o.status, count(*)::int AS n
       FROM app.orders o JOIN app.stores s ON s.id = o.store_id
      GROUP BY s.code, o.status`,
  );
  const noBanco = new Map<string, Map<string, number>>();
  for (const l of distribuicao) {
    const m = noBanco.get(String(l.code)) ?? new Map<string, number>();
    m.set(String(l.status), Number(l.n));
    noBanco.set(String(l.code), m);
  }
  const falhasDeStatus: string[] = [];
  for (const loja of plano.lojas) {
    const esperado = new Map<string, number>();
    for (const p of loja.pedidos) {
      esperado.set(p.pedido.status, (esperado.get(p.pedido.status) ?? 0) + 1);
    }
    const encontrado = noBanco.get(loja.codigo) ?? new Map();
    const igual =
      esperado.size === encontrado.size &&
      [...esperado].every(([status, n]) => encontrado.get(status) === n);
    if (!igual) falhasDeStatus.push(loja.chave);
  }
  v.push(
    verificar(
      "distribuição exata de status por loja (1 PENDING, 1 ACCEPTED, 2 PREPARING, 2 intermediários, 3 COMPLETED, 1 CANCELLED)",
      falhasDeStatus,
      "as 100 lojas batem com o plano",
    ),
  );

  // 3. Totais.
  const totaisErrados = await linhas(
    cliente,
    `SELECT o.code AS pedido
       FROM app.orders o
       LEFT JOIN (SELECT order_id, sum(line_total_cents) AS soma
                    FROM app.order_items GROUP BY order_id) i ON i.order_id = o.id
      WHERE o.total_cents <> coalesce(i.soma, 0) + o.delivery_fee_cents - o.discount_cents
         OR o.subtotal_cents <> coalesce(i.soma, 0)`,
  );
  v.push(
    verificar(
      "total do pedido = Σ line_total + frete − desconto",
      totaisErrados.map((l) => String(l.pedido)),
      "1.000 pedidos",
    ),
  );
  const linhasErradas = await linhas(
    cliente,
    `SELECT i.id::text AS item
       FROM app.order_items i
       LEFT JOIN (SELECT order_item_id, sum(price_delta_cents * quantity) AS soma
                    FROM app.order_item_options GROUP BY order_item_id) x ON x.order_item_id = i.id
      WHERE i.line_total_cents <> i.unit_price_cents * i.quantity + i.options_total_cents
         OR i.options_total_cents <> coalesce(x.soma, 0) * i.quantity`,
  );
  v.push(
    verificar(
      "line_total = (unitário + opções) × quantidade",
      linhasErradas.map((l) => String(l.item)),
      "todos os itens",
    ),
  );

  // 4. Vínculos na mesma loja.
  const vinculos = await linhas(
    cliente,
    `SELECT 'produto' AS tipo, o.code AS pedido
       FROM app.order_items i
       JOIN app.orders o ON o.id = i.order_id
       LEFT JOIN app.products p ON p.id = i.product_id
      WHERE p.id IS NULL OR p.store_id <> o.store_id OR i.store_id <> o.store_id
     UNION ALL
     SELECT 'cliente', o.code
       FROM app.orders o
       LEFT JOIN app.store_customers c ON c.id = o.store_customer_id
      WHERE c.id IS NULL OR c.store_id <> o.store_id
     UNION ALL
     SELECT 'opção', o.code
       FROM app.order_item_options x
       JOIN app.order_items i ON i.id = x.order_item_id
       JOIN app.orders o ON o.id = i.order_id
       LEFT JOIN app.option_items oi ON oi.id = x.option_item_id
       LEFT JOIN app.option_groups g ON g.id = oi.group_id
      WHERE oi.id IS NULL OR g.id <> x.option_group_id
         OR g.store_id <> o.store_id OR g.product_id <> i.product_id`,
  );
  v.push(
    verificar(
      "produto, cliente e opção do pedido são da mesma loja",
      vinculos.map((l) => `${String(l.tipo)} em ${String(l.pedido)}`),
      "nenhum vínculo cruzado",
    ),
  );

  // 5. Histórico: ordem crescente, transições permitidas, fim = status do pedido.
  const pedidos = await linhas(
    cliente,
    `SELECT o.id::text AS id, o.code AS codigo, o.status, o.fulfillment, o.total_cents,
            o.placed_at, s.code AS loja, o.public_token
       FROM app.orders o JOIN app.stores s ON s.id = o.store_id`,
  );
  const historico = await linhas(
    cliente,
    `SELECT order_id::text AS pedido, from_status, to_status, occurred_at
       FROM app.order_status_history
      ORDER BY order_id, occurred_at, created_at, id`,
  );
  const passos = new Map<string, Record<string, unknown>[]>();
  for (const h of historico) {
    const lista = passos.get(String(h.pedido)) ?? [];
    lista.push(h);
    passos.set(String(h.pedido), lista);
  }
  const falhasDeHistorico: string[] = [];
  const ref = plano.referencia.getTime();
  const depoisDaReferencia: string[] = [];
  for (const p of pedidos) {
    const lista = passos.get(String(p.id)) ?? [];
    const codigo = String(p.codigo);
    let ok = lista.length > 0 && lista[0]!.from_status === null;
    for (let i = 1; ok && i < lista.length; i++) {
      const anterior = lista[i - 1]!;
      const atual = lista[i]!;
      ok =
        atual.from_status === anterior.to_status &&
        (atual.occurred_at as Date).getTime() > (anterior.occurred_at as Date).getTime() &&
        proximosStatusDoPedido(String(atual.from_status), String(p.fulfillment)).includes(
          String(atual.to_status),
        );
    }
    if (ok) ok = lista.at(-1)!.to_status === p.status;
    if (ok) ok = (lista[0]!.occurred_at as Date).getTime() === (p.placed_at as Date).getTime();
    if (!ok) falhasDeHistorico.push(`${String(p.loja)}/${codigo}`);
    const ultimo = lista.at(-1);
    if (
      (p.placed_at as Date).getTime() >= ref ||
      (ultimo !== undefined && (ultimo.occurred_at as Date).getTime() >= ref)
    ) {
      depoisDaReferencia.push(`${String(p.loja)}/${codigo}`);
    }
  }
  v.push(
    verificar(
      "histórico em ordem crescente, só com transições da máquina de status, terminando no status do pedido",
      falhasDeHistorico,
      "1.000 históricos",
    ),
  );
  v.push(
    verificar(
      "todos os pedidos e históricos acontecem antes da referência",
      depoisDaReferencia,
      "nenhum depois da referência",
    ),
  );

  // 6. Tokens (comparados em memória; nunca escritos).
  const tokenEsperado = new Map<string, string>();
  const codigoDaLoja = new Map<string, string>();
  for (const loja of plano.lojas) {
    for (const p of loja.pedidos) {
      tokenEsperado.set(id(`pedido:${p.chave}`), tokenDoPedido(p.chave));
      codigoDaLoja.set(id(`pedido:${p.chave}`), loja.chave);
    }
  }
  const tokensErrados = pedidos.filter(
    (p) => tokenEsperado.get(String(p.id)) !== p.public_token,
  );
  v.push(
    verificar(
      "token de acompanhamento = tokenDoPedido(chave) (conferido em memória)",
      tokensErrados.map((p) => `${String(p.loja)}/${String(p.codigo)}`),
      "1.000 tokens",
    ),
  );

  // 7. Catálogo.
  const categorias = await linhas(
    cliente,
    `SELECT e.code, count(c.id)::int AS n
       FROM (SELECT unnest($1::text[]) AS code) e
       LEFT JOIN app.stores s ON s.code = e.code
       LEFT JOIN app.categories c ON c.store_id = s.id AND c.deleted_at IS NULL AND c.is_visible
      GROUP BY e.code`,
    [codigos],
  );
  v.push(
    verificar(
      "2 categorias visíveis por loja",
      categorias.filter((l) => Number(l.n) !== 2).map((l) => String(l.code)),
      "100 lojas",
    ),
  );
  const produtos = await linhas(
    cliente,
    `SELECT e.code, count(p.id)::int AS n
       FROM (SELECT unnest($1::text[]) AS code) e
       LEFT JOIN app.stores s ON s.code = e.code
       LEFT JOIN app.products p ON p.store_id = s.id AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
      GROUP BY e.code`,
    [codigos],
  );
  v.push(
    verificar(
      `${PRODUTOS_POR_LOJA} produtos publicados por loja`,
      produtos.filter((l) => Number(l.n) !== PRODUTOS_POR_LOJA).map((l) => String(l.code)),
      `${produtos.length} lojas × ${PRODUTOS_POR_LOJA}`,
    ),
  );
  const semPrincipal = await linhas(
    cliente,
    `SELECT p.slug AS produto, s.code AS loja
       FROM app.products p JOIN app.stores s ON s.id = p.store_id
       LEFT JOIN app.product_images i ON i.product_id = p.id AND i.is_primary
      WHERE p.status = 'PUBLISHED'
      GROUP BY p.id, p.slug, s.code
     HAVING count(i.id) <> 1`,
  );
  v.push(
    verificar(
      "todo produto publicado tem exatamente 1 imagem principal",
      semPrincipal.map((l) => `${String(l.loja)}/${String(l.produto)}`),
      "800 produtos",
    ),
  );
  const donos = await contar(
    cliente,
    `SELECT count(DISTINCT m.store_id)::int AS n
       FROM app.store_members m JOIN app.stores s ON s.id = m.store_id
      WHERE m.role = 'OWNER' AND m.revoked_at IS NULL AND s.code = ANY($1::text[])`,
    [codigos],
  );
  v.push(
    verificar(
      "cada loja tem um dono vinculado",
      donos === TOTAL_DE_LOJAS ? [] : [`${donos} lojas com dono`],
      `${donos} lojas`,
    ),
  );

  // 8. Ids do plano = ids do banco.
  const idsDoPlano = plano.lojas.flatMap((l) => {
    const i = idsDaLoja(l);
    return [i.loja, ...i.categorias, ...i.produtos, ...i.clientes, ...i.pedidos];
  });
  const idsNoBanco = new Set(
    (
      await linhas(
        cliente,
        `SELECT id::text AS id FROM app.stores WHERE code LIKE 'SIM-%'
         UNION ALL SELECT c.id::text FROM app.categories c JOIN app.stores s ON s.id = c.store_id WHERE s.code LIKE 'SIM-%'
         UNION ALL SELECT p.id::text FROM app.products p JOIN app.stores s ON s.id = p.store_id WHERE s.code LIKE 'SIM-%'
         UNION ALL SELECT c.id::text FROM app.store_customers c JOIN app.stores s ON s.id = c.store_id WHERE s.code LIKE 'SIM-%'
         UNION ALL SELECT o.id::text FROM app.orders o JOIN app.stores s ON s.id = o.store_id WHERE s.code LIKE 'SIM-%'`,
      )
    ).map((l) => String(l.id)),
  );
  const faltando = idsDoPlano.filter((x) => !idsNoBanco.has(x));
  v.push(
    verificar(
      "os ids do plano são os ids do banco (lojas, categorias, produtos, clientes e pedidos)",
      idsNoBanco.size === idsDoPlano.length ? faltando : [`${idsNoBanco.size} no banco, ${idsDoPlano.length} no plano`, ...faltando],
      `${idsDoPlano.length} ids`,
    ),
  );

  // 9. Atacado.
  const esperadasDeAtacado = plano.lojas.filter((l) => l.atacado !== null).length;
  const atacadoNoBanco = await linhas(
    cliente,
    `SELECT s.code AS loja, p.slug AS produto,
            pr.min_quantity, pr.discount_kind, pr.discount_value, pr.amount_cents, pr.variant_id
       FROM app.product_prices pr
       JOIN app.products p ON p.id = pr.product_id
       JOIN app.stores s ON s.id = pr.store_id
      WHERE pr.kind = 'WHOLESALE'`,
  );
  const falhasDeAtacado = atacadoNoBanco
    .filter(
      (a) =>
        Number(a.min_quantity) !== ATACADO.minimo ||
        a.discount_kind !== "PERCENT" ||
        Number(a.discount_value) !== ATACADO.desconto ||
        Number(a.amount_cents) !== 0 ||
        a.variant_id !== null,
    )
    .map((a) => String(a.loja));
  v.push(
    verificar(
      "atacado: 1 faixa de 10 un. com 5 % por loja de varejo escolhida, presa ao produto",
      atacadoNoBanco.length === esperadasDeAtacado
        ? falhasDeAtacado
        : [`${atacadoNoBanco.length} faixas, ${esperadasDeAtacado} esperadas`, ...falhasDeAtacado],
      `${atacadoNoBanco.length} faixas`,
    ),
  );

  // 10. O pedido-prova.
  const idDaProva = id(`pedido:${CHAVE_DO_PEDIDO_PROVA}`);
  const prova = await linhas(
    cliente,
    `SELECT o.status, o.fulfillment, o.subtotal_cents, o.delivery_fee_cents, o.total_cents,
            i.quantity, i.unit_price_cents, i.options_total_cents, i.line_total_cents,
            s.code AS loja
       FROM app.orders o
       JOIN app.stores s ON s.id = o.store_id
       JOIN app.order_items i ON i.order_id = o.id
      WHERE o.id = $1`,
    [idDaProva],
  );
  const p0 = prova[0];
  v.push(
    verificar(
      "pedido-prova (Cozinha do Benfica): 2 × (2000 + 300) + 500 = 5100",
      prova.length === 1 &&
        p0!.status === "COMPLETED" &&
        p0!.fulfillment === "DELIVERY" &&
        Number(p0!.quantity) === 2 &&
        Number(p0!.unit_price_cents) === 2000 &&
        Number(p0!.options_total_cents) === 600 &&
        Number(p0!.line_total_cents) === 4600 &&
        Number(p0!.subtotal_cents) === 4600 &&
        Number(p0!.delivery_fee_cents) === 500 &&
        Number(p0!.total_cents) === 5100
        ? []
        : ["o pedido-prova não tem os valores esperados"],
      "orders.total = 5100; item 2 × 2000, opções 600, linha 4600",
    ),
  );

  // 11. Retrato histórico: trocar o preço do produto não mexe no pedido.
  v.push(await provarRetratoHistorico(cliente, plano, idDaProva));

  return {
    verificacoes: v,
    apoio: {
      pedidos: new Map(
        pedidos.map((p) => [
          String(p.id),
          {
            codigo: String(p.codigo),
            status: String(p.status),
            total: Number(p.total_cents),
            placedAt: p.placed_at as Date,
            loja: String(p.loja),
          },
        ]),
      ),
    },
  };
}

/** BEGIN, troca o preço da marmita, confere o item (2000/4600), ROLLBACK e confere que voltou. */
async function provarRetratoHistorico(
  cliente: ClienteSql,
  plano: PlanoDoPerfil,
  idDaProva: string,
): Promise<Verificacao> {
  const nome = "retrato histórico: trocar o preço da marmita não muda o pedido (BEGIN … ROLLBACK)";
  const loja = plano.lojas[0]!;
  const produtoId = id(`produto:${loja.chave}:marmita-frango-grelhado`);
  const antes = await linhas(
    cliente,
    "SELECT amount_cents FROM app.product_prices WHERE product_id = $1 AND kind = 'BASE'",
    [produtoId],
  );
  if (antes.length === 0) {
    return { nome, ok: false, detalhe: "a marmita não tem preço BASE no banco" };
  }
  const original = Number(antes[0]!.amount_cents);
  await cliente.query("BEGIN");
  let trocado: number;
  let dentro: Record<string, unknown>[];
  try {
    await cliente.query(
      "UPDATE app.product_prices SET amount_cents = 9900 WHERE product_id = $1 AND kind = 'BASE'",
      [produtoId],
    );
    trocado = Number(
      (await linhas(cliente, "SELECT amount_cents FROM app.product_prices WHERE product_id = $1 AND kind = 'BASE'", [produtoId]))[0]!.amount_cents,
    );
    dentro = await linhas(
      cliente,
      `SELECT i.unit_price_cents, i.line_total_cents, o.total_cents
         FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
        WHERE o.id = $1`,
      [idDaProva],
    );
  } finally {
    await cliente.query("ROLLBACK");
  }
  const depois = Number(
    (await linhas(cliente, "SELECT amount_cents FROM app.product_prices WHERE product_id = $1 AND kind = 'BASE'", [produtoId]))[0]!.amount_cents,
  );
  const ok =
    trocado === 9900 &&
    dentro.length === 1 &&
    Number(dentro[0]!.unit_price_cents) === 2000 &&
    Number(dentro[0]!.line_total_cents) === 4600 &&
    Number(dentro[0]!.total_cents) === 5100 &&
    depois === original;
  return {
    nome,
    ok,
    detalhe: ok
      ? "com o preço em 9900, o item continuou a 2000 / 4600 e o pedido a 5100; o ROLLBACK devolveu o preço original"
      : `preço trocado=${trocado}, item=${JSON.stringify(dentro[0] ?? null)}, preço depois do ROLLBACK=${depois} (original ${original})`,
  };
}

// ---------------------------------------------------------------------------
// Camada da aplicação
// ---------------------------------------------------------------------------

type Sharp = (entrada: Buffer) => {
  metadata(): Promise<{ width?: number; height?: number; format?: string }>;
  raw(): { toBuffer(): Promise<Buffer> };
};

let sharpCarregado: Sharp | null = null;
function carregarSharp(): Sharp {
  if (sharpCarregado !== null) return sharpCarregado;
  const doSite = createRequire(resolve(RAIZ, "apps/web/package.json"));
  const doNext = createRequire(doSite.resolve("next/package.json"));
  sharpCarregado = doNext("sharp") as Sharp;
  return sharpCarregado;
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** GET/POST respeitando `Retry-After` quando vier 429 (até 6 tentativas, no máximo 60 s cada). */
export async function pedir(
  url: string,
  opcoes: RequestInit & { readonly tentativas?: number } = {},
): Promise<Response> {
  const { tentativas = 6, ...init } = opcoes;
  for (let n = 1; ; n++) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
    if (r.status !== 429 || n >= tentativas) return r;
    const pedida = Number(r.headers.get("retry-after"));
    await r.arrayBuffer().catch(() => undefined);
    await esperar(Math.min(60, Number.isFinite(pedida) && pedida > 0 ? pedida : 2 * n) * 1000);
  }
}

/**
 * Espaça chamadas: a próxima só sai `intervaloMs` depois da anterior. O
 * catálogo público tem limite de 60 consultas/min por endereço (com espera
 * crescente até 15 min para quem insiste); a validação fica abaixo dele em vez
 * de afrouxar o limite da API.
 */
export function espacador(intervaloMs: number): () => Promise<void> {
  let proxima = 0;
  return async () => {
    const agora = Date.now();
    const vez = Math.max(agora, proxima);
    proxima = vez + intervaloMs;
    if (vez > agora) await esperar(vez - agora);
  };
}

/** Executa as tarefas com no máximo `limite` ao mesmo tempo. */
export async function comLimite<T>(
  tarefas: readonly (() => Promise<T>)[],
  limite = 4,
): Promise<T[]> {
  const resultados: T[] = new Array<T>(tarefas.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, tarefas.length) }, async () => {
    while (proximo < tarefas.length) {
      const i = proximo++;
      resultados[i] = await tarefas[i]!();
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}

interface ImagemEsperada {
  readonly loja: string;
  readonly url: string;
  readonly largura: number;
  readonly altura: number;
}

export interface ResultadoDaAplicacao {
  readonly verificacoes: Verificacao[];
  readonly imagens: {
    readonly logos: number;
    readonly capas: number;
    readonly principais: number;
    readonly extras: number;
    readonly extrasEsperadas: number;
  };
}

export async function validarAplicacao(
  cliente: ClienteSql,
  plano: PlanoDoPerfil,
  manifesto: Manifesto,
  enderecos: { readonly site: string; readonly api: string },
  apoio: DadosDeApoio,
  relatar: (linha: string) => void = () => {},
): Promise<ResultadoDaAplicacao> {
  const { site, api } = enderecos;
  const v: Verificacao[] = [];

  // --- vitrine e catálogo na API; página no site -----------------------------
  const falhasDaVitrine: string[] = [];
  const falhasDoCatalogo: string[] = [];
  const falhasDoAtacado: string[] = [];
  const falhasDoSite: string[] = [];
  const vezDoCatalogo = espacador(1200);
  await comLimite(
    manifesto.lojas.map((loja) => async () => {
      const vitrine = await pedir(`${api}/v1/vitrine/${loja.apelido}`);
      const corpo = (await vitrine.json().catch(() => null)) as { loja?: { apelido?: string; nome?: string } } | null;
      if (vitrine.status !== 200 || corpo?.loja?.apelido !== loja.apelido || corpo.loja.nome !== loja.nome) {
        falhasDaVitrine.push(`${loja.apelido}: HTTP ${vitrine.status}`);
      }
      await vezDoCatalogo();
      const catalogo = await pedir(`${api}/v1/vitrine/${loja.apelido}/catalogo`);
      const dados = (await catalogo.json().catch(() => null)) as {
        secoes?: { produtos: { id: string }[] }[];
      } | null;
      const produtos = new Map<string, { id: string }>();
      for (const secao of dados?.secoes ?? []) for (const p of secao.produtos) produtos.set(p.id, p);
      const esperados = new Set(loja.produtos.map((p) => p.id));
      if (catalogo.status !== 200 || produtos.size !== PRODUTOS_POR_LOJA || [...produtos.keys()].some((k) => !esperados.has(k))) {
        falhasDoCatalogo.push(`${loja.apelido}: HTTP ${catalogo.status}, ${produtos.size} produtos`);
      }
      // O atacado é conferido na página do produto: o cartão do catálogo não tem
      // preço de varejo quando o preço mora na variante "Único" (forma do seed
      // de demonstração), e sem preço de varejo a faixa não é mostrada nele.
      for (const esperado of loja.produtos.filter((p) => p.atacado !== null)) {
        const pagina = await pedir(`${api}/v1/vitrine/${loja.apelido}/produto/${esperado.id}`);
        const produto = (await pagina.json().catch(() => null)) as {
          precoCentavos?: number | null;
          atacado?: { pedidoMinimo?: number; faixas?: { quantidadeMinima?: number; tipoDeDesconto?: string; desconto?: number }[] } | null;
        } | null;
        const faixa = produto?.atacado?.faixas?.[0];
        if (
          pagina.status !== 200 ||
          produto?.atacado?.pedidoMinimo !== ATACADO.minimo ||
          faixa?.quantidadeMinima !== ATACADO.minimo ||
          faixa.tipoDeDesconto !== "PERCENTUAL" ||
          faixa.desconto !== ATACADO.desconto
        ) {
          falhasDoAtacado.push(`${loja.apelido}/${esperado.slug}`);
        }
      }
      const pagina = await pedir(`${site}/loja/${loja.apelido}`);
      const tipo = pagina.headers.get("content-type") ?? "";
      await pagina.arrayBuffer().catch(() => undefined);
      if (pagina.status !== 200 || !tipo.includes("text/html")) {
        falhasDoSite.push(`${loja.apelido}: HTTP ${pagina.status}`);
      }
    }),
    4,
  );
  relatar("  vitrine, catálogo e páginas do site conferidos");
  v.push(verificar("API: GET da vitrine das 100 lojas (200, apelido e nome)", falhasDaVitrine, "100 lojas"));
  v.push(verificar("API: catálogo das 100 lojas com os 8 produtos do manifesto", falhasDoCatalogo, "100 lojas × 8 produtos"));
  const comAtacado = manifesto.lojas.filter((l) => l.produtos.some((p) => p.atacado !== null)).length;
  v.push(verificar("API: a faixa de atacado (10 un., 5 %) aparece na página do produto", falhasDoAtacado, `${comAtacado} lojas de varejo`));
  v.push(verificar("site: GET /loja/<apelido> das 100 lojas (200 e text/html)", falhasDoSite, "100 páginas"));

  // --- imagens ---------------------------------------------------------------
  const acervo = new Map<string, { largura: number; altura: number }>();
  for (const l of await linhas(
    cliente,
    `SELECT storage_key, width, height FROM app.assets WHERE storage_key LIKE 'demo/simulacao/%'`,
  )) {
    acervo.set(`/${String(l.storage_key)}`, { largura: Number(l.width), altura: Number(l.height) });
  }
  const principais: ImagemEsperada[] = [];
  const logos: ImagemEsperada[] = [];
  const capas: ImagemEsperada[] = [];
  for (const loja of manifesto.lojas) {
    for (const [lista, url] of [[logos, loja.logo], [capas, loja.capa]] as const) {
      const medida = url === null ? undefined : acervo.get(url);
      lista.push({ loja: loja.apelido, url: url ?? "(sem imagem)", largura: medida?.largura ?? -1, altura: medida?.altura ?? -1 });
    }
    for (const p of loja.produtos) {
      const medida = p.imagem === null ? undefined : acervo.get(p.imagem);
      principais.push({ loja: loja.apelido, url: p.imagem ?? "(sem imagem)", largura: medida?.largura ?? -1, altura: medida?.altura ?? -1 });
    }
  }
  const extras: ImagemEsperada[] = (
    await linhas(
      cliente,
      `SELECT s.slug AS loja, i.url, i.width, i.height
         FROM app.product_images i JOIN app.stores s ON s.id = i.store_id
        WHERE s.code LIKE 'SIM-%' AND NOT i.is_primary`,
    )
  ).map((l) => ({ loja: String(l.slug ?? l.loja), url: String(l.url), largura: Number(l.width), altura: Number(l.height) }));
  const extrasEsperadas =
    plano.lojas.reduce((s, l) => s + l.loja.produtos.reduce((t, p) => t + fotosDoProduto(p), 0), 0) -
    plano.lojas.reduce((s, l) => s + l.loja.produtos.length, 0);

  const sharp = carregarSharp();
  const conferirImagens = async (lista: readonly ImagemEsperada[]): Promise<string[]> => {
    const falhas: string[] = [];
    await comLimite(
      lista.map((img) => async () => {
        if (img.largura < 0) {
          falhas.push(`${img.loja}: imagem fora do acervo`);
          return;
        }
        try {
          const r = await pedir(`${site}${img.url}`);
          const tipo = r.headers.get("content-type") ?? "";
          const bytes = Buffer.from(await r.arrayBuffer());
          if (r.status !== 200) return void falhas.push(`${img.loja}: HTTP ${r.status}`);
          if (!tipo.startsWith("image/")) return void falhas.push(`${img.loja}: content-type ${tipo}`);
          const medida = await sharp(bytes).metadata();
          await sharp(bytes).raw().toBuffer();
          if (medida.width !== img.largura || medida.height !== img.altura) {
            falhas.push(`${img.loja}: ${medida.width}×${medida.height}, acervo ${img.largura}×${img.altura}`);
          }
        } catch (erro) {
          falhas.push(`${img.loja}: ${erro instanceof Error ? erro.message.slice(0, 80) : "erro"}`);
        }
      }),
      4,
    );
    return falhas;
  };
  const checagens: readonly (readonly [string, readonly ImagemEsperada[]])[] = [
    ["logos", logos],
    ["capas", capas],
    ["imagens principais", principais],
  ];
  for (const [rotulo, lista] of checagens) {
    const falhas = await conferirImagens(lista);
    relatar(`  ${lista.length} ${rotulo} conferidas`);
    v.push(
      verificar(
        `imagens: ${lista.length} ${rotulo} (HTTP 200, content-type de imagem, decodificação e dimensões do acervo)`,
        falhas,
        `${lista.length} conferidas`,
      ),
    );
  }
  const falhasDosExtras = await conferirImagens(extras);
  relatar(`  ${extras.length} fotos extras conferidas`);
  v.push(
    verificar(
      `imagens: ${extras.length} fotos extras (eixo de cor e fotos), contadas à parte; esperadas pelo perfil: ${extrasEsperadas}`,
      extras.length === extrasEsperadas ? falhasDosExtras : [`${extras.length} no banco, ${extrasEsperadas} esperadas`, ...falhasDosExtras],
      `${extras.length} conferidas`,
    ),
  );

  // --- acompanhamento: 1 pedido por status em cada segmento -------------------
  const escolhidas = new Map<string, typeof plano.lojas[number]>();
  for (const loja of plano.lojas) if (!escolhidas.has(loja.segmento)) escolhidas.set(loja.segmento, loja);
  const falhasDoAcompanhamento: string[] = [];
  let consultados = 0;
  const tarefas: (() => Promise<void>)[] = [];
  for (const loja of escolhidas.values()) {
    const vistos = new Set<string>();
    for (const pedido of loja.pedidos) {
      if (vistos.has(pedido.pedido.status)) continue;
      vistos.add(pedido.pedido.status);
      tarefas.push(async () => {
        const banco = apoio.pedidos.get(id(`pedido:${pedido.chave}`));
        const r = await pedir(`${api}/v1/vitrine/${loja.loja.nova!.apelido}/pedido/${tokenDoPedido(pedido.chave)}`);
        const corpo = (await r.json().catch(() => null)) as { pedido?: { status?: string; totalCentavos?: number; codigo?: string } } | null;
        consultados++;
        if (r.status !== 200 || banco === undefined || corpo?.pedido?.status !== banco.status || corpo.pedido.totalCentavos !== banco.total || corpo.pedido.codigo !== banco.codigo) {
          falhasDoAcompanhamento.push(`${loja.chave}/${pedido.chave.split(":").at(-1)}: HTTP ${r.status}`);
        }
      });
    }
  }
  await comLimite(tarefas, 4);
  relatar(`  ${consultados} acompanhamentos conferidos`);
  v.push(
    verificar(
      `acompanhamento: 1 pedido por status em cada um dos ${escolhidas.size} segmentos (${consultados} consultas)`,
      falhasDoAcompanhamento,
      `${consultados} pedidos batem com o banco (status, código e total)`,
    ),
  );

  // --- painel: login do dono, fila e detalhe ---------------------------------
  const falhasDoPainel: string[] = [];
  let painelConsultado = 0;
  let provaNoPainel = false;
  for (const loja of escolhidas.values()) {
    const apelido = loja.loja.nova!.apelido;
    const login = await pedir(`${api}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: site },
      body: JSON.stringify({ email: loja.loja.nova!.dono.email, senha: SENHA_DOS_DONOS }),
    });
    const sessao = (await login.json().catch(() => null)) as { status?: string; papel?: string; tokenDeAcesso?: string } | null;
    if (login.status !== 200 || sessao?.status !== "SESSAO_CRIADA" || sessao.tokenDeAcesso === undefined) {
      falhasDoPainel.push(`${apelido}: login HTTP ${login.status}`);
      continue;
    }
    const cabecalho = { authorization: `Bearer ${sessao.tokenDeAcesso}`, origin: site };
    // Um pedido ativo (o PENDING) e o pedido-prova, cada um no dia em que foi feito.
    const alvos = loja.pedidos.filter((p) => p.pedido.status === "PENDING" || (loja.indice === 0 && p.chave === CHAVE_DO_PEDIDO_PROVA));
    for (const alvo of alvos) {
      const idDoPedido = id(`pedido:${alvo.chave}`);
      const banco = apoio.pedidos.get(idDoPedido);
      if (banco === undefined) {
        falhasDoPainel.push(`${apelido}: pedido fora do banco`);
        continue;
      }
      const fila = await pedir(`${api}/v1/lojas/${apelido}/pedidos?dia=${diaLocal(banco.placedAt)}`, { headers: cabecalho });
      const lista = (await fila.json().catch(() => null)) as { pedidos?: { id: string; status: string; totalCentavos: number }[] } | null;
      const naFila = lista?.pedidos?.find((p) => p.id === idDoPedido);
      painelConsultado++;
      if (fila.status !== 200 || naFila?.status !== banco.status || naFila.totalCentavos !== banco.total) {
        falhasDoPainel.push(`${apelido}: fila HTTP ${fila.status}`);
      }
      const detalhe = await pedir(`${api}/v1/lojas/${apelido}/pedidos/${idDoPedido}`, { headers: cabecalho });
      const d = (await detalhe.json().catch(() => null)) as {
        pedido?: { totalCentavos?: number; status?: string; itens?: { precoUnitarioCentavos?: number; totalCentavos?: number; quantidade?: number }[] };
      } | null;
      painelConsultado++;
      if (detalhe.status !== 200 || d?.pedido?.totalCentavos !== banco.total || d.pedido.status !== banco.status) {
        falhasDoPainel.push(`${apelido}: detalhe HTTP ${detalhe.status}`);
      }
      if (alvo.chave === CHAVE_DO_PEDIDO_PROVA) {
        const item = d?.pedido?.itens?.[0];
        provaNoPainel =
          d?.pedido?.totalCentavos === 5100 &&
          item?.precoUnitarioCentavos === 2000 &&
          item.totalCentavos === 4600 &&
          item.quantidade === 2;
      }
    }
  }
  relatar(`  ${painelConsultado} consultas ao painel conferidas`);
  v.push(
    verificar(
      `painel: login do dono, fila do dia e detalhe do pedido em 1 loja de cada um dos ${escolhidas.size} segmentos (${painelConsultado} consultas)`,
      falhasDoPainel,
      "fila e detalhe batem com o banco",
    ),
  );
  v.push(
    verificar(
      "painel: o detalhe do pedido-prova mostra R$ 51,00 (item 2 × R$ 20,00, linha R$ 46,00)",
      provaNoPainel ? [] : ["o detalhe do pedido-prova não veio com 5100 / 2000 / 4600"],
      "5100 no detalhe do painel; 5100 também no acompanhamento (Cozinha do Benfica)",
    ),
  );

  return {
    verificacoes: v,
    imagens: {
      logos: logos.length,
      capas: capas.length,
      principais: principais.length,
      extras: extras.length,
      extrasEsperadas,
    },
  };
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

const marca = (ok: boolean): string => (ok ? "✔" : "✘");

function tabela(verificacoes: readonly Verificacao[]): string {
  const celula = (t: string): string => t.replaceAll("|", "\\|");
  const linhasDaTabela = verificacoes.map(
    (x) => `| ${marca(x.ok)} | ${celula(x.nome)} | ${celula(x.detalhe)}${x.exemplos === undefined ? "" : ` (ex.: ${celula(x.exemplos.join("; "))})`} |`,
  );
  return ["| | Verificação | Resultado |", "|---|---|---|", ...linhasDaTabela].join("\n");
}

export function montarRelatorio(dados: {
  readonly plano: PlanoDoPerfil;
  readonly referenciaTexto: string;
  readonly banco: string;
  readonly impressoes: { readonly ids: string; readonly conteudo: string; readonly lojas: number; readonly pedidos: number };
  readonly verificacoesDoBanco: readonly Verificacao[];
  readonly aplicacao: ResultadoDaAplicacao | null;
  readonly enderecos: { readonly site: string; readonly api: string } | null;
}): string {
  const { plano, impressoes, verificacoesDoBanco, aplicacao } = dados;
  const tudo = [...verificacoesDoBanco, ...(aplicacao?.verificacoes ?? [])];
  const aprovado = tudo.every((x) => x.ok);
  const partes = [
    "# Relatório de validação — seed de simulação",
    "",
    `**Resultado: ${aprovado ? "APROVADO" : "REPROVADO"}** — ${tudo.filter((x) => x.ok).length} de ${tudo.length} verificações.`,
    "",
    "## Perfil",
    "",
    `- semente: \`${plano.semente}\``,
    `- referência: \`${dados.referenciaTexto}\``,
    `- impressão do perfil (em \`stores.code\`): \`${plano.impressao}\``,
    `- base: \`${dados.banco}\``,
    `- lojas: ${impressoes.lojas}; pedidos: ${impressoes.pedidos}`,
    "",
    "## Impressões (SHA-256) — duas execuções iguais têm as duas iguais",
    "",
    `- ids ordenados: \`${impressoes.ids}\``,
    `- conteúdo (preços, itens, totais, datas, status e nomes por id): \`${impressoes.conteudo}\``,
    "",
    "## Camada do banco",
    "",
    tabela(verificacoesDoBanco),
    "",
    "## Camada da aplicação",
    "",
  ];
  if (aplicacao === null || dados.enderecos === null) {
    partes.push("Não executada (faltou `--site` e `--api`).");
  } else {
    partes.push(
      `Site ${mascararUrl(dados.enderecos.site)} e API ${mascararUrl(dados.enderecos.api)}.`,
      "",
      `Imagens: ${aplicacao.imagens.logos} logos, ${aplicacao.imagens.capas} capas e ${aplicacao.imagens.principais} imagens principais; mais ${aplicacao.imagens.extras} fotos extras (esperadas pelo perfil: ${aplicacao.imagens.extrasEsperadas}).`,
      "",
      tabela(aplicacao.verificacoes),
    );
  }
  partes.push("");
  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

async function principal(argv: readonly string[]): Promise<number> {
  const escrever = (linha: string): void => {
    process.stdout.write(`${linha}\n`);
  };
  let cliente: Awaited<ReturnType<typeof conectarAdministracao>> | null = null;
  try {
    const parametros = lerParametrosDaValidacao(argv);
    const manifesto = JSON.parse(await lerSaida("manifesto.json").catch(() => {
      throw new ErroDeParametros("saida/manifesto.json não existe: rode seed:simulacao antes.");
    })) as Manifesto;
    const semente = validarSemente(parametros.semente ?? manifesto.perfil.semente);
    const referenciaTexto = parametros.referencia === null ? manifesto.perfil.referencia : argv[argv.indexOf("--referencia") + 1]!;
    const referencia = parametros.referencia ?? validarReferencia(manifesto.perfil.referencia);
    const plano = montarPlano(semente, referencia);
    if (plano.impressao !== manifesto.perfil.impressao) {
      throw new ErroDeGuarda("O perfil pedido não é o do manifesto (impressão diferente): rode seed:simulacao de novo.");
    }

    const alvo = montarAlvo(process.env, parametros.banco);
    cliente = await conectarAdministracao(alvo);
    escrever("Camada do banco…");
    const { verificacoes, apoio } = await validarBanco(cliente, plano);
    for (const x of verificacoes) escrever(`  ${marca(x.ok)} ${x.nome}${x.ok ? "" : ` — ${x.detalhe}`}`);
    const impressoes = await impressoesDoBanco(cliente);

    let aplicacao: ResultadoDaAplicacao | null = null;
    if (parametros.site !== null && parametros.api !== null) {
      escrever(`Camada da aplicação (site ${mascararUrl(parametros.site)}, API ${mascararUrl(parametros.api)})…`);
      aplicacao = await validarAplicacao(cliente, plano, manifesto, { site: parametros.site, api: parametros.api }, apoio, escrever);
      for (const x of aplicacao.verificacoes) escrever(`  ${marca(x.ok)} ${x.nome}${x.ok ? "" : ` — ${x.detalhe}`}`);
    } else {
      escrever("Camada da aplicação não executada (informe --site e --api).");
    }

    const relatorio = montarRelatorio({
      plano,
      referenciaTexto,
      banco: parametros.banco,
      impressoes,
      verificacoesDoBanco: verificacoes,
      aplicacao,
      enderecos: parametros.site !== null && parametros.api !== null ? { site: parametros.site, api: parametros.api } : null,
    });
    const cabecalho = { perfil: plano.impressao, executadoEm: new Date().toISOString() };
    const saidas: Record<string, string> = {
      "validacao-banco.json": `${JSON.stringify({ ...cabecalho, impressoes, verificacoes }, null, 2)}\n`,
      "relatorio.md": relatorio,
    };
    if (aplicacao !== null) {
      saidas["validacao-aplicacao.json"] = `${JSON.stringify({ ...cabecalho, imagens: aplicacao.imagens, verificacoes: aplicacao.verificacoes }, null, 2)}\n`;
    }
    // A varredura roda ANTES de gravar: saída suja não chega ao disco.
    const sujas = Object.entries(saidas).flatMap(([nome, texto]) => varrerSaidas(texto).map((p) => `${nome}: ${p}`));
    if (sujas.length > 0) {
      throw new Error(`Varredura das saídas reprovou (${sujas.join("; ")}); nada foi gravado.`);
    }
    for (const [nome, texto] of Object.entries(saidas)) await escreverSaida(nome, texto);
    const reprovadas = [...verificacoes, ...(aplicacao?.verificacoes ?? [])].filter((x) => !x.ok);
    escrever(reprovadas.length === 0 ? "APROVADO. Relatório em saida/relatorio.md." : `REPROVADO: ${reprovadas.length} verificação(ões). Relatório em saida/relatorio.md.`);
    return reprovadas.length === 0 ? 0 : 1;
  } catch (erro) {
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    return erro instanceof ErroDeParametros ? 2 : 1;
  } finally {
    await cliente?.end().catch(() => {});
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}

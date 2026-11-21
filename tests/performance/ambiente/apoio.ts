/**
 * Peças comuns dos scripts de ambiente do desempenho (Estruturação 5).
 *
 * Tudo aqui roda com `node` direto (Node 24 tira os tipos), a partir da raiz do
 * repositório. As credenciais e endereços chegam pelo ambiente, nunca do código:
 * no CI, pelo `env` do job; no computador, pelo `.env` da raiz (o
 * `--env-file-if-exists` dos comandos) ou pelo local.sh.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";

import { montarAmbientesDosServidores } from "../../../packages/database/seed/simulacao/aplicacao.ts";
import {
  conectarConferindo,
  montarAlvo,
  type AlvoDaSimulacao,
} from "../../../packages/database/seed/simulacao/banco.ts";
import { BANCO_PADRAO } from "../../../packages/database/seed/simulacao/parametros.ts";

export const RAIZ = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Portas e índice do Redis do ensaio: fora das do e2e (3100/3101) e do seed (3200/3201). */
export const PORTA_DO_SITE = 3300;
export const PORTA_DA_API = 3301;
export const INDICE_DO_REDIS = 6;
export const URL_DO_SITE = `http://localhost:${PORTA_DO_SITE}`;
export const URL_DA_API = `http://localhost:${PORTA_DA_API}`;

/** O perfil do seed: semente e data de referência fixas (iguais às do #135). */
export const SEMENTE = process.env.SEMENTE?.trim() || "sc-2026";
export const REFERENCIA =
  process.env.REFERENCIA?.trim() || "2026-11-01T18:00:00-03:00";

/** Acima disto o limitador do catálogo (60/min por IP) deixa de medir o catálogo. */
export const LIMITE_DO_CATALOGO_NO_ENSAIO = "1000000";

export const ETAPAS = ["smoke", "carga", "estresse"] as const;
export type Etapa = (typeof ETAPAS)[number];

export function etapaDoArgumento(valor: string | undefined): Etapa {
  if (valor !== undefined && (ETAPAS as readonly string[]).includes(valor)) {
    return valor as Etapa;
  }
  throw new Error(`Informe a etapa: ${ETAPAS.join(", ")}.`);
}

/**
 * `tests/performance/saida/<rótulo>/`, criada se faltar. O rótulo (#142) vem de
 * ROTULO (ex.: carga-antes-1) e, sem ele, é a própria etapa.
 */
export function rotuloDaSaida(etapa: Etapa): string {
  const rotulo = process.env.ROTULO?.trim() || etapa;
  if (!/^[a-z0-9-]{1,40}$/.test(rotulo)) throw new Error(`ROTULO inválido: ${rotulo}`);
  return rotulo;
}

export function pastaDaSaida(etapa: Etapa): string {
  const pasta = resolve(RAIZ, "tests/performance/saida", rotuloDaSaida(etapa));
  mkdirSync(pasta, { recursive: true });
  return pasta;
}

export function lerJson<T>(caminho: string): T | null {
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as T;
  } catch {
    return null;
  }
}

export function gravarJson(caminho: string, valor: unknown): void {
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`);
}

export const CAMINHO_DO_MANIFESTO = resolve(
  RAIZ,
  "packages/database/seed/simulacao/saida/manifesto.json",
);

export interface ProdutoDoManifesto {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly imagem: string;
}

export interface LojaDoManifesto {
  readonly indice: number;
  readonly codigo: string;
  readonly apelido: string;
  readonly nome: string;
  readonly segmento: string;
  readonly logo: string;
  readonly capa: string;
  readonly produtos: readonly ProdutoDoManifesto[];
}

export interface Manifesto {
  readonly perfil: {
    readonly semente: string;
    readonly referencia: string;
    readonly impressao: string;
    readonly banco: string;
    readonly lojas: number;
    readonly pedidosPorLoja: number;
  };
  readonly lojas: readonly LojaDoManifesto[];
}

export function lerManifesto(): Manifesto {
  const manifesto = lerJson<Manifesto>(CAMINHO_DO_MANIFESTO);
  if (manifesto === null) {
    throw new Error(
      `Manifesto do seed não encontrado em ${CAMINHO_DO_MANIFESTO}: rode o seed:simulacao antes.`,
    );
  }
  return manifesto;
}

/** O alvo do banco da simulação, já passado pelas guardas do seed. */
export function alvoDoBanco(): AlvoDaSimulacao {
  return montarAlvo(process.env, BANCO_PADRAO);
}

/** Conecta como superusuário (não sofre RLS) e confere `current_database()`. */
export async function conectarNaBase(): Promise<pg.Client> {
  const alvo = alvoDoBanco();
  return conectarConferindo(alvo.urlDoMigrador, alvo.banco);
}

export interface AmbientesDoEnsaio {
  readonly api: Record<string, string>;
  readonly site: Record<string, string>;
}

/**
 * O ambiente da API e o do site: o do seed (banco da simulação, segredos
 * aleatórios só na memória) mais o que é próprio do ensaio. O Redis vai para o
 * índice /6 em QUALQUER ambiente, e o limitador do catálogo é levantado.
 */
export function ambientesDoEnsaio(): AmbientesDoEnsaio {
  const base = montarAmbientesDosServidores(process.env, {
    banco: BANCO_PADRAO,
    portaDaApi: PORTA_DA_API,
    portaDoSite: PORTA_DO_SITE,
  });
  const redis = new URL(base.api.REDIS_URL ?? "");
  redis.pathname = `/${INDICE_DO_REDIS}`;
  const comum = {
    REDIS_URL: redis.toString(),
    REDIS_URL_TEST: redis.toString(),
    VITRINE_CATALOGO_LIMITE: LIMITE_DO_CATALOGO_NO_ENSAIO,
  };
  return {
    api: {
      ...base.api,
      ...comum,
      ARMAZENAMENTO_PRIVADO_DIR: mkdtempSync(
        resolve(tmpdir(), "sc-perf-privado-"),
      ),
    },
    site: {
      ...base.site,
      ...comum,
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: URL_DA_API,
      URL_DO_SITE,
    },
  };
}

export const esperar = (ms: number): Promise<void> =>
  new Promise((aceitar) => setTimeout(aceitar, ms));

/** Os bytes de um WebP começam com RIFF e têm WEBP na posição 8. */
export function ehWebp(corpo: Uint8Array): boolean {
  if (corpo.byteLength < 100) return false;
  const texto = (de: number, ate: number): string =>
    String.fromCharCode(...corpo.slice(de, ate));
  return texto(0, 4) === "RIFF" && texto(8, 12) === "WEBP";
}

/**
 * Total do pedido fecha em centavos: total = Σ linhas + frete − desconto,
 * subtotal = Σ linhas, linha = unitário × quantidade + opções, opções =
 * Σ(acréscimo × quantidade da opção) × quantidade do item. É a fórmula do
 * `seed:simulacao:validar` (validar.ts), aqui sobre os pedidos que o filtro
 * escolher. O filtro entra como cláusula SQL fixa, nunca com dado de fora.
 */
export function sqlDosTotaisErrados(filtroDeChave: string): string {
  return `
    SELECT o.code AS pedido, o.total_cents::text AS total, o.subtotal_cents::text AS subtotal,
           coalesce(i.soma, 0)::text AS soma_das_linhas
      FROM app.orders o
      LEFT JOIN (SELECT order_id, sum(line_total_cents) AS soma
                   FROM app.order_items GROUP BY order_id) i ON i.order_id = o.id
     WHERE ${filtroDeChave}
       AND (o.total_cents <> coalesce(i.soma, 0) + o.delivery_fee_cents - o.discount_cents
            OR o.subtotal_cents <> coalesce(i.soma, 0))`;
}

export function sqlDasLinhasErradas(filtroDeChave: string): string {
  return `
    SELECT o.code AS pedido, i.id::text AS item
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id
      LEFT JOIN (SELECT order_item_id, sum(price_delta_cents * quantity) AS soma
                   FROM app.order_item_options GROUP BY order_item_id) x ON x.order_item_id = i.id
     WHERE ${filtroDeChave}
       AND (i.line_total_cents <> i.unit_price_cents * i.quantity + i.options_total_cents
            OR i.options_total_cents <> coalesce(x.soma, 0) * i.quantity)`;
}

/**
 * Linha de um pedido criado PELA API (caminho do carrinho, o do k6). A
 * convenção da API é outra que a do seed: `unit_price_cents` já traz o
 * acréscimo das opções, `options_total_cents` é o acréscimo POR UNIDADE e
 * `line_total = unit_price × quantity` (teste da API:
 * apps/api/tests/carrinho-rota.int.test.ts). O seed grava unitário sem o
 * acréscimo e `options_total` por linha: só `line_total` coincide. Por isso os
 * pedidos do k6 NÃO usam `sqlDasLinhasErradas`. O preço de cada opção
 * (`order_item_options.price_delta_cents`) não entra na conta: nesse caminho a
 * API o grava como 0 (ver `sqlDasOpcoesSemPreco`).
 */
export function sqlDasLinhasErradasDaApi(filtroDeChave: string): string {
  return `
    SELECT o.code AS pedido, i.id::text AS item, i.quantity::text AS quantidade,
           i.unit_price_cents::text AS unitario, i.options_total_cents::text AS opcoes,
           i.line_total_cents::text AS linha
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id
     WHERE ${filtroDeChave}
       AND (i.line_total_cents <> i.unit_price_cents * i.quantity
            OR i.options_total_cents > i.unit_price_cents)`;
}

/**
 * Itens com acréscimo de opções (options_total > 0) cujas linhas de opção
 * gravaram preço 0: observação, não reprovação (a API guarda só o total).
 */
export function sqlDasOpcoesSemPreco(filtroDeChave: string): string {
  return `
    SELECT count(*)::int AS itens
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id
     WHERE ${filtroDeChave}
       AND i.options_total_cents > 0
       AND coalesce((SELECT sum(price_delta_cents * quantity)
                       FROM app.order_item_options x
                      WHERE x.order_item_id = i.id), 0) = 0`;
}

/**
 * Pedidos INICIAIS (de antes do k6): os do seed e, com VOLUME=sim, os do volume.
 * A chave de idempotência do k6 começa com `k6-`; a do volume, com `vol-`.
 */
export const SO_DO_SEED = "COALESCE(o.idempotency_key, '') NOT LIKE 'k6-%'";
/** Só os 1.000 do seed de simulação (fórmula de itens do seed). */
export const SO_DA_BASE_DO_SEED =
  "COALESCE(o.idempotency_key, '') NOT LIKE 'k6-%' AND COALESCE(o.idempotency_key, '') NOT LIKE 'vol-%'";
/** Só os do volume (#138), que seguem a fórmula de itens do checkout (a da API). */
export const SO_DO_VOLUME = "COALESCE(o.idempotency_key, '') LIKE 'vol-%'";

/** O modo da execução: com ou sem o volume de 100 mil pedidos. */
export const COM_VOLUME = process.env.VOLUME === "sim";

/** Pedidos ligados a cliente de outra loja, e itens de outra loja: precisam ser 0. */
export const SQL_DOS_VINCULOS_ENTRE_LOJAS = `
  SELECT (SELECT count(*) FROM app.orders o JOIN app.store_customers c ON c.id = o.store_customer_id
           WHERE c.store_id <> o.store_id)::int AS clientes,
         (SELECT count(*) FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
           WHERE i.store_id <> o.store_id)::int AS itens`;

/**
 * Impressão SHA-256 dos pedidos iniciais (loja, número, status, valores e data):
 * se um pedido do seed mudar durante o ensaio, a reconciliação percebe.
 */
export async function impressaoDosPedidosIniciais(cliente: {
  query: (texto: string) => Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<string> {
  const r = await cliente.query(
    `SELECT s.code AS loja, o.number::text AS numero, o.status, o.total_cents::text AS total,
            o.subtotal_cents::text AS subtotal, o.delivery_fee_cents::text AS frete,
            to_char(o.placed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS feito
       FROM app.orders o JOIN app.stores s ON s.id = o.store_id
      WHERE ${SO_DO_SEED}
      ORDER BY s.code, o.number`,
  );
  const hash = createHash("sha256");
  for (const l of r.rows) {
    hash.update(
      `${l.loja}|${l.numero}|${l.status}|${l.total}|${l.subtotal}|${l.frete}|${l.feito}\n`,
    );
  }
  return hash.digest("hex");
}

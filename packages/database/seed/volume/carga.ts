/**
 * A CARGA do volume (#138): +100.000 pedidos, uma transação por loja.
 *
 * Ordem (D-3): guarda → trava advisory (conexão dedicada) → pré-voo → por
 * loja: BEGIN, confere a sequência, INSERT … SELECT FROM unnest, atualiza a
 * sequência, COMMIT. Só `sc_admin` grava; RLS e constraints seguem ativas.
 *
 * Idempotência por loja: base apenas (vazia) insere; exatamente o plano
 * (completa) pula; qualquer outra coisa (divergente) recusa sem reparar.
 */

import { performance } from "node:perf_hooks";

import type { ClienteSql } from "../../src/migrate.ts";
import { type Ambiente, ErroDeGuarda } from "../simulacao/banco.ts";
import {
  impressaoDaBase,
  type EstadoDaLoja,
  lerEstadoDaLoja,
  lerLojasDaBase,
  numero,
  situacaoDaLoja,
  texto,
} from "./base.ts";
import { INVARIANTES } from "./checagens.ts";
import {
  abrirConexaoGuardada,
  type ConexaoDoVolume,
  type FabricaDeConexao,
  fabricaPadrao,
} from "./guarda.ts";
import {
  type ParametrosDoVolume,
  PEDIDOS_DO_VOLUME,
  ULTIMO_NUMERO_DA_BASE,
} from "./parametros.ts";
import {
  distribuirPedidos,
  EMAIL_DA_IDENTIDADE,
  FUSO_DAS_LOJAS,
  hashDaLoja,
  hashDoPlano,
  idDaIdentidadeDoVolume,
  idsDosPedidos,
  LOJAS_COM_IDENTIDADE,
  type LojaDoBanco,
  montarPlanoDaLoja,
  type PlanoDaLojaDoVolume,
} from "./plano.ts";

/** Chave da trava advisory (duas partes inteiras: espaço separado das bigint do projeto). */
export const TRAVA_DO_VOLUME: readonly [number, number] = [8_310_138, 1];

/** Erro sem texto do banco: só a etapa e o código SQLSTATE (nunca message/detail). */
export class ErroDoVolume extends Error {
  readonly etapa: string;
  readonly codigo: string;
  constructor(etapa: string, codigo: string) {
    super(`Falha na etapa "${etapa}" (código ${codigo}).`);
    this.name = "ErroDoVolume";
    this.etapa = etapa;
    this.codigo = codigo;
  }
}

/** A falha pedida por `--falhar-na-loja`: prova o rollback da loja inteira. */
export class FalhaInduzida extends Error {
  readonly loja: number;
  constructor(loja: number) {
    super(`Falha induzida na loja ${loja} (antes do COMMIT).`);
    this.name = "FalhaInduzida";
    this.loja = loja;
  }
}

export function erroSeguro(etapa: string, erro: unknown): Error {
  if (erro instanceof ErroDeGuarda || erro instanceof FalhaInduzida || erro instanceof ErroDoVolume) {
    return erro;
  }
  const codigo =
    typeof erro === "object" && erro !== null && "code" in erro
      ? String((erro as { code: unknown }).code)
      : "desconhecido";
  return new ErroDoVolume(etapa, codigo);
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type ResultadoDaLoja = "inserida" | "pulada" | "ensaiada";

export interface RegistroDaLoja {
  readonly indice: number;
  readonly codigo: string;
  readonly quantidade: number;
  readonly resultado: ResultadoDaLoja;
  readonly ms: number;
}

export interface ResumoDaCarga {
  readonly modo: "completa" | "retomada" | "sem-efeito" | "ensaio";
  readonly ensaio: boolean;
  readonly lojas: readonly RegistroDaLoja[];
  readonly pedidosInseridos: number;
  readonly pedidosPulados: number;
  readonly clientesInseridos: number;
  readonly hashDoPlano: string;
  readonly impressaoDaBaseAntes: string;
  readonly impressaoDaBaseDepois: string;
  readonly tempos: { readonly preparoMs: number; readonly cargaMs: number; readonly totalMs: number };
  /** Instante do início do primeiro INSERT (para esperar o autoanalyze). */
  readonly inicioDaEscrita: string | null;
}

// ---------------------------------------------------------------------------
// Pré-voo
// ---------------------------------------------------------------------------

/** Colunas que o INSERT usa: confere por `information_schema` (sc_admin lê o esquema `app`). */
export const COLUNAS_USADAS: Readonly<Record<string, readonly string[]>> = {
  orders: [
    "id", "store_id", "number", "code", "public_token", "store_customer_id", "status", "channel",
    "fulfillment", "payment_method", "change_for_cents", "pix_key_snapshot", "pix_holder_snapshot",
    "pix_key_type_snapshot", "pix_account_name_snapshot", "subtotal_cents", "items_total_cents",
    "delivery_fee_cents", "delivery_fee_mode", "total_cents", "currency", "payment_status",
    "cost_total_cents", "idempotency_key", "whatsapp_message_chars", "whatsapp_clicked_at",
    "whatsapp_confirmed_at", "store_timezone", "placed_at", "accepted_at", "completed_at",
    "cancelled_at", "cancel_reason", "created_at", "updated_at",
  ],
  order_contacts: [
    "order_id", "store_id", "name", "phone_e164", "email", "recipient_name", "street", "number",
    "complement", "neighborhood", "city", "uf", "created_at", "updated_at",
  ],
  order_items: [
    "id", "store_id", "order_id", "product_id", "variant_id", "product_name", "variant_name",
    "sku_snapshot", "quantity", "unit_price_cents", "compare_at_cents", "unit_cost_cents",
    "price_kind_snapshot", "options_total_cents", "line_total_cents", "sort_order", "created_at",
    "wholesale_min_quantity",
  ],
  order_item_options: [
    "id", "store_id", "order_item_id", "option_group_id", "option_item_id", "group_name_snapshot",
    "option_name_snapshot", "kind_snapshot", "action", "quantity", "price_delta_cents",
    "sort_order", "created_at",
  ],
  order_status_history: [
    "id", "store_id", "order_id", "from_status", "to_status", "changed_by_identity_id",
    "actor_role", "reason", "occurred_at", "created_at",
  ],
  store_customers: [
    "id", "store_id", "identity_id", "display_name", "phone_e164", "email", "address",
    "orders_count", "total_spent_cents", "last_order_at",
  ],
  store_sequences: ["store_id", "kind", "last_value"],
  identities: ["id", "email_norm", "display_name", "locale"],
};

export async function conferirEsquema(cliente: ClienteSql): Promise<void> {
  const r = await cliente.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'app'
      AND table_name = ANY($1::text[])`,
    [Object.keys(COLUNAS_USADAS)],
  );
  const existentes = new Set(r.rows.map((l) => `${texto(l, "table_name")}.${texto(l, "column_name")}`));
  const faltando: string[] = [];
  for (const [tabela, colunas] of Object.entries(COLUNAS_USADAS)) {
    for (const coluna of colunas) {
      if (!existentes.has(`${tabela}.${coluna}`)) faltando.push(`${tabela}.${coluna}`);
    }
  }
  if (faltando.length > 0) {
    throw new ErroDeGuarda(`O esquema da base não tem colunas esperadas: ${faltando.join(", ")}.`);
  }
}

/** Recusa se houver outro client backend no banco (exclui os pids da própria execução). */
export async function conferirSemOutrasSessoes(
  cliente: ClienteSql,
  pidsProprios: readonly number[],
): Promise<void> {
  const r = await cliente.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND backend_type = 'client backend'
        AND pid <> ALL($1::int[])`,
    [pidsProprios],
  );
  const n = numero(r.rows[0]!, "n");
  if (n > 0) {
    throw new ErroDeGuarda(
      `Há ${n} outra(s) sessão(ões) conectada(s) à base da simulação (API, k6 ou outro processo): pare-as antes da carga.`,
    );
  }
}

async function pidDe(cliente: ClienteSql): Promise<number> {
  const r = await cliente.query("SELECT pg_backend_pid()::int AS pid");
  return numero(r.rows[0]!, "pid");
}

/** A identidade sintética: ausente ou idêntica; e nenhum cliente do #135 ligado a ela. */
async function conferirIdentidade(cliente: ClienteSql, semente: string): Promise<void> {
  const idDela = idDaIdentidadeDoVolume(semente);
  const r = await cliente.query(
    `SELECT id, email_norm FROM app.identities WHERE id = $1 OR email_norm = $2`,
    [idDela, EMAIL_DA_IDENTIDADE],
  );
  if (r.rows.length > 1) throw new ErroDeGuarda("A identidade sintética do volume está duplicada.");
  const existente = r.rows[0];
  if (existente !== undefined && (texto(existente, "id") !== idDela || texto(existente, "email_norm") !== EMAIL_DA_IDENTIDADE)) {
    throw new ErroDeGuarda("Já existe uma identidade com o e-mail do volume e outro id: recusado.");
  }
}

/** Nenhum cliente do #135 pode estar ligado à identidade sintética. */
async function conferirIdentidadeSemClientesDaBase(
  cliente: ClienteSql,
  semente: string,
  clientesDoVolume: readonly string[],
): Promise<void> {
  const r = await cliente.query(
    `SELECT count(*)::int AS n FROM app.store_customers
      WHERE identity_id = $1 AND NOT (id = ANY($2::uuid[]))`,
    [idDaIdentidadeDoVolume(semente), clientesDoVolume],
  );
  if (numero(r.rows[0]!, "n") > 0) {
    throw new ErroDeGuarda("Há clientes do #135 ligados à identidade sintética do volume: recusado.");
  }
}

// ---------------------------------------------------------------------------
// INSERT em lote
// ---------------------------------------------------------------------------

interface Coluna {
  readonly nome: string;
  /** Tipo do elemento (o INSERT usa `$n::tipo[]`). Nomes e tipos são constantes internas. */
  readonly tipo: string;
  readonly valores: readonly unknown[];
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

async function inserirEmLote(
  cliente: ClienteSql,
  tabela: string,
  colunas: readonly Coluna[],
): Promise<void> {
  const comprimento = colunas[0]?.valores.length ?? 0;
  if (comprimento === 0) return;
  if (colunas.some((c) => c.valores.length !== comprimento)) {
    throw new Error(`Arrays de comprimentos diferentes em ${tabela}.`);
  }
  const nomes = colunas.map((c) => `"${c.nome}"`).join(", ");
  const arrays = colunas.map((c, i) => `$${i + 1}::${c.tipo}[]`).join(", ");
  await cliente.query(
    `INSERT INTO app.${tabela} (${nomes}) SELECT * FROM unnest(${arrays})`,
    colunas.map((c) => [...c.valores]),
  );
}

const repetir = <T>(valor: T, vezes: number): T[] => Array.from({ length: vezes }, () => valor);

/** Insere uma loja inteira (clientes, pedidos e filhos). Quem chama abre e fecha a transação. */
export async function inserirLoja(
  cliente: ClienteSql,
  plano: PlanoDaLojaDoVolume,
  semente: string,
): Promise<{ clientes: number }> {
  const { loja, pedidos, clientes } = plano;
  const n = pedidos.length;
  const ultimo = ULTIMO_NUMERO_DA_BASE + n;

  // Sequência: trava a linha e confere o ponto de partida.
  const seq = await cliente.query(
    `SELECT last_value FROM app.store_sequences WHERE store_id = $1 AND kind = 'order' FOR UPDATE`,
    [loja.id],
  );
  if (seq.rows.length !== 1 || numero(seq.rows[0]!, "last_value") !== ULTIMO_NUMERO_DA_BASE) {
    throw new ErroDeGuarda(`A sequência de pedidos da loja ${loja.codigo} não está em ${ULTIMO_NUMERO_DA_BASE}.`);
  }

  // Identidade sintética (só se faltar): sem senha, sem aceite legal.
  if (loja.indice < LOJAS_COM_IDENTIDADE) {
    await cliente.query(
      `INSERT INTO app.identities (id, email_norm, display_name, locale)
       SELECT $1::uuid, $2, 'Comprador do volume (sintético)', 'pt-BR'
        WHERE NOT EXISTS (SELECT 1 FROM app.identities WHERE id = $1::uuid)`,
      [idDaIdentidadeDoVolume(semente), EMAIL_DA_IDENTIDADE],
    );
  }

  await inserirEmLote(cliente, "store_customers", [
    { nome: "id", tipo: "uuid", valores: clientes.map((c) => c.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, clientes.length) },
    { nome: "identity_id", tipo: "uuid", valores: clientes.map((c) => c.identidade) },
    { nome: "display_name", tipo: "text", valores: clientes.map((c) => c.nome) },
    { nome: "phone_e164", tipo: "text", valores: clientes.map((c) => c.telefone) },
    { nome: "email", tipo: "text", valores: clientes.map((c) => c.email) },
    {
      nome: "address",
      tipo: "jsonb",
      valores: clientes.map((c) =>
        JSON.stringify({
          logradouro: c.endereco.logradouro,
          numero: c.endereco.numero,
          complemento: c.endereco.complemento,
          bairro: c.endereco.bairro,
          cidade: "Fortaleza",
          estado: "CE",
          cep: null,
          pontoDeReferencia: null,
        }),
      ),
    },
    { nome: "orders_count", tipo: "int", valores: clientes.map((c) => c.pedidos) },
    { nome: "total_spent_cents", tipo: "bigint", valores: clientes.map((c) => c.gasto) },
    { nome: "last_order_at", tipo: "timestamptz", valores: clientes.map((c) => iso(c.ultimoPedido)) },
  ]);

  const porId = new Map(clientes.map((c) => [c.id, c]));
  const pix = loja.pix;
  const comPix = (p: { pagamento: string }): boolean => p.pagamento === "PIX" && pix !== null;

  await inserirEmLote(cliente, "orders", [
    { nome: "id", tipo: "uuid", valores: pedidos.map((p) => p.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, n) },
    { nome: "number", tipo: "bigint", valores: pedidos.map((p) => p.numero) },
    { nome: "code", tipo: "text", valores: pedidos.map((p) => p.codigo) },
    { nome: "public_token", tipo: "text", valores: pedidos.map((p) => p.token) },
    { nome: "store_customer_id", tipo: "uuid", valores: pedidos.map((p) => p.clienteId) },
    { nome: "status", tipo: "text", valores: pedidos.map((p) => p.status) },
    { nome: "channel", tipo: "text", valores: repetir("ONLINE", n) },
    { nome: "fulfillment", tipo: "text", valores: pedidos.map((p) => p.entrega) },
    { nome: "payment_method", tipo: "text", valores: pedidos.map((p) => p.pagamento) },
    { nome: "change_for_cents", tipo: "bigint", valores: pedidos.map((p) => p.troco) },
    { nome: "pix_key_snapshot", tipo: "text", valores: pedidos.map((p) => (comPix(p) ? pix!.chave : null)) },
    { nome: "pix_holder_snapshot", tipo: "text", valores: pedidos.map((p) => (comPix(p) ? pix!.titular : null)) },
    { nome: "pix_key_type_snapshot", tipo: "text", valores: pedidos.map((p) => (comPix(p) ? pix!.tipo : null)) },
    { nome: "pix_account_name_snapshot", tipo: "text", valores: pedidos.map((p) => (comPix(p) ? pix!.titular : null)) },
    { nome: "subtotal_cents", tipo: "bigint", valores: pedidos.map((p) => p.subtotal) },
    { nome: "items_total_cents", tipo: "bigint", valores: pedidos.map((p) => p.subtotal) },
    { nome: "delivery_fee_cents", tipo: "bigint", valores: pedidos.map((p) => p.frete) },
    { nome: "delivery_fee_mode", tipo: "text", valores: pedidos.map((p) => (p.frete === 0 ? "FREE" : "VALUE")) },
    { nome: "total_cents", tipo: "bigint", valores: pedidos.map((p) => p.total) },
    { nome: "currency", tipo: "text", valores: repetir("BRL", n) },
    {
      nome: "payment_status",
      tipo: "text",
      valores: pedidos.map((p) =>
        p.status === "COMPLETED"
          ? "CONFIRMED"
          : p.pagamento === "PIX" && p.status !== "CANCELLED"
            ? "AWAITING_PROOF"
            : "PENDING",
      ),
    },
    { nome: "cost_total_cents", tipo: "bigint", valores: pedidos.map((p) => p.custoTotal) },
    { nome: "idempotency_key", tipo: "text", valores: pedidos.map((p) => p.chaveDeIdempotencia) },
    { nome: "whatsapp_message_chars", tipo: "int", valores: pedidos.map((p) => 300 + p.itens.length * 60) },
    { nome: "whatsapp_clicked_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(new Date(p.feitoEm.getTime() + 36_000))) },
    { nome: "whatsapp_confirmed_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(new Date(p.feitoEm.getTime() + 72_000))) },
    { nome: "store_timezone", tipo: "text", valores: repetir(FUSO_DAS_LOJAS, n) },
    { nome: "placed_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.feitoEm)) },
    { nome: "accepted_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.aceitoEm)) },
    { nome: "completed_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.concluidoEm)) },
    { nome: "cancelled_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.canceladoEm)) },
    { nome: "cancel_reason", tipo: "text", valores: pedidos.map((p) => p.motivoDoCancelamento) },
    { nome: "created_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.feitoEm)) },
    { nome: "updated_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.atualizadoEm)) },
  ]);

  await inserirEmLote(cliente, "order_contacts", [
    { nome: "order_id", tipo: "uuid", valores: pedidos.map((p) => p.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, n) },
    { nome: "name", tipo: "text", valores: pedidos.map((p) => porId.get(p.clienteId)!.nome) },
    { nome: "phone_e164", tipo: "text", valores: pedidos.map((p) => porId.get(p.clienteId)!.telefone) },
    { nome: "email", tipo: "text", valores: pedidos.map((p) => porId.get(p.clienteId)!.email) },
    { nome: "recipient_name", tipo: "text", valores: pedidos.map((p) => porId.get(p.clienteId)!.nome) },
    { nome: "street", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? porId.get(p.clienteId)!.endereco.logradouro : null)) },
    { nome: "number", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? porId.get(p.clienteId)!.endereco.numero : null)) },
    { nome: "complement", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? porId.get(p.clienteId)!.endereco.complemento : null)) },
    { nome: "neighborhood", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? porId.get(p.clienteId)!.endereco.bairro : null)) },
    { nome: "city", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? "Fortaleza" : null)) },
    { nome: "uf", tipo: "text", valores: pedidos.map((p) => (p.entrega === "DELIVERY" ? "CE" : null)) },
    { nome: "created_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.feitoEm)) },
    { nome: "updated_at", tipo: "timestamptz", valores: pedidos.map((p) => iso(p.feitoEm)) },
  ]);

  const itens = pedidos.flatMap((p) => p.itens.map((item, posicao) => ({ p, item, posicao })));
  await inserirEmLote(cliente, "order_items", [
    { nome: "id", tipo: "uuid", valores: itens.map((x) => x.item.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, itens.length) },
    { nome: "order_id", tipo: "uuid", valores: itens.map((x) => x.p.id) },
    { nome: "product_id", tipo: "uuid", valores: itens.map((x) => x.item.modelo.produtoId) },
    { nome: "variant_id", tipo: "uuid", valores: itens.map((x) => x.item.modelo.varianteId) },
    { nome: "product_name", tipo: "text", valores: itens.map((x) => x.item.modelo.produto) },
    { nome: "variant_name", tipo: "text", valores: itens.map((x) => x.item.modelo.variante) },
    { nome: "sku_snapshot", tipo: "text", valores: itens.map((x) => x.item.modelo.sku) },
    { nome: "quantity", tipo: "int", valores: itens.map((x) => x.item.quantidade) },
    { nome: "unit_price_cents", tipo: "bigint", valores: itens.map((x) => x.item.precoUnitario) },
    { nome: "compare_at_cents", tipo: "bigint", valores: itens.map((x) => x.item.modelo.comparadoCom) },
    { nome: "unit_cost_cents", tipo: "bigint", valores: itens.map((x) => x.item.modelo.custo) },
    { nome: "price_kind_snapshot", tipo: "text", valores: itens.map((x) => x.item.modelo.tipoDePreco) },
    { nome: "options_total_cents", tipo: "bigint", valores: itens.map((x) => x.item.acrescimoPorUnidade) },
    { nome: "line_total_cents", tipo: "bigint", valores: itens.map((x) => x.item.total) },
    { nome: "sort_order", tipo: "int", valores: itens.map((x) => x.posicao) },
    { nome: "created_at", tipo: "timestamptz", valores: itens.map((x) => iso(x.p.feitoEm)) },
  ]);

  const opcoes = itens.flatMap((x) => x.item.opcoes.map((o, ordem) => ({ x, o, ordem })));
  await inserirEmLote(cliente, "order_item_options", [
    { nome: "id", tipo: "uuid", valores: opcoes.map((y) => y.o.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, opcoes.length) },
    { nome: "order_item_id", tipo: "uuid", valores: opcoes.map((y) => y.x.item.id) },
    { nome: "option_group_id", tipo: "uuid", valores: opcoes.map((y) => y.o.grupoId) },
    { nome: "option_item_id", tipo: "uuid", valores: opcoes.map((y) => y.o.itemId) },
    { nome: "group_name_snapshot", tipo: "text", valores: opcoes.map((y) => y.o.grupo) },
    { nome: "option_name_snapshot", tipo: "text", valores: opcoes.map((y) => y.o.opcao) },
    { nome: "kind_snapshot", tipo: "text", valores: opcoes.map((y) => y.o.tipo) },
    { nome: "action", tipo: "text", valores: repetir("ADD", opcoes.length) },
    { nome: "quantity", tipo: "int", valores: repetir(1, opcoes.length) },
    // Convenção do checkout da vitrine: o acréscimo fica em options_total, não na opção.
    { nome: "price_delta_cents", tipo: "bigint", valores: repetir(0, opcoes.length) },
    { nome: "sort_order", tipo: "int", valores: opcoes.map((y) => y.ordem) },
    { nome: "created_at", tipo: "timestamptz", valores: opcoes.map((y) => iso(y.x.p.feitoEm)) },
  ]);

  const historico = pedidos.flatMap((p) => p.historico.map((h, ordem) => ({ p, h, ordem })));
  await inserirEmLote(cliente, "order_status_history", [
    { nome: "id", tipo: "uuid", valores: historico.map((y) => y.h.id) },
    { nome: "store_id", tipo: "uuid", valores: repetir(loja.id, historico.length) },
    { nome: "order_id", tipo: "uuid", valores: historico.map((y) => y.p.id) },
    { nome: "from_status", tipo: "text", valores: historico.map((y) => y.h.de) },
    { nome: "to_status", tipo: "text", valores: historico.map((y) => y.h.para) },
    { nome: "changed_by_identity_id", tipo: "uuid", valores: historico.map((y) => (y.ordem === 0 ? null : loja.quemMudaStatus)) },
    { nome: "actor_role", tipo: "text", valores: historico.map((y) => (y.ordem === 0 ? "CUSTOMER" : "OWNER")) },
    { nome: "reason", tipo: "text", valores: historico.map((y) => (y.h.para === "CANCELLED" ? y.p.motivoDoCancelamento : null)) },
    { nome: "occurred_at", tipo: "timestamptz", valores: historico.map((y) => iso(y.h.quando)) },
    { nome: "created_at", tipo: "timestamptz", valores: historico.map((y) => iso(y.h.quando)) },
  ]);

  const atualizada = await cliente.query(
    `UPDATE app.store_sequences SET last_value = $2 WHERE store_id = $1 AND kind = 'order'`,
    [loja.id, ultimo],
  );
  if (atualizada.rowCount !== 1) {
    throw new ErroDeGuarda(`Não consegui atualizar a sequência da loja ${loja.codigo}.`);
  }
  return { clientes: clientes.length };
}

// ---------------------------------------------------------------------------
// A carga
// ---------------------------------------------------------------------------

export interface OpcoesDaCarga {
  readonly fabrica?: FabricaDeConexao;
  /** Mensagem de andamento (sem dado sensível). */
  readonly relatar?: (linha: string) => void;
}

interface LojaPreparada {
  readonly loja: LojaDoBanco;
  readonly quantidade: number;
  readonly hash: string;
  readonly idsDosPedidos: readonly string[];
  readonly idsDosClientes: readonly string[];
  readonly estado: EstadoDaLoja;
  readonly situacao: "vazia" | "completa";
}

async function dentroDeTransacao<T>(
  cliente: ClienteSql,
  etapa: string,
  trabalho: () => Promise<T>,
  desfazerNoFim = false,
): Promise<T> {
  await cliente.query("BEGIN");
  try {
    const resultado = await trabalho();
    await cliente.query(desfazerNoFim ? "ROLLBACK" : "COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erroSeguro(etapa, erro);
  }
}

export async function carregar(
  env: Ambiente,
  params: ParametrosDoVolume,
  opcoes: OpcoesDaCarga = {},
): Promise<ResumoDaCarga> {
  const fabrica = opcoes.fabrica ?? fabricaPadrao;
  const relatar = opcoes.relatar ?? (() => {});
  const inicio = performance.now();

  const trava = await abrirConexaoGuardada(env, "sc_admin", fabrica);
  let admin: ConexaoDoVolume | null = null;
  try {
    const pegou = await trava.query("SELECT pg_try_advisory_lock($1::int, $2::int) AS ok", [
      TRAVA_DO_VOLUME[0],
      TRAVA_DO_VOLUME[1],
    ]);
    if (pegou.rows[0]?.["ok"] !== true) {
      throw new ErroDeGuarda("Outra carga do volume está em andamento (trava advisory ocupada).");
    }
    admin = await abrirConexaoGuardada(env, "sc_admin", fabrica);
    const pids = [await pidDe(trava), await pidDe(admin)];

    // --- Pré-voo ------------------------------------------------------------
    relatar("pré-voo: conferindo a base do #135…");
    await conferirSemOutrasSessoes(admin, pids);
    await conferirEsquema(admin);
    const lojas = await lerLojasDaBase(admin);
    await conferirIdentidade(admin, params.semente);
    const quantidades = distribuirPedidos(params.semente, lojas.length);
    if (quantidades.reduce((a, b) => a + b, 0) !== PEDIDOS_DO_VOLUME) {
      throw new ErroDeGuarda("A distribuição não soma o total do volume.");
    }

    const preparadas: LojaPreparada[] = [];
    const hashes: string[] = [];
    for (const [i, loja] of lojas.entries()) {
      const plano = montarPlanoDaLoja(params.semente, params.referencia, loja, quantidades[i]!);
      const ids = idsDosPedidos(plano);
      const estado = await lerEstadoDaLoja(admin, loja.id, ids, plano.quantidade);
      const situacao = situacaoDaLoja(estado, plano.quantidade);
      if (situacao === "divergente") {
        throw new ErroDeGuarda(
          `A loja ${loja.codigo} está fora do estado esperado (base ${estado.pedidosDaBase}, acima da base ${estado.pedidosAcima}, do plano ${estado.pedidosDoPlano}, sequência ${estado.ultimaSequencia ?? "ausente"}). ` +
            "Nada foi escrito. Para voltar ao estado do #135, o caminho é `seed:simulacao --recriar`, decidido por uma pessoa.",
        );
      }
      const hash = hashDaLoja(plano);
      hashes.push(hash);
      preparadas.push({
        loja,
        quantidade: plano.quantidade,
        hash,
        idsDosPedidos: ids,
        idsDosClientes: plano.clientes.map((c) => c.id),
        estado,
        situacao,
      });
    }
    const todosOsClientes = preparadas.flatMap((p) => p.idsDosClientes);
    await conferirIdentidadeSemClientesDaBase(admin, params.semente, todosOsClientes);
    const impressaoAntes = await impressaoDaBase(admin, todosOsClientes);
    const preparoMs = performance.now() - inicio;

    // --- Carga --------------------------------------------------------------
    const registros: RegistroDaLoja[] = [];
    let pedidosInseridos = 0;
    let pedidosPulados = 0;
    let clientesInseridos = 0;
    let inicioDaEscrita: string | null = null;
    const inicioDaCarga = performance.now();

    for (const [i, p] of preparadas.entries()) {
      const t0 = performance.now();
      if (p.situacao === "completa") {
        pedidosPulados += p.quantidade;
        registros.push({ indice: i, codigo: p.loja.codigo, quantidade: p.quantidade, resultado: "pulada", ms: 0 });
        continue;
      }
      if (params.ensaio && registros.some((r) => r.resultado === "ensaiada")) break;
      inicioDaEscrita ??= new Date().toISOString();
      const plano = montarPlanoDaLoja(params.semente, params.referencia, p.loja, p.quantidade);
      const etapa = `loja ${i}`;
      const { clientes } = await dentroDeTransacao(
        admin,
        etapa,
        async () => {
          const feito = await inserirLoja(admin!, plano, params.semente);
          if (params.ensaio) await conferirNaTransacao(admin!, params.referencia);
          if (params.falharNaLoja === i) throw new FalhaInduzida(i);
          return feito;
        },
        params.ensaio,
      );
      if (params.ensaio) {
        const depois = await lerEstadoDaLoja(admin, p.loja.id, p.idsDosPedidos, p.quantidade);
        if (situacaoDaLoja(depois, p.quantidade) !== "vazia") {
          throw new ErroDeGuarda("O ROLLBACK do ensaio não devolveu a loja ao estado inicial.");
        }
        registros.push({ indice: i, codigo: p.loja.codigo, quantidade: p.quantidade, resultado: "ensaiada", ms: performance.now() - t0 });
        relatar(`ensaio: loja ${p.loja.codigo} carregada, conferida e desfeita (ROLLBACK).`);
        continue;
      }
      pedidosInseridos += p.quantidade;
      clientesInseridos += clientes;
      registros.push({ indice: i, codigo: p.loja.codigo, quantidade: p.quantidade, resultado: "inserida", ms: performance.now() - t0 });
      relatar(`loja ${p.loja.codigo}: ${p.quantidade} pedidos em ${Math.round(performance.now() - t0)} ms.`);
    }
    const cargaMs = performance.now() - inicioDaCarga;

    const impressaoDepois = await impressaoDaBase(admin, todosOsClientes);
    if (impressaoDepois !== impressaoAntes) {
      throw new ErroDeGuarda("A impressão da base do #135 mudou durante a carga: algo além do volume foi alterado.");
    }

    const ensaiou = registros.some((r) => r.resultado === "ensaiada");
    const modo = ensaiou
      ? "ensaio"
      : pedidosInseridos === 0
        ? "sem-efeito"
        : pedidosPulados > 0
          ? "retomada"
          : "completa";
    return {
      modo,
      ensaio: params.ensaio,
      lojas: registros,
      pedidosInseridos,
      pedidosPulados,
      clientesInseridos,
      hashDoPlano: hashDoPlano(hashes),
      impressaoDaBaseAntes: impressaoAntes,
      impressaoDaBaseDepois: impressaoDepois,
      tempos: { preparoMs, cargaMs, totalMs: performance.now() - inicio },
      inicioDaEscrita,
    };
  } catch (erro) {
    throw erroSeguro("carga", erro);
  } finally {
    await trava.query("SELECT pg_advisory_unlock($1::int, $2::int)", [TRAVA_DO_VOLUME[0], TRAVA_DO_VOLUME[1]]).catch(() => {});
    await admin?.end().catch(() => {});
    await trava.end().catch(() => {});
  }
}

/** As invariantes do ensaio, dentro da transação (só enxerga a loja ensaiada). */
export async function conferirNaTransacao(cliente: ClienteSql, referencia: Date): Promise<void> {
  const erros: string[] = [];
  for (const inv of INVARIANTES) {
    const r = await cliente.query(inv.sql, inv.usaReferencia === true ? [referencia.toISOString()] : []);
    const n = numero(r.rows[0]!, "n");
    if (n !== 0) erros.push(`${inv.nome}: ${n}`);
  }
  if (erros.length > 0) {
    throw new ErroDeGuarda(`O ensaio encontrou divergências: ${erros.join("; ")}.`);
  }
}

// ---------------------------------------------------------------------------
// Estatísticas (autoanalyze)
// ---------------------------------------------------------------------------

const TABELAS_DE_PEDIDO = ["orders", "order_items", "order_item_options", "order_status_history", "order_contacts", "store_customers"];

export interface EstadoDoAutoanalyze {
  readonly todasAtualizadas: boolean;
  readonly tabelas: readonly { readonly tabela: string; readonly ultimo: string | null }[];
  readonly esperouMs: number;
}

/** Espera `last_autoanalyze` ≥ `desde` nas tabelas de pedido (sem ANALYZE manual: D-2). */
export async function esperarAutoanalyze(
  cliente: ClienteSql,
  desde: Date,
  limiteMs = 900_000,
  intervaloMs = 10_000,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<EstadoDoAutoanalyze> {
  const t0 = performance.now();
  for (;;) {
    const r = await cliente.query(
      `SELECT relname, greatest(last_autoanalyze, last_analyze) AS ultimo FROM pg_stat_user_tables
        WHERE schemaname = 'app' AND relname = ANY($1::text[]) ORDER BY relname`,
      [TABELAS_DE_PEDIDO],
    );
    const tabelas = r.rows.map((l) => ({
      tabela: texto(l, "relname"),
      ultimo: l["ultimo"] === null ? null : new Date(texto(l, "ultimo")).toISOString(),
    }));
    const todas =
      tabelas.length === TABELAS_DE_PEDIDO.length &&
      tabelas.every((t) => t.ultimo !== null && new Date(t.ultimo).getTime() >= desde.getTime());
    const espera = performance.now() - t0;
    if (todas || espera >= limiteMs) return { todasAtualizadas: todas, tabelas, esperouMs: espera };
    await dormir(intervaloMs);
  }
}


import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  comoAdministracao,
  criarCliente,
  criarIdentidade,
  criarLoja,
  type ClienteDeTeste,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "../../testing/src/index.ts";
import {
  CORPO_ANTIGO,
  IMPRESSAO_NOVA,
  impressao,
  paraExplicar,
} from "../../../tests/performance/ambiente/corpos-de-meus-pedidos.ts";
import { derivarUrlDePapel } from "../src/migrate.ts";

/**
 * #142 — a otimização de `app.meus_pedidos` (migração 0074): o filtro por loja
 * nas duas junções deixa o planejador usar os índices que começam por
 * `store_id`. Este arquivo prova que ela NÃO muda o contrato da função
 * SECURITY DEFINER nem o resultado em dados válidos, que o estreitamento só
 * esconde vínculo corrompido entre lojas, e que a trava da migração recusa
 * aplicar quando esse vínculo existe.
 *
 * O "corpo antigo" é o texto da 0029 (lido do arquivo), executado como
 * `sc_migrator` — o dono da função, com BYPASSRLS —, que é o contexto real do
 * corpo dentro da função.
 */

const ESPERA = 120_000;
const MIGRACAO_0074 = fileURLToPath(
  new URL("../migrations/0074_meus_pedidos_por_loja.sql", import.meta.url),
);

function senha(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`variável de ambiente ausente: ${nome}`);
  return valor;
}

async function conectarComo(papel: "sc_app" | "sc_migrator", variavel: string): Promise<pg.Client> {
  const cliente = new pg.Client({
    connectionString: derivarUrlDePapel(bancoDoArquivo().url, papel, senha(variavel)),
  });
  await cliente.connect();
  return cliente;
}

interface Linha {
  order_id: string;
  store_id: string;
  number: string;
  items_count: string;
  [coluna: string]: unknown;
}

/** Abre uma transação com o contexto da requisição, roda e desfaz. */
async function emContexto<T>(
  cliente: pg.Client,
  contexto: { usuarioId: string; papel: string; lojaId?: string },
  acao: () => Promise<T>,
): Promise<T> {
  await cliente.query("BEGIN READ ONLY");
  try {
    await cliente.query(
      `SELECT set_config('app.store_id', $1, true), set_config('app.user_id', $2, true),
              set_config('app.role', $3, true), set_config('app.order_token', '', true)`,
      [contexto.lojaId ?? "", contexto.usuarioId, contexto.papel],
    );
    return await acao();
  } finally {
    await cliente.query("ROLLBACK");
  }
}

let app: pg.Client;
let migrador: pg.Client;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;
let maria: IdentidadeDeTeste;
let joao: IdentidadeDeTeste;
let mariaEmA: ClienteDeTeste;
let mariaEmB: ClienteDeTeste;
let joaoEmA: ClienteDeTeste;
const pedidosDaMaria: string[] = [];
let pedidoDoJoao = "";
let numero = 0;

async function plantarPedido(loja: LojaDeTeste, cliente: ClienteDeTeste, itens: number): Promise<string> {
  numero += 1;
  const n = numero;
  return comoAdministracao(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `INSERT INTO app.orders
         (store_id, number, code, public_token, store_customer_id, status,
          subtotal_cents, items_total_cents, total_cents, placed_at)
       VALUES ($1, $2::bigint, $3, $4, $5, 'PENDING', $6::bigint, $6::bigint, $6::bigint, now() - make_interval(mins => $2::int))
       RETURNING id`,
      [loja.id, n, `T-${n}`, `tok-142-${n}-${loja.id}`, cliente.id, 1000 * itens],
    );
    const id = r.rows[0]!.id;
    for (let i = 0; i < itens; i++) {
      await tx.query(
        `INSERT INTO app.order_items (store_id, order_id, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, 1, 1000, 1000)`,
        [loja.id, id, `Item ${i + 1}`],
      );
    }
    return id;
  });
}

const SQL_DO_CORPO_ANTIGO_COM_PEDIDO = CORPO_ANTIGO.replace(/\bp_order_id\b/g, "$1::uuid");

beforeAll(async () => {
  lojaA = await criarLoja();
  lojaB = await criarLoja();
  maria = await criarIdentidade();
  joao = await criarIdentidade();
  mariaEmA = await criarCliente({ loja: lojaA, identidade: maria });
  mariaEmB = await criarCliente({ loja: lojaB, identidade: maria });
  joaoEmA = await criarCliente({ loja: lojaA, identidade: joao });
  for (const [loja, cliente, itens] of [
    [lojaA, mariaEmA, 1],
    [lojaA, mariaEmA, 3],
    [lojaB, mariaEmB, 2],
    [lojaA, mariaEmA, 2],
    [lojaB, mariaEmB, 1],
  ] as const) {
    pedidosDaMaria.push(await plantarPedido(loja, cliente, itens));
  }
  pedidoDoJoao = await plantarPedido(lojaA, joaoEmA, 2);
  app = await conectarComo("sc_app", "SENHA_BANCO_APLICACAO");
  migrador = await conectarComo("sc_migrator", "SENHA_BANCO_MIGRADOR");
}, ESPERA);

afterAll(async () => {
  await app?.end().catch(() => {});
  await migrador?.end().catch(() => {});
});

describe("#142 app.meus_pedidos por loja (0074)", () => {
  it(
    "[CA-5] (a) a função nova devolve as mesmas linhas, na mesma ordem, que o corpo da 0029 — na lista e com p_order_id",
    async () => {
      const cliente = { usuarioId: maria.id, papel: "CUSTOMER" };
      const nova = await emContexto(app, cliente, async () => (await app.query<Linha>("SELECT * FROM app.meus_pedidos()")).rows);
      const antiga = await emContexto(migrador, cliente, async () => (await migrador.query<Linha>(paraExplicar(CORPO_ANTIGO))).rows);
      expect(nova.map((l) => l.order_id)).toHaveLength(pedidosDaMaria.length);
      expect(new Set(nova.map((l) => l.store_id))).toEqual(new Set([lojaA.id, lojaB.id]));
      expect(nova.map((l) => Object.values(l))).toEqual(antiga.map((l) => Object.values(l)));
      expect(nova.map((l) => Number(l.items_count)).sort()).toEqual([1, 1, 2, 2, 3]);

      const alvo = pedidosDaMaria[1]!;
      const umaNova = await emContexto(app, cliente, async () => (await app.query<Linha>("SELECT * FROM app.meus_pedidos($1::uuid)", [alvo])).rows);
      const umaAntiga = await emContexto(migrador, cliente, async () => (await migrador.query<Linha>(SQL_DO_CORPO_ANTIGO_COM_PEDIDO, [alvo])).rows);
      expect(umaNova).toHaveLength(1);
      expect(umaNova.map((l) => Object.values(l))).toEqual(umaAntiga.map((l) => Object.values(l)));
    },
    ESPERA,
  );

  it(
    "[CA-5] (b) papel diferente de CUSTOMER e outra identidade recebem zero linhas; p_order_id alheio volta vazio",
    async () => {
      for (const papel of ["OWNER", "STAFF", "PUBLIC", ""]) {
        const linhas = await emContexto(app, { usuarioId: maria.id, papel, lojaId: lojaA.id }, async () => (await app.query("SELECT * FROM app.meus_pedidos()")).rows);
        expect(linhas, `papel ${papel || "vazio"}`).toEqual([]);
      }
      const doJoao = await emContexto(app, { usuarioId: joao.id, papel: "CUSTOMER" }, async () => (await app.query<Linha>("SELECT * FROM app.meus_pedidos()")).rows);
      expect(doJoao.map((l) => l.order_id)).toEqual([pedidoDoJoao]);
      const alheio = await emContexto(app, { usuarioId: maria.id, papel: "CUSTOMER" }, async () => (await app.query("SELECT * FROM app.meus_pedidos($1::uuid)", [pedidoDoJoao])).rows);
      expect(alheio).toEqual([]);
    },
    ESPERA,
  );

  it(
    "[CA-5] (c) o contrato da função SECURITY DEFINER é o mesmo da 0029: dono, search_path fixo, volatilidade, assinatura, retorno e ACL sem PUBLIC",
    async () => {
      const r = await migrador.query(
        `SELECT p.prosecdef AS definer, p.provolatile AS volatil, p.proconfig AS config,
                pg_get_userbyid(p.proowner) AS dono,
                pg_get_function_arguments(p.oid) AS argumentos,
                pg_get_function_result(p.oid) AS resultado,
                p.proacl::text[] AS acl
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'meus_pedidos'`,
      );
      expect(r.rows).toHaveLength(1);
      const f = r.rows[0];
      expect(f.definer).toBe(true);
      expect(f.volatil).toBe("s");
      expect(f.config).toEqual(["search_path=app, pg_temp"]);
      expect(f.dono).toBe("sc_migrator");
      expect(f.argumentos).toBe("p_order_id uuid DEFAULT NULL::uuid");
      expect(f.resultado).toBe(
        "TABLE(order_id uuid, store_id uuid, store_name text, store_slug text, number bigint, code text, status text, fulfillment text, total_cents bigint, placed_at timestamp with time zone, updated_at timestamp with time zone, public_token text, items_count bigint)",
      );
      const acl = (f.acl as string[]).map((e) => e.split("=")[0]).sort();
      expect(acl).toEqual(["sc_admin", "sc_app", "sc_migrator"]);
      expect((f.acl as string[]).some((e) => e.startsWith("="))).toBe(false);
    },
    ESPERA,
  );

  it(
    "[CA-5] (d) um vínculo corrompido entre lojas fica oculto na função nova, e a trava da 0074 recusa aplicar com ele na base",
    async () => {
      const trava = readFileSync(MIGRACAO_0074, "utf8").match(/DO \$trava\$[\s\S]*?\$trava\$;/)?.[0];
      expect(trava, "a 0074 precisa ter o bloco DO $trava$").toBeDefined();
      await migrador.query("BEGIN");
      try {
        // Pedido da loja B ligado à ficha da Maria na loja A (dado corrompido).
        numero += 1;
        await migrador.query(
          `INSERT INTO app.orders (store_id, number, code, public_token, store_customer_id, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [lojaB.id, numero, `T-${numero}`, `tok-142-corrompido-${numero}`, mariaEmA.id],
        );
        await migrador.query(
          `SELECT set_config('app.store_id', '', true), set_config('app.user_id', $1, true),
                  set_config('app.role', 'CUSTOMER', true)`,
          [maria.id],
        );
        const nova = (await migrador.query("SELECT order_id FROM app.meus_pedidos()")).rows;
        const antiga = (await migrador.query(paraExplicar(CORPO_ANTIGO))).rows;
        expect(antiga).toHaveLength(pedidosDaMaria.length + 1);
        expect(nova).toHaveLength(pedidosDaMaria.length);
        await migrador.query("SAVEPOINT antes_da_trava");
        await expect(migrador.query(trava!)).rejects.toThrow(/vínculo/);
        await migrador.query("ROLLBACK TO SAVEPOINT antes_da_trava");
      } finally {
        await migrador.query("ROLLBACK");
      }
      // Sem o dado corrompido, a mesma trava passa.
      await expect(migrador.query(trava!)).resolves.toBeDefined();
    },
    ESPERA,
  );

  it(
    "[CA-5] (e) o corpo gravado pela 0074 é exatamente o literal versionado de corpos-de-meus-pedidos.ts",
    async () => {
      const r = await migrador.query(
        `SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'meus_pedidos'`,
      );
      expect(impressao(String(r.rows[0]?.prosrc))).toBe(IMPRESSAO_NOVA);
    },
    ESPERA,
  );
});

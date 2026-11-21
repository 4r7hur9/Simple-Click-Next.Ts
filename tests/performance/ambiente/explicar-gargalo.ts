/**
 * O EXPLAIN (ANALYZE, BUFFERS) do gargalo `app.meus_pedidos` (#142), na base
 * DESCARTÁVEL comprovada (descartavel.ts), no fim do preparo:
 *
 *   node tests/performance/ambiente/explicar-gargalo.ts <etapa>
 *
 * - a CHAMADA, como a API faz: `sc_app`, contexto CUSTOMER da identidade com
 *   mais pedidos (a sintética do volume, em várias lojas);
 * - o CORPO 0029 e o CORPO 0074 (textos versionados em
 *   corpos-de-meus-pedidos.ts, nunca o texto lido do catálogo), como
 *   `sc_migrator` — o dono da função SECURITY DEFINER, com BYPASSRLS, que é o
 *   contexto real do corpo dentro da função;
 * - QUAL corpo está vigente (impressão do `prosrc`) e os vínculos entre lojas
 *   (pedido ligado a cliente de outra loja, item de outra loja): precisam ser 0.
 *
 * Tudo em `BEGIN READ ONLY`, com `statement_timeout` e `lock_timeout`, e sempre
 * ROLLBACK. Saída em `saida/<rótulo>/explain/` (sem valores ligados: o contexto
 * entra por `set_config`, e o plano só mostra `current_setting(...)`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import { montarAlvo } from "../../../packages/database/seed/simulacao/banco.ts";
import { BANCO_PADRAO } from "../../../packages/database/seed/simulacao/parametros.ts";
import { derivarUrlDePapel } from "../../../packages/database/src/migrate.ts";
import { etapaDoArgumento, gravarJson, pastaDaSaida } from "./apoio.ts";
import {
  CORPO_ANTIGO,
  CORPO_NOVO,
  corpoVigente,
  impressao,
  paraExplicar,
} from "./corpos-de-meus-pedidos.ts";
import { provarDescartavel } from "./descartavel.ts";

const SQL_CONTEXTO = `
  SELECT set_config('app.store_id', '', true), set_config('app.user_id', $1, true),
         set_config('app.role', 'CUSTOMER', true), set_config('app.order_token', '', true),
         set_config('app.checkout_key', '', true), set_config('app.cart_session', '', true)`;

interface NoDoPlano {
  "Node Type"?: string;
  "Relation Name"?: string;
  Plans?: NoDoPlano[];
}

/** As tabelas lidas por Seq Scan no plano (JSON do EXPLAIN). */
export function tabelasEmSeqScan(no: NoDoPlano | undefined, achadas = new Set<string>()): Set<string> {
  if (no === undefined) return achadas;
  if (no["Node Type"] === "Seq Scan" && no["Relation Name"]) achadas.add(no["Relation Name"]);
  for (const filho of no.Plans ?? []) tabelasEmSeqScan(filho, achadas);
  return achadas;
}

async function conectar(url: string, papel: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  const r = await cliente.query(
    "SELECT current_database() AS banco, session_user AS sessao, current_user AS papel",
  );
  const l = r.rows[0] ?? {};
  if (l.banco !== BANCO_PADRAO || l.sessao !== papel || l.papel !== papel) {
    await cliente.end().catch(() => {});
    throw new Error(`Sessão inesperada (${l.banco}/${l.sessao}/${l.papel}): recusado.`);
  }
  return cliente;
}

interface Medida {
  rotulo: string;
  tempoMs: number;
  linhas: number;
  seqScanEm: string[];
}

async function explicar(
  cliente: pg.Client,
  consulta: { rotulo: string; sql: string },
  identidade: string,
  pasta: string,
): Promise<Medida> {
  const { rotulo, sql } = consulta;
  let medida: Medida | null = null;
  // Duas passagens: a 1ª aquece o cache; vale a 2ª (que NÃO prova cache frio).
  for (const passada of [1, 2]) {
    await cliente.query("BEGIN READ ONLY");
    try {
      await cliente.query("SET LOCAL statement_timeout = '120s'");
      await cliente.query("SET LOCAL lock_timeout = '5s'");
      await cliente.query(SQL_CONTEXTO, [identidade]);
      const json = await cliente.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
      const texto = await cliente.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
      const plano = (json.rows[0]?.["QUERY PLAN"] as { Plan: NoDoPlano & { "Actual Rows"?: number }; "Execution Time": number }[])[0];
      if (passada === 2) {
        writeFileSync(resolve(pasta, `${rotulo}.json`), `${JSON.stringify(plano, null, 2)}\n`);
        writeFileSync(
          resolve(pasta, `${rotulo}.txt`),
          `${texto.rows.map((l) => String(l["QUERY PLAN"])).join("\n")}\n`,
        );
        medida = {
          rotulo,
          tempoMs: plano["Execution Time"],
          linhas: Number(plano.Plan["Actual Rows"] ?? 0),
          seqScanEm: [...tabelasEmSeqScan(plano.Plan)].sort(),
        };
      }
    } finally {
      await cliente.query("ROLLBACK");
    }
  }
  return medida as Medida;
}

async function principal(): Promise<void> {
  const etapa = etapaDoArgumento(process.argv[2]);
  await provarDescartavel(process.env);
  const alvo = montarAlvo(process.env, BANCO_PADRAO);
  const pasta = resolve(pastaDaSaida(etapa), "explain");
  mkdirSync(pasta, { recursive: true });

  const migrador = await conectar(
    derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, "sc_migrator", alvo.senhas.migrador),
    "sc_migrator",
  );
  const app = await conectar(
    derivarUrlDePapel(alvo.urlDoBancoDaSimulacao, "sc_app", alvo.senhas.aplicacao),
    "sc_app",
  );
  try {
    await migrador.query("BEGIN READ ONLY");
    let prosrc = "";
    let vinculos = { clientes: -1, itens: -1 };
    let identidade = "";
    let pedidosDaIdentidade = 0;
    let lojasDaIdentidade = 0;
    try {
      await migrador.query("SET LOCAL statement_timeout = '120s'");
      const f = await migrador.query(
        `SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'meus_pedidos'`,
      );
      prosrc = String(f.rows[0]?.prosrc ?? "");
      const v = await migrador.query(
        `SELECT (SELECT count(*) FROM app.orders o JOIN app.store_customers c ON c.id = o.store_customer_id
                  WHERE c.store_id <> o.store_id)::int AS clientes,
                (SELECT count(*) FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
                  WHERE i.store_id <> o.store_id)::int AS itens`,
      );
      vinculos = { clientes: Number(v.rows[0]?.clientes), itens: Number(v.rows[0]?.itens) };
      const quem = await migrador.query(
        `SELECT c.identity_id::text AS identidade, count(o.id)::int AS pedidos,
                count(DISTINCT o.store_id)::int AS lojas
           FROM app.store_customers c JOIN app.orders o ON o.store_customer_id = c.id
          WHERE c.identity_id IS NOT NULL
          GROUP BY c.identity_id ORDER BY count(o.id) DESC, c.identity_id LIMIT 1`,
      );
      identidade = String(quem.rows[0]?.identidade ?? "");
      pedidosDaIdentidade = Number(quem.rows[0]?.pedidos ?? 0);
      lojasDaIdentidade = Number(quem.rows[0]?.lojas ?? 0);
    } finally {
      await migrador.query("ROLLBACK");
    }
    if (identidade === "") throw new Error("Nenhuma identidade com pedidos para medir.");

    const medidas = [
      await explicar(app, { rotulo: "meus-pedidos-chamada", sql: "SELECT * FROM app.meus_pedidos()" }, identidade, pasta),
      await explicar(migrador, { rotulo: "meus-pedidos-corpo-0029", sql: paraExplicar(CORPO_ANTIGO) }, identidade, pasta),
      await explicar(migrador, { rotulo: "meus-pedidos-corpo-0074", sql: paraExplicar(CORPO_NOVO) }, identidade, pasta),
    ];
    const vigente = corpoVigente(prosrc);
    const resultado = {
      geradoEm: new Date().toISOString(),
      corpoVigente: vigente,
      impressaoDaFuncao: impressao(prosrc),
      vinculosEntreLojas: vinculos,
      identidadeMedida: { pedidos: pedidosDaIdentidade, lojas: lojasDaIdentidade },
      medidas,
      observacao:
        "Passada 2 de 2 (cache possivelmente quente). Corpos executados a partir dos textos versionados; a chamada como sc_app em contexto CUSTOMER.",
    };
    gravarJson(resolve(pasta, "gargalo.json"), resultado);
    process.stdout.write(
      `✔ EXPLAIN do gargalo: corpo vigente ${vigente}; ${medidas
        .map((m) => `${m.rotulo} ${m.tempoMs.toFixed(1)} ms (${m.linhas} linhas, Seq Scan: ${m.seqScanEm.join(", ") || "nenhum"})`)
        .join("; ")}; vínculos entre lojas: ${vinculos.clientes} cliente(s), ${vinculos.itens} item(ns).\n`,
    );
    if (vigente === "desconhecido") {
      throw new Error("O corpo vigente de app.meus_pedidos não é o da 0029 nem o da 0074.");
    }
    if (vinculos.clientes !== 0 || vinculos.itens !== 0) {
      throw new Error("Há vínculos entre lojas na base: a otimização estreitaria o resultado.");
    }
  } finally {
    await migrador.end().catch(() => {});
    await app.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await principal();
  } catch (erro) {
    process.stderr.write(`✘ ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  }
}

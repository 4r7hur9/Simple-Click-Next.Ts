/**
 * A prova de que o Postgres é o DESCARTÁVEL desta execução (#142).
 *
 * O nome `simpleclick_simulacao` e o marcador do seed são iguais na base
 * descartável do ensaio e na base compartilhada do #135 (que mora no mesmo
 * cluster do preview). Nenhuma das guardas do seed olha a porta. Por isso o
 * volume (VOLUME=sim) e o EXPLAIN do gargalo só rodam depois de duas fases:
 *
 * 1. SEM conexão: existe SERVICOS_ENV (gravado pelo servicos.sh), nenhuma
 *    variável PG* desvia a conexão, o host da DATABASE_URL_DIRETA é loopback,
 *    a porta é a gravada em PORTA_PG e não é 5432 (o postgres-dev) nem 6432.
 * 2. Na PRIMEIRA consulta (superusuário do contêiner): o `system_identifier`
 *    do cluster e o nonce no comentário do banco `postgres` batem com os
 *    gravados. Qualquer divergência fecha a conexão e recusa.
 *
 * Nada aqui lê `process.env` sozinho: o ambiente e a fábrica de conexões
 * entram por parâmetro, para o teste provar que a fábrica não é chamada nas
 * recusas da fase 1.
 */
import { existsSync, readFileSync } from "node:fs";

import pg from "pg";

import { VARIAVEIS_PG_PROIBIDAS } from "../../../packages/database/seed/volume/guarda.ts";

export type Ambiente = Readonly<Record<string, string | undefined>>;

export class RecusaDoDescartavel extends Error {
  override name = "RecusaDoDescartavel";
}

export interface ProvaDoDescartavel {
  readonly porta: string;
  readonly nonce: string;
  readonly sysid: string;
}

export interface ClienteMinimo {
  query(texto: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export type Fabrica = (url: string) => Promise<ClienteMinimo>;

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const PORTAS_PROIBIDAS = new Set(["5432", "6432"]);

/** Lê NOME=valor do arquivo do servicos.sh (só as três chaves da prova). */
export function lerProva(caminho: string): ProvaDoDescartavel {
  const valores = new Map<string, string>();
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const i = linha.indexOf("=");
    if (i > 0) valores.set(linha.slice(0, i), linha.slice(i + 1).trim());
  }
  const porta = valores.get("PORTA_PG") ?? "";
  const nonce = valores.get("SC_PERF_NONCE") ?? "";
  const sysid = valores.get("SC_PERF_SYSID") ?? "";
  if (!/^\d{2,5}$/.test(porta) || !/^[0-9a-f]{32}$/.test(nonce) || !/^\d{6,25}$/.test(sysid)) {
    throw new RecusaDoDescartavel(
      "O arquivo de SERVICOS_ENV não traz PORTA_PG, SC_PERF_NONCE e SC_PERF_SYSID válidos: suba os serviços pelo servicos.sh.",
    );
  }
  return { porta, nonce, sysid };
}

/** Fase 1: tudo que dá para recusar sem abrir conexão. Devolve a prova. */
export function conferirSemConexao(env: Ambiente): ProvaDoDescartavel {
  const arquivo = env.SERVICOS_ENV?.trim();
  if (!arquivo || !existsSync(arquivo)) {
    throw new RecusaDoDescartavel(
      "SERVICOS_ENV ausente: o volume e o EXPLAIN só rodam na base descartável do servicos.sh (use o local.sh).",
    );
  }
  for (const nome of VARIAVEIS_PG_PROIBIDAS) {
    const valor = env[nome];
    if (valor !== undefined && valor.trim() !== "") {
      throw new RecusaDoDescartavel(`${nome} está definida: ela desviaria a conexão. Recusado.`);
    }
  }
  const prova = lerProva(arquivo);
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL_DIRETA ?? "");
  } catch {
    throw new RecusaDoDescartavel("DATABASE_URL_DIRETA ausente ou inválida.");
  }
  if (!HOSTS_LOCAIS.has(url.hostname)) {
    throw new RecusaDoDescartavel(`O host ${url.hostname} não é loopback: recusado.`);
  }
  const porta = url.port || "5432";
  if (PORTAS_PROIBIDAS.has(porta)) {
    throw new RecusaDoDescartavel(
      `A porta ${porta} é a do Postgres do preview ou do agrupador: recusado.`,
    );
  }
  if (porta !== prova.porta) {
    throw new RecusaDoDescartavel(
      `A porta da DATABASE_URL_DIRETA (${porta}) não é a do Postgres descartável (${prova.porta}): recusado.`,
    );
  }
  return prova;
}

const fabricaPadrao: Fabrica = async (url) => {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente as unknown as ClienteMinimo;
};

/**
 * Fase 2: conecta como o superusuário do contêiner e confere sysid e nonce na
 * primeira consulta. Fecha a conexão em qualquer caso e lança se divergir.
 */
export async function provarDescartavel(env: Ambiente, fabrica: Fabrica = fabricaPadrao): Promise<ProvaDoDescartavel> {
  const prova = conferirSemConexao(env);
  const cliente = await fabrica(String(env.DATABASE_URL_DIRETA));
  try {
    const r = await cliente.query(
      `SELECT (SELECT system_identifier FROM pg_control_system())::text AS sysid,
              (SELECT shobj_description(d.oid, 'pg_database') FROM pg_database d
                WHERE d.datname = 'postgres') AS comentario`,
    );
    const linha = r.rows[0] ?? {};
    if (String(linha.sysid) !== prova.sysid) {
      throw new RecusaDoDescartavel("O system_identifier do cluster não é o do Postgres descartável: recusado.");
    }
    if (String(linha.comentario) !== `sc-perf-descartavel:${prova.nonce}`) {
      throw new RecusaDoDescartavel("O nonce do Postgres descartável não confere: recusado.");
    }
    return prova;
  } finally {
    await cliente.end().catch(() => {});
  }
}

// Linha de comando: `node descartavel.ts provar` (o preparar.sh chama antes do volume).
if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "provar") {
  try {
    await provarDescartavel(process.env);
    process.stdout.write("✔ Postgres descartável comprovado (porta, system_identifier e nonce).\n");
  } catch (erro) {
    process.stderr.write(`✘ ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  }
}

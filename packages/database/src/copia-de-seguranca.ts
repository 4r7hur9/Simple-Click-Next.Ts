/**
 * Cópia de segurança do banco, com retenção de sete dias (T-024, AC-052).
 *
 *   node packages/database/src/copia-de-seguranca.ts copiar  <pasta>
 *   node packages/database/src/copia-de-seguranca.ts ensaiar <pasta | arquivo.dump>
 *
 * `copiar` usa `DATABASE_URL_DIRETA` (credencial de migração, que enxerga
 * todas as lojas) e grava `simpleclick-<data>.dump` no formato próprio do
 * `pg_dump`, mais um manifesto `.dump.json` tirado do MESMO instante da cópia:
 * as migrações aplicadas e quantas linhas cada tabela tinha. O instante é o
 * mesmo porque a contagem e a cópia leem o mesmo retrato exportado do banco
 * (`pg_export_snapshot`), então o manifesto vale mesmo com a loja vendendo.
 * Depois apaga, da mesma pasta, as cópias com mais de sete dias (Q-004).
 *
 * `ensaiar` restaura a cópia num banco descartável e confere contra o
 * manifesto — ver `ensaio-de-restauracao.ts`.
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { executarFerramenta } from "./ferramentas-do-postgres.ts";
import type { ClienteSql } from "./migrate.ts";

/** Quantos dias uma cópia fica na pasta (Q-004). */
export const DIAS_DE_RETENCAO = 7;

/** `simpleclick-20261006T030629Z.dump`: a data no nome é o que a retenção lê. */
const NOME_DA_COPIA = /^simpleclick-(\d{8}T\d{6}Z)\.dump$/;

/** O que a cópia sabia de si no instante em que foi tirada. */
export interface ManifestoDaCopia {
  readonly versao: 1;
  readonly arquivo: string;
  readonly criadaEm: string;
  readonly sha256: string;
  readonly migracoes: readonly { nome: string; sha256: string }[];
  /** `esquema.tabela` → linhas no instante da cópia. */
  readonly linhas: Readonly<Record<string, number>>;
}

/** Data do nome da cópia, ou `undefined` se o arquivo não é uma cópia. */
export function dataDaCopia(nome: string): Date | undefined {
  const casou = NOME_DA_COPIA.exec(nome);
  if (!casou) return undefined;
  const t = casou[1] as string;
  return new Date(
    `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`,
  );
}

/** Nome da cópia para um instante. */
export function nomeDaCopia(instante: Date): string {
  const t = instante.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return `simpleclick-${t}.dump`;
}

/** Resumo SHA-256 de um arquivo, lido aos pedaços. */
export function resumoDoArquivo(caminho: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const resumo = createHash("sha256");
    createReadStream(caminho)
      .on("data", (parte) => resumo.update(parte))
      .on("error", rejeitar)
      .on("end", () => resolver(resumo.digest("hex")));
  });
}

/**
 * Apaga da pasta as cópias (e seus manifestos) com mais de sete dias. Só
 * arquivo com nome de cópia é considerado: o resto da pasta não é tocado.
 */
export function aplicarRetencao(
  pasta: string,
  agora: Date,
  dias: number = DIAS_DE_RETENCAO,
): string[] {
  const limite = agora.getTime() - dias * 24 * 60 * 60 * 1000;
  const apagadas: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const data = dataDaCopia(nome);
    if (data === undefined || data.getTime() >= limite) continue;
    rmSync(join(pasta, nome), { force: true });
    rmSync(join(pasta, `${nome}.json`), { force: true });
    apagadas.push(nome);
  }
  return apagadas.sort();
}

/** Tabelas de dados do SimpleClick, como `esquema.tabela`. */
export async function tabelasDoBanco(cliente: ClienteSql): Promise<string[]> {
  const { rows } = await cliente.query(`
    SELECT n.nspname || '.' || c.relname AS tabela
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname IN ('app', 'migracao')
     ORDER BY 1`);
  return rows.map((linha) => String(linha.tabela));
}

/** Linhas de cada tabela, vistas por quem conectou. */
export async function contarLinhas(
  cliente: ClienteSql,
): Promise<Record<string, number>> {
  const linhas: Record<string, number> = {};
  for (const tabela of await tabelasDoBanco(cliente)) {
    const [esquema, nome] = tabela.split(".") as [string, string];
    const { rows } = await cliente.query(
      `SELECT count(*)::bigint AS total FROM "${esquema}"."${nome}"`,
    );
    linhas[tabela] = Number(rows[0]?.total ?? 0);
  }
  return linhas;
}

/** O livro de migrações do banco, em ordem. */
export async function livroDeMigracoes(
  cliente: ClienteSql,
): Promise<{ nome: string; sha256: string }[]> {
  const { rows } = await cliente.query(
    "SELECT nome, sha256 FROM migracao.aplicadas ORDER BY nome",
  );
  return rows.map((linha) => ({
    nome: String(linha.nome),
    sha256: String(linha.sha256),
  }));
}

/**
 * Tira a cópia e o manifesto do mesmo retrato do banco, e aplica a retenção.
 * O arquivo só ganha o nome final depois de completo: uma cópia interrompida
 * nunca parece uma cópia boa.
 */
export async function fazerCopia(entrada: {
  readonly urlDeOrigem: string;
  readonly pasta: string;
  readonly agora?: Date;
  readonly ambiente?: Readonly<Record<string, string | undefined>>;
}): Promise<{
  manifesto: ManifestoDaCopia;
  caminho: string;
  apagadas: string[];
}> {
  const agora = entrada.agora ?? new Date();
  const nome = nomeDaCopia(agora);
  const caminho = join(entrada.pasta, nome);
  const parcial = `${caminho}.parcial`;

  const cliente = new pg.Client({ connectionString: entrada.urlDeOrigem });
  await cliente.connect();
  let migracoes: ManifestoDaCopia["migracoes"];
  let linhas: Record<string, number>;
  try {
    await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const { rows } = await cliente.query(
      "SELECT pg_export_snapshot() AS retrato",
    );
    const retrato = String(rows[0]?.retrato);
    migracoes = await livroDeMigracoes(cliente);
    linhas = await contarLinhas(cliente);
    await executarFerramenta({
      ferramenta: "pg_dump",
      argumentos: [
        "--format=custom",
        `--snapshot=${retrato}`,
        `--file=${parcial}`,
      ],
      url: entrada.urlDeOrigem,
      ...(entrada.ambiente === undefined ? {} : { ambiente: entrada.ambiente }),
    });
    await cliente.query("COMMIT");
  } catch (causa) {
    rmSync(parcial, { force: true });
    throw causa;
  } finally {
    await cliente.end();
  }

  renameSync(parcial, caminho);
  const manifesto: ManifestoDaCopia = {
    versao: 1,
    arquivo: nome,
    criadaEm: agora.toISOString(),
    sha256: await resumoDoArquivo(caminho),
    migracoes,
    linhas,
  };
  writeFileSync(`${caminho}.json`, `${JSON.stringify(manifesto, null, 2)}\n`);
  return {
    manifesto,
    caminho,
    apagadas: aplicarRetencao(entrada.pasta, agora),
  };
}

/** A cópia mais nova da pasta, ou o próprio arquivo quando já é um. */
export function copiaMaisNova(alvo: string): string {
  if (!statSync(alvo).isDirectory()) return alvo;
  const copias = readdirSync(alvo)
    .filter((nome) => dataDaCopia(nome) !== undefined)
    .sort();
  const ultima = copias.at(-1);
  if (ultima === undefined) throw new Error(`Nenhuma cópia em ${alvo}.`);
  return join(alvo, ultima);
}

/** Linha de comando: `copiar` ou `ensaiar`. Devolve o código de saída. */
async function principal(argumentos: readonly string[]): Promise<number> {
  const [comando, alvo] = argumentos;
  const escrever = (linha: string) => process.stdout.write(`${linha}\n`);
  if ((comando !== "copiar" && comando !== "ensaiar") || alvo === undefined) {
    process.stderr.write("uso: copia-de-seguranca.ts copiar|ensaiar <pasta>\n");
    return 2;
  }
  const variavel =
    comando === "copiar" ? "DATABASE_URL_DIRETA" : "DATABASE_URL_ENSAIO";
  const url = process.env[variavel]?.trim();
  if (!url) {
    process.stderr.write(`${variavel} não está definida.\n`);
    return 2;
  }
  try {
    if (comando === "copiar") {
      const { caminho, apagadas, manifesto } = await fazerCopia({
        urlDeOrigem: url,
        pasta: resolve(alvo),
      });
      const total = Object.values(manifesto.linhas).reduce((a, b) => a + b, 0);
      escrever(
        `✔ cópia em ${caminho} (${total} linhas em ${Object.keys(manifesto.linhas).length} tabelas)`,
      );
      for (const nome of apagadas) escrever(`  apagada pela retenção: ${nome}`);
      return 0;
    }
    const { ensaiarRestauracao } = await import("./ensaio-de-restauracao.ts");
    const relatorio = await ensaiarRestauracao({
      arquivo: copiaMaisNova(resolve(alvo)),
      urlDoServidor: url,
      relatar: (linha) => escrever(`  ${linha}`),
    });
    escrever(
      `✔ restauração ensaiada: ${relatorio.tabelasConferidas} tabelas conferem com o manifesto`,
    );
    return 0;
  } catch (erro) {
    process.stderr.write(
      `✘ ${erro instanceof Error ? erro.message : String(erro)}\n`,
    );
    return 1;
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}

/**
 * Prova da cópia de segurança e do ensaio de restauração (T-024, AC-052),
 * contra PostgreSQL de verdade e com as ferramentas de verdade (`pg_dump`,
 * `pg_restore`, `psql`) da instalação da máquina.
 *
 * A origem é um banco descartável migrado e com a carga de exemplo (lojas,
 * catálogo, pedidos), copiado pela credencial de migração como a publicação
 * faria. Toda prova de "reprovou" confere também que nenhum banco de ensaio
 * ficou para trás.
 */
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { carregarDadosDeExemplo } from "../seed/index.ts";
import {
  contarLinhas,
  fazerCopia,
  type ManifestoDaCopia,
  nomeDaCopia,
  resumoDoArquivo,
} from "./copia-de-seguranca.ts";
import {
  ensaiarRestauracao,
  PREFIXO_DO_ENSAIO,
} from "./ensaio-de-restauracao.ts";
import { localizarFerramenta } from "./ferramentas-do-postgres.ts";
import {
  aplicarMigracoes,
  derivarUrlDePapel,
  lerMigracoes,
} from "./migrate.ts";

/**
 * Sem o cliente do PostgreSQL (`pg_dump`, `pg_restore`, `psql`) na máquina, não
 * há como provar a cópia nem a restauração: a suíte é PULADA, com o motivo
 * escrito no aviso, em vez de reprovar por ferramenta ausente. Na CI (`CI`
 * definida) a falta da ferramenta continua sendo falha: lá ela é pré-requisito
 * do ambiente, e pular em silêncio esconderia a prova do AC-052. Instalação:
 * veja "Pré-requisitos" no README (`brew install libpq`, ou `PG_BIN`).
 */
const MOTIVO_DE_PULAR: string | null = (() => {
  if (process.env.CI) return null;
  try {
    for (const ferramenta of ["pg_dump", "pg_restore", "psql"] as const) {
      localizarFerramenta(ferramenta);
    }
    return null;
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.warn(
      `[copia-de-seguranca] suíte PULADA (AC-052 não foi provado nesta máquina): ${motivo}`,
    );
    return motivo;
  }
})();

const ESPERA = 240_000;
const DIA = 24 * 60 * 60 * 1000;

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} não está definida (veja .env.example).`);
  return valor;
}

const SERVIDOR = exigir("DATABASE_URL_TEST");
const NOME = `sc_teste_${Date.now().toString(36)}_copia_${Math.random().toString(36).slice(2, 8)}`;
const ORIGEM = (() => {
  const url = new URL(SERVIDOR);
  url.pathname = `/${NOME}`;
  return url.toString();
})();
const AGORA = new Date("2026-10-06T03:00:00Z");

let pasta: string;
const outrasPastas: string[] = [];
let copia: Awaited<ReturnType<typeof fazerCopia>>;

async function comCliente<T>(url: string, acao: (c: pg.Client) => Promise<T>) {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

/** Bancos de ensaio que existem agora no servidor. */
function bancosDeEnsaio(): Promise<string[]> {
  return comCliente(SERVIDOR, async (c) => {
    const { rows } = await c.query(
      "SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY 1",
      [`${PREFIXO_DO_ENSAIO}%`],
    );
    return rows.map((linha) => String(linha.datname));
  });
}

beforeAll(async () => {
  if (MOTIVO_DE_PULAR !== null) return;
  await comCliente(SERVIDOR, (c) =>
    c.query(`CREATE DATABASE ${NOME} TEMPLATE template0`),
  );
  await comCliente(ORIGEM, (c) =>
    aplicarMigracoes({ cliente: c, segredos: process.env }),
  );
  const administracao = derivarUrlDePapel(
    ORIGEM,
    "sc_admin",
    exigir("SENHA_BANCO_ADMINISTRACAO"),
  );
  await comCliente(administracao, (c) =>
    carregarDadosDeExemplo({
      cliente: c,
      ambiente: { NODE_ENV: "development" },
    }),
  );

  pasta = mkdtempSync(join(tmpdir(), "sc-copia-"));
  for (const dias of [8, 6]) {
    const antiga = nomeDaCopia(new Date(AGORA.getTime() - dias * DIA));
    writeFileSync(join(pasta, antiga), "cópia antiga");
    writeFileSync(join(pasta, `${antiga}.json`), "{}");
  }
  writeFileSync(join(pasta, "anotacoes.txt"), "não é cópia");

  copia = await fazerCopia({
    urlDeOrigem: derivarUrlDePapel(
      ORIGEM,
      "sc_migrator",
      exigir("SENHA_BANCO_MIGRADOR"),
    ),
    pasta,
    agora: AGORA,
  });
}, ESPERA);

afterAll(async () => {
  if (MOTIVO_DE_PULAR !== null) return;
  await comCliente(SERVIDOR, (c) =>
    c.query(`DROP DATABASE IF EXISTS ${NOME} WITH (FORCE)`),
  );
  for (const caminho of [pasta, ...outrasPastas]) {
    if (caminho) rmSync(caminho, { recursive: true, force: true });
  }
}, ESPERA);

/** Copia a cópia boa para outra pasta, para estragar sem afetar as outras. */
function copiaEmOutraPasta(): string {
  const outra = mkdtempSync(join(tmpdir(), "sc-copia-estragada-"));
  outrasPastas.push(outra);
  const destino = join(outra, copia.manifesto.arquivo);
  copyFileSync(copia.caminho, destino);
  copyFileSync(`${copia.caminho}.json`, `${destino}.json`);
  return destino;
}

describe.skipIf(MOTIVO_DE_PULAR !== null)("cópia de segurança", () => {
  it(
    "@spec:AC-052 sai com data no nome e manifesto do mesmo instante, e a retenção apaga só o que passou de sete dias",
    async () => {
      expect(copia.manifesto.arquivo).toBe("simpleclick-20261006T030000Z.dump");
      expect(existsSync(copia.caminho)).toBe(true);
      expect(copia.manifesto.sha256).toBe(await resumoDoArquivo(copia.caminho));
      expect(copia.manifesto.migracoes).toHaveLength(lerMigracoes().length);

      const reais = await comCliente(ORIGEM, (c) => contarLinhas(c));
      expect(copia.manifesto.linhas).toEqual(reais);
      expect(copia.manifesto.linhas["app.stores"]).toBeGreaterThanOrEqual(2);
      expect(copia.manifesto.linhas["app.orders"]).toBeGreaterThan(0);

      const oitoDias = nomeDaCopia(new Date(AGORA.getTime() - 8 * DIA));
      const seisDias = nomeDaCopia(new Date(AGORA.getTime() - 6 * DIA));
      expect(copia.apagadas).toEqual([oitoDias]);
      expect(existsSync(join(pasta, oitoDias))).toBe(false);
      expect(existsSync(join(pasta, `${oitoDias}.json`))).toBe(false);
      expect(existsSync(join(pasta, seisDias))).toBe(true);
      expect(existsSync(join(pasta, "anotacoes.txt"))).toBe(true);
    },
    ESPERA,
  );
});

describe.skipIf(MOTIVO_DE_PULAR !== null)("ensaio de restauração", () => {
  it(
    "@spec:AC-052 restaura num banco descartável, confere com o manifesto e apaga o banco no fim",
    async () => {
      const antes = await bancosDeEnsaio();
      const relatorio = await ensaiarRestauracao({
        arquivo: copia.caminho,
        urlDoServidor: SERVIDOR,
      });
      expect(relatorio.banco.startsWith(PREFIXO_DO_ENSAIO)).toBe(true);
      expect(relatorio.tabelasConferidas).toBe(
        Object.keys(copia.manifesto.linhas).length,
      );
      expect(await bancosDeEnsaio()).toEqual(antes);
    },
    ESPERA,
  );

  it(
    "@spec:AC-052 cópia corrompida, ou que não volta igual ao manifesto, reprova sem deixar banco para trás",
    async () => {
      const antes = await bancosDeEnsaio();

      // Um byte trocado: o resumo não bate e nada é criado.
      const trocada = copiaEmOutraPasta();
      const bytes = readFileSync(trocada);
      const meio = Math.floor(bytes.length / 2);
      bytes[meio] = (bytes[meio] ?? 0) ^ 0xff;
      writeFileSync(trocada, bytes);
      await expect(
        ensaiarRestauracao({ arquivo: trocada, urlDoServidor: SERVIDOR }),
      ).rejects.toThrow(/corrompida/);

      // Arquivo cortado ao meio com resumo recalculado: a restauração falha.
      const cortada = copiaEmOutraPasta();
      writeFileSync(cortada, readFileSync(cortada).subarray(0, 4096));
      const manifesto = JSON.parse(
        readFileSync(`${cortada}.json`, "utf8"),
      ) as ManifestoDaCopia;
      writeFileSync(
        `${cortada}.json`,
        JSON.stringify({
          ...manifesto,
          sha256: await resumoDoArquivo(cortada),
        }),
      );
      await expect(
        ensaiarRestauracao({ arquivo: cortada, urlDoServidor: SERVIDOR }),
      ).rejects.toThrow();

      // Manifesto que promete uma linha a mais: a conferência acusa.
      const divergente = copiaEmOutraPasta();
      writeFileSync(
        `${divergente}.json`,
        JSON.stringify({
          ...copia.manifesto,
          linhas: {
            ...copia.manifesto.linhas,
            "app.stores": (copia.manifesto.linhas["app.stores"] ?? 0) + 1,
          },
        }),
      );
      await expect(
        ensaiarRestauracao({ arquivo: divergente, urlDoServidor: SERVIDOR }),
      ).rejects.toThrow(/app\.stores/);

      expect(await bancosDeEnsaio()).toEqual(antes);
    },
    ESPERA,
  );
});

/**
 * [CA-3] A prova do Postgres descartável recusa ANTES de conectar quando o
 * ambiente aponta para outro lugar, e fecha a conexão quando sysid ou nonce não
 * batem. Roda com `node --test` (o caminho não está no gate do vitest).
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { conferirSemConexao, provarDescartavel, RecusaDoDescartavel, type ClienteMinimo } from "./descartavel.ts";

const NONCE = "0123456789abcdef0123456789abcdef";
const SYSID = "7400000000000000001";

function arquivoDeServicos(porta = "55440"): string {
  const pasta = mkdtempSync(join(tmpdir(), "sc-perf-teste-"));
  const caminho = join(pasta, ".servicos.env");
  writeFileSync(caminho, `PORTA_PG=${porta}\nSC_PERF_NONCE=${NONCE}\nSC_PERF_SYSID=${SYSID}\n`);
  return caminho;
}

function ambiente(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SERVICOS_ENV: arquivoDeServicos(),
    DATABASE_URL_DIRETA: "postgresql://postgres:x@localhost:55440/simpleclick",
    ...extra,
  };
}

function fabricaQueNaoPodeSerChamada(): never {
  throw new Error("a fábrica foi chamada numa recusa da fase 1");
}

function fabricaCom(sysid: string, comentario: string) {
  const estado = { fechada: false };
  const fabrica = async (): Promise<ClienteMinimo> => ({
    query: async () => ({ rows: [{ sysid, comentario }] }),
    end: async () => {
      estado.fechada = true;
    },
  });
  return { fabrica, estado };
}

describe("[CA-3] prova do Postgres descartável", () => {
  const recusas: [string, Record<string, string | undefined>][] = [
    ["sem SERVICOS_ENV", { SERVICOS_ENV: undefined }],
    ["SERVICOS_ENV que não existe", { SERVICOS_ENV: "/nao/existe/.servicos.env" }],
    ["host fora do loopback", { DATABASE_URL_DIRETA: "postgresql://postgres:x@db.exemplo.com:55440/simpleclick" }],
    ["porta 5432 (postgres-dev do preview)", { DATABASE_URL_DIRETA: "postgresql://postgres:x@localhost:5432/simpleclick" }],
    ["porta sem número (padrão 5432)", { DATABASE_URL_DIRETA: "postgresql://postgres:x@localhost/simpleclick" }],
    ["porta 6432 (agrupador)", { DATABASE_URL_DIRETA: "postgresql://postgres:x@localhost:6432/simpleclick" }],
    ["porta diferente da PORTA_PG gravada", { DATABASE_URL_DIRETA: "postgresql://postgres:x@localhost:55441/simpleclick" }],
    ["PGHOST definida", { PGHOST: "outro" }],
    ["PGOPTIONS definida", { PGOPTIONS: "-c role=postgres" }],
  ];
  for (const [rotulo, extra] of recusas) {
    it(`[CA-3] recusa sem conectar: ${rotulo}`, async () => {
      await assert.rejects(
        provarDescartavel(ambiente(extra), fabricaQueNaoPodeSerChamada),
        RecusaDoDescartavel,
      );
    });
  }

  it("[CA-3] recusa arquivo de serviços sem a prova completa", () => {
    const pasta = mkdtempSync(join(tmpdir(), "sc-perf-teste-"));
    const caminho = join(pasta, ".servicos.env");
    writeFileSync(caminho, "PORTA_PG=55440\n");
    assert.throws(() => conferirSemConexao(ambiente({ SERVICOS_ENV: caminho })), RecusaDoDescartavel);
  });

  it("[CA-3] sysid divergente: recusa e fecha a conexão", async () => {
    const { fabrica, estado } = fabricaCom("999", `sc-perf-descartavel:${NONCE}`);
    await assert.rejects(provarDescartavel(ambiente(), fabrica), /system_identifier/);
    assert.equal(estado.fechada, true);
  });

  it("[CA-3] nonce divergente: recusa e fecha a conexão", async () => {
    const { fabrica, estado } = fabricaCom(SYSID, "simpleclick-simulacao");
    await assert.rejects(provarDescartavel(ambiente(), fabrica), /nonce/);
    assert.equal(estado.fechada, true);
  });

  it("[CA-3] aceita o descartável com porta, sysid e nonce certos", async () => {
    const { fabrica, estado } = fabricaCom(SYSID, `sc-perf-descartavel:${NONCE}`);
    const prova = await provarDescartavel(ambiente(), fabrica);
    assert.equal(prova.porta, "55440");
    assert.equal(estado.fechada, true);
  });
});

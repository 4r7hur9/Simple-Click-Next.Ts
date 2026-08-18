import { appendFileSync } from "node:fs";

import { beforeAll, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "../src/db-test.ts";

/**
 * Suíte que passa, executada duas vezes seguidas pela prova de repetição.
 *
 * A chave `9001` é fixa de propósito: `app.stores` tem única global em `code`,
 * então, se qualquer estado sobrasse da execução anterior, a segunda inserção
 * falharia. "Deu o mesmo resultado nas duas vezes" deixa de ser observação e
 * vira consequência do banco ser novo.
 */

const RELATO = process.env.SC_RELATO_DO_BANCO;

beforeAll(() => {
  if (RELATO !== undefined) {
    appendFileSync(RELATO, `${bancoDoArquivo().nome}\n`, "utf8");
  }
});

it("escreve na loja de chave fixa e enxerga só o que escreveu", async () => {
  const cliente = await conectarNoBancoDoArquivo();
  try {
    await cliente.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ('9001', 'Loja da prova', 'loja-da-prova', 'ACTIVE', 'FOOD_SNACK')`,
    );
    const total = await cliente.query(
      "SELECT count(*)::int AS total FROM app.stores",
    );
    expect((total.rows[0] as { total: number }).total).toBe(1);
  } finally {
    await cliente.end();
  }
});

it("encontra o esquema já migrado, sem aplicar migração nenhuma", async () => {
  const cliente = await conectarNoBancoDoArquivo();
  try {
    const aplicadas = await cliente.query(
      "SELECT count(*)::int AS total FROM migracao.aplicadas",
    );
    expect((aplicadas.rows[0] as { total: number }).total).toBeGreaterThan(0);
  } finally {
    await cliente.end();
  }
});

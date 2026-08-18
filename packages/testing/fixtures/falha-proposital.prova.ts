import { appendFileSync } from "node:fs";

import { beforeAll, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "../src/db-test.ts";

/**
 * Suíte que falha de propósito, executada pela prova de descarte.
 *
 * Não é um teste do projeto: é o cenário que a prova precisa observar. Banco de
 * teste que só é apagado quando o teste passa entulha o servidor exatamente nos
 * dias ruins, que são os dias em que a suíte roda mais vezes.
 */

const RELATO = process.env.SC_RELATO_DO_BANCO;

beforeAll(() => {
  if (RELATO !== undefined) {
    appendFileSync(RELATO, `${bancoDoArquivo().nome}\n`, "utf8");
  }
});

it("escreve no banco e então falha", async () => {
  const cliente = await conectarNoBancoDoArquivo();
  try {
    await cliente.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ('9002', 'Loja que some', 'loja-que-some', 'ACTIVE', 'FOOD_SNACK')`,
    );
  } finally {
    await cliente.end();
  }
  expect("esta suíte falha por desenho").toBe(
    "e o banco tem de sumir assim mesmo",
  );
});

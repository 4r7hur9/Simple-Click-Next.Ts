import { expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "../src/db-test.ts";

/**
 * Metade B da prova de que dois arquivos de teste rodando ao mesmo tempo não
 * enxergam os dados um do outro (AC-003).
 *
 * O par `paralelo-a` / `paralelo-b` grava a MESMA chave de loja, `7300`, que
 * tem única global em `app.stores`. Se os dois arquivos dividissem um banco,
 * um dos dois quebraria na inserção — em qualquer ordem, em paralelo ou em
 * sequência. Passar os dois é a prova.
 */

it("@spec:AC-003 grava a chave compartilhada e enxerga apenas o próprio dado", async () => {
  const cliente = await conectarNoBancoDoArquivo();
  try {
    await cliente.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ('7300', 'Loja paralela B', 'loja-paralela-b', 'ACTIVE', 'FOOD_SNACK')`,
    );

    const lojas = await cliente.query(
      "SELECT slug FROM app.stores ORDER BY slug",
    );
    expect(
      lojas.rows.map((linha) => String((linha as { slug: unknown }).slug)),
    ).toEqual(["loja-paralela-b"]);
  } finally {
    await cliente.end();
  }
});

it("@spec:AC-003 o banco deste arquivo é exclusivo dele", () => {
  expect(bancoDoArquivo().nome).toContain("paralelob");
});

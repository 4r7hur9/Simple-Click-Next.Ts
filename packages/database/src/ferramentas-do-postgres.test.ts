/**
 * Prova do filtro da restauração (T-024, AC-052): só some o `SET` de
 * parâmetro que o servidor de destino não conhece, e nenhum dado de `COPY` é
 * tocado — nem com fim de linha do Windows, nem com acento partido ao meio
 * entre dois blocos.
 */
import { describe, expect, it } from "vitest";

import {
  FiltroDeParametrosDesconhecidos,
  separarSenha,
} from "./ferramentas-do-postgres.ts";

/** Passa o texto pelo filtro em blocos do tamanho pedido. */
async function filtrar(texto: string, tamanho: number): Promise<string> {
  const filtro = new FiltroDeParametrosDesconhecidos(
    new Set(["statement_timeout", "client_encoding"]),
  );
  const partes: Buffer[] = [];
  filtro.on("data", (parte: Buffer) => partes.push(Buffer.from(parte)));
  const fim = new Promise((resolver) => filtro.on("end", resolver));
  const bytes = Buffer.from(texto, "utf8");
  for (let i = 0; i < bytes.length; i += tamanho) {
    filtro.write(bytes.subarray(i, i + tamanho));
  }
  filtro.end();
  await fim;
  return Buffer.concat(partes).toString("utf8");
}

describe("filtro da restauração", () => {
  it("@spec:AC-052 retira só o SET desconhecido, preserva dados de COPY e acentos", async () => {
    const entrada = [
      "SET statement_timeout = 0;",
      "SET transaction_timeout = 0;",
      "SET client_encoding = 'UTF8';",
      "COPY app.notas (texto) FROM stdin;",
      "SET transaction_timeout = 0;",
      "Pastelaria São João",
      "\\.",
      "SET transaction_timeout = 0;",
      "",
    ].join("\r\n");

    for (const tamanho of [1, 3, 7, 4096]) {
      const saida = await filtrar(entrada, tamanho);
      expect(saida).toBe(
        [
          "SET statement_timeout = 0;",
          "SET client_encoding = 'UTF8';",
          "COPY app.notas (texto) FROM stdin;",
          "SET transaction_timeout = 0;",
          "Pastelaria São João",
          "\\.",
          "",
        ].join("\r\n"),
      );
    }
  });

  it("@spec:AC-052 a senha sai da cadeia de conexão e vai à parte", () => {
    const { url, senha } = separarSenha(
      "postgresql://sc_migrator:s%40nha-de-prova@banco:5432/simpleclick",
    );
    expect(senha).toBe("s@nha-de-prova");
    expect(url).not.toContain("nha-de-prova");
  });
});

/**
 * Prova de que as métricas nunca cruzam loja (T-806; AC-811, AC-816, P-003).
 *
 * Duas lojas com movimento no MESMO período, e a B vendendo muito mais que a
 * A — de propósito: se uma soma da B vazasse para a A, o número da A mudaria
 * de um jeito impossível de passar despercebido.
 *
 * Três portas sob prova, todas pela aplicação montada:
 *
 * 1. o dono da A pedindo as métricas (e a planilha) da B pelo apelido dela
 *    sai por "não encontrado" — a MESMA resposta do apelido que não existe,
 *    dada pelo vínculo que `core/db.ts` confere antes de qualquer consulta;
 * 2. tentar informar a loja na requisição (`lojaId` na consulta) é recusado
 *    pela borda com 400, em vez de ignorado — a loja vem do apelido e do
 *    contexto, nunca de um parâmetro;
 * 3. os números e a planilha da A refletem só a A.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDasMetricas } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  appDasMetricas,
  exportarMetricas,
  inserirPedido,
  lerMetricas,
  tokenDoDonoDasMetricas,
} from "./apoio-de-metricas.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof appDasMetricas>;
let A: LojaDeTeste;
let B: LojaDeTeste;
let tokenDaA: string;

/** 14h32 de 27/09/2026 em São Paulo. */
const AGORA = new Date("2026-09-27T14:32:00-03:00");

/** O que a B tem no banco que uma exportação poderia tocar. */
async function retratoDe(loja: LojaDeTeste): Promise<unknown> {
  const { rows } = await migrador.query(
    `SELECT (SELECT count(*)::int FROM app.audit_log WHERE store_id = $1) AS auditoria,
            (SELECT count(*)::int FROM app.orders WHERE store_id = $1) AS pedidos`,
    [loja.id],
  );
  return rows[0];
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = appDasMetricas(acesso, { agora: () => AGORA });

  A = await criarLoja({ nome: "Loja A das Métricas" });
  B = await criarLoja({ nome: "Loja B das Métricas" });
  tokenDaA = tokenDoDonoDasMetricas(A.dono.id);

  // A: dois pedidos pequenos hoje.
  for (const total of [1_000, 2_000]) {
    await inserirPedido(migrador, A.id, {
      colocadoEm: new Date("2026-09-27T10:00:00-03:00"),
      totalCentavos: total,
      status: "COMPLETED",
      itens: [{ nome: "Produto da A", quantidade: 1, totalCentavos: total }],
      cliente: {
        nome: "Cliente da A",
        telefone: "5511900000001",
        rua: "Rua da A",
      },
    });
  }
  // B: muito mais, no mesmo dia e na mesma hora.
  for (const total of [50_000, 70_000, 90_000]) {
    await inserirPedido(migrador, B.id, {
      colocadoEm: new Date("2026-09-27T10:00:00-03:00"),
      totalCentavos: total,
      status: "COMPLETED",
      canal: "MANUAL",
      itens: [{ nome: "Produto da B", quantidade: 5, totalCentavos: total }],
      cliente: {
        nome: "Cliente da B",
        telefone: "5511900000002",
        rua: "Rua da B",
      },
    });
  }
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("as métricas da loja A não enxergam a loja B (AC-811)", () => {
  it(
    "@spec:AC-811 @principle:P-003 o dono da A pedindo as métricas e a planilha da B sai por 'não encontrado', igual a apelido que não existe, e nada da B muda",
    async () => {
      const antes = await retratoDe(B);

      const inexistente = await lerMetricas(
        app,
        "loja-que-nao-existe-nas-metricas",
        tokenDaA,
      );
      const daB = await lerMetricas(app, B.apelido, tokenDaA);
      const planilhaDaB = await exportarMetricas(app, B.apelido, tokenDaA);

      expect(inexistente.status).toBe(404);
      expect(daB.status).toBe(404);
      expect(planilhaDaB.status).toBe(404);
      // A mesma porta: o mesmo código e o mesmo formato de corpo, sem
      // nenhum vestígio de que a B existe.
      expect(daB.body.erro.codigo).toBe("nao_encontrado");
      expect(Object.keys(daB.body.erro).sort()).toEqual(
        Object.keys(inexistente.body.erro).sort(),
      );
      expect(daB.body.erro.codigo).toBe(inexistente.body.erro.codigo);
      expect(daB.body.erro.mensagem).toBe(inexistente.body.erro.mensagem);
      for (const corpo of [JSON.stringify(daB.body), planilhaDaB.text]) {
        expect(corpo).not.toMatch(/Loja B|Produto da B|Cliente da B/);
      }

      // Nada foi gravado na B — nem a linha de auditoria de uma exportação.
      expect(await retratoDe(B)).toEqual(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-811 @principle:P-003 informar o identificador da loja B na requisição é recusado pela borda, e não ignorado",
    async () => {
      for (const consulta of [
        { lojaId: B.id },
        { periodo: "7d", lojaId: B.id },
        { storeId: B.id },
        { loja: B.apelido },
      ]) {
        const metricas = await lerMetricas(app, A.apelido, tokenDaA, consulta);
        const planilha = await exportarMetricas(
          app,
          A.apelido,
          tokenDaA,
          consulta,
        );

        expect(metricas.status, JSON.stringify(consulta)).toBe(400);
        expect(metricas.body.erro).toBe("entrada_invalida");
        expect(planilha.status, JSON.stringify(consulta)).toBe(400);
        expect(JSON.stringify(metricas.body)).not.toContain("Produto da B");
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-811 @principle:P-003 com a B vendendo mais no mesmo período, os números da A somam só os pedidos da A",
    async () => {
      for (const periodo of ["hoje", "7d"]) {
        const resposta = await lerMetricas(app, A.apelido, tokenDaA, {
          periodo,
        });
        expect(resposta.status, periodo).toBe(200);
        const metricas = esquemaDasMetricas.parse(resposta.body);

        expect(metricas.resumo.pedidos, periodo).toBe(2);
        expect(metricas.resumo.vendidoCentavos, periodo).toBe(3_000);
        expect(metricas.resumo.porCanal.balcao, periodo).toEqual({
          quantidade: 0,
          totalCentavos: 0,
        });
        expect(metricas.maisVendidos, periodo).toEqual([
          {
            produtoId: null,
            nome: "Produto da A",
            quantidade: 2,
            totalCentavos: 3_000,
          },
        ]);
        const somaDosDias = metricas.porDia.reduce(
          (soma, ponto) => soma + ponto.vendidoCentavos,
          0,
        );
        const somaDasHoras = metricas.porHora.reduce(
          (soma, ponto) => soma + ponto.vendidoCentavos,
          0,
        );
        expect([somaDosDias, somaDasHoras], periodo).toEqual([3_000, 3_000]);
      }
    },
    ESPERA_LONGA,
  );
});

describe("a planilha da loja A só tem a loja A (AC-816)", () => {
  it(
    "@spec:AC-816 @principle:P-003 a exportação da A no período em que a B vendeu traz só os pedidos da A, e a auditoria fica na A",
    async () => {
      const auditoriaDaB = await retratoDe(B);

      const resposta = await exportarMetricas(app, A.apelido, tokenDaA, {
        periodo: "hoje",
      });

      expect(resposta.status).toBe(200);
      expect(resposta.headers["x-quantidade-de-pedidos"]).toBe("2");
      expect(resposta.text).toContain("Cliente da A");
      expect(resposta.text).not.toMatch(/Cliente da B|Produto da B|Balcão/);
      expect(resposta.text).not.toContain("5511900000001");

      const trilhaDaA = await migrador.query(
        `SELECT count(*)::int AS n FROM app.audit_log
          WHERE store_id = $1 AND action = 'metricas.exportar'`,
        [A.id],
      );
      expect(trilhaDaA.rows[0]?.n).toBeGreaterThanOrEqual(1);
      expect(await retratoDe(B)).toEqual(auditoriaDaB);
    },
    ESPERA_LONGA,
  );
});

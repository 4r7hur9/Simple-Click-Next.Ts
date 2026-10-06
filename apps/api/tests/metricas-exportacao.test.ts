/**
 * Prova da exportação do período pela API, contra PostgreSQL de verdade
 * (T-808; AC-815, AC-816).
 *
 * Um pedido por linha, no mesmo recorte da tela e no relógio da loja; só o que
 * o dono vê na tela (nem telefone, nem endereço); e a exportação registrada na
 * trilha de auditoria, na mesma transação, com o autor de verdade.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  AGORA,
  appDasMetricas,
  exportarMetricas,
  inserirPedido,
  lojaComDono,
  sp,
} from "./apoio-de-metricas.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("a exportação do período (AC-815, AC-816)", () => {
  it(
    "@spec:AC-815 @spec:AC-816 a planilha traz um pedido por linha no recorte da tela, sem telefone nem endereço, e a exportação fica na auditoria",
    async () => {
      const { loja, token } = await lojaComDono("Empório da Planilha");
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      const primeiro = await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T09:15:00"),
        totalCentavos: 3_000,
        status: "COMPLETED",
        itens: [{ nome: "Pão de queijo", quantidade: 2, totalCentavos: 3_000 }],
        cliente: {
          nome: "Maria Conceição",
          telefone: "5511988887777",
          rua: "Rua das Flores",
        },
      });
      const segundo = await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T11:40:00"),
        totalCentavos: 1_250,
        status: "CANCELLED",
        canal: "MANUAL",
        itens: [{ nome: "Café", quantidade: 1, totalCentavos: 1_250 }],
      });
      // Fora do recorte: o dia anterior.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-26T21:00:00"),
        totalCentavos: 9_900,
        cliente: {
          nome: "Cliente de Ontem",
          telefone: "5511911112222",
          rua: "Avenida Antiga",
        },
      });

      const resposta = await exportarMetricas(app, loja.apelido, token, {
        periodo: "hoje",
      });

      expect(resposta.status).toBe(200);
      expect(resposta.headers["content-type"]).toContain("text/csv");
      expect(resposta.headers["content-disposition"]).toContain(
        `pedidos-${loja.apelido}-2026-09-27-a-2026-09-27.csv`,
      );
      expect(resposta.headers["x-quantidade-de-pedidos"]).toBe("2");
      const csv = resposta.text;
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const linhas = csv.slice(1).trimEnd().split("\r\n");
      expect(linhas).toHaveLength(3);
      expect(linhas[0]).toBe(
        "Data;Hora;Número;Código;Cliente;Canal;Itens;Status;Conta como venda;Valor (R$)",
      );
      expect(linhas[1]).toBe(
        `2026-09-27;09:15;${primeiro.numero};M${primeiro.numero};Maria Conceição;Site;2× Pão de queijo;Concluído;Sim;30,00`,
      );
      expect(linhas[2]).toBe(
        `2026-09-27;11:40;${segundo.numero};M${segundo.numero};;Balcão;1× Café;Cancelado;Não;12,50`,
      );
      // Só o que o dono vê na tela: nem telefone, nem endereço; e nada fora do recorte.
      expect(csv).not.toContain("988887777");
      expect(csv).not.toContain("Rua das Flores");
      expect(csv).not.toContain("Cliente de Ontem");

      const trilha = await migrador.query(
        `SELECT actor_id, actor_role, entity, after_data
           FROM app.audit_log
          WHERE store_id = $1 AND action = 'metricas.exportar'`,
        [loja.id],
      );
      expect(trilha.rows).toEqual([
        {
          actor_id: loja.dono.id,
          actor_role: "OWNER",
          entity: "orders",
          after_data: {
            de: "2026-09-27",
            ate: "2026-09-27",
            fuso: "America/Sao_Paulo",
            quantidade: 2,
          },
        },
      ]);
    },
    ESPERA_LONGA,
  );
});

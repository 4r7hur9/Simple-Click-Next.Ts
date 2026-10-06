/**
 * Prova do que vende e de quando vende pela API, contra PostgreSQL de verdade
 * (T-805; AC-807, AC-808, AC-809).
 *
 * O ranking soma os itens congelados do pedido (o nome do momento da compra),
 * a evolução e a distribuição agrupam no relógio da loja, e o banco só devolve
 * o que existe: a prova confere que o painel chega com os dias e as horas sem
 * venda em zero e que o pedido cancelado não entra em nenhum dos três.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  AGORA,
  appDasMetricas,
  inserirPedido,
  lerMetricas,
  lojaComDono,
  noContrato,
  sp,
  type MetricasDaResposta,
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

describe("mais vendidos, evolução por dia e movimento por hora (AC-807, AC-808, AC-809)", () => {
  let metricas: MetricasDaResposta;

  beforeAll(async () => {
    const { loja, token } = await lojaComDono("Padaria do Ranking");
    const app = appDasMetricas(acesso, { agora: () => AGORA });
    const pedido = (
      quando: string,
      itens: { nome: string; quantidade: number; totalCentavos: number }[],
      status = "COMPLETED",
    ) =>
      inserirPedido(migrador, loja.id, {
        colocadoEm: sp(quando),
        status,
        totalCentavos: itens.reduce((s, i) => s + i.totalCentavos, 0),
        itens,
      });
    await pedido("2026-09-21T17:10:00", [
      { nome: "Pão de queijo", quantidade: 25, totalCentavos: 12_500 },
      { nome: "Café", quantidade: 10, totalCentavos: 5_000 },
    ]);
    await pedido("2026-09-24T18:20:00", [
      { nome: "Bolo inteiro", quantidade: 2, totalCentavos: 24_000 },
    ]);
    await pedido("2026-09-24T18:45:00", [
      { nome: "Pão de queijo", quantidade: 15, totalCentavos: 7_500 },
    ]);
    await pedido("2026-09-27T13:05:00", [
      { nome: "Café", quantidade: 20, totalCentavos: 10_000 },
    ]);
    // Cancelado: não entra em ranking, série nem hora.
    await pedido(
      "2026-09-25T03:00:00",
      [{ nome: "Bolo inteiro", quantidade: 10, totalCentavos: 120_000 }],
      "CANCELLED",
    );

    const resposta = await lerMetricas(app, loja.apelido, token, {
      periodo: "7d",
    });
    expect(resposta.status).toBe(200);
    metricas = noContrato(resposta.body);
  }, ESPERA_LONGA);

  it("@spec:AC-807 os mais vendidos vêm com quantidade e valor, por quantidade, e o líder em valor também está na lista", () => {
    expect(metricas.maisVendidos).toEqual([
      {
        produtoId: null,
        nome: "Pão de queijo",
        quantidade: 40,
        totalCentavos: 20_000,
      },
      { produtoId: null, nome: "Café", quantidade: 30, totalCentavos: 15_000 },
      {
        produtoId: null,
        nome: "Bolo inteiro",
        quantidade: 2,
        totalCentavos: 24_000,
      },
    ]);
  });

  it("@spec:AC-808 sete dias viram sete pontos, com os dias sem venda em zero", () => {
    expect(metricas.porDia).toEqual([
      { dia: "2026-09-21", pedidos: 1, vendidoCentavos: 17_500 },
      { dia: "2026-09-22", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-23", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-24", pedidos: 2, vendidoCentavos: 31_500 },
      { dia: "2026-09-25", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-26", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-27", pedidos: 1, vendidoCentavos: 10_000 },
    ]);
  });

  it("@spec:AC-809 a distribuição por hora tem as 24 horas do relógio da loja, com o pico do fim da tarde e as horas paradas em zero", () => {
    expect(metricas.porHora).toHaveLength(24);
    expect(metricas.porHora[17]).toEqual({
      hora: 17,
      pedidos: 1,
      vendidoCentavos: 17_500,
    });
    expect(metricas.porHora[18]).toEqual({
      hora: 18,
      pedidos: 2,
      vendidoCentavos: 31_500,
    });
    expect(metricas.porHora[13]?.pedidos).toBe(1);
    // A madrugada do cancelado continua zerada.
    expect(metricas.porHora[3]).toEqual({
      hora: 3,
      pedidos: 0,
      vendidoCentavos: 0,
    });
    expect(metricas.porHora.filter((h) => h.pedidos === 0)).toHaveLength(21);
  });
});

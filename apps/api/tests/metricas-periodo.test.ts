/**
 * Prova do período das métricas pela API, contra PostgreSQL de verdade
 * (T-800; AC-800, AC-802, AC-803, AC-804, AC-805).
 *
 * A prova de unidade de `periodo.ts` mostra que as pontas são calculadas no
 * fuso da loja. Esta mostra o que só o banco responde: que o SQL corta com as
 * mesmas pontas e agrupa o dia e a hora no MESMO fuso (`AT TIME ZONE`) — o
 * pedido das 23:59 cai no dia da loja, e não no dia do UTC —, que o fuso que
 * vale é o cadastrado na loja, que os atalhos e o intervalo a dedo recortam
 * números, listas e gráficos juntos, que o intervalo errado é recusado sem
 * número nenhum, e que o período em curso compara com o mesmo pedaço do
 * anterior (decisão de 03/10/2026).
 *
 * A prova atravessa a aplicação montada — token de dono de verdade, borda de
 * validação, vínculo com a loja conferido por `core/db.ts` e transação com a
 * loja gravada — e confere cada resposta contra o contrato publicado.
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

describe("o dia do painel é o dia da loja (AC-800)", () => {
  it(
    "@spec:AC-800 às 23:59 de São Paulo o pedido das 23:59 é de hoje e o das 23:59 de ontem não é, embora o UTC diga o contrário",
    async () => {
      const { loja, token } = await lojaComDono("Pastelaria da Meia-Noite");
      // 23:59:59 do dia 27 em São Paulo — em UTC já é dia 28.
      const app = appDasMetricas(acesso, {
        agora: () => sp("2026-09-27T23:59:59"),
      });
      // Feito às 23:59 do dia 27 (02:59 do dia 28 em UTC): é de hoje.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T23:59:00"),
        totalCentavos: 3_000,
        status: "COMPLETED",
      });
      // Primeiro instante do dia 27: é de hoje.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T00:00:00"),
        totalCentavos: 1_000,
        status: "PREPARING",
      });
      // 23:59 do dia 26 (02:59 do dia 27 em UTC): é de ontem.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-26T23:59:00"),
        totalCentavos: 9_000,
        status: "COMPLETED",
      });
      // Ainda esperando o dono aceitar: é o "em aberto" de hoje.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T10:00:00"),
        totalCentavos: 2_500,
        status: "PENDING",
      });

      const resposta = await lerMetricas(app, loja.apelido, token);

      expect(resposta.status).toBe(200);
      const metricas = noContrato(resposta.body);
      expect(metricas.periodo).toMatchObject({
        atalho: "hoje",
        de: "2026-09-27",
        ate: "2026-09-27",
        fuso: "America/Sao_Paulo",
        inicio: "2026-09-27T03:00:00.000Z",
        fim: "2026-09-28T03:00:00.000Z",
      });
      // Quantidade, total vendido, valor médio e os ainda em aberto.
      expect(metricas.resumo.pedidos).toBe(2);
      expect(metricas.resumo.vendidoCentavos).toBe(4_000);
      expect(metricas.resumo.ticketMedioCentavos).toBe(2_000);
      expect(metricas.resumo.emAberto).toEqual({
        quantidade: 1,
        totalCentavos: 2_500,
      });
      // A série diz o mesmo: um dia só, e as horas no relógio da loja.
      expect(metricas.porDia).toEqual([
        { dia: "2026-09-27", pedidos: 2, vendidoCentavos: 4_000 },
      ]);
      expect(metricas.porHora[23]).toEqual({
        hora: 23,
        pedidos: 1,
        vendidoCentavos: 3_000,
      });
      expect(metricas.porHora[0]).toEqual({
        hora: 0,
        pedidos: 1,
        vendidoCentavos: 1_000,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-800 a loja de Manaus fecha o dia uma hora depois: o fuso que vale é o cadastrado na loja",
    async () => {
      const { loja, token } = await lojaComDono(
        "Tacacá do Largo",
        "America/Manaus",
      );
      // 23:59:59 do dia 27 em Manaus — já é 00:59 do dia 28 em São Paulo.
      const app = appDasMetricas(acesso, {
        agora: () => new Date("2026-09-28T03:59:59.000Z"),
      });
      // 23:30 do dia 27 em Manaus; em São Paulo seria 00:30 do dia 28.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: new Date("2026-09-28T03:30:00.000Z"),
        totalCentavos: 4_200,
        status: "ACCEPTED",
      });

      const resposta = await lerMetricas(app, loja.apelido, token);

      expect(resposta.status).toBe(200);
      const metricas = noContrato(resposta.body);
      expect(metricas.periodo).toMatchObject({
        de: "2026-09-27",
        ate: "2026-09-27",
        fuso: "America/Manaus",
        inicio: "2026-09-27T04:00:00.000Z",
      });
      expect(metricas.resumo.pedidos).toBe(1);
      expect(metricas.porDia).toEqual([
        { dia: "2026-09-27", pedidos: 1, vendidoCentavos: 4_200 },
      ]);
      expect(metricas.porHora[23]?.pedidos).toBe(1);
    },
    ESPERA_LONGA,
  );
});

describe("os atalhos recalculam tudo e mostram o período (AC-803)", () => {
  it(
    "@spec:AC-803 hoje, três e sete dias trocam números, listas e gráficos juntos, e o período em vigor vem com início e fim",
    async () => {
      const { loja, token } = await lojaComDono("Empório dos Atalhos");
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      const pedido = (dia: string, nome: string, total: number) =>
        inserirPedido(migrador, loja.id, {
          colocadoEm: sp(`${dia}T12:00:00`),
          totalCentavos: total,
          itens: [{ nome, quantidade: 1, totalCentavos: total }],
        });
      await pedido("2026-09-27", "Coxinha", 1_000);
      await pedido("2026-09-25", "Empada", 2_000);
      await pedido("2026-09-22", "Quibe", 3_000);
      // Oito dias atrás: fora até do corte de sete dias.
      await pedido("2026-09-20", "Esfiha", 4_000);

      const esperado = {
        hoje: { de: "2026-09-27", dias: 1, pedidos: 1, vendido: 1_000 },
        "3d": { de: "2026-09-25", dias: 3, pedidos: 2, vendido: 3_000 },
        "7d": { de: "2026-09-21", dias: 7, pedidos: 3, vendido: 6_000 },
      } as const;

      for (const [atalho, conta] of Object.entries(esperado)) {
        const resposta = await lerMetricas(app, loja.apelido, token, {
          periodo: atalho,
        });
        expect(resposta.status, atalho).toBe(200);
        const metricas = noContrato(resposta.body);

        expect(metricas.periodo, atalho).toMatchObject({
          atalho,
          de: conta.de,
          ate: "2026-09-27",
          dias: conta.dias,
        });
        expect(metricas.resumo.pedidos, atalho).toBe(conta.pedidos);
        expect(metricas.resumo.vendidoCentavos, atalho).toBe(conta.vendido);
        // Listas e gráficos no MESMO recorte dos números.
        expect(metricas.porDia, atalho).toHaveLength(conta.dias);
        const somaDosDias = metricas.porDia.reduce((s, p) => s + p.pedidos, 0);
        const somaDasHoras = metricas.porHora.reduce(
          (s, p) => s + p.pedidos,
          0,
        );
        const somaDoRanking = metricas.maisVendidos.reduce(
          (s, p) => s + p.quantidade,
          0,
        );
        expect([somaDosDias, somaDasHoras, somaDoRanking], atalho).toEqual([
          conta.pedidos,
          conta.pedidos,
          conta.pedidos,
        ]);
        expect(
          metricas.maisVendidos.map((p) => p.nome),
          atalho,
        ).not.toContain("Esfiha");
      }
    },
    ESPERA_LONGA,
  );
});

describe("o intervalo a dedo cobre as duas pontas por inteiro (AC-804)", () => {
  it(
    "@spec:AC-804 de 1º a 15 do mês passado conta do primeiro instante do dia 1º ao último do dia 15, e nada fora disso",
    async () => {
      const { loja, token } = await lojaComDono("Mercearia do Intervalo");
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      const pedido = (quando: string, total: number) =>
        inserirPedido(migrador, loja.id, {
          colocadoEm: sp(quando),
          totalCentavos: total,
        });
      await pedido("2026-08-01T00:00:00.000", 1_000); // primeiro instante: dentro
      await pedido("2026-08-15T23:59:59.999", 2_000); // último instante: dentro
      await pedido("2026-07-31T23:59:59.999", 4_000); // véspera: fora
      await pedido("2026-08-16T00:00:00.000", 8_000); // dia seguinte: fora

      const resposta = await lerMetricas(app, loja.apelido, token, {
        periodo: "personalizado",
        de: "2026-08-01",
        ate: "2026-08-15",
      });

      expect(resposta.status).toBe(200);
      const metricas = noContrato(resposta.body);
      expect(metricas.periodo).toMatchObject({
        atalho: "personalizado",
        de: "2026-08-01",
        ate: "2026-08-15",
        dias: 15,
        inicio: "2026-08-01T03:00:00.000Z",
        fim: "2026-08-16T03:00:00.000Z",
      });
      expect(metricas.resumo.pedidos).toBe(2);
      expect(metricas.resumo.vendidoCentavos).toBe(3_000);
      expect(metricas.porDia[0]).toMatchObject({
        dia: "2026-08-01",
        pedidos: 1,
      });
      expect(metricas.porDia[14]).toMatchObject({
        dia: "2026-08-15",
        pedidos: 1,
      });
    },
    ESPERA_LONGA,
  );
});

describe("intervalo inválido é recusado com explicação (AC-805)", () => {
  it(
    "@spec:AC-805 data final antes da inicial, intervalo acima de um ano ou data faltando: 400 com a explicação, e nenhum número",
    async () => {
      const { loja, token } = await lojaComDono("Quitanda das Datas");
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-15T12:00:00"),
        totalCentavos: 1_000,
      });

      const recusas = [
        { de: "2026-09-20", ate: "2026-09-10", fala: /posterior/ },
        { de: "2025-01-01", ate: "2026-09-27", fala: /366 dias/ },
        { de: "2026-09-10", fala: /data inicial e a data final/ },
        { de: "2026-02-30", ate: "2026-03-10", fala: /datas válidas/ },
      ];
      for (const { fala, ...datas } of recusas) {
        const resposta = await lerMetricas(app, loja.apelido, token, {
          periodo: "personalizado",
          ...datas,
        });
        expect(resposta.status, JSON.stringify(datas)).toBe(400);
        expect(resposta.body.erro).toBe("periodo_invalido");
        expect(resposta.body.explicacao).toMatch(fala);
        // Nada de número errado junto da recusa: a tela mantém o anterior.
        expect(resposta.body).not.toHaveProperty("resumo");
      }
    },
    ESPERA_LONGA,
  );
});

describe("comparação com o período anterior equivalente (AC-802)", () => {
  it(
    "@spec:AC-802 R$ 500 hoje até as 14h32 contra R$ 400 ontem até as 14h32: subiu R$ 100, 25%, e a venda de ontem à noite não entra",
    async () => {
      const { loja, token } = await lojaComDono("Doceria Comparada");
      const app = appDasMetricas(acesso, { agora: () => AGORA });
      const pedido = (quando: string, totalCentavos: number) =>
        inserirPedido(migrador, loja.id, {
          colocadoEm: sp(quando),
          totalCentavos,
          status: "COMPLETED",
        });
      await pedido("2026-09-27T09:00:00", 30_000);
      await pedido("2026-09-27T13:00:00", 20_000);
      await pedido("2026-09-26T10:00:00", 25_000);
      await pedido("2026-09-26T14:00:00", 15_000);
      // Ontem depois das 14h32: o "hoje" ainda não chegou nessa hora.
      await pedido("2026-09-26T20:00:00", 90_000);

      const resposta = await lerMetricas(app, loja.apelido, token);

      expect(resposta.status).toBe(200);
      const { comparacao } = noContrato(resposta.body);
      expect(comparacao.periodoAnterior).toEqual({
        de: "2026-09-26",
        ate: "2026-09-26",
        fim: "2026-09-26T17:32:00.000Z",
        parcial: true,
      });
      expect(comparacao.vendidoCentavos).toEqual({
        atual: 50_000,
        anterior: 40_000,
        diferenca: 10_000,
        variacaoPorCento: 25,
        direcao: "subiu",
      });
      expect(comparacao.pedidos).toMatchObject({
        atual: 2,
        anterior: 2,
        direcao: "igual",
      });

      // Dia já encerrado compara com o anterior inteiro: o dia 26 contra o 25.
      const encerrado = await lerMetricas(app, loja.apelido, token, {
        periodo: "personalizado",
        de: "2026-09-26",
        ate: "2026-09-26",
      });
      const fechado = noContrato(encerrado.body).comparacao;
      expect(fechado.periodoAnterior).toMatchObject({
        de: "2026-09-25",
        parcial: false,
      });
      expect(fechado.vendidoCentavos).toMatchObject({
        atual: 130_000,
        anterior: 0,
        direcao: "sem-base",
        variacaoPorCento: null,
      });
    },
    ESPERA_LONGA,
  );
});

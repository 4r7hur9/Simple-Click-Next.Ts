/**
 * Prova dos três números do painel pela API, contra PostgreSQL de verdade
 * (T-801; AC-817, AC-812, AC-810).
 *
 * A régua do que é venda mora no core (`situacaoNaVenda`), e a lista de status
 * que o SQL usa é derivada dela. Esta prova mostra que a régua chega inteira
 * ao `GROUP BY`: dez pedidos com dois cancelados viram o vendido dos oito
 * válidos, repartido entre concluído e em andamento, com o cancelado e o
 * WhatsApp não confirmado à parte e o balcão somado ao site.
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

describe("vendido, concluído e em andamento, com o cancelado à parte (AC-817, AC-812, AC-810)", () => {
  let metricas: MetricasDaResposta;

  beforeAll(async () => {
    const { loja, token } = await lojaComDono("Lanchonete dos Dez Pedidos");
    const app = appDasMetricas(acesso, { agora: () => AGORA });
    const pedido = (
      status: string,
      totalCentavos: number,
      canal: "ONLINE" | "MANUAL" = "ONLINE",
      whatsapp?: "aguardando",
    ) =>
      inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T11:00:00"),
        status,
        totalCentavos,
        canal,
        ...(whatsapp === undefined ? {} : { whatsapp }),
      });
    // Dez pedidos: oito válidos e dois cancelados.
    for (let i = 0; i < 3; i += 1) await pedido("COMPLETED", 3_000);
    await pedido("PREPARING", 2_500, "MANUAL");
    await pedido("PREPARING", 2_500, "MANUAL");
    await pedido("READY_FOR_PICKUP", 1_500, "MANUAL");
    await pedido("OUT_FOR_DELIVERY", 2_000);
    await pedido("ACCEPTED", 1_000);
    await pedido("CANCELLED", 4_000);
    await pedido("CANCELLED", 4_000);
    // Fora da conta dos dez: abriu o WhatsApp e não confirmou (AC-611).
    await pedido("PENDING", 7_000, "ONLINE", "aguardando");

    const resposta = await lerMetricas(app, loja.apelido, token);
    expect(resposta.status).toBe(200);
    metricas = noContrato(resposta.body);
  }, ESPERA_LONGA);

  it("@spec:AC-817 três valores distintos e rotulados, e o concluído somado ao em andamento é o vendido", () => {
    const { resumo } = metricas;
    expect(resumo.vendidoCentavos).toBe(18_500);
    expect(resumo.concluidos).toEqual({ quantidade: 3, totalCentavos: 9_000 });
    expect(resumo.emAndamento).toEqual({ quantidade: 5, totalCentavos: 9_500 });
    expect(
      resumo.concluidos.totalCentavos + resumo.emAndamento.totalCentavos,
    ).toBe(resumo.vendidoCentavos);
    expect(resumo.concluidos.quantidade + resumo.emAndamento.quantidade).toBe(
      resumo.pedidos,
    );
  });

  it("@spec:AC-812 dez pedidos com dois cancelados: o vendido só soma os válidos, o cancelado aparece à parte e a regra vem escrita", () => {
    const { resumo } = metricas;
    expect(resumo.pedidos).toBe(8);
    expect(resumo.cancelados).toEqual({ quantidade: 2, totalCentavos: 8_000 });
    expect(resumo.naoConfirmados).toEqual({
      quantidade: 1,
      totalCentavos: 7_000,
    });
    expect(resumo.ticketMedioCentavos).toBe(Math.round(18_500 / 8));
    expect(metricas.regraDeVenda).toMatch(/aceitou/);
    expect(metricas.regraDeVenda).toMatch(/cancelado/);
  });

  it("@spec:AC-810 o vendido soma o site e o balcão, e a divisão por canal fecha com ele", () => {
    const { porCanal, vendidoCentavos } = metricas.resumo;
    expect(porCanal.site).toEqual({ quantidade: 5, totalCentavos: 12_000 });
    expect(porCanal.balcao).toEqual({ quantidade: 3, totalCentavos: 6_500 });
    expect(porCanal.site.totalCentavos + porCanal.balcao.totalCentavos).toBe(
      vendidoCentavos,
    );
  });
});

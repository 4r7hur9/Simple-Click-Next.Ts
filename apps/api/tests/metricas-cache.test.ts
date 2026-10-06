/**
 * Prova do cache das métricas pela API, contra PostgreSQL de verdade
 * (T-807, AC-814).
 *
 * A prova de unidade de `cache.ts` mostra a regra da chave e do prazo. Esta
 * mostra a marca-d'água de verdade: `max(updated_at)` lida do banco a cada
 * abertura, o pedido novo mudando a marca e aparecendo na leitura seguinte, e
 * o horário de referência viajando junto com o número guardado.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  AGORA,
  appDasMetricas,
  cacheEmMemoria,
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

describe("número guardado nunca se passa por número do instante (AC-814)", () => {
  it(
    "@spec:AC-814 a leitura guardada traz o horário em que foi calculada, o pedido novo aparece na leitura seguinte e 'atualizar agora' recalcula",
    async () => {
      const { loja, token } = await lojaComDono("Açaiteria do Cache");
      let relogio = AGORA;
      const app = appDasMetricas(acesso, {
        agora: () => relogio,
        cache: cacheEmMemoria(),
      });
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T10:00:00"),
        totalCentavos: 2_000,
      });

      const primeira = await lerMetricas(app, loja.apelido, token);
      expect(primeira.status).toBe(200);
      expect(primeira.headers["cache-control"]).toContain("no-store");
      expect(primeira.body).toMatchObject({
        deCache: false,
        calculadoEm: AGORA.toISOString(),
      });

      // Trinta segundos depois, sem pedido novo: vem guardada, e diz de quando é.
      relogio = new Date(AGORA.getTime() + 30_000);
      const guardada = await lerMetricas(app, loja.apelido, token);
      expect(guardada.body).toMatchObject({
        deCache: true,
        calculadoEm: AGORA.toISOString(),
      });

      // Um pedido novo muda a marca-d'água: a leitura seguinte já o conta.
      await inserirPedido(migrador, loja.id, {
        colocadoEm: sp("2026-09-27T14:00:00"),
        totalCentavos: 3_000,
      });
      const depoisDoPedido = await lerMetricas(app, loja.apelido, token);
      expect(depoisDoPedido.body.deCache).toBe(false);
      expect(depoisDoPedido.body.calculadoEm).toBe(relogio.toISOString());
      expect(noContrato(depoisDoPedido.body).resumo.pedidos).toBe(2);

      // "Atualizar agora" recalcula mesmo com a entrada ainda válida.
      relogio = new Date(AGORA.getTime() + 45_000);
      const atualizada = await lerMetricas(app, loja.apelido, token, {
        atualizar: "1",
      });
      expect(atualizada.body).toMatchObject({
        deCache: false,
        calculadoEm: relogio.toISOString(),
      });
    },
    ESPERA_LONGA,
  );
});

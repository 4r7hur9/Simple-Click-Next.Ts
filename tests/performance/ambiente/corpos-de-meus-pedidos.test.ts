/**
 * [CA-6] Os corpos versionados de app.meus_pedidos: o novo é o antigo com SÓ os
 * dois predicados de loja; o texto do EXPLAIN tem uma única troca; a
 * impressão identifica cada corpo. Roda com `node --test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CORPO_ANTIGO,
  CORPO_NOVO,
  corpoVigente,
  IMPRESSAO_ANTIGA,
  IMPRESSAO_NOVA,
  normalizar,
  paraExplicar,
} from "./corpos-de-meus-pedidos.ts";

describe("[CA-6] corpos de app.meus_pedidos", () => {
  it("[CA-6] o corpo novo é o antigo mais os dois predicados de loja, e nada além", () => {
    const esperado = normalizar(CORPO_ANTIGO)
      .replace(
        "(SELECT count(*) FROM app.order_items i WHERE i.order_id = o.id)",
        "(SELECT count(*) FROM app.order_items i WHERE i.store_id = o.store_id AND i.order_id = o.id)",
      )
      .replace(
        "JOIN app.store_customers c ON c.id = o.store_customer_id",
        "JOIN app.store_customers c ON c.id = o.store_customer_id AND c.store_id = o.store_id",
      );
    assert.notEqual(esperado, normalizar(CORPO_ANTIGO), "as duas trocas precisam acontecer");
    assert.equal(normalizar(CORPO_NOVO), esperado);
  });

  it("[CA-6] o texto do EXPLAIN troca só p_order_id por NULL::uuid", () => {
    for (const corpo of [CORPO_ANTIGO, CORPO_NOVO]) {
      const texto = paraExplicar(corpo);
      assert.equal(/\bp_order_id\b/.test(texto), false);
      assert.equal(texto.split("NULL::uuid").length - 1, corpo.split("p_order_id").length - 1);
      assert.equal(texto.replaceAll("NULL::uuid", "p_order_id"), corpo);
    }
  });

  it("[CA-6] a impressão identifica o corpo vigente e ignora só espaço", () => {
    assert.notEqual(IMPRESSAO_ANTIGA, IMPRESSAO_NOVA);
    assert.equal(corpoVigente(CORPO_ANTIGO), "0029");
    assert.equal(corpoVigente(`\n\n${CORPO_NOVO.replaceAll("  ", " ")}\n`), "0074");
    assert.equal(corpoVigente("SELECT 1"), "desconhecido");
  });
});

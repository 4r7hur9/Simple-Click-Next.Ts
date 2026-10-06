import { describe, expect, it, vi } from "vitest";

import { responderRevalidacao } from "../src/server/revalidacao";
import type { MotorDeCacheDoSite } from "../src/server/cache";

/**
 * Prova da invalidação da VITRINE PÚBLICA pelo apelido (dívida 93).
 *
 * A API avisa a rota de invalidação quando o dono altera catálogo ou
 * configuração. A vitrine é guardada pelo apelido — é o que vem no endereço —,
 * então o aviso traz o apelido, e a rota vence a etiqueta `vitrine:<apelido>`.
 *
 * Aqui a regra é exercitada direto em `responderRevalidacao`, com um motor que
 * só anota: autenticação, leitura do corpo e escolha das etiquetas. A tomada
 * do Next (`app/api/revalidate/route.ts`) só repassa para esta função.
 */

const CONFIGURADO = "c".repeat(40);
const CABECALHO = "x-simpleclick-revalidacao";
const LOJA = "11111111-1111-4111-8111-111111111111";

function motorQueAnota() {
  const vencidas: string[] = [];
  const motor: MotorDeCacheDoSite = {
    lembrar: (pedido) => pedido.calcular(),
    invalidar: (etiqueta) => {
      vencidas.push(etiqueta);
    },
  };
  return { motor, vencidas };
}

function aviso(corpo: unknown, apresentado: string = CONFIGURADO): Request {
  return new Request("https://simpleclick.localhost/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", [CABECALHO]: apresentado },
    body: JSON.stringify(corpo),
  });
}

describe("invalidar a vitrine pelo apelido (dívida 93)", () => {
  it("@spec:AC-028 o aviso com o apelido vence a etiqueta da vitrine daquela loja", async () => {
    const { motor, vencidas } = motorQueAnota();

    const resposta = await responderRevalidacao(
      aviso({ apelido: "pastelaria-da-vila" }),
      { segredo: CONFIGURADO, motor },
    );

    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toEqual({
      apelido: "pastelaria-da-vila",
      invalidado: ["vitrine:pastelaria-da-vila"],
    });
    expect(vencidas).toEqual(["vitrine:pastelaria-da-vila"]);
  });

  it("@spec:AC-028 com loja e apelido no mesmo aviso, vence as duas famílias", async () => {
    const { motor, vencidas } = motorQueAnota();

    const resposta = await responderRevalidacao(
      aviso({ lojaId: LOJA, apelido: "pastelaria-da-vila" }),
      { segredo: CONFIGURADO, motor },
    );

    expect(resposta.status).toBe(200);
    expect(vencidas).toEqual([LOJA, "vitrine:pastelaria-da-vila"]);
  });

  it("@spec:AC-027 recusa apelido que forjaria a etiqueta de outra loja", async () => {
    const { motor, vencidas } = motorQueAnota();

    const resposta = await responderRevalidacao(
      aviso({ apelido: "pastelaria-da-vila:catalogo" }),
      { segredo: CONFIGURADO, motor },
    );

    expect(resposta.status).toBe(400);
    expect(vencidas).toEqual([]);
  });

  it("@spec:AC-028 recusa aviso sem loja e sem apelido, e nomes sem a loja dona deles", async () => {
    const { motor, vencidas } = motorQueAnota();

    const vazio = await responderRevalidacao(aviso({}), {
      segredo: CONFIGURADO,
      motor,
    });
    const nomesSoltos = await responderRevalidacao(
      aviso({ apelido: "pastelaria-da-vila", nomes: ["catalogo"] }),
      { segredo: CONFIGURADO, motor },
    );

    expect(vazio.status).toBe(400);
    expect(nomesSoltos.status).toBe(400);
    expect(vencidas).toEqual([]);
  });

  it("@spec:AC-028 o apelido não abre a porta: sem o segredo certo, nada vence", async () => {
    const { motor, vencidas } = motorQueAnota();

    const resposta = await responderRevalidacao(
      aviso({ apelido: "pastelaria-da-vila" }, "d".repeat(40)),
      { segredo: CONFIGURADO, motor },
    );

    expect(resposta.status).toBe(401);
    expect(vencidas).toEqual([]);
  });
});

/**
 * O motor do Next vence a etiqueta NA HORA.
 *
 * O perfil `"max"` do Next 16 só marca a etiqueta como velha: a visita
 * seguinte recebe a cópia antiga uma última vez, enquanto o Next busca a nova
 * por trás. É exatamente o que o dono não pode ver depois de salvar.
 */
const espiao = vi.hoisted(() => ({
  revalidateTag: vi.fn<(etiqueta: string, perfil?: unknown) => undefined>(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: espiao.revalidateTag,
  unstable_cache: (calcular: () => unknown) => () => calcular(),
}));

describe("o motor do Next vence a vitrine na hora", () => {
  it("@spec:AC-028 a etiqueta da vitrine é vencida com prazo zero, e não servida velha mais uma vez", async () => {
    espiao.revalidateTag.mockClear();

    const resposta = await responderRevalidacao(
      aviso({ apelido: "pastelaria-da-vila" }),
      { segredo: CONFIGURADO },
    );

    expect(resposta.status).toBe(200);
    expect(espiao.revalidateTag).toHaveBeenCalledWith(
      "vitrine:pastelaria-da-vila",
      { expire: 0 },
    );
    expect(espiao.revalidateTag).not.toHaveBeenCalledWith(
      expect.anything(),
      "max",
    );
  });
});

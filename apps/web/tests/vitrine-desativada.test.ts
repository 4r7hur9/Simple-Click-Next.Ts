/**
 * Card #145 (D-1) — a loja desativada pela administração sai do site na hora.
 *
 * A API já recusa a vitrine de loja fora do ar, mas o site guardava a versão
 * de antes por até o prazo do cache. A ponte `/api/admin/*` agora renova a
 * vitrine da loja (mesma renovação das rotas de loja e catálogo) quando um ato
 * que muda a visibilidade dá certo; leitura, recusa e erro não renovam.
 */
import { describe, expect, it, vi } from "vitest";

import { encaminharParaAdministracao } from "../src/server/admin-api.ts";

const ID = "5c1d0e2f-0000-4000-8000-000000000001";
const ORIGEM = "https://simpleclick.localhost";

function pedido(caminho: string, metodo: string): Request {
  return new Request(`${ORIGEM}/api/admin/${caminho}`, {
    method: metodo,
    headers: {
      cookie: "sc_access=abc.def.ghi",
      origin: ORIGEM,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    ...(metodo === "GET" ? {} : { body: "{}" }),
  });
}

function api(status: number, corpo: unknown) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

const ATOS: readonly (readonly [string, string, string])[] = [
  ["desativar", "POST", `lojas/${ID}/desativar`],
  ["ativar", "POST", `lojas/${ID}/ativar`],
  ["aprovar", "POST", `lojas/${ID}/aprovar`],
  ["recusar", "POST", `lojas/${ID}/recusar`],
  ["suspensão", "PUT", `lojas/${ID}/suspensao`],
  ["reativação", "PUT", `lojas/${ID}/reativacao`],
  ["restauração", "PUT", `lojas/${ID}/restauracao`],
  ["exclusão", "DELETE", `lojas/${ID}`],
];

describe("ponte da administração renova a vitrine (D-1)", () => {
  it.each(ATOS)(
    "%s que dá certo renova a vitrine do apelido da ficha",
    async (_nome, metodo, caminho) => {
      const renovar = vi.fn();
      const resposta = await encaminharParaAdministracao(
        pedido(caminho, metodo),
        caminho.split("/"),
        api(200, { id: ID, apelido: "pastelaria-da-vila" }),
        renovar,
      );
      expect(resposta.status).toBe(200);
      expect(renovar).toHaveBeenCalledExactlyOnceWith("pastelaria-da-vila");
    },
  );

  it.each(ATOS)(
    "%s recusada pela API (409) não renova nada",
    async (_nome, metodo, caminho) => {
      const renovar = vi.fn();
      const resposta = await encaminharParaAdministracao(
        pedido(caminho, metodo),
        caminho.split("/"),
        api(409, { erro: "transicao_invalida", apelido: "x" }),
        renovar,
      );
      expect(resposta.status).toBe(409);
      expect(renovar).not.toHaveBeenCalled();
    },
  );

  it("leitura da ficha não renova", async () => {
    const renovar = vi.fn();
    await encaminharParaAdministracao(
      pedido(`lojas/${ID}`, "GET"),
      ["lojas", ID],
      api(200, { id: ID, apelido: "pastelaria-da-vila" }),
      renovar,
    );
    expect(renovar).not.toHaveBeenCalled();
  });

  it("corpo sem apelido não renova e a resposta segue igual", async () => {
    const renovar = vi.fn();
    const resposta = await encaminharParaAdministracao(
      pedido(`lojas/${ID}/desativar`, "POST"),
      ["lojas", ID, "desativar"],
      api(200, { ok: true }),
      renovar,
    );
    expect(resposta.status).toBe(200);
    expect(renovar).not.toHaveBeenCalled();
  });

  it("falha ao renovar nunca desfaz o ato: a resposta da API segue", async () => {
    const resposta = await encaminharParaAdministracao(
      pedido(`lojas/${ID}/desativar`, "POST"),
      ["lojas", ID, "desativar"],
      api(200, { apelido: "pastelaria-da-vila" }),
      () => {
        throw new Error("fora do contexto do Next");
      },
    );
    expect(resposta.status).toBe(200);
  });
});

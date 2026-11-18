import { describe, expect, it, vi } from "vitest";

import { encaminharParaAdministracao } from "../src/server/admin-api.ts";
import { encaminharAoPainel } from "../src/server/encaminhar-ao-painel.ts";
import { encaminharALoja } from "../src/server/encaminhar-a-loja.ts";

const SITE = "https://simpleclick.localhost";

function pedido(
  caminho: string,
  metodo: string,
  cabecalhos: Record<string, string> = {},
  corpo = "{}",
): Request {
  return new Request(`${SITE}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo,
  });
}

describe("proteção de origem das APIs do painel e da administração", () => {
  it("recusa escrita externa ao catálogo antes de ler sessão ou chamar a API", async () => {
    const resposta = await encaminharAoPainel(
      pedido(
        "/api/catalogo/categorias",
        "POST",
        {
          cookie: "sc_access=token",
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
      ),
      "categorias",
    );
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ erro: "origem_recusada" });
  });

  it("recusa escrita externa nas rotas de cliente do painel antes da sessão", async () => {
    const resposta = await encaminharALoja(
      pedido(
        "/api/painel/clientes",
        "POST",
        {
          cookie: "sc_access=token",
          "content-type": "application/json",
          origin: "https://outro-site.example",
        },
      ),
      "clientes",
    );
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ erro: "origem_recusada" });
  });

  it("recusa origem externa e corpo não JSON no proxy administrativo", async () => {
    const buscar = vi.fn<typeof fetch>();
    const base = {
      cookie: "sc_access=token",
      "content-type": "application/json",
    };
    const origem = await encaminharParaAdministracao(
      pedido("/api/admin/lojas", "POST", {
        ...base,
        "sec-fetch-site": "same-site",
      }),
      ["lojas"],
      buscar,
    );
    expect(origem.status).toBe(403);

    const corpo = await encaminharParaAdministracao(
      pedido(
        "/api/admin/lojas",
        "POST",
        {
          cookie: "sc_access=token",
          "sec-fetch-site": "same-origin",
          "content-type": "text/plain",
        },
        "nao-json",
      ),
      ["lojas"],
      buscar,
    );
    expect(corpo.status).toBe(415);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("permite POST JSON do mesmo site ao endpoint de administração", async () => {
    const buscar = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    const resposta = await encaminharParaAdministracao(
      pedido("/api/admin/lojas", "POST", {
        cookie: "sc_access=token",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      }),
      ["lojas"],
      buscar,
    );
    expect(resposta.status).toBe(200);
    expect(buscar).toHaveBeenCalledOnce();
  });
});

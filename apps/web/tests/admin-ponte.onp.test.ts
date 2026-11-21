/**
 * A ponte do site até a API da administração não se abre com a reforma visual
 * (card #113, T-11301). Prova de REGRESSÃO, verde contra o código de hoje.
 *
 * A lista de caminhos não é congelada aqui (outros cards podem acrescentar
 * entradas nos próprios cards): o teste confere que o que NÃO deve passar
 * continua recusado, e que a ponte continua sem autorizar nada — quem decide
 * é a API, e a prova de acesso de verdade está em `apps/api/tests/admin-*.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  caminhoPermitido,
  encaminharParaAdministracao,
} from "../src/server/admin-api.ts";

const UUID = "5c1d0e2f-0000-4000-8000-000000000001";
const CARGA = "A".repeat(20);
const ASSINATURA = "B".repeat(43);

function pedido(
  caminho: string,
  { metodo = "GET", cookie }: { metodo?: string; cookie?: string } = {},
): Request {
  return new Request(`https://simpleclick.localhost/api/admin/${caminho}`, {
    method: metodo,
    ...(cookie !== undefined ? { headers: { cookie } } : {}),
  });
}

function partes(caminho: string): string[] {
  return caminho.split("/");
}

describe("ponte da administração: o que continua recusado", () => {
  const PROIBIDOS: readonly (readonly [string, string])[] = [
    ["usuarios", "GET"],
    ["lojas/outra-coisa", "GET"],
    [`lojas/${UUID}/senha`, "GET"],
    [`lojas/${UUID}/documentos/${UUID}`, "GET"],
    [`lojas/${UUID}/arquivos`, "GET"],
    ["lojas/../metricas", "GET"],
    ["lojas/nao-e-uuid", "GET"],
    ["lojas/", "GET"],
    ["", "GET"],
    ["arquivos/curto.curto", "GET"],
    // Método fora do que a entrada aceita.
    ["metricas", "POST"],
    ["limites", "DELETE"],
    ["lojas", "DELETE"],
    [`contas/${UUID}`, "PATCH"],
    // O `/contas` antigo saiu da ponte (card #170, T-9): só /pessoas.
    ["contas", "GET"],
    [`contas/${UUID}`, "GET"],
    // Pessoas: só os métodos de cada entrada, e nada fora do desenho.
    ["pessoas", "DELETE"],
    [`pessoas/${UUID}`, "DELETE"],
    [`pessoas/${UUID}`, "PUT"],
    [`pessoas/${UUID}/acesso`, "GET"],
    [`pessoas/${UUID}/acesso`, "PUT"],
    [`pessoas/${UUID}/desativacao`, "POST"],
    [`pessoas/${UUID}/reativacao`, "GET"],
    [`pessoas/${UUID}/senha`, "POST"],
    [`pessoas/${UUID}/admin`, "PUT"],
    ["pessoas/nao-e-uuid", "GET"],
    [`lojas/${UUID}/metricas`, "PUT"],
  ];

  it.each(PROIBIDOS)(
    "[CA-3] @spec:AC-11304 %s (%s) não está na lista",
    (caminho, metodo) => {
      expect(caminhoPermitido(caminho, metodo)).toBe(false);
    },
  );

  it("[CA-3] @spec:AC-11304 caminho fora da lista recebe 404 antes de qualquer requisição, mesmo com sessão", async () => {
    const buscar = vi.fn<typeof fetch>();
    for (const [caminho, metodo] of PROIBIDOS) {
      const resposta = await encaminharParaAdministracao(
        pedido(caminho, { metodo, cookie: "sc_access=abc.def.ghi" }),
        partes(caminho),
        buscar,
      );
      expect(resposta.status).toBe(404);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
    }
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-3] @spec:AC-11304 sem cookie de acesso, um caminho permitido recebe 401, sem chamar a API", async () => {
    const buscar = vi.fn<typeof fetch>();
    for (const cookie of [
      undefined,
      "outro=1",
      "sc_access=",
      "sc_refresh=abc.def.ghi",
    ]) {
      const resposta = await encaminharParaAdministracao(
        pedido("lojas", cookie === undefined ? {} : { cookie }),
        ["lojas"],
        buscar,
      );
      expect(resposta.status).toBe(401);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
    }
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("ponte da administração: pessoas", () => {
  const COOKIE = "sc_access=abc.def.ghi";
  const PERMITIDOS: readonly (readonly [string, string])[] = [
    ["pessoas", "GET"],
    ["pessoas", "POST"],
    [`pessoas/${UUID}`, "GET"],
    [`pessoas/${UUID}`, "PATCH"],
    [`pessoas/${UUID}/desativacao`, "PUT"],
    [`pessoas/${UUID}/reativacao`, "PUT"],
    [`pessoas/${UUID}/acesso`, "POST"],
  ];

  it.each(PERMITIDOS)("%s (%s) está na lista", (caminho, metodo) => {
    expect(caminhoPermitido(caminho, metodo)).toBe(true);
  });

  function daFicha(destino: string | null): Request {
    return new Request(
      `https://simpleclick.localhost/api/admin/pessoas/${UUID}`,
      {
        headers: {
          cookie: COOKIE,
          ...(destino === null ? {} : { "sec-fetch-site": destino }),
        },
      },
    );
  }

  it("[CA-2] a ficha só abre quando o pedido é do próprio site (Sec-Fetch-Site: same-origin)", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );
    for (const destino of [null, "cross-site", "same-site", "none", ""]) {
      const resposta = await encaminharParaAdministracao(
        daFicha(destino),
        ["pessoas", UUID],
        buscar,
      );
      expect(resposta.status).toBe(403);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
    }
    expect(buscar).not.toHaveBeenCalled();

    const aberta = await encaminharParaAdministracao(
      daFicha("same-origin"),
      ["pessoas", UUID],
      buscar,
    );
    expect(aberta.status).toBe(200);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("[CA-2] a lista não exige o cabeçalho (ela não traz telefone)", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );
    const resposta = await encaminharParaAdministracao(
      pedido("pessoas?busca=ana", { cookie: COOKIE }),
      ["pessoas"],
      buscar,
    );
    expect(resposta.status).toBe(200);
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(
      /\/v1\/admin\/pessoas\?busca=ana$/,
    );
  });

  it("[CA-6] o link único volta uma vez, sem cache, e a ponte não o guarda nem o repassa em cabeçalho", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            caminho: "/definir-senha?token=segredo",
            expiraEm: "2026-11-21T15:00:00.000Z",
            emailEnviado: false,
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              location: "/nao/deveria/passar",
            },
          },
        ),
    );
    const resposta = await encaminharParaAdministracao(
      new Request(
        `https://simpleclick.localhost/api/admin/pessoas/${UUID}/acesso`,
        {
          method: "POST",
          headers: {
            cookie: COOKIE,
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify({ motivo: "Esqueceu a senha" }),
        },
      ),
      ["pessoas", UUID, "acesso"],
      buscar,
    );
    expect(resposta.status).toBe(201);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(resposta.headers.get("location")).toBeNull();
  });
});

describe("ponte da administração: o que passa, passa fechado", () => {
  it("[CA-3] @spec:AC-11307 toda resposta sai com no-store e a API recebe só o token do cookie, em /v1/admin", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ itens: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600",
            "set-cookie": "nao=deveria-passar",
          },
        }),
    );
    const resposta = await encaminharParaAdministracao(
      pedido("lojas?busca=x", { cookie: "sc_access=abc.def.ghi" }),
      ["lojas"],
      buscar,
    );

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(resposta.headers.get("set-cookie")).toBeNull();
    const [endereco, init] = buscar.mock.calls[0] ?? [];
    expect(String(endereco)).toMatch(/\/v1\/admin\/lojas\?busca=x$/);
    const cabecalhos = new Headers(init?.headers);
    expect(cabecalhos.get("authorization")).toBe("Bearer abc.def.ghi");
    expect(cabecalhos.get("cookie")).toBeNull();
    expect(init?.cache).toBe("no-store");
  });

  it("[CA-3] @spec:AC-11309 o documento baixa como anexo: os três cabeçalhos do arquivo são repassados", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="contrato.pdf"',
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          },
        }),
    );
    const resposta = await encaminharParaAdministracao(
      pedido(`arquivos/${CARGA}.${ASSINATURA}`, {
        cookie: "sc_access=abc.def.ghi",
      }),
      ["arquivos", `${CARGA}.${ASSINATURA}`],
      buscar,
    );
    expect(resposta.headers.get("content-disposition")).toContain("attachment");
    expect(resposta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(resposta.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(resposta.headers.get("cache-control")).toBe("no-store");
  });

  it("[CA-3] @spec:AC-11301 a recusa da API (401 e 403) chega à tela como veio, sem cache", async () => {
    for (const status of [401, 403]) {
      const buscar = vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ erro: "recusado" }), { status }),
      );
      const resposta = await encaminharParaAdministracao(
        pedido("lojas", { cookie: "sc_access=abc.def.ghi" }),
        ["lojas"],
        buscar,
      );
      expect(resposta.status).toBe(status);
      expect(resposta.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("[CA-3] @spec:AC-11307 API fora do ar vira 503 sem dado e sem cache", async () => {
    const buscar = vi.fn<typeof fetch>(async () => {
      throw new Error("sem rede");
    });
    const resposta = await encaminharParaAdministracao(
      pedido("lojas", { cookie: "sc_access=abc.def.ghi" }),
      ["lojas"],
      buscar,
    );
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
  });
});

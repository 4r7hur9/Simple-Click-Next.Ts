/**
 * Para onde a pessoa vai depois de entrar ou criar conta (card #37).
 *
 * - Cliente que entrou pelo site principal (sem `?proximo=`): o feed,
 *   /explorar/produtos.
 * - Quem começou dentro de uma loja volta para ela: a tela usa o `?proximo=`
 *   conferido, que vence o destino do papel — e só caminho interno passa.
 * - Dono e administração vão para a área deles; a equipe, que entra com sessão
 *   de cliente, é reconhecida pelo vínculo em `/v1/eu` e vai para o painel.
 */
import { describe, expect, it, vi } from "vitest";

import {
  comDestino,
  destinoDosParametros,
  destinoSeguro,
} from "../src/features/auth/destino-seguro.ts";
import {
  respostaDoCadastro,
  respostaDoLogin,
} from "../src/features/auth/respostas-de-acesso.ts";
import {
  DESTINO_DO_CLIENTE,
  destinoDaSessao,
  destinoDoPapel,
  responderAcaoDeSessao,
} from "../src/server/sessao.ts";

function eu(lojas: { apelido: string; nome: string; papel: string }[], papel = "CUSTOMER") {
  return {
    identidade: { id: "id-1", email: "pessoa@exemplo.test", nome: "Pessoa", papel },
    lojasDaConta: lojas,
  };
}

function apiDoEu(corpo: unknown, status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(corpo, { status }),
  );
}

describe("destino do papel", () => {
  it("cliente vai para o feed; dono para o painel; admin para a administração", () => {
    expect(DESTINO_DO_CLIENTE).toBe("/explorar/produtos");
    expect(destinoDoPapel("CUSTOMER")).toBe("/explorar/produtos");
    expect(destinoDoPapel("OWNER")).toBe("/painel");
    expect(destinoDoPapel("ADMIN")).toBe("/admin");
  });
});

describe("destinoDaSessao", () => {
  it("cliente sem loja: feed", async () => {
    const buscar = apiDoEu(eu([]));
    expect(await destinoDaSessao("CUSTOMER", "tok", buscar)).toBe("/explorar/produtos");
    const [url, init] = buscar.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/v1\/eu$/);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("equipe (sessão de cliente com vínculo de loja): painel", async () => {
    const buscar = apiDoEu(eu([{ apelido: "pastelaria", nome: "Pastelaria", papel: "STAFF" }]));
    expect(await destinoDaSessao("CUSTOMER", "tok", buscar)).toBe("/painel");
  });

  it("dono e admin não precisam conferir", async () => {
    const buscar = apiDoEu({});
    expect(await destinoDaSessao("OWNER", "tok", buscar)).toBe("/painel");
    expect(await destinoDaSessao("ADMIN", "tok", buscar)).toBe("/admin");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("API fora na conferência: segue como cliente, sem travar o login", async () => {
    const caiu = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await destinoDaSessao("CUSTOMER", "tok", caiu)).toBe("/explorar/produtos");
    expect(await destinoDaSessao("CUSTOMER", "tok", apiDoEu({}, 500))).toBe("/explorar/produtos");
  });
});

describe("ponte de sessão: login da equipe", () => {
  it("o corpo devolvido à página manda a equipe para o painel", async () => {
    const buscar = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith("/v1/eu")
        ? Response.json(eu([{ apelido: "pastelaria", nome: "Pastelaria", papel: "STAFF" }]))
        : Response.json({
            status: "SESSAO_CRIADA",
            papel: "CUSTOMER",
            tokenDeAcesso: "acesso",
            tokenDeRenovacao: "renovacao",
            acessoExpiraEm: "2026-10-05T12:15:00.000Z",
          }),
    ) as unknown as typeof fetch;
    const resposta = await responderAcaoDeSessao(
      new Request("https://simpleclick.localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "staff@exemplo.test", senha: "x" }),
      }),
      "login",
      buscar,
      { NODE_ENV: "development" },
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ redirecionarPara: "/painel" });
  });
});

describe("telas de acesso", () => {
  it("sem destino na resposta, o cliente cai no feed", () => {
    expect(respostaDoLogin(200, { status: "SESSAO_CRIADA" })).toEqual({
      status: "SESSAO_CRIADA",
      redirecionarPara: "/explorar/produtos",
    });
    expect(respostaDoCadastro(201, { status: "SESSAO_CRIADA" })).toEqual({
      status: "SESSAO_CRIADA",
      redirecionarPara: "/explorar/produtos",
    });
  });

  it("quem começou numa loja volta para ela (o ?proximo= vence o papel)", () => {
    const parametros = new URLSearchParams({ proximo: "/loja/pastelaria-da-vila/cardapio?x=1" });
    expect(destinoDosParametros(parametros)).toBe("/loja/pastelaria-da-vila/cardapio?x=1");
    expect(comDestino("/cadastrar", "/loja/pastelaria-da-vila")).toBe(
      "/cadastrar?proximo=%2Floja%2Fpastelaria-da-vila",
    );
  });

  it("retorno de fora do site não passa (anti open redirect)", () => {
    for (const ruim of ["https://golpe.test", "//golpe.test", "/\\golpe.test", "javascript:alert(1)", ""]) {
      expect(destinoSeguro(ruim)).toBeUndefined();
    }
    expect(destinoDosParametros(new URLSearchParams({ proximo: "https://golpe.test" }))).toBeUndefined();
  });
});

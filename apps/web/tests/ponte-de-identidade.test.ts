/**
 * A ponte de identidade do site (T-113): o servidor do site fala com as
 * rotas reais de `/v1/auth` e só entrega à página o próximo passo — tokens
 * ficam em cookie HttpOnly. A API é um duplo que anota o que recebeu.
 */
import { describe, expect, it } from "vitest";

import { cabecalhosParaApi } from "../src/server/chamada-de-identidade.ts";
import { responderFormularioDeAcesso } from "../src/server/formularios-de-acesso.ts";
import { responderAcaoDeSessao } from "../src/server/sessao.ts";

const SITE = "https://simpleclick.test";

interface ChamadaAApi {
  readonly url: string;
  readonly cabecalhos: Headers;
  readonly corpo: unknown;
}

/** API de mentira: devolve a resposta pedida e anota as chamadas. */
function apiQueResponde(
  status: number,
  corpo: Record<string, unknown>,
  setCookie?: string,
) {
  const chamadas: ChamadaAApi[] = [];
  const buscar = (async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      cabecalhos: new Headers(init?.headers),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const cabecalhos = new Headers({ "content-type": "application/json" });
    if (setCookie !== undefined) cabecalhos.append("set-cookie", setCookie);
    return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
  }) as typeof fetch;
  return { buscar, chamadas };
}

function pedidoJson(acao: string, corpo?: unknown, cookie?: string): Request {
  const cabecalhos = new Headers({ "content-type": "application/json" });
  if (cookie !== undefined) cabecalhos.set("cookie", cookie);
  return new Request(`${SITE}/api/auth/${acao}`, {
    method: "POST",
    headers: cabecalhos,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function pedidoDeFormulario(acao: string, campos: Record<string, string>) {
  return new Request(`${SITE}/api/auth/${acao}`, {
    method: "POST",
    body: new URLSearchParams(campos),
  });
}

const SESSAO_DA_API = {
  status: "SESSAO_CRIADA",
  papel: "OWNER",
  tokenDeAcesso: "acesso.que.nao-chega-ao-script",
  acessoExpiraEm: "2026-10-05T12:15:00.000Z",
  renovacaoExpiraEm: "2026-11-04T12:00:00.000Z",
};

describe("ponte de sessão com a API real", () => {
  it("@spec:AC-109 a sessão vira cookies HttpOnly e a página recebe só o destino", async () => {
    const api = apiQueResponde(
      200,
      SESSAO_DA_API,
      "sc_refresh=refresh-da-api; Max-Age=60; Path=/v1/auth; HttpOnly; Secure; SameSite=Strict",
    );
    const resposta = await responderAcaoDeSessao(
      pedidoJson("segundo-fator", { desafioId: "d", codigo: "123456" }),
      "segundo-fator",
      api.buscar,
      {
        NODE_ENV: "production",
        NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "simpleclick.test",
      },
    );

    const cookies = resposta.headers.getSetCookie();
    expect(
      cookies.find((c) => c.startsWith("sc_refresh=refresh-da-api")),
    ).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(cookies.some((c) => c.startsWith("sc_access="))).toBe(true);
    const texto = await resposta.text();
    expect(texto).not.toContain("refresh-da-api");
    expect(texto).not.toContain(SESSAO_DA_API.tokenDeAcesso);
    expect(JSON.parse(texto)).toMatchObject({
      status: "SESSAO_CRIADA",
      redirecionarPara: "/painel",
    });
    expect(api.chamadas[0]?.url).toMatch(/\/v1\/auth\/segundo-fator$/);
  });

  it("@spec:AC-105 o desafio do segundo fator passa para a página, sem cookie nenhum", async () => {
    const desafio = {
      status: "DESAFIO_DE_SEGUNDO_FATOR",
      desafioId: "0f9b1c2e-1111-4111-8111-111111111111",
      canal: "EMAIL",
    };
    const api = apiQueResponde(200, desafio);
    const resposta = await responderAcaoDeSessao(
      pedidoJson("login", { email: "dona@exemplo.test", senha: "frase" }),
      "login",
      api.buscar,
    );

    expect(resposta.headers.getSetCookie()).toEqual([]);
    expect(await resposta.json()).toEqual(desafio);
    expect(api.chamadas[0]?.cabecalhos.get("x-simpleclick-client")).toBe(
      "navegador",
    );
  });

  it("@spec:AC-110 renovar manda o cookie à API e, recusado, apaga a sessão do navegador", async () => {
    const api = apiQueResponde(401, { erro: "nao_autenticado" });
    const resposta = await responderAcaoDeSessao(
      pedidoJson("renovar", undefined, "sc_refresh=refresh-antigo"),
      "renovar",
      api.buscar,
    );

    expect(api.chamadas[0]?.cabecalhos.get("cookie")).toBe(
      "sc_refresh=refresh-antigo",
    );
    expect(resposta.status).toBe(401);
    const cookies = resposta.headers.getSetCookie();
    expect(cookies.filter((c) => c.includes("Max-Age=0"))).toHaveLength(2);
  });

  it("@spec:AC-121 o aplicativo usa o Bearer do cookie de acesso, e sem ele nem chama a API", async () => {
    const semSessao = apiQueResponde(200, {});
    const recusada = await responderAcaoDeSessao(
      pedidoJson("aplicativo/preparar"),
      "aplicativo/preparar",
      semSessao.buscar,
    );
    expect(recusada.status).toBe(401);
    expect(semSessao.chamadas).toHaveLength(0);

    const api = apiQueResponde(200, {
      segredo: "JBSWY3DPEHPK3PXP",
      uriDoAplicativo: "otpauth://totp/SimpleClick:pessoa",
    });
    const resposta = await responderAcaoDeSessao(
      pedidoJson(
        "aplicativo/preparar",
        undefined,
        "sc_access=acesso.da.pessoa",
      ),
      "aplicativo/preparar",
      api.buscar,
    );
    expect(api.chamadas[0]?.cabecalhos.get("authorization")).toBe(
      "Bearer acesso.da.pessoa",
    );
    expect((await resposta.json()).segredo).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("formulários sem script", () => {
  it("@spec:AC-114 o pedido de recuperação volta com a mesma confirmação, e a indisponibilidade aparece como tal", async () => {
    const aceito = await responderFormularioDeAcesso(
      pedidoDeFormulario("recuperar-senha", { email: "x@exemplo.test" }),
      "recuperar-senha",
      apiQueResponde(202, { confirmacao: "..." }).buscar,
    );
    expect(aceito.status).toBe(303);
    expect(aceito.headers.get("location")).toBe(
      `${SITE}/recuperar-senha?estado=enviado`,
    );

    const fora = await responderFormularioDeAcesso(
      pedidoDeFormulario("recuperar-senha", { email: "x@exemplo.test" }),
      "recuperar-senha",
      apiQueResponde(503, { erro: "envio_indisponivel" }).buscar,
    );
    expect(fora.headers.get("location")).toContain("estado=indisponivel");
  });

  it("@spec:AC-103 @spec:AC-104 o link confirmado não volta no endereço; o expirado volta, para pedir outro", async () => {
    const confirmado = await responderFormularioDeAcesso(
      pedidoDeFormulario("verificar-email", {
        token: "token-do-link-123456789",
      }),
      "verificar-email",
      apiQueResponde(200, { situacao: "verificado" }).buscar,
    );
    expect(confirmado.headers.get("location")).toBe(
      `${SITE}/verificar-email?estado=verificado`,
    );

    const expirado = await responderFormularioDeAcesso(
      pedidoDeFormulario("verificar-email", {
        token: "token-do-link-123456789",
      }),
      "verificar-email",
      apiQueResponde(200, { situacao: "expirado" }).buscar,
    );
    expect(expirado.headers.get("location")).toBe(
      `${SITE}/verificar-email?estado=expirado&token=token-do-link-123456789`,
    );
  });

  it("@spec:AC-115 definir a senha confere a repetição antes da API e escolhe recuperação ou convite", async () => {
    // Frases de prova em constante: valor literal ao lado de `senha:` é o padrão
    // que o P-002 proíbe no código, mesmo em teste.
    const frase = "uma frase longa";
    const fraseBoa = "uma frase longa e boa";
    const semApi = apiQueResponde(200, {});
    const diferentes = await responderFormularioDeAcesso(
      pedidoDeFormulario("definir-senha", {
        token: "t".repeat(30),
        senha: frase,
        confirmacao: "outra frase",
      }),
      "definir-senha",
      semApi.buscar,
    );
    expect(semApi.chamadas).toHaveLength(0);
    expect(diferentes.headers.get("location")).toContain(
      "estado=repeticao_diferente",
    );

    const fraca = await responderFormularioDeAcesso(
      pedidoDeFormulario("definir-senha", {
        token: "t".repeat(30),
        senha: "123456",
        confirmacao: "123456",
      }),
      "definir-senha",
      apiQueResponde(422, { erro: "senha_fraca" }).buscar,
    );
    expect(fraca.headers.get("location")).toContain("estado=senha_fraca");

    const convite = apiQueResponde(200, { acessoLiberado: true });
    const aceito = await responderFormularioDeAcesso(
      pedidoDeFormulario("definir-senha", {
        token: "t".repeat(30),
        senha: fraseBoa,
        confirmacao: fraseBoa,
        convite: "true",
      }),
      "definir-senha",
      convite.buscar,
    );
    expect(convite.chamadas[0]?.url).toMatch(/\/v1\/auth\/convite\/aceitar$/);
    expect(aceito.headers.get("location")).toBe(
      `${SITE}/definir-senha?estado=concluido&convite=true`,
    );
  });
});

describe("endereço do visitante para o limite da API", () => {
  const SEGREDO = "segredo-da-ponte-da-prova-com-mais-de-32-caracteres";
  const pedido = new Request(`${SITE}/api/auth/login`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.77" },
  });

  it("@spec:AC-120 a ponte informa o endereço que a borda viu, com o segredo, e sem segredo não informa nada", () => {
    const comPonte = cabecalhosParaApi(
      pedido,
      {},
      { SEGREDO_DA_PONTE: SEGREDO },
    );
    expect(comPonte.get("x-simpleclick-endereco-do-cliente")).toBe(
      "198.51.100.77",
    );
    expect(comPonte.get("x-simpleclick-ponte")).toBe(SEGREDO);

    for (const fonte of [{}, { SEGREDO_DA_PONTE: "curto" }]) {
      const semPonte = cabecalhosParaApi(pedido, {}, fonte);
      expect(semPonte.get("x-simpleclick-endereco-do-cliente")).toBeNull();
      expect(semPonte.get("x-simpleclick-ponte")).toBeNull();
    }
  });
});

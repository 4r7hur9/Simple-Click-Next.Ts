import { describe, expect, it } from "vitest";

import { responderSessaoDoNavegador } from "../src/server/sessao.ts";
import { adicionarCookiesQueApagam } from "../src/server/session-cookie.ts";

describe("sessão web", () => {
  it("@spec:AC-109 sessão web sai só em cookie HttpOnly, Secure e SameSite, sem token no corpo", async () => {
    const resposta = responderSessaoDoNavegador(
      {
        tokenDeAcesso: "acesso-que-nao-pode-chegar-ao-script",
        tokenDeRenovacao: "refresh-que-fica-no-cookie",
        acessoExpiraEm: "2026-08-23T12:15:00.000Z",
      },
      { NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "simpleclick.test" },
    );

    const cookie = resposta.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Domain=simpleclick.test");

    const corpo = JSON.stringify(await resposta.json());
    expect(corpo).not.toContain("acesso-que-nao-pode-chegar-ao-script");
    expect(corpo).not.toContain("refresh-que-fica-no-cookie");
  });

  it("mantém o cookie no host local quando o BFF roda em localhost", () => {
    const resposta = responderSessaoDoNavegador(
      {
        tokenDeAcesso: "acesso-local",
        tokenDeRenovacao: "refresh-local",
        acessoExpiraEm: "2026-08-23T12:15:00.000Z",
      },
      { NODE_ENV: "development" },
    );

    const cookie = resposta.headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain("Domain=");
    expect(cookie).toContain("sc_refresh=refresh-local");
  });

  it("@spec:AC-616 o cookie de acesso vai ao domínio comum de site e API, para o fechamento do navegador levar a sessão do cliente", () => {
    // O fechamento sai do navegador direto para a API e a página não lê o
    // token: sem o domínio comum, a API nunca vê quem está comprando.
    const fonte = { NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "simpleclick.test" };
    const resposta = responderSessaoDoNavegador(
      {
        tokenDeAcesso: "acesso-do-cliente",
        tokenDeRenovacao: "refresh-do-cliente",
        acessoExpiraEm: "2026-08-23T12:15:00.000Z",
      },
      fonte,
    );
    const acesso = resposta.headers
      .getSetCookie()
      .find((linha) => linha.startsWith("sc_access="));
    expect(acesso).toContain("Domain=simpleclick.test");
    expect(acesso).toContain("HttpOnly");

    // E a saída apaga no MESMO domínio: sem ele o navegador mantém o cookie.
    const apagar = new Headers();
    adicionarCookiesQueApagam(apagar, fonte);
    const apagaAcesso = apagar
      .getSetCookie()
      .find((linha) => linha.startsWith("sc_access="));
    expect(apagaAcesso).toContain("Max-Age=0");
    expect(apagaAcesso).toContain("Domain=simpleclick.test");
  });
});

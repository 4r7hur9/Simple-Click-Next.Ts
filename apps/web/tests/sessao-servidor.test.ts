import { describe, expect, it } from "vitest";

import { responderSessaoDoNavegador } from "../src/server/sessao.ts";

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
});

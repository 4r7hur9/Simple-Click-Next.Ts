// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === "sc_definir_senha" ? { value: "token-do-cookie" } : undefined,
  }),
}));

import configuracao from "../next.config.ts";
import PaginaDeDefinicaoDeSenha from "../src/app/(conta)/definir-senha/page.tsx";
import { LimparTokenDaBarra } from "../src/features/auth/LimparTokenDaBarra.tsx";
import { responderFormularioDeAcesso } from "../src/server/formularios-de-acesso.ts";

const SITE = "https://site.exemplo";
const TOKEN = "T".repeat(43);

function pedido(campos: Record<string, string>): Request {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return new Request(`${SITE}/api/auth/definir-senha`, {
    method: "POST",
    body: dados,
  });
}

function api(status: number) {
  const chamadas: string[] = [];
  const buscar = (async (url: string) => {
    chamadas.push(String(url));
    return new Response(JSON.stringify({}), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

describe("/definir-senha endurecida", () => {
  it("[CA-7] responde Referrer-Policy no-referrer e Cache-Control no-store", async () => {
    const regras = await configuracao.headers!();
    const cabecalhos = new Map<string, string>();
    for (const r of regras.filter(
      (r) => r.source === "/:path*" || r.source === "/definir-senha",
    ))
      for (const h of r.headers) cabecalhos.set(h.key, h.value);
    expect(cabecalhos.get("Referrer-Policy")).toBe("no-referrer");
    expect(cabecalhos.get("Cache-Control")).toBe("no-store");
  });

  it("[CA-7] tira o token da barra sem guardá-lo em storage", async () => {
    window.history.replaceState(
      null,
      "",
      `/definir-senha?token=${TOKEN}&convite=true`,
    );
    const raiz = createRoot(document.createElement("div"));
    await act(async () => raiz.render(<LimparTokenDaBarra />));
    expect(window.location.search).toBe("?convite=true");
    expect(window.location.href).not.toContain(TOKEN);
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain(TOKEN);
    await act(async () => raiz.unmount());
  });

  it("[CA-7] o erro volta sem o token na URL, e o token vai em cookie httpOnly restrito", async () => {
    for (const [campos, api_] of [
      [{ token: TOKEN, senha: "123456", confirmacao: "123456" }, api(422)],
      [{ token: TOKEN, senha: "abc", confirmacao: "xyz" }, api(200)],
    ] as const) {
      const r = await responderFormularioDeAcesso(
        pedido(campos),
        "definir-senha",
        api_.buscar,
      );
      expect(r.headers.get("location")).not.toContain(TOKEN);
      expect(r.headers.get("location")).not.toContain("token=");
      const cookie = r.headers.get("set-cookie") ?? "";
      expect(cookie).toContain(`sc_definir_senha=${TOKEN}`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/definir-senha");
      expect(cookie).toMatch(/Max-Age=\d+/);
    }
    const fim = await responderFormularioDeAcesso(
      pedido({
        token: TOKEN,
        senha: "uma frase longa e boa",
        confirmacao: "uma frase longa e boa",
      }),
      "definir-senha",
      api(410).buscar,
    );
    expect(fim.headers.get("location")).not.toContain(TOKEN);
    expect(fim.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("[CA-7] GET nunca consome o link e reabre o formulário pelo cookie (fluxo sem JavaScript)", async () => {
    const chamada = vi.fn();
    vi.stubGlobal("fetch", chamada);
    const html = renderToStaticMarkup(
      await PaginaDeDefinicaoDeSenha({
        searchParams: Promise.resolve({ token: TOKEN }),
      }),
    );
    expect(chamada).not.toHaveBeenCalled();
    expect(html).toContain(`value="${TOKEN}"`);
    const depoisDoErro = renderToStaticMarkup(
      await PaginaDeDefinicaoDeSenha({
        searchParams: Promise.resolve({ estado: "senha_fraca" }),
      }),
    );
    expect(chamada).not.toHaveBeenCalled();
    expect(depoisDoErro).toContain('value="token-do-cookie"');
    vi.unstubAllGlobals();
  });
});

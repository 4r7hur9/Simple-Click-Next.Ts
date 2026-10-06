/**
 * A tela e a ação de escolher a loja do painel (T-115, AC-136).
 *
 * Sem rede e sem servidor: os cabeçalhos do pedido, os cookies da resposta e
 * o redirecionamento do Next são trocados por versões que só anotam o que
 * receberam. A API de mentira responde "quem sou eu" com as duas lojas da
 * dona, ou com o estado que cada prova pede.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOJA_DA_SESSAO,
  OUTRA_LOJA_DA_SESSAO,
  quemSouEu,
} from "./apoio-da-loja-da-sessao";

const estado = vi.hoisted(() => ({
  cookie: "sc_access=token-da-dona" as string | null,
  gravados: [] as unknown[],
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(estado.cookie === null ? {} : { cookie: estado.cookie }),
  cookies: async () => ({
    set: (valor: unknown) => estado.gravados.push(valor),
  }),
}));

/** O `redirect` do Next interrompe a execução; aqui ele vira um erro legível. */
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirecionou:${destino}`);
  },
}));

const { escolherLojaDoPainel } = await import("../src/server/actions/loja");
const { default: PaginaDeEscolhaDaLoja } =
  await import("../src/app/(conta)/escolher-loja/page");

/** A API responde "quem sou eu" com as lojas pedidas (ou com o status). */
function apiCom(lojas: readonly unknown[] | number) {
  vi.stubGlobal("fetch", (async () =>
    typeof lojas === "number"
      ? Response.json({ erro: "x" }, { status: lojas })
      : Response.json(quemSouEu(lojas))) as typeof fetch);
}

function formulario(apelido: string): FormData {
  const dados = new FormData();
  dados.set("apelido", apelido);
  return dados;
}

async function pagina(busca: Record<string, string> = {}): Promise<string> {
  const elemento = await PaginaDeEscolhaDaLoja({
    searchParams: Promise.resolve(busca),
  });
  return renderToStaticMarkup(elemento);
}

beforeEach(() => {
  estado.cookie = "sc_access=token-da-dona";
  estado.gravados.length = 0;
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.simpleclick.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("escolher a loja (AC-136)", () => {
  it("@spec:AC-136 a tela lista as lojas da sessão, cada uma com o seu botão", async () => {
    apiCom([LOJA_DA_SESSAO, OUTRA_LOJA_DA_SESSAO]);
    const html = await pagina();
    expect(html).toContain("Abrir Açaí &amp; Guaraná da Vila");
    expect(html).toContain("Abrir Açaí do Centro");
    expect(html).toContain(`value="${OUTRA_LOJA_DA_SESSAO.apelido}"`);
    expect(html).toContain('aria-label="Suas lojas"');
  });

  it("@spec:AC-136 a escolha vai para um cookie HttpOnly, Secure e SameSite, e abre o painel", async () => {
    apiCom([LOJA_DA_SESSAO, OUTRA_LOJA_DA_SESSAO]);
    await expect(
      escolherLojaDoPainel(formulario(OUTRA_LOJA_DA_SESSAO.apelido)),
    ).rejects.toThrow("redirecionou:/painel");
    expect(estado.gravados).toEqual([
      expect.objectContaining({
        name: "sc_loja",
        value: OUTRA_LOJA_DA_SESSAO.apelido,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      }),
    ]);
  });

  it("@spec:AC-136 loja que não é da sessão é recusada sem mudar nada", async () => {
    apiCom([LOJA_DA_SESSAO, OUTRA_LOJA_DA_SESSAO]);
    await expect(
      escolherLojaDoPainel(formulario("emporio-do-bruno")),
    ).rejects.toThrow("redirecionou:/escolher-loja?estado=recusada");
    expect(estado.gravados).toEqual([]);
    expect(await pagina({ estado: "recusada" })).toContain(
      "Essa loja não está entre as suas",
    );
  });

  it("@spec:AC-136 escolha guardada que deixou de valer volta para a lista, com o aviso", async () => {
    estado.cookie = "sc_access=token-da-dona; sc_loja=loja-que-saiu";
    apiCom([LOJA_DA_SESSAO, OUTRA_LOJA_DA_SESSAO]);
    expect(await pagina()).toContain("A loja escolhida antes não abre mais");
  });

  it("@spec:AC-135 sem sessão vai para a entrada; sem loja e API fora do ar explicam", async () => {
    estado.cookie = null;
    await expect(pagina()).rejects.toThrow("redirecionou:/entrar");
    await expect(escolherLojaDoPainel(formulario("x"))).rejects.toThrow(
      "redirecionou:/entrar",
    );

    estado.cookie = "sc_access=token-da-dona";
    apiCom([]);
    expect(await pagina()).toContain("Sua conta ainda não tem loja");

    apiCom(500);
    const foraDoAr = await pagina();
    expect(foraDoAr).toContain("Não foi possível carregar suas lojas");
    expect(foraDoAr).toContain('role="alert"');
  });
});

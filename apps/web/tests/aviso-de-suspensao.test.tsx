// @vitest-environment jsdom
/**
 * O aviso de suspensão do painel do dono, do lado da tela (AC-209, P-012).
 *
 * Que a API responde a situação da loja suspensa ao dono dela — e só a ele —
 * está provado contra o banco em `apps/api/tests/admin-situacao.test.ts`.
 * Aqui se prova o que o painel mostra: o aviso com desde quando e o motivo,
 * nada para a loja no ar, nada inventado quando a leitura falha, e o repasse
 * do site que leva a sessão do cookie até a API.
 */
import axe from "axe-core";
import type { SituacaoParaODonoNoContrato } from "@simpleclick/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/loja/situacao/route.ts";
import {
  AvisoDeSuspensao,
  ENDERECO_DA_SITUACAO,
} from "../src/features/config/AvisoDeSuspensao.tsx";
import { desmontar, esperar, montar, simularApi } from "./apoio-config.tsx";

afterEach(() => {
  desmontar();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const SUSPENSA: SituacaoParaODonoNoContrato = {
  status: "SUSPENDED",
  suspensao: {
    desde: "2026-10-01T12:30:00.000Z",
    motivo: "Mensalidade em atraso",
  },
};

async function painelCom(resposta: { status: number; corpo?: unknown }) {
  const chamadas = simularApi(() => resposta);
  const tela = montar(<AvisoDeSuspensao />);
  await esperar();
  return { tela, chamadas };
}

describe("o dono vê o aviso de suspensão ao entrar (AC-209)", () => {
  it("@spec:AC-209 a loja suspensa mostra o aviso com desde quando, o motivo, o que continua guardado e com quem falar", async () => {
    const { tela, chamadas } = await painelCom({
      status: 200,
      corpo: SUSPENSA,
    });

    expect(chamadas[0]?.url).toBe(ENDERECO_DA_SITUACAO);
    const aviso = tela.querySelector(".sc-aviso--atencao");
    expect(aviso).not.toBeNull();
    const texto = aviso?.textContent ?? "";
    expect(texto).toContain("Sua loja está suspensa");
    expect(texto).toContain("Desde 01/10/2026, 09:30");
    expect(texto).toContain(
      "Motivo informado pela administração: Mensalidade em atraso",
    );
    expect(texto).toContain("Nada foi apagado");
    expect(texto).toContain("fale com a administração da plataforma");
  });

  it("@spec:AC-209 a loja no ar não mostra aviso nenhum, e a leitura que falha também não inventa um", async () => {
    const noAr = await painelCom({
      status: 200,
      corpo: { status: "ACTIVE", suspensao: null },
    });
    expect(noAr.tela.querySelector(".sc-aviso")).toBeNull();
    desmontar();

    const falhou = await painelCom({
      status: 500,
      corpo: { erro: "interno" },
    });
    expect(falhou.tela.querySelector(".sc-aviso")).toBeNull();
  });

  it("@spec:AC-209 @principle:P-012 o aviso não tem violação crítica nem séria de acessibilidade", async () => {
    const { tela } = await painelCom({ status: 200, corpo: SUSPENSA });

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});

describe("o site repassa a pergunta com a sessão do dono (AC-209)", () => {
  it("@spec:AC-209 com o cookie da sessão, o site pergunta à API com o token e devolve a resposta sem cache", async () => {
    const pedidos: { url: string; autorizacao: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        autorizacao: new Headers(init?.headers).get("authorization"),
      });
      return new Response(JSON.stringify(SUSPENSA), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const resposta = await GET(
      new Request("https://site.exemplo.test/api/loja/situacao", {
        headers: { cookie: "outro=1; sc_access=token-do-dono" },
      }),
    );

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(await resposta.json()).toEqual(SUSPENSA);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url).toMatch(/\/v1\/lojas\/[a-z0-9-]+\/situacao$/);
    expect(pedidos[0]?.autorizacao).toBe("Bearer token-do-dono");
  });

  it("@spec:AC-209 sem sessão, o site responde 401 sem perguntar à API", async () => {
    const buscar = vi.fn();
    vi.stubGlobal("fetch", buscar);

    const resposta = await GET(
      new Request("https://site.exemplo.test/api/loja/situacao"),
    );

    expect(resposta.status).toBe(401);
    expect(buscar).not.toHaveBeenCalled();
  });
});

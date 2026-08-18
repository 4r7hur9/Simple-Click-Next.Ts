import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O Next só entrega `revalidateTag` dentro de uma requisição sua, com o
 * armazenamento de geração montado. Aqui ele é substituído para que o teste
 * exercite o CAMINHO INTEIRO da rota — autenticação, leitura do corpo e
 * escolha das etiquetas — e possa afirmar exatamente qual etiqueta foi
 * mandada invalidar.
 */
const espiao = vi.hoisted(() => ({
  revalidateTag: vi.fn<(etiqueta: string, perfil?: unknown) => undefined>(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: espiao.revalidateTag,
  unstable_cache: (calcular: () => unknown) => () => calcular(),
}));

const { POST, runtime } = await import("../src/app/api/revalidate/route");

/**
 * Prova da rota de invalidação (AC-028): ela é autenticada de verdade e recusa
 * quem não apresentar o segredo.
 */

const LOJA_A = "11111111-1111-4111-8111-111111111111";
const SEGREDO = "r".repeat(48);
const CABECALHO = "x-simpleclick-revalidacao";

/** Monta o pedido que a API faria. */
function pedido(opcoes: {
  segredo?: string;
  corpo?: unknown;
  corpoBruto?: string;
}): Request {
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opcoes.segredo !== undefined) cabecalhos[CABECALHO] = opcoes.segredo;

  return new Request("https://simpleclick.localhost/api/revalidate", {
    method: "POST",
    headers: cabecalhos,
    body:
      opcoes.corpoBruto ?? JSON.stringify(opcoes.corpo ?? { lojaId: LOJA_A }),
  });
}

beforeEach(() => {
  espiao.revalidateTag.mockClear();
  vi.stubEnv("SEGREDO_DE_REVALIDACAO", SEGREDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/revalidate", () => {
  it("@spec:AC-028 invalida a loja avisada e diz o que invalidou", async () => {
    const resposta = await POST(pedido({ segredo: SEGREDO }));

    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toEqual({
      lojaId: LOJA_A,
      invalidado: [LOJA_A],
    });
    expect(espiao.revalidateTag).toHaveBeenCalledWith(LOJA_A, "max");
  });

  it("@spec:AC-028 invalida só os dados nomeados quando o aviso os traz", async () => {
    const resposta = await POST(
      pedido({
        segredo: SEGREDO,
        corpo: { lojaId: LOJA_A, nomes: ["catalogo"] },
      }),
    );

    expect(resposta.status).toBe(200);
    expect(espiao.revalidateTag).toHaveBeenCalledTimes(1);
    expect(espiao.revalidateTag).toHaveBeenCalledWith(
      `${LOJA_A}:catalogo`,
      "max",
    );
  });

  it("@spec:AC-028 recusa quem não apresenta o segredo, e não invalida nada", async () => {
    const resposta = await POST(pedido({}));

    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: "nao_autenticado" });
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 recusa o segredo errado, e não invalida nada", async () => {
    const resposta = await POST(pedido({ segredo: "x".repeat(48) }));

    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({
      erro: "segredo_invalido",
    });
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 recusa o segredo quase certo — não basta acertar o começo", async () => {
    const resposta = await POST(pedido({ segredo: SEGREDO.slice(0, -1) }));

    expect(resposta.status).toBe(401);
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 sem segredo configurado no site, a rota recusa todo mundo em vez de abrir", async () => {
    vi.stubEnv("SEGREDO_DE_REVALIDACAO", "");

    const semSegredo = await POST(pedido({}));
    const comSegredo = await POST(pedido({ segredo: SEGREDO }));

    expect(semSegredo.status).toBe(503);
    expect(comSegredo.status).toBe(503);
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 recusa segredo configurado curto demais para ser segredo", async () => {
    vi.stubEnv("SEGREDO_DE_REVALIDACAO", "curto");

    const resposta = await POST(pedido({ segredo: "curto" }));

    expect(resposta.status).toBe(503);
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-027 recusa identificador de loja que forjaria a etiqueta de outra", async () => {
    const resposta = await POST(
      pedido({ segredo: SEGREDO, corpo: { lojaId: `${LOJA_A}:catalogo` } }),
    );

    expect(resposta.status).toBe(400);
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 recusa corpo que não é JSON, sem derrubar a rota", async () => {
    const resposta = await POST(
      pedido({ segredo: SEGREDO, corpoBruto: "isto não é json" }),
    );

    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toMatchObject({
      erro: "corpo_invalido",
    });
  });

  it("@spec:AC-028 recusa lista de nomes que não é lista de texto", async () => {
    const resposta = await POST(
      pedido({ segredo: SEGREDO, corpo: { lojaId: LOJA_A, nomes: [7] } }),
    );

    expect(resposta.status).toBe(400);
    expect(espiao.revalidateTag).not.toHaveBeenCalled();
  });

  it("@spec:AC-028 a resposta da invalidação nunca fica guardada em cache", async () => {
    const resposta = await POST(pedido({ segredo: SEGREDO }));

    expect(resposta.headers.get("cache-control")).toBe("no-store");
  });

  it("@spec:AC-028 a rota roda no ambiente que tem a comparação em tempo constante", () => {
    expect(runtime).toBe("nodejs");
  });
});

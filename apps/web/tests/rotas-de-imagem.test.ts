/**
 * Card #81 — as rotas do site que levam uma imagem até a API renovam a vitrine
 * quando a troca deu certo, e só então (recusa não muda nada no ar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LojaDoPainel from "../src/server/loja-do-painel";

const next = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));
vi.mock("next/cache", () => next);

vi.mock("../src/server/loja-do-painel", async (original) => ({
  ...(await original<typeof LojaDoPainel>()),
  sessaoParaEncaminhar: async () => ({ token: "t", apelido: "pastelaria-da-vila" }),
}));

import { PUT as trocarFotoDoProduto } from "../src/app/api/catalogo/produtos/[produtoId]/imagens/[imagemId]/arquivo/route";
import { POST as enviarFotoDoProduto } from "../src/app/api/catalogo/produtos/[produtoId]/imagens/arquivo/route";
import { PUT as enviarImagemDaLoja } from "../src/app/api/loja/imagem/[tipo]/route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ID = "00000000-0000-4000-8000-000000000001";

function pedido(metodo: string, caminho: string) {
  return new Request(`http://localhost:3000${caminho}`, {
    method: metodo,
    headers: { "content-type": "image/png" },
    body: PNG,
  });
}

function apiResponde(status: number, corpo: unknown = { url: "http://x/y.png" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(corpo, { status })),
  );
}

beforeEach(() => {
  next.revalidatePath.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a vitrine é renovada depois de uma troca de imagem que deu certo", () => {
  it("logo, capa, fundo e topo da loja", async () => {
    apiResponde(200);
    const resposta = await enviarImagemDaLoja(pedido("PUT", "/api/loja/imagem/fundo"), {
      params: Promise.resolve({ tipo: "fundo" }),
    });
    expect(resposta.status).toBe(200);
    expect(next.revalidatePath).toHaveBeenCalledWith("/loja/pastelaria-da-vila");
  });

  it("foto nova do produto", async () => {
    apiResponde(201);
    await enviarFotoDoProduto(pedido("POST", `/api/catalogo/produtos/${ID}/imagens/arquivo`), {
      params: Promise.resolve({ produtoId: ID }),
    });
    expect(next.revalidatePath).toHaveBeenCalledWith("/loja/pastelaria-da-vila/cardapio");
  });

  it("foto do produto trocada no lugar", async () => {
    apiResponde(200);
    const resposta = await trocarFotoDoProduto(
      pedido("PUT", `/api/catalogo/produtos/${ID}/imagens/${ID}/arquivo`),
      { params: Promise.resolve({ produtoId: ID, imagemId: ID }) },
    );
    expect(resposta.status).toBe(200);
    expect(next.revalidatePath).toHaveBeenCalledWith("/loja/pastelaria-da-vila/cardapio");
  });
});

describe("recusa não renova nada (a imagem anterior continua no ar)", () => {
  it("API recusou a foto", async () => {
    apiResponde(400, { erro: "imagem_invalida" });
    const resposta = await trocarFotoDoProduto(
      pedido("PUT", `/api/catalogo/produtos/${ID}/imagens/${ID}/arquivo`),
      { params: Promise.resolve({ produtoId: ID, imagemId: ID }) },
    );
    expect(resposta.status).toBe(400);
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });

  it("envio indisponível devolve a mensagem sem renovar", async () => {
    apiResponde(503, { erro: "envio_indisponivel", mensagem: "fora do ar" });
    const resposta = await enviarImagemDaLoja(pedido("PUT", "/api/loja/imagem/logo"), {
      params: Promise.resolve({ tipo: "logo" }),
    });
    expect(resposta.status).toBe(503);
    expect((await resposta.json()).mensagem).toBe("fora do ar");
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
/**
 * Favoritos da conta (card #111, AC-11102 a AC-11104, AC-11130).
 *
 * Prova a TELA com a API trocada por respostas do teste. Quem só vê os
 * favoritos de cada pessoa (AC-11101) é a API: `apps/api/tests/
 * favoritos-e-recentes.test.ts`. O último teste liga a tela à rota real do
 * proxy, para a remoção de produto não falhar de novo (AC-11125).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { LojaDoFeed, ProdutoFavorito } from "@simpleclick/contracts";

import {
  ListaDeLojas,
  ListaDeProdutosFavoritos,
} from "../src/features/conta/LojasDaConta";
import * as proxy from "../src/app/api/conta/[...resto]/route";
import {
  botao,
  clicar,
  desmontar,
  esperar,
  montar,
  simularApi,
} from "./apoio-config";

afterEach(desmontar);

const ID_1 = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";
const ID_2 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function produto(id: string, nome: string): ProdutoFavorito {
  return {
    id,
    nome,
    precoCentavos: 1_990,
    precoOriginalCentavos: null,
    imagem: null,
    disponivel: true,
    indisponivelAte: null,
    loja: {
      apelido: "papelaria-central",
      nome: "Papelaria Central",
      tipoDeNegocio: "papelaria",
      logo: null,
      cidade: null,
      bairro: null,
      formasDeEntrega: ["PICKUP"],
    } as ProdutoFavorito["loja"],
    favoritadoEm: "2026-09-22T12:00:00.000Z",
  };
}

function loja(apelido: string, nome: string): LojaDoFeed {
  return {
    apelido,
    nome,
    tipoDeNegocio: "padaria",
    tipoDeNegocioNome: "Padaria",
    cidade: "Campinas",
    bairro: "Centro",
    uf: "SP",
    formasDeEntrega: ["PICKUP"],
    logo: null,
    capa: null,
    corDestaque: "#b7ff00",
    distanciaKm: null,
    produtosNoFeed: 3,
    favorita: true,
    ultimaVisita: null,
  };
}

const PRODUTOS = [
  produto(ID_1, "Caderno universitário"),
  produto(ID_2, "Caneta azul"),
];

describe("produtos favoritos (AC-11102)", () => {
  it("[CA-2] @spec:AC-11102 cada produto mostra nome, preço, loja e link para o produto", () => {
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    const item = raiz.querySelector(`[data-produto="${ID_1}"]`);
    expect(item?.textContent).toContain("Caderno universitário");
    expect(item?.textContent).toContain("Papelaria Central");
    expect(item?.textContent).toMatch(/R\$\s?19,90/);
    expect(item?.querySelector("a")?.getAttribute("href")).toBe(
      `/loja/papelaria-central/produto/${ID_1}`,
    );
  });
});

describe("tirar dos favoritos (AC-11103, AC-11104, AC-11130)", () => {
  it("[CA-4] @spec:AC-11104 o botão diz qual item e a estrela é só ícone", () => {
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    const nomes = [...raiz.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(nomes).toEqual([
      "Tirar Caderno universitário dos favoritos",
      "Tirar Caneta azul dos favoritos",
    ]);
    expect(raiz.querySelector("button svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("[CA-3] @spec:AC-11103 o produto some quando a API confirma, sem recarregar a página", async () => {
    const chamadas = simularApi(() => ({ status: 204 }));
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    clicar(botao(raiz, "Tirar Caderno universitário"));
    await esperar();
    expect(chamadas).toEqual([
      {
        url: `/api/conta/favoritos/produtos/${ID_1}`,
        metodo: "DELETE",
        corpo: undefined,
      },
    ]);
    expect(raiz.querySelector(`[data-produto="${ID_1}"]`)).toBeNull();
    expect(raiz.querySelector(`[data-produto="${ID_2}"]`)).not.toBeNull();
  });

  it("[CA-3] @spec:AC-11103 se falhar, o item continua e o aviso diz o que fazer", async () => {
    simularApi(() => ({ status: 500, corpo: { erro: "indisponivel" } }));
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    clicar(botao(raiz, "Tirar Caderno universitário"));
    await esperar();
    expect(raiz.querySelector(`[data-produto="${ID_1}"]`)).not.toBeNull();
    const alerta = document.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("Não foi possível remover agora");
    expect(alerta?.textContent).toContain("Tentar de novo");
  });

  it("[CA-30] @spec:AC-11130 a espera é mostrada e o clique duplo não manda duas vezes", async () => {
    let solta: (() => void) | undefined;
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      chamadas.push(url);
      return new Promise<Response>((resolver) => {
        solta = () => resolver(new Response(null, { status: 204 }));
      });
    });
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    const alvo = botao(raiz, "Tirar Caderno universitário");
    clicar(alvo);
    expect(alvo.getAttribute("aria-busy")).toBe("true");
    clicar(alvo);
    clicar(botao(raiz, "Tirar Caneta azul"));
    expect(chamadas).toHaveLength(1);
    await act(async () => {
      solta?.();
    });
    await esperar();
  });

  it("[CA-3] @spec:AC-11103 vale também para a loja favorita", async () => {
    const chamadas = simularApi(() => ({ status: 204 }));
    const raiz = montar(
      <ListaDeLojas
        removivel
        lojas={[loja("padaria-do-bairro", "Padaria do Bairro")]}
        vazio={{ titulo: "Nada", descricao: "Nada" }}
      />,
    );
    clicar(botao(raiz, "Tirar Padaria do Bairro dos favoritos"));
    await esperar();
    expect(chamadas[0]?.url).toBe("/api/conta/favoritos/padaria-do-bairro");
    expect(raiz.querySelector("[data-loja]")).toBeNull();
  });

  it("[CA-3] @spec:AC-11125 a remoção da tela chega à API pela rota real do proxy", async () => {
    const naApi: { url: string; metodo: string }[] = [];
    vi.stubGlobal(
      "fetch",
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const endereco = String(url);
        if (endereco.startsWith("/api/conta/")) {
          const partes = endereco.replace("/api/conta/", "").split("/");
          return proxy.DELETE(
            new Request(`https://simpleclick.localhost${endereco}`, {
              method: init?.method ?? "GET",
              headers: {
                cookie: "sc_access=token",
                "sec-fetch-site": "same-origin",
              },
            }),
            { params: Promise.resolve({ resto: partes }) },
          );
        }
        naApi.push({ url: endereco, metodo: init?.method ?? "GET" });
        return new Response(null, { status: 204 });
      },
    );
    const raiz = montar(<ListaDeProdutosFavoritos produtos={PRODUTOS} />);
    clicar(botao(raiz, "Tirar Caderno universitário"));
    await esperar();
    expect(naApi).toEqual([
      {
        url: expect.stringContaining(`/v1/conta/favoritos/produtos/${ID_1}`),
        metodo: "DELETE",
      },
    ]);
    expect(raiz.querySelector(`[data-produto="${ID_1}"]`)).toBeNull();
  });
});

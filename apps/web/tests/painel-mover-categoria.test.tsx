// @vitest-environment jsdom
/**
 * Prova da tela quando o produto muda de categoria (AC-329).
 *
 * O caminho da API está provado contra o banco em
 * `apps/api/tests/mover-categoria.int.test.ts`. Aqui: o formulário avisa que
 * trocar a categoria não apaga nada, os valores guardados aparecem com a
 * categoria de onde vieram, e o descarte só acontece no segundo clique, depois
 * de o dono ler o que será apagado.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CamposDeEspecificacao } from "../src/features/painel-catalogo/CamposDeEspecificacao";

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
}

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function roteiro(...respostas: (() => Promise<Response>)[]): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({
        url,
        metodo: init?.method ?? "GET",
        corpo:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const proxima = respostas.shift();
      if (proxima === undefined) throw new Error(`chamada inesperada: ${url}`);
      return proxima();
    }),
  );
  return chamadas;
}

async function montar(elemento: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(elemento);
  });
  return container;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) =>
      candidato.getAttribute("aria-label") === texto ||
      candidato.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

async function clicar(elemento: HTMLElement): Promise<void> {
  await act(async () => {
    elemento.click();
  });
}

const FURACAO = {
  id: "esp-furacao",
  nome: "Furação",
  tipo: "texto" as const,
  unidade: null,
  obrigatoria: true,
  opcoes: [],
};

const GUARDADOS = [
  {
    especificacaoId: "esp-aro",
    nome: "Aro",
    unidade: "pol",
    categoriaNome: "Pneus",
    valor: "15",
    motivo: "outra_categoria",
  },
  {
    especificacaoId: "esp-largura",
    nome: "Largura",
    unidade: "mm",
    categoriaNome: "Pneus",
    valor: 195,
    motivo: "outra_categoria",
  },
];

describe("o produto que mudou de categoria (AC-329)", () => {
  it("@spec:AC-329 trocar a categoria no formulário avisa que nada será apagado e pede as especificações da nova", async () => {
    const chamadas = roteiro(async () => json({ especificacoes: [FURACAO] }));
    const tela = await montar(
      <CamposDeEspecificacao
        categoriaId="cat-rodas"
        produtoId="prod-1"
        categoriaGravadaId="cat-pneus"
        valores={{}}
        erros={{}}
        aoMudar={() => {}}
        aoCarregar={() => {}}
      />,
    );

    expect(chamadas[0]?.url).toBe(
      "/api/catalogo/categorias/cat-rodas/especificacoes",
    );
    expect(tela.querySelector('[role="note"]')?.textContent).toContain(
      "nada é apagado sem a sua confirmação",
    );
    expect(tela.querySelector("label")?.textContent).toBe("Furação *");
  });

  it("@spec:AC-329 os valores guardados aparecem com a categoria de onde vieram, e o descarte só vale confirmado", async () => {
    const aviso =
      "O valor guardado Aro (Pneus): 15 será apagado deste produto.";
    const chamadas = roteiro(
      async () =>
        json({
          produtoId: "prod-1",
          categoriaId: "cat-rodas",
          campos: [{ especificacao: FURACAO, valor: null }],
          paraPreencher: ["esp-furacao"],
          naoUsadas: GUARDADOS,
        }),
      async () => json({ erro: "confirmacao_necessaria", aviso }, 409),
      async () =>
        json({
          produtoId: "prod-1",
          categoriaId: "cat-rodas",
          campos: [{ especificacao: FURACAO, valor: null }],
          paraPreencher: ["esp-furacao"],
          naoUsadas: [GUARDADOS[1]],
        }),
    );
    const tela = await montar(
      <CamposDeEspecificacao
        categoriaId="cat-rodas"
        produtoId="prod-1"
        categoriaGravadaId="cat-rodas"
        valores={{}}
        erros={{}}
        aoMudar={() => {}}
        aoCarregar={() => {}}
      />,
    );

    const guardados = tela.querySelector(
      '[aria-labelledby="valores-guardados"]',
    );
    expect(guardados?.textContent).toContain("Aro: 15 pol · de Pneus");
    expect(guardados?.textContent).toContain("Largura: 195 mm · de Pneus");

    await clicar(botao(tela, "Descartar Aro"));
    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/produtos/prod-1/especificacoes/esp-aro",
      metodo: "DELETE",
      corpo: {},
    });
    // O primeiro clique só mostra o que seria apagado.
    expect(tela.querySelector('[role="alertdialog"]')?.textContent).toContain(
      aviso,
    );
    expect(guardados?.textContent).toContain("Aro: 15");

    await clicar(botao(tela, "Confirmar descarte"));
    expect(chamadas[2]).toEqual({
      url: "/api/catalogo/produtos/prod-1/especificacoes/esp-aro",
      metodo: "DELETE",
      corpo: { confirmado: true },
    });
    const depois = tela.querySelector('[aria-labelledby="valores-guardados"]');
    expect(depois?.textContent).not.toContain("Aro: 15");
    expect(depois?.textContent).toContain("Largura: 195");
  });

  it("@spec:AC-329 desistir do descarte mantém o valor guardado sem nova chamada", async () => {
    const chamadas = roteiro(
      async () =>
        json({
          produtoId: "prod-1",
          categoriaId: "cat-rodas",
          campos: [],
          paraPreencher: [],
          naoUsadas: [GUARDADOS[0]],
        }),
      async () =>
        json({ erro: "confirmacao_necessaria", aviso: "Será apagado." }, 409),
    );
    const tela = await montar(
      <CamposDeEspecificacao
        categoriaId="cat-rodas"
        produtoId="prod-1"
        categoriaGravadaId="cat-rodas"
        valores={{}}
        erros={{}}
        aoMudar={() => {}}
        aoCarregar={() => {}}
      />,
    );

    await clicar(botao(tela, "Descartar Aro"));
    await clicar(botao(tela, "Manter"));

    expect(tela.querySelector('[role="alertdialog"]')).toBeNull();
    expect(tela.textContent).toContain("Aro: 15");
    expect(chamadas).toHaveLength(2);
  });
});

// @vitest-environment jsdom
/**
 * Prova da tela de categorias do dono (AC-300, AC-301, AC-302, AC-303).
 *
 * A regra está provada contra o banco em
 * `apps/api/tests/categorias-do-painel.int.test.ts`. Aqui a pergunta é outra:
 * a TELA mostra cada estado do jeito certo e manda para a API exatamente o que
 * o dono escolheu? Por isso o `fetch` é trocado por um roteiro — o que se prova
 * é a conversa da tela com a rota, não a rota.
 */
import axe from "axe-core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListaCategorias } from "../src/features/painel-catalogo/ListaCategorias";

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

const LANCHES = {
  id: "c-lanches",
  nome: "Lanches",
  apelido: "lanches",
  descricao: "Feitos na hora",
  visivel: true,
  ordem: 0,
  produtos: 5,
};
const BEBIDAS = {
  id: "c-bebidas",
  nome: "Bebidas",
  apelido: "bebidas",
  descricao: null,
  visivel: false,
  ordem: 1,
  produtos: 1,
};
const VAZIA = {
  id: "c-vazia",
  nome: "Temporária",
  apelido: "temporaria",
  descricao: null,
  visivel: true,
  ordem: 2,
  produtos: 0,
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Troca o `fetch` por um roteiro: cada chamada consome a próxima resposta e
 * fica registrada, para a prova conferir o que a tela mandou.
 */
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

async function montar(): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<ListaCategorias />);
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

/** O item da lista com a categoria: as ações dela moram no menu da linha. */
function itemDa(dentro: HTMLElement, nome: string): HTMLElement {
  const achado = [...dentro.querySelectorAll<HTMLElement>("ol > li")].find(
    (item) => item.querySelector("h3")?.textContent?.startsWith(nome),
  );
  if (!achado) throw new Error(`nenhuma categoria "${nome}"`);
  return achado;
}

async function clicar(elemento: HTMLElement): Promise<void> {
  await act(async () => {
    elemento.click();
  });
}

/** Digita como o navegador: o React só ouve o valor que passa pelo setter nativo. */
async function digitar(
  campo: HTMLInputElement | HTMLTextAreaElement,
  valor: string,
): Promise<void> {
  const prototipo = Object.getPrototypeOf(campo) as object;
  const setter = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  await act(async () => {
    setter?.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("os quatro estados da lista (AC-300, P-011)", () => {
  it("@spec:AC-300 @principle:P-011 enquanto carrega, a tela diz que está carregando", async () => {
    roteiro(() => new Promise<Response>(() => {}));
    const tela = await montar();

    expect(tela.textContent).toContain("Carregando categorias…");
    expect(tela.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("@spec:AC-300 @principle:P-011 sem categoria, a tela convida a criar a primeira", async () => {
    roteiro(async () => json({ categorias: [] }));
    const tela = await montar();

    expect(tela.textContent).toContain("Crie a primeira categoria");
    expect(tela.querySelector('[role="alert"]')).toBeNull();
  });

  it("@spec:AC-300 @principle:P-011 erro não se disfarça de vazio e oferece tentar de novo", async () => {
    const chamadas = roteiro(
      async () => json({ erro: "falhou" }, 500),
      async () => json({ categorias: [LANCHES] }),
    );
    const tela = await montar();

    const alerta = tela.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("Não conseguimos ler");
    expect(tela.textContent).not.toContain("Crie a primeira categoria");

    await clicar(botao(tela, "Tentar de novo"));
    expect(chamadas).toHaveLength(2);
    expect(tela.textContent).toContain("Lanches");
    expect(tela.querySelector('[role="alert"]')).toBeNull();
  });

  it("@spec:AC-300 a lista mostra a ordem da vitrine, a visibilidade e quantos produtos cada uma tem", async () => {
    roteiro(async () => json({ categorias: [LANCHES, BEBIDAS] }));
    const tela = await montar();

    const itens = [...tela.querySelectorAll("ol > li")].map(
      (item) => item.textContent ?? "",
    );
    expect(itens).toHaveLength(2);
    expect(itens[0]).toContain("01");
    expect(itens[0]).toContain("Lanches");
    expect(itens[0]).toContain("Visível");
    expect(itens[0]).toContain("5 produtos");
    expect(itens[1]).toContain("Bebidas");
    expect(itens[1]).toContain("Oculta");
    expect(itens[1]).toContain("1 produto");
  });

  it("@spec:AC-300 @principle:P-012 a lista não tem violação crítica nem séria de acessibilidade", async () => {
    roteiro(async () => json({ categorias: [LANCHES, BEBIDAS] }));
    const tela = await montar();
    await clicar(botao(itemDa(tela, "Lanches"), "Apagar"));

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  });
});

describe("criar, ocultar e reordenar (AC-300, AC-301, AC-302)", () => {
  it("@spec:AC-300 criar envia nome, descrição e visibilidade e põe a categoria na lista", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [] }),
      async () =>
        json(
          {
            id: "c-nova",
            nome: "Pastéis",
            apelido: "pasteis",
            descricao: "Massa fina",
            visivel: true,
            ordem: 0,
            produtos: 0,
          },
          201,
        ),
    );
    const tela = await montar();

    const nome = tela.querySelector<HTMLInputElement>(
      'input[placeholder="Ex.: Lanches"]',
    );
    const descricao = tela.querySelector<HTMLTextAreaElement>("textarea");
    if (!nome || !descricao) throw new Error("formulário incompleto");
    await digitar(nome, "Pastéis");
    await digitar(descricao, "Massa fina");
    await act(async () => {
      tela
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/categorias",
      metodo: "POST",
      corpo: { nome: "Pastéis", descricao: "Massa fina", visivel: true },
    });
    expect(tela.querySelector("ol")?.textContent).toContain("Pastéis");
  });

  it("@spec:AC-301 ocultar manda só a visibilidade e a categoria continua na gestão", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [LANCHES] }),
      async () => json({ ...LANCHES, visivel: false }),
    );
    const tela = await montar();

    await clicar(botao(tela, "Ocultar"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/categorias/c-lanches",
      metodo: "PATCH",
      corpo: { visivel: false },
    });
    const item = tela.querySelector("ol > li")?.textContent ?? "";
    expect(item).toContain("Lanches");
    expect(item).toContain("Oculta");
    expect(item).toContain("5 produtos");
  });

  it("@spec:AC-302 subir uma categoria envia a ordem nova inteira", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [LANCHES, BEBIDAS] }),
      async () => new Response(null, { status: 204 }),
    );
    const tela = await montar();

    await clicar(botao(tela, "Mover Bebidas para cima"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/categorias",
      metodo: "PUT",
      corpo: { ids: ["c-bebidas", "c-lanches"] },
    });
    expect(tela.querySelector("ol > li")?.textContent).toContain("Bebidas");
  });
});

describe("apagar pergunta o destino dos produtos (AC-303)", () => {
  it("@spec:AC-303 categoria com produtos oferece mover ou ocultar, e manda o destino escolhido", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [LANCHES, BEBIDAS] }),
      async () => json({ resultado: "movida", produtos: 5 }),
      async () => json({ categorias: [{ ...BEBIDAS, produtos: 6 }] }),
    );
    const tela = await montar();

    await clicar(botao(itemDa(tela, "Lanches"), "Apagar"));
    const pergunta = tela.querySelector('[role="group"]');
    expect(pergunta?.textContent).toContain("Lanches tem 5 produtos");
    expect(pergunta?.textContent).toContain(
      "Mover os produtos e apagar a categoria",
    );
    expect(pergunta?.textContent).toContain(
      "Ocultar a categoria com os produtos",
    );
    // O destino nunca oferece a própria categoria.
    const opcoes = [...(pergunta?.querySelectorAll("select option") ?? [])].map(
      (opcao) => opcao.textContent,
    );
    expect(opcoes).toEqual(["Bebidas"]);

    await clicar(botao(tela, "Confirmar"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/categorias/c-lanches",
      metodo: "DELETE",
      corpo: { destino: { acao: "mover", categoriaId: "c-bebidas" } },
    });
    expect(tela.textContent).toContain("Produtos movidos e Lanches apagada.");
    expect(tela.querySelector("ol")?.textContent).not.toContain("Lanches");
  });

  it("@spec:AC-303 escolher ocultar manda o destino ocultar, sem apagar nada", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [LANCHES, BEBIDAS] }),
      async () => json({ resultado: "ocultada", produtos: 5 }),
      async () =>
        json({ categorias: [{ ...LANCHES, visivel: false }, BEBIDAS] }),
    );
    const tela = await montar();

    await clicar(botao(itemDa(tela, "Lanches"), "Apagar"));
    const ocultar = tela.querySelector<HTMLInputElement>(
      'input[type="radio"][value="ocultar"]',
    );
    if (!ocultar) throw new Error("sem a opção de ocultar");
    await clicar(ocultar);
    await clicar(botao(tela, "Confirmar"));

    expect(chamadas[1]?.corpo).toEqual({ destino: { acao: "ocultar" } });
    expect(tela.textContent).toContain("nada foi apagado");
  });

  it("@spec:AC-303 categoria vazia só pede confirmação, e a corrida vira pergunta de destino", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [LANCHES, VAZIA] }),
      // Alguém pôs um produto na "vazia" entre a leitura e o pedido.
      async () => json({ erro: "categoria_com_produtos", produtos: 1 }, 409),
    );
    const tela = await montar();

    await clicar(botao(itemDa(tela, "Temporária"), "Apagar"));
    expect(tela.querySelector('[role="group"]')?.textContent).toContain(
      "não tem produtos",
    );
    await clicar(botao(tela, "Confirmar"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/categorias/c-vazia",
      metodo: "DELETE",
      corpo: {},
    });
    expect(tela.querySelector('[role="group"]')?.textContent).toContain(
      "Temporária tem 1 produto",
    );
    expect(tela.querySelector("ol")?.textContent).toContain("Temporária");
  });
});

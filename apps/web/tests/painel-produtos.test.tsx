// @vitest-environment jsdom
/**
 * Prova das telas do ciclo de vida do produto (AC-304, AC-307, AC-308).
 *
 * O ciclo está provado contra o banco em
 * `apps/api/tests/produtos-do-painel.int.test.ts`. Aqui se prova o que só a
 * tela mostra: o rascunho aparece MARCADO na gestão, duplicar e remover
 * conversam com a rota certa, e o cartão da vitrine enquadra a foto sem
 * distorcer nem estourar a coluna no menor celular.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListaProdutos } from "../src/features/painel-catalogo/ListaProdutos";
import { CartaoDeProduto } from "../src/features/vitrine/GradeDeProdutos";

interface Chamada {
  readonly url: string;
  readonly metodo: string;
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
      chamadas.push({ url, metodo: init?.method ?? "GET" });
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
    raiz?.render(<ListaProdutos />);
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

const PUBLICADO = {
  id: "p-1",
  nome: "Pastel de queijo",
  apelido: "pastel-de-queijo",
  descricao: "Massa crocante.",
  categoriaId: "c-1",
  categoriaNome: "Pastéis",
  precoCentavos: 1990,
  status: "PUBLISHED",
  disponivel: true,
};
const RASCUNHO = {
  ...PUBLICADO,
  id: "p-2",
  nome: "Pastel de camarão",
  apelido: "pastel-de-camarao",
  status: "DRAFT",
};

describe("a lista de produtos do dono (AC-307, AC-308, P-011)", () => {
  it("@spec:AC-308 @principle:P-011 erro de leitura não se disfarça de lista vazia", async () => {
    const chamadas = roteiro(
      async () => json({ erro: "falhou" }, 500),
      async () => json({ produtos: [] }),
    );
    const tela = await montar();

    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Não conseguimos ler seus produtos",
    );
    expect(tela.textContent).not.toContain("Cadastre o primeiro produto");

    await clicar(botao(tela, "Tentar de novo"));
    expect(chamadas).toHaveLength(2);
    expect(tela.textContent).toContain("Cadastre o primeiro produto");
  });

  it("@spec:AC-308 o rascunho aparece na gestão marcado como rascunho, ao lado do publicado", async () => {
    roteiro(async () => json({ produtos: [PUBLICADO, RASCUNHO] }));
    const tela = await montar();

    const itens = [...tela.querySelectorAll("ul > li")].map(
      (item) => item.textContent ?? "",
    );
    expect(itens[0]).toContain("Pastel de queijo");
    expect(itens[0]).toContain("Publicado");
    // O formatador brasileiro separa o símbolo com espaço inquebrável.
    expect(itens[0]).toMatch(/R\$\s19,90/);
    expect(itens[1]).toContain("Pastel de camarão");
    expect(itens[1]).toContain("Rascunho");
  });

  it("@spec:AC-307 duplicar chama a rota e a cópia volta como rascunho", async () => {
    const copia = {
      ...PUBLICADO,
      id: "p-3",
      nome: "Pastel de queijo (cópia)",
      status: "DRAFT",
      disponivel: false,
    };
    const chamadas = roteiro(
      async () => json({ produtos: [PUBLICADO] }),
      async () => json(copia, 201),
      async () => json({ produtos: [PUBLICADO, copia] }),
    );
    const tela = await montar();

    await clicar(botao(tela, "Duplicar"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/produtos/p-1/duplicar",
      metodo: "POST",
    });
    const itens = [...tela.querySelectorAll("ul > li")].map(
      (item) => item.textContent ?? "",
    );
    expect(itens[1]).toContain("Pastel de queijo (cópia)");
    expect(itens[1]).toContain("Rascunho");
  });

  it("@spec:AC-307 remover pede confirmação na própria linha e só então apaga", async () => {
    const chamadas = roteiro(
      async () => json({ produtos: [PUBLICADO] }),
      async () => new Response(null, { status: 204 }),
    );
    const tela = await montar();

    await clicar(botao(tela, "Remover Pastel de queijo"));
    expect(chamadas).toHaveLength(1);
    expect(tela.querySelector('[role="group"]')?.textContent).toContain(
      "Pedidos que já o incluíram continuam como foram feitos",
    );

    await clicar(botao(tela, "Confirmar remoção"));
    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/produtos/p-1",
      metodo: "DELETE",
    });
    expect(tela.querySelector("ul")).toBeNull();
  });
});

describe("o cartão da vitrine mostra a foto sem distorcer (AC-304)", () => {
  // Caminho montado a partir do texto do endereço: no ambiente de navegador
  // simulado, `URL` é a do jsdom, e o Node recusa convertê-la em caminho.
  const CSS = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../packages/ui/styles/vitrine.css",
    ),
    "utf8",
  );

  function regra(seletor: string): string {
    const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const achada = new RegExp(`${escapado}\\s*\\{([^}]*)\\}`).exec(CSS);
    if (!achada) throw new Error(`regra ${seletor} ausente`);
    return achada[1] ?? "";
  }

  it("@spec:AC-304 a foto do produto entra com o espaço reservado e sem texto repetido", () => {
    const html = renderToStaticMarkup(
      <CartaoDeProduto
        produto={{
          id: "p-1",
          apelido: "pastel-de-queijo",
          nome: "Pastel de queijo",
          chamada: null,
          preco: "R$ 19,90",
          precoCentavos: 1990,
          precoAnterior: null,
          imagem:
            "https://res.cloudinary.com/simpleclick/image/upload/v1/pastel.jpg",
          disponivel: true,
          link: "/l/loja/produto/pastel-de-queijo",
        }}
      />,
    );

    expect(html).toContain('class="sc-vitrine__moldura"');
    expect(html).toMatch(/<img[^>]*class="sc-vitrine__foto"/);
    expect(html).toMatch(/<img[^>]*width="320"/);
    expect(html).toMatch(/<img[^>]*height="240"/);
  });

  it("@spec:AC-304 a moldura tem proporção fixa e a foto a preenche por corte, sem estourar a coluna", () => {
    const moldura = regra(".sc-vitrine__moldura");
    const foto = regra(".sc-vitrine__foto");
    const cartao = regra(".sc-vitrine__cartao");

    expect(moldura).toContain("aspect-ratio: 4 / 3");
    expect(moldura).toContain("inline-size: 100%");
    // Cortar em vez de esticar: é isso que impede a distorção.
    expect(foto).toContain("object-fit: cover");
    expect(foto).toContain("inline-size: 100%");
    expect(foto).toContain("block-size: 100%");
    expect(cartao).toContain("inline-size: 100%");
    expect(cartao).toContain("overflow: clip");
    // Duas colunas de 9rem cabem no menor celular suportado (344px).
    expect(regra(".sc-vitrine__grade")).toContain(
      "repeat(auto-fill, minmax(9rem, 1fr))",
    );
  });
});

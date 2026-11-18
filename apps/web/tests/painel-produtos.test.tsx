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

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListaProdutos } from "../src/features/painel-catalogo/ListaProdutos";
import { CartaoDeProduto } from "../src/features/vitrine/GradeDeProdutos";

// O teste renderiza o HTML do cartão sem o runtime do Next. A configuração
// real da aplicação autoriza o Cloudinary; aqui basta preservar os atributos
// que o navegador recebe, sem executar o loader padrão do framework.
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    ...props
  }: ComponentProps<"img"> & {
    readonly priority?: boolean;
  }) => <img {...props} />,
}));

interface Chamada {
  readonly url: string;
  readonly metodo: string;
}

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  // A consulta da lista mora no endereço: cada teste começa do zero.
  window.history.replaceState(null, "", "/");
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

/**
 * A página que a API devolve (card #76): a lista já filtrada e os atalhos
 * contados na loja toda (`daLoja`, quando o filtro deixou só parte).
 */
function pagina(
  produtos: readonly Record<string, unknown>[],
  daLoja: readonly Record<string, unknown>[] = produtos,
) {
  return {
    produtos,
    pagina: 1,
    porPagina: 50,
    total: produtos.length,
    totalDePaginas: 1,
    resumo: {
      todos: daLoja.length,
      estoqueBaixo: daLoja.filter((p) => p.estoqueBaixo === true).length,
      comAtacado: daLoja.filter(
        (p) => typeof p.pedidoMinimoDeAtacado === "number",
      ).length,
    },
    categorias: [],
    marcas: [],
  };
}

async function assentar(): Promise<void> {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
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
  await assentar();
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
      async () => json(pagina([])),
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
    const chamadas = roteiro(async () => json(pagina([PUBLICADO, RASCUNHO])));
    const tela = await montar();

    const itens = [...tela.querySelectorAll("tbody tr")].map(
      (item) => item.textContent ?? "",
    );
    expect(itens[0]).toContain("Pastel de queijo");
    expect(itens[0]).toContain("Publicado");
    // O formatador brasileiro separa o símbolo com espaço inquebrável.
    expect(itens[0]).toMatch(/R\$\s19,90/);
    expect(itens[1]).toContain("Pastel de camarão");
    expect(itens[1]).toContain("Rascunho");
    // A lista pede UMA página ao servidor (card #76), nunca a loja inteira.
    expect(chamadas[0]?.url).toBe("/api/catalogo/produtos?pagina=1");
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
      async () => json(pagina([PUBLICADO])),
      async () => json(copia, 201),
      async () => json(pagina([PUBLICADO, copia])),
    );
    const tela = await montar();

    await clicar(botao(tela, "Duplicar"));

    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/produtos/p-1/duplicar",
      metodo: "POST",
    });
    const itens = [...tela.querySelectorAll("tbody tr")].map(
      (item) => item.textContent ?? "",
    );
    expect(itens[1]).toContain("Pastel de queijo (cópia)");
    expect(itens[1]).toContain("Rascunho");
  });

  it("@spec:AC-307 remover pede confirmação na própria linha e só então apaga", async () => {
    const chamadas = roteiro(
      async () => json(pagina([PUBLICADO])),
      async () => new Response(null, { status: 204 }),
      // Depois de remover, a página é relida (o próximo sobe para o lugar).
      async () => json(pagina([])),
    );
    const tela = await montar();

    // A ação mora no menu da própria linha do produto.
    const linha = [...tela.querySelectorAll<HTMLElement>("tbody tr")].find(
      (candidata) => candidata.textContent?.includes("Pastel de queijo"),
    );
    if (!linha) throw new Error("linha do produto ausente");
    await clicar(botao(linha, "Remover"));
    expect(chamadas).toHaveLength(1);
    expect(
      tela.querySelector('[role="group"][aria-label^="Confirmar a remoção"]')
        ?.textContent,
    ).toContain("Pedidos que já o incluíram continuam como foram feitos");

    await clicar(botao(tela, "Confirmar remoção"));
    expect(chamadas[1]).toEqual({
      url: "/api/catalogo/produtos/p-1",
      metodo: "DELETE",
    });
    expect(tela.querySelector("table")).toBeNull();
  });
});

/** Finge a largura da tela: `true` = a partir de 48rem (computador). */
function larguraDeComputador(computador: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((consulta: string) => ({
      // A lista pergunta "é celular?" (abaixo de 48rem).
      matches: consulta.includes("max-width: 47.99rem") ? !computador : false,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("a lista de produtos no celular é de cartões (#112 AC-11218, #133)", () => {
  it("@spec:AC-11218 abaixo de 48rem não há tabela: cada produto é um cartão com nome, preço, situação e ações", async () => {
    larguraDeComputador(false);
    roteiro(async () => json(pagina([PUBLICADO, RASCUNHO])));
    const tela = await montar();

    expect(tela.querySelector("table")).toBeNull();
    const lista = tela.querySelector('ul[aria-label="Produtos do catálogo"]');
    expect(lista).not.toBeNull();
    const cartoes = [...(lista?.querySelectorAll(":scope > li") ?? [])];
    expect(cartoes).toHaveLength(2);
    const primeiro = cartoes[0]?.textContent ?? "";
    expect(primeiro).toContain("Pastel de queijo");
    expect(primeiro).toContain("Pastéis");
    expect(primeiro).toMatch(/R\$\s19,90/);
    expect(primeiro).toContain("Publicado");
    expect(cartoes[1]?.textContent).toContain("Rascunho");
    // Os rótulos que o cabeçalho da coluna dava viram termos da lista.
    expect(
      [...(cartoes[0]?.querySelectorAll("dt") ?? [])].map((d) => d.textContent),
    ).toEqual(["Categoria", "Preço", "Estoque"]);
    // O nome leva à edição e as ações continuam no cartão.
    expect(
      cartoes[0]?.querySelector('a[href="/painel/produtos/p-1"]'),
    ).not.toBeNull();
    expect(cartoes[0]?.querySelector("button")).not.toBeNull();
  });

  it("@spec:AC-11218 a partir de 48rem a lista continua uma tabela com cabeçalho", async () => {
    larguraDeComputador(true);
    roteiro(async () => json(pagina([PUBLICADO])));
    const tela = await montar();

    expect(tela.querySelector("table")).not.toBeNull();
    expect(tela.querySelector("thead th")).not.toBeNull();
    expect(tela.querySelector('ul[aria-label="Produtos do catálogo"]')).toBeNull();
  });
});

describe("o que está acabando aparece para o dono repor (AC-336)", () => {
  const ACABANDO = {
    ...PUBLICADO,
    id: "p-4",
    nome: "Camiseta Básica",
    estoqueBaixo: true,
    variacoesAcabando: [
      { id: "v-m", nome: "M", quantidade: 3, minimoAlerta: 5 },
    ],
  };
  const EM_DIA = { ...PUBLICADO, estoqueBaixo: false, variacoesAcabando: [] };

  it("@spec:AC-336 o produto com variação no aviso vem sinalizado, dizendo qual e quanto resta", async () => {
    roteiro(async () => json(pagina([EM_DIA, ACABANDO])));
    const tela = await montar();

    const itens = [...tela.querySelectorAll("tbody tr")];
    expect(itens[0]?.textContent).not.toContain("Estoque baixo");
    expect(itens[1]?.textContent).toContain("Estoque baixo");
    expect(itens[1]?.textContent).toContain("M com 3 un. (aviso em 5)");
    expect(
      itens[1]?.querySelector('a[href="/painel/produtos/p-4/estoque"]')
        ?.textContent,
    ).toContain("Repor estoque");
  });

  it("@spec:AC-336 a visão do que está acabando mostra só o que precisa de reposição", async () => {
    const chamadas = roteiro(
      async () => json(pagina([EM_DIA, ACABANDO])),
      async () => json(pagina([ACABANDO], [EM_DIA, ACABANDO])),
      async () => json(pagina([EM_DIA, ACABANDO])),
    );
    const tela = await montar();

    await clicar(botao(tela, "Acabando (1)"));
    await assentar();
    // O recorte é feito no servidor e fica no endereço da página.
    expect(chamadas[1]?.url).toBe(
      "/api/catalogo/produtos?estoque=baixo&pagina=1",
    );
    expect(window.location.search).toBe("?estoque=baixo");
    let nomes = [...tela.querySelectorAll("tbody tr")].map(
      (linha) => linha.querySelector("a")?.textContent,
    );
    expect(nomes).toEqual(["Camiseta Básica"]);

    await clicar(botao(tela, "Acabando (1)"));
    await assentar();
    nomes = [...tela.querySelectorAll("tbody tr")].map(
      (linha) => linha.querySelector("a")?.textContent,
    );
    expect(nomes).toEqual(["Pastel de queijo", "Camiseta Básica"]);
  });

  it("@spec:AC-336 sem nada acabando, a lista não oferece o recorte", async () => {
    roteiro(async () => json(pagina([EM_DIA])));
    const tela = await montar();

    expect(
      [...tela.querySelectorAll("button")].some((b) =>
        (b.textContent ?? "").includes("Acabando"),
      ),
    ).toBe(false);
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
          link: "/loja/loja/produto/pastel-de-queijo",
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

    // Quadrada no celular (duas colunas), 4:3 a partir do dobrável aberto:
    // a proporção é sempre fixa, que é o que reserva o espaço.
    expect(moldura).toContain("aspect-ratio: 1");
    expect(CSS).toMatch(
      /@media \(min-width: 540px\)[\s\S]*\.sc-vitrine__moldura\s*\{[^}]*aspect-ratio: 4 \/ 3/,
    );
    expect(moldura).toContain("inline-size: 100%");
    // Cortar em vez de esticar: é isso que impede a distorção.
    expect(foto).toContain("object-fit: cover");
    expect(foto).toContain("inline-size: 100%");
    expect(foto).toContain("block-size: 100%");
    expect(cartao).toContain("inline-size: 100%");
    expect(cartao).toContain("overflow: clip");
    // No menor celular suportado (344px) as colunas encolhem até zero em vez
    // de empurrar a página para o lado.
    expect(regra(".sc-vitrine__grade")).toContain("minmax(0, 1fr)");
  });
});

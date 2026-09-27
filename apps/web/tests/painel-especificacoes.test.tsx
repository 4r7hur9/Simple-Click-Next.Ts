// @vitest-environment jsdom
/**
 * Prova das telas do criador de especificações (AC-325, AC-326, AC-327,
 * AC-330).
 *
 * A regra está provada contra o banco em
 * `apps/api/tests/especificacoes-do-painel.int.test.ts`. Aqui se prova a
 * conversa da tela com a rota: o que o dono preenche é o que vai para a API,
 * o aviso de impacto aparece ANTES da alteração, e o formulário do produto não
 * deixa salvar com a obrigatória em branco.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navegacao = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navegacao, back: vi.fn() }),
}));

import {
  CamposDeEspecificacao,
  conferirEspecificacoes,
  type EspecificacaoHerdada,
} from "../src/features/painel-catalogo/CamposDeEspecificacao";
import { EditorEspecificacoes } from "../src/features/painel-catalogo/EditorEspecificacoes";
import { FormularioProduto } from "../src/features/painel-catalogo/FormularioProduto";

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
  navegacao.push.mockReset();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Troca o `fetch` por um roteiro e registra o que a tela mandou. */
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

/** Digita como o navegador: o React só ouve o valor que passa pelo setter nativo. */
async function digitar(
  campo: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  valor: string,
): Promise<void> {
  const prototipo = Object.getPrototypeOf(campo) as object;
  const setter = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  await act(async () => {
    setter?.call(campo, valor);
    campo.dispatchEvent(
      new Event(campo instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function enviar(formulario: HTMLFormElement | null): Promise<void> {
  if (formulario === null) throw new Error("formulário ausente");
  await act(async () => {
    formulario.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

const ARO = {
  id: "esp-aro",
  categoriaId: "cat-pneus",
  nome: "Aro",
  tipo: "lista" as const,
  unidade: "pol",
  obrigatoria: true,
  filtravel: true,
  opcoes: ["13", "14", "15", "16"],
  ordem: 1,
  versao: 1,
  removidaEm: null,
  produtos: 20,
};
const LARGURA = {
  id: "esp-largura",
  categoriaId: "cat-pneus",
  nome: "Largura",
  tipo: "numero" as const,
  unidade: "mm",
  obrigatoria: true,
  filtravel: false,
  opcoes: [],
  ordem: 0,
  versao: 1,
  removidaEm: null,
  produtos: 0,
};
const INDICE = {
  ...LARGURA,
  id: "esp-indice",
  nome: "Índice de carga",
  unidade: null,
  obrigatoria: false,
  ordem: 2,
};

const ENDERECO = "/api/catalogo/categorias/cat-pneus/especificacoes";

describe("o criador de especificações da categoria (AC-325)", () => {
  it("@spec:AC-325 @principle:P-011 carregando, erro com tentar de novo, e vazio têm cara própria", async () => {
    roteiro(
      async () => json({ erro: "falhou" }, 500),
      async () => json({ especificacoes: [] }),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível carregar",
    );
    await clicar(botao(tela, "Tentar de novo"));
    expect(tela.textContent).toContain("Nenhuma especificação criada ainda");
  });

  it("@spec:AC-325 criar manda nome, tipo, unidade, lista, obrigatória e filtro", async () => {
    const chamadas = roteiro(
      async () => json({ especificacoes: [] }),
      async () => json(ARO, 201),
      async () => json({ especificacoes: [ARO] }),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    const formulario = [...tela.querySelectorAll("form")].at(-1) ?? null;
    const [nome, unidade] = [
      ...(formulario?.querySelectorAll<HTMLInputElement>("input.sc-campo") ??
        []),
    ];
    const tipo = formulario?.querySelector("select");
    if (!nome || !unidade || !tipo) throw new Error("formulário incompleto");
    await digitar(nome, "Aro");
    await digitar(tipo, "lista");
    await digitar(unidade, "pol");
    const opcoes = formulario?.querySelector("textarea");
    if (!opcoes) throw new Error("a lista deveria pedir as opções");
    await digitar(opcoes, "13, 14, 15, 16");
    for (const caixa of formulario?.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    ) ?? []) {
      await clicar(caixa);
    }
    await enviar(formulario);

    expect(chamadas[1]).toEqual({
      url: ENDERECO,
      metodo: "POST",
      corpo: {
        nome: "Aro",
        tipo: "lista",
        unidade: "pol",
        opcoes: ["13", "14", "15", "16"],
        obrigatoria: true,
        filtravel: true,
      },
    });
    const item = tela.querySelector("ol > li")?.textContent ?? "";
    expect(item).toContain("Aro");
    expect(item).toContain("Lista de opções · pol · obrigatória");
    expect(item).toContain("filtro da vitrine");
  });
});

describe("ordem, lista e alterações com aviso (AC-326, AC-327, AC-330)", () => {
  it("@spec:AC-326 subir uma especificação envia a nova ordem inteira", async () => {
    const chamadas = roteiro(
      async () => json({ especificacoes: [LARGURA, ARO, INDICE] }),
      async () => json({ especificacoes: [ARO, LARGURA, INDICE] }),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    await clicar(botao(tela, "Subir Aro"));

    expect(chamadas[1]).toEqual({
      url: ENDERECO,
      metodo: "PUT",
      corpo: { ids: ["esp-aro", "esp-largura", "esp-indice"] },
    });
  });

  it("@spec:AC-327 acrescentar um valor à lista manda só o valor novo", async () => {
    const chamadas = roteiro(
      async () => json({ especificacoes: [ARO] }),
      async () => json({ ...ARO, opcoes: [...ARO.opcoes, "17"] }),
      async () =>
        json({ especificacoes: [{ ...ARO, opcoes: [...ARO.opcoes, "17"] }] }),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    const campo = tela.querySelector<HTMLInputElement>(
      'input[placeholder="Acrescentar valor"]',
    );
    if (!campo) throw new Error("sem o campo de nova opção");
    await digitar(campo, "17");
    await clicar(botao(tela, "Acrescentar opção"));

    expect(chamadas[1]).toEqual({
      url: `${ENDERECO}/esp-aro/opcoes`,
      metodo: "POST",
      corpo: { valor: "17" },
    });
    expect(tela.textContent).toContain("Opções: 13, 14, 15, 16, 17");
  });

  it("@spec:AC-330 renomear com produto afetado mostra quantos, e só aplica ao confirmar", async () => {
    const aviso =
      "Renomear Aro afetará 20 produto(s). Os valores ficam, e o nome anterior fica no histórico.";
    const chamadas = roteiro(
      async () => json({ especificacoes: [ARO] }),
      async () => json({ erro: "confirmacao_necessaria", aviso }, 409),
      async () => json({ ...ARO, nome: "Diâmetro do aro", versao: 2 }),
      async () =>
        json({ especificacoes: [{ ...ARO, nome: "Diâmetro do aro" }] }),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    await clicar(botao(tela, "Renomear"));
    const campo = tela.querySelector<HTMLInputElement>(
      'input[maxlength="120"][required]',
    );
    if (!campo) throw new Error("sem o campo do novo nome");
    await digitar(campo, "Diâmetro do aro");
    await enviar(campo.closest("form"));

    expect(chamadas[1]).toMatchObject({
      metodo: "PATCH",
      corpo: { nome: "Diâmetro do aro" },
    });
    const dialogo = tela.querySelector('[role="alertdialog"]');
    expect(dialogo?.textContent).toContain("20 produto(s)");
    // Nada mudou ainda: a lista continua com o nome antigo.
    expect(tela.querySelector("ol h3")?.textContent).toBe("Aro");

    await clicar(botao(tela, "Confirmar novo nome"));
    expect(chamadas[2]).toEqual({
      url: `${ENDERECO}/esp-aro`,
      metodo: "PATCH",
      corpo: { nome: "Diâmetro do aro", confirmado: true },
    });
    expect(tela.querySelector("ol h3")?.textContent).toBe("Diâmetro do aro");
  });

  it("@spec:AC-330 remover avisa quantos produtos serão afetados, e desistir não muda nada", async () => {
    const aviso =
      "Remover Aro afetará 20 produto(s). Os valores serão preservados no histórico.";
    const chamadas = roteiro(
      async () => json({ especificacoes: [ARO] }),
      async () => json({ erro: "confirmacao_necessaria", aviso }, 409),
    );
    const tela = await montar(<EditorEspecificacoes categoriaId="cat-pneus" />);

    await clicar(botao(tela, "Remover Aro"));
    expect(chamadas[1]).toEqual({
      url: `${ENDERECO}/esp-aro`,
      metodo: "DELETE",
      corpo: {},
    });
    expect(tela.querySelector('[role="alertdialog"]')?.textContent).toContain(
      aviso,
    );

    await clicar(botao(tela, "Desistir"));
    expect(tela.querySelector('[role="alertdialog"]')).toBeNull();
    expect(chamadas).toHaveLength(2);
    expect(tela.querySelector("ol h3")?.textContent).toBe("Aro");
  });
});

describe("o produto herda as especificações da categoria (AC-326, AC-327)", () => {
  const HERDADAS: EspecificacaoHerdada[] = [LARGURA, ARO, INDICE];

  it("@spec:AC-326 os campos aparecem na ordem da categoria, com a obrigatória marcada", async () => {
    roteiro(async () => json({ especificacoes: HERDADAS }));
    const carregadas = vi.fn();
    const tela = await montar(
      <CamposDeEspecificacao
        categoriaId="cat-pneus"
        valores={{}}
        erros={{}}
        aoMudar={() => {}}
        aoCarregar={carregadas}
      />,
    );

    expect(
      [...tela.querySelectorAll("label")].map((rotulo) => rotulo.textContent),
    ).toEqual(["Largura (mm) *", "Aro (pol) *", "Índice de carga"]);
    expect(carregadas).toHaveBeenCalledWith(HERDADAS);
  });

  it("@spec:AC-326 obrigatória em branco é apontada antes de salvar", () => {
    expect(conferirEspecificacoes(HERDADAS, { "esp-largura": 195 })).toEqual({
      "esp-aro": "Aro é obrigatória.",
    });
    expect(
      conferirEspecificacoes(HERDADAS, { "esp-largura": 195, "esp-aro": "15" }),
    ).toEqual({});
  });

  it("@spec:AC-327 a lista só oferece os valores cadastrados, e recusa o que não está nela", async () => {
    roteiro(async () => json({ especificacoes: [ARO] }));
    const tela = await montar(
      <CamposDeEspecificacao
        categoriaId="cat-pneus"
        valores={{}}
        erros={{}}
        aoMudar={() => {}}
        aoCarregar={() => {}}
      />,
    );

    expect(
      [...tela.querySelectorAll("select option")].map(
        (opcao) => opcao.textContent,
      ),
    ).toEqual(["Escolha…", "13", "14", "15", "16"]);
    expect(conferirEspecificacoes([ARO], { "esp-aro": "17" })).toEqual({
      "esp-aro": "Valor inválido para Aro. Escolha: 13, 14, 15, 16.",
    });
  });

  it("@spec:AC-326 o formulário do produto não salva com obrigatória em branco, e salva tudo quando preenchida", async () => {
    const chamadas = roteiro(
      async () => json({ categorias: [{ id: "cat-pneus", nome: "Pneus" }] }),
      async () => json({ especificacoes: [LARGURA, ARO] }),
      async () => json({ id: "prod-1" }, 201),
      async () => json({ produtoId: "prod-1", campos: [] }),
    );
    const tela = await montar(<FormularioProduto />);

    const nome = tela.querySelector<HTMLInputElement>(
      'input[placeholder="Ex.: Pastel de queijo"]',
    );
    const preco = tela.querySelector<HTMLInputElement>(
      'input[placeholder="19,90"]',
    );
    if (!nome || !preco) throw new Error("formulário incompleto");
    await digitar(nome, "Pneu 195/55 R15");
    await digitar(preco, "389,90");
    const largura = tela.querySelector<HTMLInputElement>(
      "#especificacao-esp-largura",
    );
    if (!largura) throw new Error("a Largura deveria ter sido herdada");
    await digitar(largura, "195");

    await enviar(tela.querySelector("form"));
    // Nada foi enviado: a obrigatória Aro está em branco.
    expect(chamadas).toHaveLength(2);
    expect(tela.textContent).toContain("Aro é obrigatória.");
    // O resto do preenchimento continua lá.
    expect(nome.value).toBe("Pneu 195/55 R15");

    const aro = tela.querySelector<HTMLSelectElement>("#especificacao-esp-aro");
    if (!aro) throw new Error("o Aro deveria ter sido herdado");
    await digitar(aro, "15");
    await enviar(tela.querySelector("form"));

    expect(chamadas[2]).toMatchObject({
      url: "/api/catalogo/produtos",
      metodo: "POST",
      corpo: { nome: "Pneu 195/55 R15", categoriaId: "cat-pneus" },
    });
    expect(chamadas[3]).toEqual({
      url: "/api/catalogo/produtos/prod-1/especificacoes",
      metodo: "PUT",
      corpo: { valores: { "esp-largura": 195, "esp-aro": "15" } },
    });
    expect(navegacao.push).toHaveBeenCalledWith("/painel/produtos");
  });
});

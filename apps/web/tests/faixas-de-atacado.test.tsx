// @vitest-environment jsdom
/**
 * Prova da seção "Preço de atacado" do cadastro do produto (card #55).
 *
 * As travas e a conta estão provadas no core (card #53) e na API (card #54).
 * Aqui se prova o que só a tela faz: ler o que o dono digitou, mostrar o preço
 * por peça enquanto ele digita, barrar antes do envio o que a API recusaria,
 * levar `faixasDeAtacado` à rota só quando a seção mudou e pôr a recusa 422
 * na linha certa.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const navegacao = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navegacao, back: vi.fn() }),
}));

import { FormularioProduto } from "../src/features/painel-catalogo/FormularioProduto";
import {
  atacadoInicial,
  lerAtacado,
  linhaNova,
  mudarModalidade,
  pedidoMinimoNaTela,
  precoDaLinha,
  type AtacadoNaTela,
  type FaixaGravada,
} from "../src/features/painel-catalogo/atacado/faixas-na-tela";
import { escolherNoSeletor } from "./apoio-seletor.ts";

function estado(
  tipo: AtacadoNaTela["tipo"],
  linhas: readonly [string, string][],
): AtacadoNaTela {
  return {
    modalidade: linhas.length > 1 ? "CRESCENTE" : "UNICA",
    tipo,
    linhas: linhas.map(([quantidade, desconto]) => ({
      ...linhaNova(),
      quantidade,
      desconto,
    })),
  };
}

describe("a leitura das faixas, espelhando o servidor", () => {
  it("campo vazio = só varejo: manda lista vazia", () => {
    expect(lerAtacado(estado("PERCENTUAL", [["", ""]]), 2_000)).toEqual({
      ok: true,
      faixas: [],
      origem: [],
    });
  });

  it("crescente em percentual vira o corpo da API, ignorando a linha em branco", () => {
    const leitura = lerAtacado(
      estado("PERCENTUAL", [
        ["10", "5"],
        ["", ""],
        ["50", "10%"],
      ]),
      2_000,
    );
    expect(leitura).toEqual({
      ok: true,
      faixas: [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
        { quantidadeMinima: 50, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
      ],
      origem: [0, 2],
    });
  });

  it("desconto em reais vai em centavos", () => {
    const leitura = lerAtacado(estado("VALOR", [["6", "2,50"]]), 2_000);
    expect(leitura).toMatchObject({
      ok: true,
      faixas: [{ quantidadeMinima: 6, tipoDeDesconto: "VALOR", desconto: 250 }],
    });
  });

  it("recusa com as mensagens do servidor, na linha da tela", () => {
    const problemas = (atacado: AtacadoNaTela, varejo = 2_000) => {
      const leitura = lerAtacado(atacado, varejo);
      return leitura.ok ? [] : leitura.problemas;
    };
    expect(problemas(estado("PERCENTUAL", [["1", "5"]]))).toEqual([
      { indice: 0, mensagem: "O atacado começa a partir de 2 unidades." },
    ]);
    expect(problemas(estado("PERCENTUAL", [["10", "100"]]))).toEqual([
      { indice: 0, mensagem: "O desconto percentual vai de 1% a 99%." },
    ]);
    expect(problemas(estado("VALOR", [["10", "20,00"]]))).toEqual([
      {
        indice: 0,
        mensagem:
          "O desconto em reais precisa ser menor que o preço do produto.",
      },
    ]);
    expect(
      problemas(
        estado("PERCENTUAL", [
          ["", ""],
          ["10", "10"],
          ["50", "5"],
        ]),
      ),
    ).toEqual([
      {
        indice: 2,
        mensagem: "Quem leva mais precisa ganhar um desconto maior.",
      },
    ]);
    expect(
      problemas(
        estado("PERCENTUAL", [
          ["10", "5"],
          ["10", "8"],
        ]),
      ),
    ).toEqual([
      { indice: 1, mensagem: "Já existe uma faixa com essa quantidade." },
    ]);
    expect(problemas(estado("PERCENTUAL", [["10", ""]]))).toEqual([
      { indice: 0, mensagem: "Informe o desconto da faixa." },
    ]);
    expect(problemas(estado("PERCENTUAL", [["dez", "7,5"]]))).toEqual([
      { indice: 0, mensagem: "Use um número inteiro de unidades." },
      { indice: 0, mensagem: "Use um percentual inteiro, de 1% a 99%." },
    ]);
  });

  it("o preço por peça e o pedido mínimo saem da regra do core", () => {
    const atacado = estado("PERCENTUAL", [
      ["50", "10"],
      ["10", "5"],
    ]);
    // 19,99 com 5% → 18,99 (o core arredonda o cobrado).
    expect(precoDaLinha(atacado.linhas[1]!, "PERCENTUAL", 1_999)).toEqual({
      caso: "ok",
      unitarioCentavos: 1_899,
      descontoPorUnidadeCentavos: 100,
    });
    expect(precoDaLinha(atacado.linhas[1]!, "PERCENTUAL", null)).toEqual({
      caso: "sem-varejo",
    });
    expect(
      precoDaLinha(
        { ...linhaNova(), quantidade: "5", desconto: "30,00" },
        "VALOR",
        2_000,
      ),
    ).toEqual({ caso: "nao-cabe" });
    expect(pedidoMinimoNaTela(atacado)).toBe(10);
  });

  it("carrega o gravado e troca de modalidade sem perder a primeira faixa", () => {
    const inicial = atacadoInicial([
      { quantidadeMinima: 50, tipoDeDesconto: "VALOR", desconto: 300 },
      { quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 150 },
    ]);
    expect(inicial.modalidade).toBe("CRESCENTE");
    expect(inicial.linhas.map((l) => [l.quantidade, l.desconto])).toEqual([
      ["10", "1,50"],
      ["50", "3,00"],
    ]);
    const unica = mudarModalidade(inicial, "UNICA");
    expect(unica.linhas.map((l) => l.quantidade)).toEqual(["10"]);
    expect(mudarModalidade(unica, "CRESCENTE").linhas).toHaveLength(2);
  });
});

// --- A tela -----------------------------------------------------------------

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

function respostas(porRota: Record<string, () => Response>): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      chamadas.push({
        url,
        metodo,
        corpo:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const resposta = porRota[`${metodo} ${url}`];
      if (resposta === undefined) {
        throw new Error(`chamada inesperada: ${metodo} ${url}`);
      }
      return resposta();
    }),
  );
  return chamadas;
}

function gravacao(chamadas: readonly Chamada[]): Chamada | undefined {
  return chamadas.find((chamada) => chamada.metodo !== "GET");
}

async function digitar(alvo: HTMLInputElement, valor: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(alvo, valor);
    alvo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function campo(dentro: HTMLElement, rotulo: string): HTMLInputElement {
  const achado = dentro.querySelector<HTMLInputElement>(
    `input[aria-label="${rotulo}"]`,
  );
  if (!achado) throw new Error(`nenhum campo "${rotulo}"`);
  return achado;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) => candidato.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

async function enviar(tela: HTMLElement): Promise<void> {
  await act(async () => {
    tela
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const PRODUTO = {
  id: "p-copo",
  nome: "Copo descartável",
  descricao: null,
  categoriaId: "c-desc",
  precoCentavos: 2_000,
  status: "PUBLISHED",
  disponivel: true,
  janelas: [],
};

async function montar(
  produto: typeof PRODUTO & {
    faixasDeAtacado?: readonly FaixaGravada[];
  },
  patch: () => Response = () => json({ id: PRODUTO.id }),
): Promise<{ tela: HTMLElement; chamadas: Chamada[] }> {
  const chamadas = respostas({
    "GET /api/catalogo/categorias": () =>
      json({ categorias: [{ id: "c-desc", nome: "Descartáveis" }] }),
    "GET /api/catalogo/categorias/c-desc/especificacoes": () =>
      json({ especificacoes: [] }),
    "GET /api/catalogo/produtos/p-copo/especificacoes": () =>
      json({ produtoId: "p-copo", campos: [], naoUsadas: [] }),
    "PATCH /api/catalogo/produtos/p-copo": patch,
  });
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<FormularioProduto produto={produto} />);
  });
  return { tela: container, chamadas };
}

describe("a seção 'Preço de atacado' no cadastro do produto", () => {
  it("nasce recolhida e, sem mexer nela, a edição não regrava as faixas", async () => {
    const { tela, chamadas } = await montar(PRODUTO);
    const sanfona = tela.querySelector("details");
    expect(sanfona?.textContent).toContain("Preço de atacado");
    expect(sanfona?.open).toBe(false);

    await enviar(tela);

    const corpo = gravacao(chamadas)?.corpo as Record<string, unknown>;
    expect(corpo).toBeDefined();
    expect("faixasDeAtacado" in corpo).toBe(false);
  });

  it("crescente: mostra o preço por peça e o pedido mínimo enquanto digita, e envia as faixas", async () => {
    const { tela, chamadas } = await montar(PRODUTO);
    await act(async () => {
      tela
        .querySelector<HTMLInputElement>(
          'input[type="radio"][value="CRESCENTE"]',
        )
        ?.click();
    });

    await digitar(campo(tela, "A partir de quantas unidades, faixa 1"), "10");
    await digitar(campo(tela, "Desconto, faixa 1"), "5");
    await digitar(campo(tela, "A partir de quantas unidades, faixa 2"), "50");
    await digitar(campo(tela, "Desconto, faixa 2"), "10");

    expect(tela.textContent).toContain("R$ 19,00 por unidade");
    expect(tela.textContent).toContain("R$ 18,00 por unidade");
    expect(tela.textContent).toContain("Pedido mínimo do atacado: 10 unidades");

    await enviar(tela);
    expect(gravacao(chamadas)?.corpo).toMatchObject({
      faixasDeAtacado: [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
        { quantidadeMinima: 50, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
      ],
    });
  });

  it("trocar para reais vale para todas as faixas e recalcula o preço", async () => {
    const { tela, chamadas } = await montar(PRODUTO);
    await digitar(campo(tela, "A partir de quantas unidades, faixa"), "6");
    const seletor = tela.querySelector<HTMLButtonElement>(
      'button[role="combobox"][aria-label="Tipo de desconto, faixa"]',
    );
    if (!seletor) throw new Error("sem o seletor do tipo");
    escolherNoSeletor(seletor, "VALOR");
    await digitar(campo(tela, "Desconto, faixa"), "2,50");
    expect(tela.textContent).toContain("R$ 17,50 por unidade");

    await enviar(tela);
    expect(gravacao(chamadas)?.corpo).toMatchObject({
      faixasDeAtacado: [
        { quantidadeMinima: 6, tipoDeDesconto: "VALOR", desconto: 250 },
      ],
    });
  });

  it("barra antes de enviar o que o servidor recusaria, com a mensagem na faixa", async () => {
    const { tela, chamadas } = await montar(PRODUTO);
    await digitar(campo(tela, "A partir de quantas unidades, faixa"), "1");
    await digitar(campo(tela, "Desconto, faixa"), "5");

    await enviar(tela);

    expect(gravacao(chamadas)).toBeUndefined();
    expect(tela.querySelector("details")?.open).toBe(true);
    expect(tela.textContent).toContain(
      "O atacado começa a partir de 2 unidades.",
    );
    expect(
      campo(tela, "A partir de quantas unidades, faixa").getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
  });

  it("a recusa 422 da API aparece na faixa certa", async () => {
    const { tela } = await montar(PRODUTO, () =>
      json(
        {
          erro: "faixas_invalidas",
          problemas: [{ indice: 0, mensagem: "Faixa recusada pela loja." }],
        },
        422,
      ),
    );
    await digitar(campo(tela, "A partir de quantas unidades, faixa"), "10");
    await digitar(campo(tela, "Desconto, faixa"), "5");

    await enviar(tela);

    expect(tela.textContent).toContain("Faixa recusada pela loja.");
    expect(navegacao.push).not.toHaveBeenCalled();
  });

  it("'Vender só no varejo' apaga as faixas gravadas", async () => {
    const { tela, chamadas } = await montar({
      ...PRODUTO,
      faixasDeAtacado: [
        {
          quantidadeMinima: 12,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 8,
          rotulo: null,
          ativo: true,
        },
      ],
    });
    expect(tela.querySelector("details")?.textContent).toContain(
      "a partir de 12 unidades",
    );
    await act(async () => botao(tela, "Vender só no varejo").click());

    await enviar(tela);
    expect(gravacao(chamadas)?.corpo).toMatchObject({ faixasDeAtacado: [] });
  });
});

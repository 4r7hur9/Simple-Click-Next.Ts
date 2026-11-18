// @vitest-environment jsdom
/**
 * Prova da gaveta do carrinho na tela (AC-500, AC-501).
 *
 * A regra de negócio já está provada contra o banco em
 * `apps/api/tests/carrinho.int.test.ts`. Aqui a pergunta é se o cliente
 * consegue OPERAR o carrinho — inclusive quem navega por teclado e ouve a
 * página —, e se cada um dos quatro estados aparece do jeito certo.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GavetaCarrinho } from "../src/features/carrinho/GavetaCarrinho";
import type {
  CarrinhoNaTela,
  UsoDoCarrinho,
} from "../src/features/carrinho/useCarrinho";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const CHEIO: CarrinhoNaTela = {
  itens: [
    {
      id: "i1",
      nome: "Marmita executiva",
      variacao: "Porção grande",
      quantidade: 2,
      precoUnitario: "R$ 20,00",
      totalDaLinha: "R$ 40,00",
      observacao: "sem cebola",
      opcoes: [{ grupoNome: "Acompanhamento", opcaoNome: "Farofa" }],
    },
    {
      id: "i2",
      nome: "Refrigerante lata",
      quantidade: 1,
      precoUnitario: "R$ 6,99",
      totalDaLinha: "R$ 6,99",
    },
  ],
  totalDeItens: 3,
  total: "R$ 46,99",
};

function usoCom(sobrescrita: Partial<UsoDoCarrinho> = {}): UsoDoCarrinho {
  return {
    situacao: "pronto",
    carrinho: CHEIO,
    erro: null,
    mudarQuantidade: async () => {},
    recarregar: async () => {},
    ...sobrescrita,
  };
}

function montar(uso: UsoDoCarrinho): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(<GavetaCarrinho carrinho={uso} linkDaVitrine="/loja/sabor" />),
  );
  return container;
}

function botaoPorRotulo(
  dentro: HTMLElement,
  trecho: string,
): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find((candidato) =>
    (candidato.getAttribute("aria-label") ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`nenhum botão com rótulo contendo "${trecho}"`);
  return achado;
}

describe("o carrinho mostra o que foi escolhido (AC-500)", () => {
  it("@spec:AC-500 cada item aparece com nome, variação, opções, observação e valor", () => {
    const tela = montar(usoCom());
    const texto = tela.textContent ?? "";

    expect(texto).toContain("Marmita executiva");
    expect(texto).toContain("Porção grande");
    expect(texto).toContain("Farofa");
    expect(texto).toContain("sem cebola");
    expect(texto).toContain("R$ 40,00");
  });

  it("@spec:AC-500 o cabeçalho traz a quantidade TOTAL de itens, não o número de linhas", () => {
    // Duas linhas, três itens. Mostrar "2" faria o número mentir para quem
    // pediu vários iguais.
    const tela = montar(usoCom());
    expect(tela.querySelector(".sc-carrinho-janela__selo")?.textContent).toBe(
      "3 itens",
    );
    expect(tela.querySelector("#titulo-do-carrinho")?.textContent).toBe(
      "Sua sacola, 3 itens",
    );
  });

  it("cada item mostra o acréscimo das opções e a descrição, sem foto", () => {
    const tela = montar(
      usoCom({
        carrinho: {
          ...CHEIO,
          itens: [
            {
              id: "i3",
              nome: "Pastel",
              quantidade: 1,
              precoUnitario: "R$ 10,00",
              totalDaLinha: "R$ 10,00",
              descricao: "Massa fina, frito na hora.",
              opcoes: [
                {
                  grupoNome: "Adicionais",
                  opcaoNome: "Catupiry",
                  acrescimo: "+ R$ 3,00",
                },
              ],
            },
          ],
        },
      }),
    );
    const texto = tela.textContent ?? "";
    expect(texto).toContain("+ R$ 3,00");
    expect(texto).toContain("Massa fina, frito na hora.");
    expect(texto).toContain("R$ 10,00 cada");
    expect(tela.querySelector(".sc-carrinho-janela__itens img")).toBeNull();
  });

  it("o rodapé tem o resumo e o 'Fechar pedido' na pílula verde", () => {
    container = document.createElement("div");
    document.body.append(container);
    raiz = createRoot(container);
    let fechou = false;
    act(() =>
      raiz?.render(
        <GavetaCarrinho
          carrinho={usoCom()}
          linkDaVitrine="/loja/sabor"
          aoFechar={() => {
            fechou = true;
          }}
        />,
      ),
    );
    const rodape = container.querySelector(".sc-carrinho-janela__rodape");
    expect(rodape?.textContent).toContain("Subtotal");
    expect(rodape?.textContent).toContain("Total");
    const fechar = rodape?.querySelector<HTMLButtonElement>(
      ".sc-carrinho-janela__acao",
    );
    expect(fechar?.textContent).toContain("Fechar pedido");
    act(() => fechar?.click());
    expect(fechou).toBe(true);
  });
});

describe("mudar quantidade e remover (AC-501)", () => {
  it("@spec:AC-501 mais e menos avisam a quantidade nova", async () => {
    const chamadas: [string, number][] = [];
    const tela = montar(
      usoCom({
        mudarQuantidade: async (id, q) => {
          chamadas.push([id, q]);
        },
      }),
    );

    await act(async () => {
      botaoPorRotulo(tela, "Aumentar quantidade de Marmita").click();
    });
    await act(async () => {
      botaoPorRotulo(tela, "Diminuir quantidade de Marmita").click();
    });

    expect(chamadas).toEqual([
      ["i1", 3],
      ["i1", 1],
    ]);
  });

  it("@spec:AC-501 no último item o botão de menos vira remover, e pede zero", async () => {
    // É o mesmo gesto que o cliente já ia fazer, e evita a dúvida entre clicar
    // em menos ou procurar um botão de remover.
    const chamadas: [string, number][] = [];
    const tela = montar(
      usoCom({
        mudarQuantidade: async (id, q) => {
          chamadas.push([id, q]);
        },
      }),
    );

    await act(async () => {
      botaoPorRotulo(tela, "Remover Refrigerante").click();
    });

    expect(chamadas).toEqual([["i2", 0]]);
  });

  it("@spec:AC-501 o rótulo acessível diz de qual item é cada botão", () => {
    // Numa lista de cinco, ouvir "diminuir" cinco vezes não diz nada a quem
    // não enxerga.
    const tela = montar(usoCom());
    const rotulos = [...tela.querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-label"),
    );

    expect(rotulos).toContain(
      "Aumentar quantidade de Marmita executiva (Porção grande)",
    );
    expect(rotulos).toContain("Remover Refrigerante lata do carrinho");
  });
});

describe("os quatro estados da gaveta (AC-501)", () => {
  it("@spec:AC-501 carrinho vazio convida a voltar à vitrine, em vez de ficar mudo", () => {
    // Uma gaveta vazia e muda é uma venda que termina ali.
    const tela = montar(
      usoCom({
        situacao: "vazio",
        carrinho: { itens: [], totalDeItens: 0, total: "R$ 0,00" },
      }),
    );

    expect(tela.textContent).toContain("sacola está vazia");
    const link = [...tela.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "/loja/sabor",
    );
    expect(link).toBeDefined();
  });

  it("@spec:AC-501 a espera é anunciada, e não fica em tela muda", () => {
    const tela = montar(usoCom({ situacao: "carregando", carrinho: null }));

    expect(tela.textContent).toContain("Carregando seu carrinho");
  });

  it("@spec:AC-501 falha ao carregar NÃO é confundida com carrinho vazio", () => {
    // Mandar a pessoa "voltar à vitrine" quando o que houve foi erro faria ela
    // achar que perdeu o que montou.
    const tela = montar(
      usoCom({
        situacao: "erro",
        erro: "Não conseguimos carregar seu carrinho. Tente de novo.",
      }),
    );

    expect(tela.textContent).toContain("Não deu para abrir o carrinho");
    expect(tela.textContent).not.toContain("sacola está vazia");
    expect(tela.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("@spec:AC-501 o erro oferece caminho de saída, e não só a má notícia", async () => {
    let recarregou = false;
    const tela = montar(
      usoCom({
        situacao: "erro",
        erro: "falhou",
        recarregar: async () => {
          recarregou = true;
        },
      }),
    );

    const tentar = [...tela.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Tentar de novo"),
    );
    await act(async () => {
      tentar?.click();
    });

    expect(recarregou).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * Prova da linha da sacola e da edição dos itens (card #110, T-11004).
 *
 * A conta do preço é do servidor: o serviço simulado devolve o que a API
 * devolveria, e a tela só mostra. Aqui a pergunta é se o cliente consegue
 * mudar a quantidade, ver o que escolheu e não ser enganado quando o servidor
 * falha.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GavetaCarrinho } from "../src/features/carrinho/GavetaCarrinho";
import {
  useCarrinho,
  type CarrinhoNaTela,
  type ItemNaTela,
  type ServicoDoCarrinho,
} from "../src/features/carrinho/useCarrinho";

// O React só aceita `act` quando o ambiente diz que é um teste.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

function item(sobrescrita: Partial<ItemNaTela> = {}): ItemNaTela {
  return {
    id: "i1",
    nome: "Camiseta lisa",
    quantidade: 2,
    precoUnitario: "R$ 20,00",
    totalDaLinha: "R$ 40,00",
    ...sobrescrita,
  };
}

function carrinhoCom(
  itens: readonly ItemNaTela[],
  total: string,
): CarrinhoNaTela {
  return {
    itens,
    totalDeItens: itens.reduce((soma, i) => soma + i.quantidade, 0),
    total,
  };
}

function Tela({ servico }: { readonly servico: ServicoDoCarrinho }) {
  const uso = useCarrinho(servico);
  return <GavetaCarrinho carrinho={uso} linkDaVitrine="/loja/sabor" />;
}

async function montar(servico: ServicoDoCarrinho): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<Tela servico={servico} />);
  });
  return container;
}

function botao(dentro: HTMLElement, trecho: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) =>
      (candidato.getAttribute("aria-label") ?? "").includes(trecho) ||
      (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`nenhum botão com "${trecho}"`);
  return achado;
}

async function tocar(alvo: HTMLElement) {
  await act(async () => {
    alvo.click();
  });
}

function contagemDaLinha(tela: HTMLElement): string {
  return tela.querySelector(".sc-carrinho-janela__contagem")?.textContent ?? "";
}

describe("[CA-7] mudar a quantidade e remover (AC-11007)", () => {
  it("[CA-7] @spec:AC-11007 + e − mostram a quantidade e o subtotal que o servidor devolveu", async () => {
    const mudarQuantidade = vi.fn(async (_id: string, quantidade: number) =>
      // O servidor aplica uma faixa de atacado: o valor NÃO é quantidade × 20.
      carrinhoCom(
        [
          item({
            quantidade,
            precoUnitario: "R$ 18,00",
            totalDaLinha: "R$ 54,00",
          }),
        ],
        "R$ 54,00",
      ),
    );
    const tela = await montar({
      ver: async () => carrinhoCom([item()], "R$ 40,00"),
      mudarQuantidade,
    });
    expect(contagemDaLinha(tela)).toBe("2");

    await tocar(botao(tela, "Aumentar quantidade"));

    expect(mudarQuantidade).toHaveBeenCalledWith("i1", 3);
    expect(contagemDaLinha(tela)).toBe("3");
    expect(tela.textContent).toContain("R$ 54,00");
    expect(tela.textContent).not.toContain("R$ 60,00");

    await tocar(botao(tela, "Diminuir quantidade"));
    expect(mudarQuantidade).toHaveBeenLastCalledWith("i1", 2);
  });

  it("[CA-7] @spec:AC-11007 − fica desabilitado na quantidade 1", async () => {
    const tela = await montar({
      ver: async () => carrinhoCom([item({ quantidade: 1 })], "R$ 20,00"),
      mudarQuantidade: async () => carrinhoCom([], "R$ 0,00"),
    });
    expect(botao(tela, "Diminuir quantidade").disabled).toBe(true);
  });

  it("[CA-7] @spec:AC-11007 remover tem nome acessível com o nome do produto e atualiza a sacola", async () => {
    const mudarQuantidade = vi.fn(async () => carrinhoCom([], "R$ 0,00"));
    const tela = await montar({
      ver: async () => carrinhoCom([item()], "R$ 40,00"),
      mudarQuantidade,
    });

    const remover = botao(tela, "Remover");
    expect(remover.getAttribute("aria-label")).toContain("Camiseta lisa");

    await tocar(remover);
    expect(mudarQuantidade).toHaveBeenCalledWith("i1", 0);
    expect(tela.textContent).toContain("Sua sacola está vazia");
  });
});

describe("[CA-8] a linha mostra o que foi escolhido e o atacado (AC-11008)", () => {
  it("[CA-8] @spec:AC-11008 variação, adicionais, atacado aplicado e varejo riscado", async () => {
    const tela = await montar({
      ver: async () =>
        carrinhoCom(
          [
            item({
              nome: "Pizza",
              quantidade: 10,
              variacao: "Grande",
              opcoes: [
                {
                  grupoNome: "Borda",
                  opcaoNome: "Catupiry",
                  acrescimo: "+ R$ 8,00",
                },
              ],
              precoUnitario: "R$ 17,00",
              precoDeVarejo: "R$ 20,00",
              faixaDoAtacado:
                "Caixa fechada: 5% de desconto a partir de 10 peças",
              avisoDoAtacado: null,
            }),
          ],
          "R$ 170,00",
        ),
      mudarQuantidade: async () => carrinhoCom([], "R$ 0,00"),
    });

    const texto = tela.textContent ?? "";
    expect(texto).toContain("Grande");
    expect(texto).toContain("Catupiry");
    expect(texto).toContain("+ R$ 8,00");
    expect(texto).toContain("Caixa fechada: 5% de desconto");
    expect(tela.querySelector("s")?.textContent).toContain("R$ 20,00");
    expect(texto).toContain("R$ 17,00");
  });

  it("[CA-8] @spec:AC-11008 com foto a linha mostra a imagem; sem foto, nenhuma imagem", async () => {
    const comFoto = await montar({
      ver: async () =>
        carrinhoCom(
          [
            item({
              foto: {
                url: "https://exemplo.test/camiseta.jpg",
                texto: null,
                largura: 96,
                altura: 96,
              },
            }),
          ],
          "R$ 40,00",
        ),
      mudarQuantidade: async () => carrinhoCom([], "R$ 0,00"),
    });
    const imagem = comFoto.querySelector("img");
    expect(imagem?.getAttribute("src")).toBe(
      "https://exemplo.test/camiseta.jpg",
    );
    // O espaço já é conhecido: a lista não pula quando a foto chega.
    expect(imagem?.getAttribute("width")).toBe("96");
    expect(imagem?.getAttribute("height")).toBe("96");

    act(() => raiz?.unmount());
    comFoto.remove();

    const semFoto = await montar({
      ver: async () => carrinhoCom([item()], "R$ 40,00"),
      mudarQuantidade: async () => carrinhoCom([], "R$ 0,00"),
    });
    expect(semFoto.querySelector("img")).toBeNull();
  });
});

describe("[CA-9] falha ao mudar a quantidade não engana o cliente (AC-11009)", () => {
  it("[CA-9] @spec:AC-11009 a linha volta à quantidade anterior, avisa e oferece tentar de novo", async () => {
    const mudarQuantidade = vi
      .fn<ServicoDoCarrinho["mudarQuantidade"]>()
      .mockRejectedValueOnce(new Error("servidor fora do ar"));
    const tela = await montar({
      ver: async () => carrinhoCom([item()], "R$ 40,00"),
      mudarQuantidade,
    });

    await tocar(botao(tela, "Aumentar quantidade"));

    // A lista NÃO some: a linha segue lá, com a quantidade de antes.
    expect(tela.querySelector(".sc-carrinho-janela__itens")).not.toBeNull();
    expect(contagemDaLinha(tela)).toBe("2");
    expect(tela.textContent).toContain("Não foi possível mudar a quantidade");
    expect(tela.textContent).toContain("R$ 40,00");

    // Tentar de novo repete a MESMA mudança e, dando certo, o aviso some.
    mudarQuantidade.mockResolvedValueOnce(
      carrinhoCom(
        [item({ quantidade: 3, totalDaLinha: "R$ 60,00" })],
        "R$ 60,00",
      ),
    );
    await tocar(botao(tela, "Tentar de novo"));

    expect(mudarQuantidade).toHaveBeenLastCalledWith("i1", 3);
    expect(contagemDaLinha(tela)).toBe("3");
    expect(tela.textContent).not.toContain(
      "Não foi possível mudar a quantidade",
    );
  });
});

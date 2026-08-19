// @vitest-environment jsdom
/**
 * Prova do estado do carrinho na tela (AC-501, AC-502).
 *
 * O que se prova aqui é a máquina de estados, e sobretudo UMA regra: erro tem
 * precedência sobre vazio. Um carrinho que não carregou não é um carrinho
 * vazio, e a tela que confunde os dois manda a pessoa "voltar à vitrine" logo
 * depois de ela ter montado o pedido.
 */
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  useCarrinho,
  type CarrinhoNaTela,
  type ServicoDoCarrinho,
  type UsoDoCarrinho,
} from "./useCarrinho.ts";

const CHEIO: CarrinhoNaTela = {
  itens: [
    {
      id: "i1",
      nome: "Marmita",
      quantidade: 2,
      precoUnitario: "R$ 20,00",
      totalDaLinha: "R$ 40,00",
    },
  ],
  totalDeItens: 2,
  total: "R$ 40,00",
};

const VAZIO: CarrinhoNaTela = { itens: [], totalDeItens: 0, total: "R$ 0,00" };

/**
 * Roda o gancho num componente de sonda e devolve o último estado visto.
 *
 * A sonda existe porque gancho de React só roda dentro de componente. Ela não
 * desenha nada: guarda o que o gancho devolveu a cada renderização.
 */
async function usarGancho(
  servico: ServicoDoCarrinho,
): Promise<{ atual: () => UsoDoCarrinho }> {
  let ultimo: UsoDoCarrinho | null = null;

  function Sonda() {
    ultimo = useCarrinho(servico);
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const raiz = createRoot(container);
  await act(async () => {
    raiz.render(<Sonda />);
  });

  return {
    atual: () => {
      if (ultimo === null) throw new Error("a sonda não renderizou o gancho");
      return ultimo;
    },
  };
}

describe("estados do carrinho na tela (AC-501)", () => {
  it("@spec:AC-501 carrinho com itens fica pronto, com o total de itens somado", async () => {
    const { atual } = await usarGancho({
      ver: async () => CHEIO,
      mudarQuantidade: async () => CHEIO,
    });

    expect(atual().situacao).toBe("pronto");
    expect(atual().carrinho?.totalDeItens).toBe(2);
  });

  it("@spec:AC-501 carrinho sem itens fica vazio, e não pronto", async () => {
    const { atual } = await usarGancho({
      ver: async () => VAZIO,
      mudarQuantidade: async () => VAZIO,
    });

    expect(atual().situacao).toBe("vazio");
  });

  it("@spec:AC-501 falha ao carregar vira erro, e NUNCA vazio", async () => {
    // É a regra que mais importa neste arquivo: sem ela, quem tem falha de rede
    // vê "seu carrinho está vazio" e acha que perdeu o pedido que montou.
    const { atual } = await usarGancho({
      ver: async () => {
        throw new Error("rede caiu");
      },
      mudarQuantidade: async () => VAZIO,
    });

    expect(atual().situacao).toBe("erro");
    expect(atual().erro).toContain("Tente de novo");
  });

  it("@spec:AC-501 mudar quantidade atualiza o carrinho com o que o servidor devolveu", async () => {
    // O servidor é quem manda no número: aceitar o valor otimista da tela faria
    // o total divergir do que será cobrado.
    const depois: CarrinhoNaTela = {
      ...CHEIO,
      totalDeItens: 5,
      total: "R$ 100,00",
    };
    const { atual } = await usarGancho({
      ver: async () => CHEIO,
      mudarQuantidade: async () => depois,
    });

    await act(async () => {
      await atual().mudarQuantidade("i1", 5);
    });

    expect(atual().carrinho?.total).toBe("R$ 100,00");
  });

  it("@spec:AC-501 falha ao mudar quantidade avisa sem apagar o que já estava na tela", async () => {
    const { atual } = await usarGancho({
      ver: async () => CHEIO,
      mudarQuantidade: async () => {
        throw new Error("rede caiu");
      },
    });

    await act(async () => {
      await atual().mudarQuantidade("i1", 5);
    });

    expect(atual().situacao).toBe("erro");
    // O que já estava na tela continua lá: apagar faria a pessoa achar que o
    // carrinho se perdeu por causa de um toque que não funcionou.
    expect(atual().carrinho?.itens).toHaveLength(1);
  });

  it("@spec:AC-502 recarregar busca o carrinho de novo, que é o que sobrevive ao recarregar a página", async () => {
    let respostas = 0;
    const { atual } = await usarGancho({
      ver: async () => {
        respostas += 1;
        return respostas === 1 ? VAZIO : CHEIO;
      },
      mudarQuantidade: async () => CHEIO,
    });

    expect(atual().situacao).toBe("vazio");

    await act(async () => {
      await atual().recarregar();
    });

    expect(atual().situacao).toBe("pronto");
  });
});

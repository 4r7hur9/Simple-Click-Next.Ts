/**
 * Prova da conferência do carrinho (AC-503, AC-504, P-006).
 *
 * O que está sob prova é de onde vem o número. Ler preço do que o navegador
 * manda foi o erro da primeira versão deste produto, e é o que permite a
 * alguém fechar um pedido de mil reais por um.
 */
import { describe, expect, it } from "vitest";

import {
  conferirCarrinho,
  type ItemParaConferir,
  type ProdutoAgora,
} from "./pedido-total.ts";

const MARMITA: ProdutoAgora = {
  produtoId: "p1",
  nome: "Marmita executiva",
  precoEmCentavos: 2000,
  disponivel: true,
};
const REFRIGERANTE: ProdutoAgora = {
  produtoId: "p2",
  nome: "Refrigerante lata",
  precoEmCentavos: 699,
  disponivel: true,
};

const DUAS_MARMITAS: ItemParaConferir = {
  itemId: "i1",
  produtoId: "p1",
  quantidade: 2,
  precoVistoEmCentavos: 2000,
};

describe("o total vem do servidor, sempre (AC-504, P-006)", () => {
  it("@spec:AC-504 @principle:P-006 o preço da conta é o do catálogo, e não o que a tela mostrou", () => {
    // A tela mostrou R$ 20,00; o catálogo diz R$ 25,00. A conta usa 25.
    const carrinho: ItemParaConferir[] = [
      { ...DUAS_MARMITAS, precoVistoEmCentavos: 2000 },
    ];
    const catalogo = [{ ...MARMITA, precoEmCentavos: 2500 }];

    const conferido = conferirCarrinho(carrinho, catalogo);

    expect(conferido.itensQueSeguem[0]?.precoUnitarioEmCentavos).toBe(2500);
    expect(conferido.subtotalEmCentavos).toBe(5000);
  });

  it("@spec:AC-504 @principle:P-006 total manipulado pelo cliente é descartado e a divergência fica marcada", () => {
    // Alguém envia "total: R$ 1,00" num carrinho de R$ 40,00. O pedido sai por
    // 40, e o fato de terem tentado fica registrado.
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA], 100);

    expect(conferido.subtotalEmCentavos).toBe(4000);
    expect(conferido.houveDivergencia).toBe(true);
    expect(conferido.totalQueOClienteEnviouEmCentavos).toBe(100);
  });

  it("@spec:AC-504 total enviado que bate com o do servidor não marca divergência", () => {
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA], 4000);

    expect(conferido.houveDivergencia).toBe(false);
  });

  it("@spec:AC-504 cliente que não envia total nenhum não é acusado de divergência", () => {
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA]);

    expect(conferido.houveDivergencia).toBe(false);
    expect(conferido.subtotalEmCentavos).toBe(4000);
  });
});

describe("o que mudou é dito item por item (AC-503)", () => {
  it("@spec:AC-503 preço que subiu é avisado com os dois valores", () => {
    // "O preço mudou" não ajuda ninguém a decidir. Os dois valores, sim.
    const conferido = conferirCarrinho(
      [DUAS_MARMITAS],
      [{ ...MARMITA, precoEmCentavos: 2500 }],
    );

    expect(conferido.mudancas).toHaveLength(1);
    expect(conferido.mudancas[0]?.tipo).toBe("PRECO_SUBIU");
    expect(conferido.mudancas[0]?.explicacao).toContain("R$ 20,00");
    expect(conferido.mudancas[0]?.explicacao).toContain("R$ 25,00");
    expect(conferido.precisaConfirmar).toBe(true);
  });

  it("@spec:AC-503 preço que caiu também é avisado, e também pede confirmação", () => {
    // Parece exagero — é boa notícia. Mas o total deixou de ser o que a pessoa
    // viu, e tela que muda número sem avisar ensina o cliente a desconfiar dele.
    const conferido = conferirCarrinho(
      [DUAS_MARMITAS],
      [{ ...MARMITA, precoEmCentavos: 1800 }],
    );

    expect(conferido.mudancas[0]?.tipo).toBe("PRECO_CAIU");
    expect(conferido.precisaConfirmar).toBe(true);
    expect(conferido.subtotalEmCentavos).toBe(3600);
  });

  it("@spec:AC-503 item esgotado sai do carrinho e o motivo é dito pelo nome", () => {
    // Seguir com ele faria a cozinha receber um pedido que não tem como
    // preparar, e o cliente descobrir isso pelo telefone.
    const conferido = conferirCarrinho(
      [DUAS_MARMITAS, { itemId: "i2", produtoId: "p2", quantidade: 1 }],
      [MARMITA, { ...REFRIGERANTE, disponivel: false }],
    );

    expect(conferido.mudancas[0]?.tipo).toBe("INDISPONIVEL");
    expect(conferido.mudancas[0]?.explicacao).toContain("Refrigerante lata");
    expect(conferido.itensQueSeguem).toHaveLength(1);
    expect(conferido.subtotalEmCentavos).toBe(4000);
  });

  it("@spec:AC-503 item que saiu do catálogo é retirado sem quebrar o fechamento", () => {
    const conferido = conferirCarrinho(
      [DUAS_MARMITAS, { itemId: "i9", produtoId: "sumiu", quantidade: 3 }],
      [MARMITA],
    );

    expect(conferido.mudancas[0]?.tipo).toBe("SAIU_DO_CATALOGO");
    expect(conferido.itensQueSeguem).toHaveLength(1);
    expect(conferido.subtotalEmCentavos).toBe(4000);
  });

  it("@spec:AC-503 carrinho sem nenhuma mudança segue sem pedir confirmação", () => {
    // Pedir confirmação quando nada mudou treinaria o cliente a clicar em
    // "confirmar" sem ler — e aí o aviso deixa de proteger.
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA]);

    expect(conferido.mudancas).toEqual([]);
    expect(conferido.precisaConfirmar).toBe(false);
  });

  it("@spec:AC-503 várias mudanças aparecem todas, e não só a primeira", () => {
    const conferido = conferirCarrinho(
      [
        DUAS_MARMITAS,
        {
          itemId: "i2",
          produtoId: "p2",
          quantidade: 1,
          precoVistoEmCentavos: 699,
        },
      ],
      [
        { ...MARMITA, precoEmCentavos: 2500 },
        { ...REFRIGERANTE, precoEmCentavos: 799 },
      ],
    );

    expect(conferido.mudancas).toHaveLength(2);
    expect(conferido.mudancas.map((m) => m.tipo)).toEqual([
      "PRECO_SUBIU",
      "PRECO_SUBIU",
    ]);
  });

  it("@spec:AC-503 item sem preço visto não inventa mudança", () => {
    // Carrinho antigo pode não ter guardado o preço mostrado. Sem referência,
    // não há o que comparar — e inventar "mudou" assustaria à toa.
    const conferido = conferirCarrinho(
      [{ itemId: "i1", produtoId: "p1", quantidade: 2 }],
      [{ ...MARMITA, precoEmCentavos: 2500 }],
    );

    expect(conferido.mudancas).toEqual([]);
    expect(conferido.subtotalEmCentavos).toBe(5000);
  });
});

describe("a conferência inclui o que a pessoa escolheu (AC-503)", () => {
  const PRODUTO: ProdutoAgora = {
    produtoId: "p1",
    nome: "X-Salada",
    precoEmCentavos: 2000,
    disponivel: true,
  };

  it("@spec:AC-503 os acréscimos das opções entram na linha, e não saem de graça", () => {
    // Sem isto o bacon de R$ 3,00 sairia por zero: o carrinho guarda a escolha,
    // e o preço dela mora no catálogo.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 2,
          acrescimosEmCentavos: 300,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.itensQueSeguem[0]?.precoUnitarioEmCentavos).toBe(2300);
    expect(conferido.subtotalEmCentavos).toBe(4600);
  });

  it("@spec:AC-503 o preço da VARIANTE vence o do produto", () => {
    // Pizza P e G são o mesmo produto com preços diferentes.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: 6000,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.subtotalEmCentavos).toBe(6000);
  });

  it("@spec:AC-503 duas linhas do mesmo produto podem ter preços diferentes", () => {
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: 4000,
        },
        {
          itemId: "i2",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: 6000,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.subtotalEmCentavos).toBe(10000);
  });

  it("@spec:AC-503 item sem preço conhecido é RETIRADO, e não segue por zero", () => {
    // Tratar preço desconhecido como zero deixa o pedido sair de graça, e a
    // cozinha preparar.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: null,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.itensQueSeguem).toEqual([]);
    expect(conferido.subtotalEmCentavos).toBe(0);
    expect(conferido.mudancas[0]?.tipo).toBe("SEM_PRECO");
    expect(conferido.precisaConfirmar).toBe(true);
  });

  it("@spec:AC-503 produto sem preço publicado também é retirado", () => {
    const conferido = conferirCarrinho(
      [{ itemId: "i1", produtoId: "p1", quantidade: 1 }],
      [{ ...PRODUTO, precoEmCentavos: null }],
    );

    expect(conferido.itensQueSeguem).toEqual([]);
    expect(conferido.mudancas[0]?.tipo).toBe("SEM_PRECO");
  });

  it("@spec:AC-503 a mudança de preço compara o unitário COM os acréscimos", () => {
    // A tela mostrou R$ 23,00 (produto + bacon). Se o bacon subir para R$ 4,00,
    // o que mudou é o unitário — e é ele que precisa ser comparado.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          acrescimosEmCentavos: 400,
          precoVistoEmCentavos: 2300,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.mudancas[0]?.tipo).toBe("PRECO_SUBIU");
    expect(conferido.mudancas[0]?.deEmCentavos).toBe(2300);
    expect(conferido.mudancas[0]?.paraEmCentavos).toBe(2400);
  });

  it("@spec:AC-503 sem mudança nenhuma, o acréscimo não vira falso alarme", () => {
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          acrescimosEmCentavos: 300,
          precoVistoEmCentavos: 2300,
        },
      ],
      [PRODUTO],
    );

    expect(conferido.mudancas).toEqual([]);
    expect(conferido.precisaConfirmar).toBe(false);
  });
});

describe("o item conferido separa o que veio das opções (AC-515)", () => {
  it("@spec:AC-503 o acréscimo sai destacado, para o pedido poder congelá-lo", () => {
    // O pedido guarda os dois: o preço do produto e o que as escolhas somaram.
    // É o que faz o cupom mostrar "X-Salada R$ 20,00 / + Bacon R$ 3,00" em vez
    // de um total sem explicação.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          acrescimosEmCentavos: 300,
        },
      ],
      [
        {
          produtoId: "p1",
          nome: "X-Salada",
          precoEmCentavos: 2000,
          disponivel: true,
        },
      ],
    );

    const item = conferido.itensQueSeguem[0];
    expect(item?.precoUnitarioEmCentavos).toBe(2300);
    expect(item?.acrescimosEmCentavos).toBe(300);
    // O preço do produto se recupera pela subtração, sem uma terceira coluna.
    expect(
      (item?.precoUnitarioEmCentavos ?? 0) - (item?.acrescimosEmCentavos ?? 0),
    ).toBe(2000);
  });

  it("@spec:AC-503 item sem opção nenhuma tem acréscimo zero, e não indefinido", () => {
    const conferido = conferirCarrinho(
      [{ itemId: "i1", produtoId: "p1", quantidade: 1 }],
      [
        {
          produtoId: "p1",
          nome: "Guaraná",
          precoEmCentavos: 600,
          disponivel: true,
        },
      ],
    );

    expect(conferido.itensQueSeguem[0]?.acrescimosEmCentavos).toBe(0);
  });
});

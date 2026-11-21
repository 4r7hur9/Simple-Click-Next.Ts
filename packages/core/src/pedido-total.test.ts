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

/**
 * Estruturação 3 (IEL Módulo 2): fechamento dos ramos de `conferirCarrinho`.
 *
 * Os casos acima já provavam o dinheiro (de onde vem o número) e as mudanças
 * (subiu, caiu, esgotou, sumiu). Ficavam sem prova: a explicação do preço
 * aplicado (AC-310), o formato do milhar na frase de aviso, o `null` explícito
 * vindo do banco e a recusa de valor quebrado (AC-311). Cada caso abaixo tem
 * uma mutação do código que ele reprova — ver docs/estruturacao/03-testes-checkout.md.
 */
describe("explicação do preço aplicado acompanha o preço (AC-310)", () => {
  const ATACADO = {
    rotulo: "Atacado",
    motivo: "Atacado: preço a partir de 6 unidades",
  };
  const VARIANTE_G = {
    rotulo: "Variante G",
    motivo: "Preço da variante G",
  };

  it("@spec:AC-310 preço do produto com atacado leva a explicação do produto para o item", () => {
    const conferido = conferirCarrinho(
      [{ itemId: "i1", produtoId: "p1", quantidade: 6 }],
      [{ ...MARMITA, precoEmCentavos: 1800, precoAplicado: ATACADO }],
    );

    expect(conferido.itensQueSeguem[0]?.precoAplicado).toEqual(ATACADO);
    expect(conferido.subtotalEmCentavos).toBe(10800);
  });

  it("@spec:AC-310 preço da variante leva a explicação da VARIANTE, e a do produto é ignorada", () => {
    // O preço veio da variante; explicar com o atacado do produto diria à
    // pessoa um motivo que não é o do número que ela está vendo.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: 3000,
          precoAplicado: VARIANTE_G,
        },
      ],
      [{ ...MARMITA, precoAplicado: ATACADO }],
    );

    expect(conferido.itensQueSeguem[0]?.precoAplicado).toEqual(VARIANTE_G);
  });

  it("@spec:AC-310 variante sem explicação NÃO herda a explicação do produto", () => {
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoBaseEmCentavos: 3000,
        },
      ],
      [{ ...MARMITA, precoAplicado: ATACADO }],
    );

    expect(conferido.itensQueSeguem[0]?.precoAplicado).toBeNull();
  });

  it("@spec:AC-310 preço normal não tem explicação: o campo é nulo, e não indefinido", () => {
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA]);

    expect(conferido.itensQueSeguem[0]?.precoAplicado).toBeNull();
  });
});

describe("a frase do aviso de preço e as bordas da conferência (AC-503, AC-311)", () => {
  it("@spec:AC-503 preço de milhar é escrito com ponto e vírgula, em reais", () => {
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoVistoEmCentavos: 99999,
        },
      ],
      [{ ...MARMITA, nome: "Fogão", precoEmCentavos: 123456 }],
    );

    expect(conferido.mudancas[0]?.explicacao).toBe(
      "Fogão subiu de R$ 999,99 para R$ 1.234,56.",
    );
  });

  it("@spec:AC-503 preço visto com valor negativo não quebra a frase (defesa, o contrato já recusa)", () => {
    // A borda HTTP só aceita inteiro não negativo; a função é pura e não
    // depende disso para continuar escrevendo uma frase legível.
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoVistoEmCentavos: -150,
        },
      ],
      [MARMITA],
    );

    expect(conferido.mudancas[0]?.tipo).toBe("PRECO_SUBIU");
    expect(conferido.mudancas[0]?.explicacao).toContain("de -R$ 1,50 para");
  });

  it("@spec:AC-503 preço visto nulo (carrinho antigo) não inventa mudança, como o ausente", () => {
    const conferido = conferirCarrinho(
      [
        {
          itemId: "i1",
          produtoId: "p1",
          quantidade: 1,
          precoVistoEmCentavos: null,
        },
      ],
      [{ ...MARMITA, precoEmCentavos: 2500 }],
    );

    expect(conferido.mudancas).toEqual([]);
    expect(conferido.precisaConfirmar).toBe(false);
  });

  it("@spec:AC-504 total enviado nulo é o mesmo que não enviar: sem divergência", () => {
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA], null);

    expect(conferido.houveDivergencia).toBe(false);
    expect(conferido.totalQueOClienteEnviouEmCentavos).toBeNull();
  });

  it("@spec:AC-504 total enviado ZERO em carrinho com itens é divergência (zero não é 'ausente')", () => {
    const conferido = conferirCarrinho([DUAS_MARMITAS], [MARMITA], 0);

    expect(conferido.houveDivergencia).toBe(true);
    expect(conferido.subtotalEmCentavos).toBe(4000);
  });

  it("@spec:AC-503 carrinho vazio confere em zero e não pede confirmação", () => {
    const conferido = conferirCarrinho([], [MARMITA]);

    expect(conferido.subtotalEmCentavos).toBe(0);
    expect(conferido.itensQueSeguem).toEqual([]);
    expect(conferido.precisaConfirmar).toBe(false);
  });

  it("@spec:AC-311 quantidade quebrada estoura em vez de arredondar", () => {
    expect(() =>
      conferirCarrinho(
        [{ itemId: "i1", produtoId: "p1", quantidade: 1.5 }],
        [MARMITA],
      ),
    ).toThrow(/quantidade/);
  });

  it("@spec:AC-311 preço do catálogo quebrado estoura em vez de cobrar centavo fantasma", () => {
    expect(() =>
      conferirCarrinho(
        [{ itemId: "i1", produtoId: "p1", quantidade: 1 }],
        [{ ...MARMITA, precoEmCentavos: 19.99 }],
      ),
    ).toThrow(/inteiro em centavos/);
  });
});

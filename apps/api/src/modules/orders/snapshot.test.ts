/**
 * Prova do congelamento do item (AC-515, P-010).
 *
 * A parte que o banco prova — que o pedido não muda quando o catálogo muda —
 * mora em `apps/api/tests/pedido-imutavel.test.ts`. Aqui está a outra metade:
 * que o que se guarda é CÓPIA, e que a conta do valor sai certa. Um item
 * congelado com o número errado é imutável do mesmo jeito, e errado para sempre.
 */
import { describe, expect, it } from "vitest";

import {
  congelarItem,
  congelarItens,
  ErroDeItemInvalido,
  type EscolhaDoCliente,
} from "./snapshot.ts";

const MARMITA: EscolhaDoCliente = {
  produto: {
    id: "11111111-1111-1111-1111-111111111111",
    nome: "Marmita executiva",
    precoEmCentavos: 2000,
    sku: "MAR-EXE",
  },
  quantidade: 1,
};

describe("o item guardado é cópia, e não referência (AC-515)", () => {
  it("@spec:AC-515 @principle:P-010 nome, preço e código são copiados para dentro do item", () => {
    const item = congelarItem(MARMITA);

    expect(item.nomeDoProduto).toBe("Marmita executiva");
    expect(item.precoUnitarioEmCentavos).toBe(2000);
    expect(item.sku).toBe("MAR-EXE");
    // A referência continua existindo, para o relatório do dono saber quanto se
    // vendeu de cada produto. Ela nunca é o caminho para saber o preço.
    expect(item.produtoId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("@spec:AC-515 @principle:P-010 alterar o produto depois não altera o item já congelado", () => {
    // É a versão em memória do que o banco prova em integração: o catálogo é o
    // que a loja vende hoje, o pedido é o que foi combinado ontem.
    const catalogo = { ...MARMITA.produto };
    const item = congelarItem({ ...MARMITA, produto: catalogo });

    catalogo.nome = "Marmita executiva GRANDE";
    (catalogo as { precoEmCentavos: number }).precoEmCentavos = 2500;

    expect(item.nomeDoProduto).toBe("Marmita executiva");
    expect(item.precoUnitarioEmCentavos).toBe(2000);
  });

  it("@spec:AC-515 @principle:P-010 o nome da opção também é cópia, e sobrevive a renomear o grupo", () => {
    const catalogo = {
      grupoId: "g1",
      grupoNome: "Cobertura",
      opcaoId: "o1",
      opcaoNome: "Leite condensado",
      acrescimoEmCentavos: 200,
    };
    const item = congelarItem({ ...MARMITA, opcoes: [catalogo] });

    catalogo.grupoNome = "Adicionais";
    catalogo.opcaoNome = "Leite condensado premium";

    expect(item.opcoes?.[0]?.nomeDoGrupo).toBe("Cobertura");
    expect(item.opcoes?.[0]?.nomeDaOpcao).toBe("Leite condensado");
  });

  it("@spec:AC-515 a variação escolhida vira nome, e não só identificador", () => {
    const item = congelarItem({
      ...MARMITA,
      variacao: { id: "v1", nome: "Porção grande", acrescimoEmCentavos: 500 },
    });

    expect(item.nomeDaVariacao).toBe("Porção grande");
    expect(item.variacaoId).toBe("v1");
    expect(item.precoUnitarioEmCentavos).toBe(2500);
  });
});

describe("a conta do item sai certa (AC-515)", () => {
  it("@spec:AC-515 as opções somam antes de multiplicar pela quantidade", () => {
    // Multiplicar antes de somar as opções daria outro número em qualquer
    // pedido com mais de uma unidade — e o número errado sem nada quebrar.
    const item = congelarItem({
      ...MARMITA,
      quantidade: 3,
      opcoes: [
        {
          grupoId: "g1",
          grupoNome: "Extras",
          opcaoId: "o1",
          opcaoNome: "Bacon",
          acrescimoEmCentavos: 300,
        },
      ],
    });

    expect(item.precoUnitarioEmCentavos).toBe(2000);
    expect(item.opcoesEmCentavos).toBe(300);
    expect(item.totalDaLinhaEmCentavos).toBe((2000 + 300) * 3);
  });

  it("@spec:AC-515 opção com quantidade própria multiplica só ela", () => {
    const item = congelarItem({
      ...MARMITA,
      quantidade: 2,
      opcoes: [
        {
          grupoId: "g1",
          grupoNome: "Extras",
          opcaoId: "o1",
          opcaoNome: "Queijo",
          quantidade: 3,
          acrescimoEmCentavos: 150,
        },
      ],
    });

    expect(item.opcoesEmCentavos).toBe(450);
    expect(item.totalDaLinhaEmCentavos).toBe((2000 + 450) * 2);
  });

  it("@spec:AC-515 o subtotal do pedido é a soma exata das linhas guardadas", () => {
    // Somar em outro lugar deixaria o total divergir das linhas, e o cliente
    // veria um valor que não corresponde ao que está escrito acima dele.
    const { itens, subtotalEmCentavos } = congelarItens([
      { ...MARMITA, quantidade: 2 },
      {
        produto: { id: "p2", nome: "Refrigerante", precoEmCentavos: 699 },
        quantidade: 3,
      },
    ]);

    expect(itens.map((i) => i.totalDaLinhaEmCentavos)).toEqual([4000, 2097]);
    expect(subtotalEmCentavos).toBe(6097);
  });

  it("@spec:AC-515 carrinho vazio soma zero, e não quebra", () => {
    expect(congelarItens([]).subtotalEmCentavos).toBe(0);
  });

  it("@spec:AC-515 preço fracionário é recusado em vez de ser arredondado em silêncio", () => {
    // Aceitar 19.99 aqui e arredondar depois faria a conta errar por centavo em
    // cada pedido, e a diferença só apareceria no extrato.
    expect(() =>
      congelarItem({
        produto: { id: "p", nome: "Item", precoEmCentavos: 1999.5 },
        quantidade: 1,
      }),
    ).toThrow(ErroDeItemInvalido);
  });

  it("@spec:AC-515 quantidade inválida é recusada com o nome do produto na mensagem", () => {
    const recusa = () => congelarItem({ ...MARMITA, quantidade: 0 });

    expect(recusa).toThrow(ErroDeItemInvalido);
    expect(recusa).toThrow(/Marmita executiva/);
  });
});

describe("a faixa de atacado fica congelada no item (card #57)", () => {
  const CAMISETA: EscolhaDoCliente = {
    produto: {
      id: "22222222-2222-2222-2222-222222222222",
      nome: "Camiseta básica",
      // 5% sobre R$ 20,00 a partir de 10 peças.
      precoEmCentavos: 1900,
      precoDeVarejoEmCentavos: 2000,
      faixaDeAtacado: {
        quantidadeMinima: 10,
        tipoDeDesconto: "PERCENTUAL",
        desconto: 5,
        rotulo: "Caixa fechada",
      },
    },
    quantidade: 12,
  };

  it("grava o unitário da faixa, o varejo riscado, o tipo e a faixa", () => {
    const item = congelarItem(CAMISETA);

    expect(item.precoUnitarioEmCentavos).toBe(1900);
    expect(item.totalDaLinhaEmCentavos).toBe(1900 * 12);
    expect(item.tipoDePreco).toBe("WHOLESALE");
    expect(item.precoDeVarejoEmCentavos).toBe(2000);
    expect(item.faixaDeAtacado).toEqual({
      quantidadeMinima: 10,
      tipoDeDesconto: "PERCENTUAL",
      desconto: 5,
      rotulo: "Caixa fechada",
    });
  });

  it("mudar a faixa do catálogo depois não muda o item congelado", () => {
    const faixa = {
      quantidadeMinima: 10,
      tipoDeDesconto: "VALOR" as const,
      desconto: 150,
      rotulo: "Atacado",
    };
    const item = congelarItem({
      ...CAMISETA,
      produto: {
        ...CAMISETA.produto,
        precoEmCentavos: 1850,
        faixaDeAtacado: faixa,
      },
    });

    faixa.desconto = 500;
    faixa.rotulo = "Outro nome";

    expect(item.faixaDeAtacado?.desconto).toBe(150);
    expect(item.faixaDeAtacado?.rotulo).toBe("Atacado");
  });

  it("no varejo, sem faixa, os campos de atacado ficam nulos", () => {
    const item = congelarItem(MARMITA);

    expect(item.faixaDeAtacado).toBeNull();
    expect(item.precoDeVarejoEmCentavos).toBeNull();
    expect(item.tipoDePreco).toBeNull();
  });

  it("recusa faixa que a quantidade do item não alcança", () => {
    expect(() => congelarItem({ ...CAMISETA, quantidade: 3 })).toThrow(
      ErroDeItemInvalido,
    );
  });
});

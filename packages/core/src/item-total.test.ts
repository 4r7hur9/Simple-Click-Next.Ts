/**
 * Prova do total de um item com escolhas (AC-411, AC-412).
 *
 * A REGRA É PURA, e é por isso que estes testes não precisam de banco, de rede
 * nem de navegador. É a mesma função que a tela chama a cada clique e que a API
 * chama ao adicionar — provar uma vez prova os dois lados, que é exatamente o
 * que o AC-411 exige quando diz "o valor conferido no servidor é o mesmo".
 */
import { describe, expect, it } from "vitest";

import {
  calcularItem,
  type GrupoDeEscolha,
  type PedidoDeItem,
} from "./item-total.ts";

const ADICIONAIS: GrupoDeEscolha = {
  grupoId: "g-adicionais",
  nome: "Adicionais",
  minimo: 0,
  maximo: null,
  permiteRepetir: true,
  itens: [
    {
      itemId: "i-bacon",
      nome: "Bacon",
      acrescimoEmCentavos: 300,
      disponivel: true,
    },
    {
      itemId: "i-cheddar",
      nome: "Cheddar",
      acrescimoEmCentavos: 250,
      disponivel: false,
    },
  ],
};

const PONTO_DA_CARNE: GrupoDeEscolha = {
  grupoId: "g-ponto",
  nome: "Ponto da carne",
  minimo: 1,
  maximo: 1,
  permiteRepetir: false,
  itens: [
    {
      itemId: "i-mal",
      nome: "Mal passada",
      acrescimoEmCentavos: 0,
      disponivel: true,
    },
    {
      itemId: "i-bem",
      nome: "Bem passada",
      acrescimoEmCentavos: 0,
      disponivel: true,
    },
  ],
};

function pedido(sobrescrita: Partial<PedidoDeItem> = {}): PedidoDeItem {
  return {
    precoBaseEmCentavos: 2000,
    quantidade: 1,
    grupos: [ADICIONAIS],
    escolhas: [],
    ...sobrescrita,
  };
}

describe("o total acompanha as escolhas (AC-411)", () => {
  it("@spec:AC-411 produto de R$ 20,00 com adicional de R$ 3,00 e quantidade dois dá R$ 46,00", () => {
    // É o cenário escrito no critério, ao pé da letra.
    const resultado = calcularItem(
      pedido({
        quantidade: 2,
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-bacon", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.unitarioEmCentavos).toBe(2300);
    expect(resultado.totalEmCentavos).toBe(4600);
    expect(resultado.podeAdicionar).toBe(true);
  });

  it("@spec:AC-411 sem escolha nenhuma, o total é o preço do produto", () => {
    expect(calcularItem(pedido()).totalEmCentavos).toBe(2000);
  });

  it("@spec:AC-411 a mesma opção marcada duas vezes soma duas vezes", () => {
    const resultado = calcularItem(
      pedido({
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-bacon", quantidade: 2 },
        ],
      }),
    );

    expect(resultado.acrescimosEmCentavos).toBe(600);
    expect(resultado.totalEmCentavos).toBe(2600);
  });

  it("@spec:AC-411 desconto por remover ingrediente diminui o total", () => {
    const semCebola: GrupoDeEscolha = {
      ...ADICIONAIS,
      itens: [
        {
          itemId: "i-sem-cebola",
          nome: "Sem cebola",
          acrescimoEmCentavos: -200,
          disponivel: true,
        },
      ],
    };
    const resultado = calcularItem(
      pedido({
        grupos: [semCebola],
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-sem-cebola", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.totalEmCentavos).toBe(1800);
  });

  it("@spec:AC-411 o unitário não desce de zero, por mais desconto que se acumule", () => {
    // Catálogo mal cadastrado não faz a loja pagar para o cliente levar.
    const exagerado: GrupoDeEscolha = {
      ...ADICIONAIS,
      itens: [
        {
          itemId: "i-absurdo",
          nome: "Desconto absurdo",
          acrescimoEmCentavos: -9999,
          disponivel: true,
        },
      ],
    };
    const resultado = calcularItem(
      pedido({
        grupos: [exagerado],
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-absurdo", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.unitarioEmCentavos).toBe(0);
    expect(resultado.totalEmCentavos).toBe(0);
  });

  it("@spec:AC-411 quantidade abaixo de um vale um", () => {
    // A tela não deveria mandar zero, mas a API recebe o que mandarem.
    expect(calcularItem(pedido({ quantidade: 0 })).totalEmCentavos).toBe(2000);
    expect(calcularItem(pedido({ quantidade: -3 })).totalEmCentavos).toBe(2000);
  });

  it("@spec:AC-411 a conta é em centavo inteiro, e não em ponto flutuante", () => {
    // R$ 19,99 três vezes dá 5997 centavos, e não 59,969999999999999 reais.
    const resultado = calcularItem(
      pedido({ precoBaseEmCentavos: 1999, quantidade: 3 }),
    );

    expect(resultado.totalEmCentavos).toBe(5997);
    expect(Number.isInteger(resultado.totalEmCentavos)).toBe(true);
  });
});

describe("escolha obrigatória pendente bloqueia (AC-412)", () => {
  it("@spec:AC-412 grupo obrigatório sem escolha impede adicionar e diz o que falta", () => {
    const resultado = calcularItem(
      pedido({ grupos: [PONTO_DA_CARNE], escolhas: [] }),
    );

    expect(resultado.podeAdicionar).toBe(false);
    expect(resultado.pendencias).toHaveLength(1);
    expect(resultado.pendencias[0]).toMatchObject({
      grupoId: "g-ponto",
      motivo: "FALTA_ESCOLHER",
    });
    expect(resultado.pendencias[0]?.explicacao).toContain("Ponto da carne");
  });

  it("@spec:AC-412 a pendência carrega o identificador do grupo, para a página rolar até ele", () => {
    // Sem o identificador, a tela saberia que falta algo e não saberia ONDE —
    // e o critério pede que ela role até o grupo e o marque.
    const resultado = calcularItem(
      pedido({ grupos: [PONTO_DA_CARNE], escolhas: [] }),
    );

    expect(resultado.pendencias[0]?.grupoId).toBe(PONTO_DA_CARNE.grupoId);
  });

  it("@spec:AC-412 escolhido o obrigatório, o item libera", () => {
    const resultado = calcularItem(
      pedido({
        grupos: [PONTO_DA_CARNE],
        escolhas: [{ grupoId: "g-ponto", itemId: "i-mal", quantidade: 1 }],
      }),
    );

    expect(resultado.podeAdicionar).toBe(true);
    expect(resultado.pendencias).toEqual([]);
  });

  it("@spec:AC-412 passar do teto do grupo é pendência, e não corte silencioso", () => {
    // Cortar sozinho faria a tela mostrar um total que não corresponde ao que a
    // pessoa marcou, e ela descobriria a diferença no cupom.
    const resultado = calcularItem(
      pedido({
        grupos: [PONTO_DA_CARNE],
        escolhas: [
          { grupoId: "g-ponto", itemId: "i-mal", quantidade: 1 },
          { grupoId: "g-ponto", itemId: "i-bem", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.podeAdicionar).toBe(false);
    expect(resultado.pendencias.map((p) => p.motivo)).toContain(
      "ESCOLHEU_DEMAIS",
    );
  });

  it("@spec:AC-412 opção esgotada marcada vira pendência com o nome dela", () => {
    const resultado = calcularItem(
      pedido({
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-cheddar", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.podeAdicionar).toBe(false);
    expect(resultado.pendencias[0]?.explicacao).toContain("Cheddar");
  });

  it("@spec:AC-412 as pendências saem na ordem dos grupos, e não por gravidade", () => {
    // A página rola até a PRIMEIRA pendência; ordenar por gravidade a faria
    // pular para o fim do formulário.
    const resultado = calcularItem(
      pedido({
        grupos: [PONTO_DA_CARNE, ADICIONAIS],
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-cheddar", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.pendencias[0]?.grupoId).toBe("g-ponto");
    expect(resultado.pendencias[1]?.grupoId).toBe("g-adicionais");
  });

  it("@spec:AC-412 opção que não é mais do grupo não entra na conta e vira pendência", () => {
    // Página aberta havia horas, depois de o dono mexer no cardápio.
    const resultado = calcularItem(
      pedido({
        escolhas: [
          { grupoId: "g-adicionais", itemId: "i-que-sumiu", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.totalEmCentavos).toBe(2000);
    expect(resultado.podeAdicionar).toBe(false);
    expect(resultado.pendencias[0]?.motivo).toBe("ITEM_DESCONHECIDO");
  });

  it("@spec:AC-412 escolha em grupo que não é do produto é recusada", () => {
    // É o caso de alguém montando o pedido à mão contra a API.
    const resultado = calcularItem(
      pedido({
        escolhas: [
          { grupoId: "g-de-outro-produto", itemId: "i-x", quantidade: 1 },
        ],
      }),
    );

    expect(resultado.podeAdicionar).toBe(false);
    expect(resultado.pendencias[0]?.motivo).toBe("ITEM_DESCONHECIDO");
    expect(resultado.totalEmCentavos).toBe(2000);
  });

  it("@spec:AC-412 repetir onde não se pode repetir é pendência", () => {
    const resultado = calcularItem(
      pedido({
        grupos: [PONTO_DA_CARNE],
        escolhas: [{ grupoId: "g-ponto", itemId: "i-mal", quantidade: 2 }],
      }),
    );

    expect(resultado.pendencias.map((p) => p.motivo)).toContain(
      "REPETICAO_NAO_PERMITIDA",
    );
  });
});

// @vitest-environment jsdom
/**
 * Escolhas do produto (card #109): regra em palavras, pendência com foco,
 * acréscimo com sinal, limite de opções e observação.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import {
  botaoDeAdicionar,
  clicar,
  grupo,
  ID_DE,
  lido,
  marcar,
  montar,
  naTela,
  opcao,
  textoDoBotao,
  variacao,
} from "./apoio-produto-onp";

afterEach(() => vi.restoreAllMocks());

describe("regra em palavras", () => {
  it("[CA-9] @spec:AC-10908 cada grupo diz a regra desde a abertura, sem alerta antes de tentar", () => {
    const produto = naTela({
      grupos: [
        grupo(
          10,
          "Ponto",
          "INGREDIENT",
          [opcao(11, "Ao ponto"), opcao(12, "Bem passado")],
          {
            minimo: 1,
            maximo: 1,
          },
        ),
        grupo(
          20,
          "Extras",
          "ADDON",
          [opcao(21, "A"), opcao(22, "B"), opcao(23, "C"), opcao(24, "D")],
          { maximo: 3 },
        ),
      ],
    });
    const { caixa, desmontar } = montar(produto);

    const texto = lido(caixa);
    expect(texto).toContain("Escolha 1 · obrigatório");
    expect(texto).toContain("Escolha até 3 · opcional");
    expect(caixa.querySelector(".sc-produto__pendencia")).toBeNull();
    expect(caixa.querySelector(".sc-produto__grupo--pendente")).toBeNull();
    desmontar();
  });
});

describe("pendência com foco, na ordem da tela", () => {
  function espiarRolagem() {
    const alvos: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      alvos.push(this.id);
    };
    return alvos;
  }

  it("[CA-10] @spec:AC-10909 um grupo obrigatório ACIMA do eixo é o primeiro pendente", () => {
    const alvos = espiarRolagem();
    const ingredientes = grupo(
      30,
      "Ponto da carne",
      "INGREDIENT",
      [opcao(31, "Ao ponto")],
      {
        minimo: 1,
        maximo: 1,
      },
    );
    const tamanho = grupo(
      50,
      "Tamanho",
      "VARIATION",
      [opcao(51, "P"), opcao(52, "G")],
      {
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
      },
    );
    const aoAdicionar = vi.fn();
    const { caixa, desmontar } = montar(
      naTela({
        grupos: [tamanho, ingredientes],
        variacoes: [
          variacao(61, "P", 1000, [
            { grupoId: tamanho.id, opcaoId: ID_DE(51) },
          ]),
          variacao(62, "G", 1500, [
            { grupoId: tamanho.id, opcaoId: ID_DE(52) },
          ]),
        ],
      }),
      { blocos: ["ingredientes", "variacoes"], aoAdicionar },
    );

    clicar(botaoDeAdicionar(caixa));

    expect(aoAdicionar).not.toHaveBeenCalled();
    expect(alvos[0]).toBe(`grupo-${ingredientes.id}`);
    const fieldset = caixa.querySelector<HTMLElement>(
      `#grupo-${ingredientes.id}`,
    )!;
    expect(fieldset.className).toContain("sc-produto__grupo--pendente");
    expect(lido(fieldset.querySelector('[role="alert"]')!)).toContain(
      "Ponto da carne",
    );
    expect(document.activeElement).toBe(fieldset);
    desmontar();
  });

  it("[CA-10] @spec:AC-10909 com dois eixos e o primeiro já escolhido, o foco vai ao segundo", () => {
    const alvos = espiarRolagem();
    const tamanho = grupo(
      50,
      "Tamanho",
      "VARIATION",
      [opcao(51, "P"), opcao(52, "G")],
      {
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
      },
    );
    const cor = grupo(
      70,
      "Cor",
      "VARIATION",
      [opcao(71, "Preta"), opcao(72, "Azul")],
      {
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
      },
    );
    const combinacao = (n: number, t: number, c: number) =>
      variacao(n, `${t}-${c}`, 5000, [
        { grupoId: tamanho.id, opcaoId: ID_DE(t) },
        { grupoId: cor.id, opcaoId: ID_DE(c) },
      ]);
    const { caixa, desmontar } = montar(
      naTela({
        precoCentavos: null,
        precoAnteriorCentavos: null,
        grupos: [tamanho, cor],
        variacoes: [
          combinacao(81, 51, 71),
          combinacao(82, 51, 72),
          combinacao(83, 52, 71),
          combinacao(84, 52, 72),
        ],
      }),
    );

    marcar(caixa, "P");
    clicar(botaoDeAdicionar(caixa));

    expect(alvos[0]).toBe(`grupo-${cor.id}`);
    expect(
      lido(caixa.querySelector(`#grupo-${cor.id} [role="alert"]`)!),
    ).toContain("cor");
    desmontar();
  });
});

describe("adicionais", () => {
  const extras = () =>
    naTela({
      grupos: [
        grupo(
          20,
          "Extras",
          "ADDON",
          [
            opcao(21, "Bacon", { acrescimoCentavos: 300 }),
            opcao(22, "Sem cebola", { acrescimoCentavos: -200 }),
            opcao(23, "Ovo"),
            opcao(24, "Queijo"),
          ],
          { maximo: 3 },
        ),
      ],
    });

  it("[CA-12] @spec:AC-10911 o acréscimo vem com sinal e o total muda na hora, e volta ao desmarcar", () => {
    const { caixa, desmontar } = montar(extras());

    const texto = lido(caixa);
    expect(texto).toContain("+ R$ 3,00");
    expect(texto).toContain("− R$ 2,00");

    const bacon = marcar(caixa, "Bacon");
    expect(textoDoBotao(caixa)).toContain("23,00");
    clicar(bacon);
    expect(textoDoBotao(caixa)).toContain("20,00");
    desmontar();
  });

  it("[CA-13] @spec:AC-10912 no limite as demais ficam desabilitadas e o limite é anunciado", () => {
    const { caixa, desmontar } = montar(extras());

    marcar(caixa, "Bacon");
    marcar(caixa, "Sem cebola");
    const ovo = marcar(caixa, "Ovo");
    const queijo = caixa.querySelector<HTMLInputElement>(
      `input[value="${ID_DE(24)}"]`,
    )!;
    expect(queijo.disabled).toBe(true);
    expect(lido(caixa)).toContain("Limite de 3 opções atingido");

    clicar(ovo);
    expect(queijo.disabled).toBe(false);
    desmontar();
  });
});

describe("observação", () => {
  it("[CA-15] @spec:AC-10914 só existe quando a loja aceita, com limite e dica visíveis", () => {
    const com = montar(naTela({ aceitaObservacao: true }));
    const campo = com.caixa.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(campo.maxLength).toBe(280);
    expect(lido(com.caixa)).toContain("Até 280 letras");
    com.desmontar();

    const sem = montar(naTela({ aceitaObservacao: false }));
    expect(sem.caixa.querySelector("textarea")).toBeNull();
    sem.desmontar();
  });
});

void act;

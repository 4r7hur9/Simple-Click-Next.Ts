// @vitest-environment jsdom
/**
 * Indisponibilidade clara (card #109): o que acabou aparece, desabilitado e em
 * texto; nada de reposição nem de estoque em unidades.
 */
import { describe, expect, it, vi } from "vitest";

import {
  botaoDeAdicionar,
  clicar,
  daApi,
  grupo,
  ID_DE,
  LOJA,
  lido,
  marcar,
  montar,
  naTela,
  opcao,
  variacao,
} from "./apoio-produto-onp";
import { prepararProduto } from "../src/server/produto";

const TAMANHO = grupo(
  50,
  "Tamanho",
  "VARIATION",
  [opcao(51, "P"), opcao(52, "M"), opcao(53, "G")],
  { minimo: 1, maximo: 1, eixoDeVariacao: true },
);
const doTamanho = (n: number, nome: string, opcaoN: number, extra = {}) =>
  variacao(
    n,
    nome,
    4990,
    [{ grupoId: TAMANHO.id, opcaoId: ID_DE(opcaoN) }],
    extra,
  );

const camiseta = (padraoEsgotada = false) =>
  naTela({
    precoCentavos: null,
    precoAnteriorCentavos: null,
    grupos: [TAMANHO],
    variacoes: [
      doTamanho(61, "P", 51, {
        padrao: padraoEsgotada,
        disponivel: !padraoEsgotada,
      }),
      doTamanho(62, "M", 52, { disponivel: false }),
      doTamanho(63, "G", 53),
    ],
  });

const radio = (caixa: HTMLElement, opcaoN: number) =>
  caixa.querySelector<HTMLInputElement>(`input[value="${ID_DE(opcaoN)}"]`)!;

describe("o que acabou fica visível e desabilitado", () => {
  it("[CA-21] @spec:AC-10920 no eixo, a variação esgotada vem desabilitada com texto; as outras seguem escolhíveis", () => {
    const { caixa, desmontar } = montar(camiseta());
    expect(radio(caixa, 52).disabled).toBe(true);
    expect(radio(caixa, 52).closest("label")?.textContent).toContain(
      "Indisponível",
    );
    expect(radio(caixa, 51).disabled).toBe(false);
    expect(radio(caixa, 53).disabled).toBe(false);
    desmontar();
  });

  it("[CA-21] @spec:AC-10920 na lista simples, a variação esgotada diz 'Esgotado' em texto", () => {
    const { caixa, desmontar } = montar(
      naTela({
        precoCentavos: null,
        precoAnteriorCentavos: null,
        variacoes: [
          variacao(61, "350 ml", 500),
          variacao(62, "2 L", 900, [], { disponivel: false }),
          variacao(63, "600 ml", 700),
        ],
      }),
    );
    const esgotada = radio(caixa, 62);
    expect(esgotada.disabled).toBe(true);
    expect(esgotada.closest("label")?.textContent).toContain("Esgotado");
    expect(radio(caixa, 61).disabled).toBe(false);
    desmontar();
  });

  it("[CA-23] @spec:AC-10922 adicional esgotado fica desabilitado com 'Acabou' e o produto segue à venda", () => {
    const { caixa, desmontar } = montar(
      naTela({
        grupos: [
          grupo(20, "Extras", "ADDON", [
            opcao(21, "Bacon"),
            opcao(22, "Cheddar", { disponivel: false }),
          ]),
        ],
      }),
    );
    const cheddar = radio(caixa, 22);
    expect(cheddar.disabled).toBe(true);
    expect(cheddar.closest("label")?.textContent).toContain("Acabou");
    expect(radio(caixa, 21).disabled).toBe(false);
    expect(botaoDeAdicionar(caixa).disabled).toBe(false);
    desmontar();
  });
});

describe("a padrão esgotada não compra", () => {
  it("[CA-22] @spec:AC-10921 com eixos, a padrão esgotada não abre marcada: botão desabilitado e frase, até escolher outra", () => {
    const aoAdicionar = vi.fn();
    const { caixa, desmontar } = montar(camiseta(true), { aoAdicionar });

    expect(radio(caixa, 51).checked).toBe(false);
    expect(botaoDeAdicionar(caixa).disabled).toBe(true);
    expect(lido(caixa)).toContain("Essa opção acabou");
    clicar(botaoDeAdicionar(caixa));
    expect(aoAdicionar).not.toHaveBeenCalled();

    marcar(caixa, "G");
    expect(botaoDeAdicionar(caixa).disabled).toBe(false);
    expect(lido(caixa)).not.toContain("Essa opção acabou");
    desmontar();
  });

  it("[CA-22] @spec:AC-10921 na lista simples, a padrão esgotada também não abre marcada", () => {
    const { caixa, desmontar } = montar(
      naTela({
        precoCentavos: null,
        precoAnteriorCentavos: null,
        variacoes: [
          variacao(61, "P", 1000, [], { padrao: true, disponivel: false }),
          variacao(62, "G", 1500),
        ],
      }),
    );
    expect(radio(caixa, 61).checked).toBe(false);
    expect(botaoDeAdicionar(caixa).disabled).toBe(true);
    expect(lido(caixa)).toContain("Essa opção acabou");
    desmontar();
  });
});

describe("produto fora de venda", () => {
  it.each([
    ["ESGOTADO", "acabou"],
    ["FORA_DO_HORARIO", "não está sendo vendido agora"],
  ] as const)(
    "[CA-24] @spec:AC-10923 %s: botão desabilitado, sem quantidade e com o motivo certo",
    (motivo, frase) => {
      const { caixa, desmontar } = montar(
        naTela({ disponivel: false, motivoIndisponivel: motivo }),
      );
      expect(botaoDeAdicionar(caixa).disabled).toBe(true);
      expect(
        caixa.querySelector('button[aria-label="Aumentar a quantidade"]'),
      ).toBeNull();
      expect(lido(caixa)).toContain(frase);
      desmontar();
    },
  );

  it("[CA-24] @spec:AC-10923 loja fechada vence os outros motivos", () => {
    const produto = prepararProduto(
      daApi({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
      LOJA,
      false,
    );
    expect(produto.motivoIndisponivel).toBe("LOJA_FECHADA");
    const { caixa, desmontar } = montar(produto);
    expect(lido(caixa)).toContain("fechada");
    expect(botaoDeAdicionar(caixa).disabled).toBe(true);
    desmontar();
  });

  it("[CA-25] @spec:AC-10924 nenhum aviso de reposição nem estoque aparece", () => {
    const { caixa, desmontar } = montar(
      naTela({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
    );
    expect(lido(caixa)).not.toMatch(
      /avise-me|volta assim|repor|em estoque|unidades? restantes?/i,
    );
    desmontar();
  });
});

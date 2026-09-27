// @vitest-environment jsdom
/**
 * Prova da grade de variações do painel (AC-316, AC-311).
 *
 * A regra de que o código de estoque não se repete e de que a variação zerada
 * fica fora da venda está provada contra o banco em
 * `apps/api/tests/variacoes-do-produto.int.test.ts`. Aqui se prova o que só a
 * tela faz: ela MANDA o código que o dono digitou em cada variação, o preço em
 * centavos inteiros e o estoque zero como zero — e explica a recusa quando o
 * código já está em uso.
 */
import { afterEach, describe, expect, it } from "vitest";

import { GradeDeVariacoes } from "../src/features/painel-catalogo/GradeDeVariacoes";
import {
  botao,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config";

const PRODUTO = "p-camiseta";
const TAMANHO = "g-tamanho";

const GRUPOS = {
  grupos: [
    {
      id: TAMANHO,
      nome: "Tamanho",
      tipo: "VARIATION",
      eixoDeVariacao: true,
      opcoes: [
        { id: "o-p", nome: "P", disponivel: true },
        { id: "o-m", nome: "M", disponivel: true },
        { id: "o-g", nome: "G", disponivel: true },
      ],
    },
  ],
};

afterEach(() => desmontar());

/** A API do painel: grupos, a lista de variações e o que responder à criação. */
function api(criar: RespostaSimulada, variacoes: unknown[] = []) {
  return simularApi((chamada: ChamadaDaApi) => {
    if (chamada.url.endsWith("/opcoes")) return { status: 200, corpo: GRUPOS };
    if (chamada.metodo === "POST") return criar;
    return { status: 200, corpo: { variacoes } };
  });
}

/** Preenche a nova variação do jeito que o dono preenche no celular. */
async function preencherVariacaoM(
  tela: HTMLElement,
  campos: { sku: string; preco: string; estoque: string },
) {
  const [nome, sku, preco] = [
    ...tela.querySelectorAll<HTMLInputElement>("form input:not([type])"),
  ];
  digitar(nome!, "Camiseta M");
  digitar(sku!, campos.sku);
  digitar(exigir<HTMLSelectElement>(tela, "form select"), "o-m");
  digitar(preco!, campos.preco);
  digitar(
    exigir<HTMLInputElement>(tela, 'form input[type="number"]'),
    campos.estoque,
  );
  await enviar(exigir<HTMLFormElement>(tela, "form"));
}

describe("a grade manda o código e o estoque de cada variação (AC-316)", () => {
  it("@spec:AC-316 @spec:AC-311 o código digitado vai com a variação, o preço em centavos inteiros e o zero como zero", async () => {
    const chamadas = api({ status: 201, corpo: {} });
    const tela = montar(<GradeDeVariacoes produtoId={PRODUTO} />);
    await esperar();

    // Ponto como separador decimal, que é o que o teclado numérico do celular
    // oferece. A conta antiga apagava o ponto e mandava 199900 — R$ 1.999,00
    // por uma camiseta de R$ 19,99.
    await preencherVariacaoM(tela, {
      sku: "CAM-BAS-M",
      preco: "19.99",
      estoque: "0",
    });

    const criacao = chamadas.find((c) => c.metodo === "POST");
    expect(criacao?.url).toBe(`/api/catalogo/produtos/${PRODUTO}/variacoes`);
    expect(criacao?.corpo).toMatchObject({
      nome: "Camiseta M",
      sku: "CAM-BAS-M",
      precoCentavos: 1999,
      // Zero é "controla e acabou" — e não "não controla", que seria nulo.
      estoque: 0,
      combinacoes: [{ grupoId: TAMANHO, opcaoId: "o-m" }],
    });
  });

  it("@spec:AC-316 código já usado em outra variação da loja é explicado, e não vira erro genérico", async () => {
    api({ status: 409, corpo: { erro: "sku_duplicado" } });
    const tela = montar(<GradeDeVariacoes produtoId={PRODUTO} />);
    await esperar();

    await preencherVariacaoM(tela, {
      sku: "CAM-BAS-P",
      preco: "49,90",
      estoque: "2",
    });

    expect(exigir(tela, '[role="status"]').textContent).toContain(
      "Esse SKU já está em outra variação da loja",
    );
    // O formulário continua preenchido: o dono troca só o código e reenvia.
    expect(botao(tela, "Criar variação").disabled).toBe(false);
  });

  it("@spec:AC-316 cada variação da lista mostra o próprio código e o estoque", async () => {
    api({ status: 201, corpo: {} }, [
      {
        id: "v-p",
        nome: "Camiseta P",
        sku: "CAM-BAS-P",
        precoCentavos: 4990,
        estoque: 4,
        padrao: true,
        disponivel: true,
        combinacoes: [{ grupoId: TAMANHO, opcaoId: "o-p" }],
      },
      {
        id: "v-m",
        nome: "Camiseta M",
        sku: "CAM-BAS-M",
        precoCentavos: 4990,
        estoque: 0,
        padrao: false,
        disponivel: true,
        combinacoes: [{ grupoId: TAMANHO, opcaoId: "o-m" }],
      },
    ]);
    const tela = montar(<GradeDeVariacoes produtoId={PRODUTO} />);
    await esperar();

    const linhas = [...tela.querySelectorAll("ul > li")].map(
      (li) => li.textContent ?? "",
    );
    expect(linhas[0]).toContain("SKU CAM-BAS-P");
    expect(linhas[0]).toContain("4 un.");
    expect(linhas[1]).toContain("SKU CAM-BAS-M");
    expect(linhas[1]).toContain("0 un.");
    expect(linhas[1]).toContain("R$ 49,90");
  });
});

// @vitest-environment jsdom
/**
 * Prova da metade que a tela deve (AC-507, AC-907, AC-908).
 *
 * O cálculo já está provado em `packages/core/src/taxa-entrega.test.ts`. Aqui a
 * pergunta é outra: o que foi calculado CHEGA aos olhos de quem paga, e chega
 * de um jeito que um leitor de tela consegue ler. Um total certo que aparece
 * sem rótulo, ou uma taxa que some quando é grátis, cumpre a conta e falha o
 * critério.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";
import { calcularValores, type ConfiguracaoDeEntrega } from "@simpleclick/core";

import { ResumoDoPedido } from "../src/features/checkout/ResumoDoPedido";
import { montarResumoParaTela } from "../src/server/resumo-de-valores";

const LOJA: ConfiguracaoDeEntrega = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaEmCentavos: 800,
  nomeDaTaxa: "Entrega Centro",
};

/** Faz o caminho inteiro: calcula, traduz para texto e desenha. */
function desenhar(
  configuracao: ConfiguracaoDeEntrega,
  forma: "DELIVERY" | "PICKUP",
  subtotalEmCentavos: number,
): string {
  const resumo = montarResumoParaTela(
    calcularValores(configuracao, forma, subtotalEmCentavos),
  );
  return renderToStaticMarkup(<ResumoDoPedido {...resumo} />);
}

/**
 * Texto puro, como um leitor de tela ouviria.
 *
 * NÃO é `textContent`: aquele cola os textos de elementos vizinhos sem nenhuma
 * separação, e "Itens" seguido de "R$ 45,50" viraria "ItensR$ 45,50" — algo que
 * nenhum leitor de tela produz. Aqui cada nó de texto vira uma parte, e as
 * partes se juntam com espaço, que é o que corresponde à pausa entre elementos.
 */
function comoSeLe(html: string): string {
  const documento = document.createElement("div");
  documento.innerHTML = html;

  const partes: string[] = [];
  const caminhante = document.createTreeWalker(documento, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    const trecho = (caminhante.currentNode.textContent ?? "").trim();
    if (trecho !== "") partes.push(trecho);
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

describe("resumo de valores na tela (AC-507)", () => {
  it("@spec:AC-507 a tela mostra itens, taxa em linha separada e total", () => {
    const lido = comoSeLe(desenhar(LOJA, "DELIVERY", 4550));

    expect(lido).toContain("Itens R$ 45,50");
    expect(lido).toContain("Entrega Centro R$ 8,00");
    expect(lido).toContain("Total R$ 53,50");
  });

  it("@spec:AC-507 a taxa aparece com o nome que o dono deu, e não com um nome do sistema", () => {
    const comOutroNome = { ...LOJA, nomeDaTaxa: "Motoboy" };
    const lido = comoSeLe(desenhar(comOutroNome, "DELIVERY", 4550));

    expect(lido).toContain("Motoboy R$ 8,00");
    expect(lido).not.toContain("Taxa de entrega");
  });

  it("@spec:AC-507 cada valor está ligado ao próprio rótulo na marcação", () => {
    // É o que separa "o número aparece" de "o número é legível": num par de
    // nome e valor, quem usa leitor de tela ouve os dois juntos.
    const html = desenhar(LOJA, "DELIVERY", 4550);

    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
    expect(html.match(/<dt/g)?.length).toBe(html.match(/<dd/g)?.length);
  });

  it("@spec:AC-507 na retirada a linha da taxa não aparece, e o total é só dos itens", () => {
    const lido = comoSeLe(desenhar(LOJA, "PICKUP", 4550));

    expect(lido).not.toContain("Entrega Centro");
    expect(lido).toContain("Total R$ 45,50");
  });
});

describe("entrega grátis na tela (AC-907)", () => {
  const comGratis = { ...LOJA, gratisAcimaDeEmCentavos: 6000 };

  it("@spec:AC-907 a linha continua aparecendo, zerada e com a indicação de grátis", () => {
    // Sumir com a linha esconderia justamente o que o cliente mais quer ver, e
    // faria o total parecer errado para quem já esperava pagar a taxa.
    const lido = comoSeLe(desenhar(comGratis, "DELIVERY", 7000));

    expect(lido).toContain("Entrega Centro R$ 0,00");
    expect(lido).toContain("entrega grátis");
    expect(lido).toContain("Total R$ 70,00");
  });

  it("@spec:AC-907 abaixo do limite a tela mostra a taxa cheia, sem indicação de grátis", () => {
    const lido = comoSeLe(desenhar(comGratis, "DELIVERY", 5000));

    expect(lido).toContain("Entrega Centro R$ 8,00");
    expect(lido).not.toContain("entrega grátis");
    expect(lido).toContain("Total R$ 58,00");
  });
});

describe("valor mínimo na tela (AC-908)", () => {
  const comMinimo = { ...LOJA, minimoParaEntregaEmCentavos: 2500 };

  it("@spec:AC-908 o aviso diz quanto falta e interrompe quem usa leitor de tela", () => {
    const html = desenhar(comMinimo, "DELIVERY", 2000);
    const lido = comoSeLe(html);

    expect(lido).toContain("Faltam R$ 5,00");
    // Sem papel de anúncio o aviso aparece só para quem enxerga, e quem não
    // enxerga fica clicando em um botão que nunca vai funcionar.
    expect(html).toMatch(/role="(status|alert)"/);
  });

  it("@spec:AC-908 pedido acima do mínimo não mostra aviso nenhum", () => {
    const lido = comoSeLe(desenhar(comMinimo, "DELIVERY", 3000));

    expect(lido).not.toContain("Faltam");
    expect(lido).not.toContain("Ainda não dá para fechar");
  });
});

describe("acessibilidade do resumo (AC-507)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    document.body.innerHTML = `<main>${desenhar(
      { ...LOJA, minimoParaEntregaEmCentavos: 2500 },
      "DELIVERY",
      2000,
    )}</main>`;

    const resultado = await axe.run(document.body);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-507 o resumo não tem violação de acessibilidade crítica nem séria", () => {
    // Sem esta primeira asserção, um erro de montagem faria o axe não avaliar
    // nada e o teste passaria com zero violação — a pior forma de um teste de
    // acessibilidade mentir.
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });
});

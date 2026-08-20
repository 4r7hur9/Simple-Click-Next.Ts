// @vitest-environment jsdom
/**
 * Prova da história da landing (AC-933, AC-934, AC-937).
 *
 * O componente é desenhado por `renderToStaticMarkup`, e isso É a prova do
 * AC-934: é exatamente o que o servidor entrega antes de qualquer script rodar.
 * Se a história aparece aqui, ela aparece para quem bloqueia script, para quem
 * está numa conexão que caiu no meio, e para o buscador.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";

import { HistoriaDaLanding } from "../src/features/landing/HistoriaDaLanding";

function desenhar(): string {
  return renderToStaticMarkup(<HistoriaDaLanding linkParaComecar="/entrar" />);
}

/** Texto puro, como um leitor de tela ouviria. */
function comoSeLe(html: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  const partes: string[] = [];
  const caminhante = document.createTreeWalker(caixa, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    const trecho = (caminhante.currentNode.textContent ?? "").trim();
    if (trecho !== "") partes.push(trecho);
  }
  return partes.join(" ").replace(/\s+/g, " ");
}

describe("a promessa aparece antes de qualquer rolagem (AC-933)", () => {
  it("@spec:AC-933 a abertura diz o que o produto faz e traz o caminho para começar", () => {
    const html = desenhar();
    const abertura = html.slice(0, html.indexOf('data-capitulo="problema"'));
    const lido = comoSeLe(abertura);

    // As DUAS metades do que o produto faz: o cardápio que fica no ar, e o
    // pedido chegando escrito. Uma sem a outra deixa a abertura contando meia
    // história — e é meia história que a pessoa leva embora se não rolar.
    expect(lido).toContain("cardápio online");
    expect(lido).toContain("pedidos prontos no WhatsApp");
    expect(abertura).toContain('href="/entrar"');
  });

  it("@spec:AC-933 a abertura fala a língua de quem tem loja, e não a do sistema", () => {
    // "Multi-tenant" e "isolamento por linha" são verdade sobre o sistema e não
    // são o problema de ninguém que vende pastel.
    const lido = comoSeLe(desenhar()).toLowerCase();

    for (const jargao of [
      "multi-tenant",
      "saas",
      "api",
      "catálogo headless",
      "isolamento",
    ]) {
      expect(lido, `jargão na landing: ${jargao}`).not.toContain(jargao);
    }
  });

  it("@spec:AC-933 a gratuidade da versão 1 aparece junto do convite", () => {
    // Em minúsculas porque o que importa é a promessa estar lá, e não a
    // maiúscula que a frase calhou de ter quando este teste foi escrito.
    const lido = comoSeLe(desenhar()).toLowerCase();

    expect(lido).toContain("sem cartão de crédito");
    // E o modelo INTEIRO, e não só a ausência de cartão: quem já foi queimado
    // por "grátis" pergunta como eles ganham dinheiro, e a página que não
    // responde deixa a pergunta trabalhando contra ela.
    expect(lido).toContain("sem plano pago");
  });
});

describe("a história existe sem script (AC-934)", () => {
  it("@spec:AC-934 todo o texto vem pronto do servidor", () => {
    // Desenhado sem navegador e sem script: é o que chega em rede ruim.
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Pedido no papel");
    expect(lido).toContain("Seu cardápio online");
    expect(lido).toContain("quanto entrou");
  });

  it("@spec:AC-934 os caminhos são LINKS, e não botões que navegam por script", () => {
    // Botão com clique não funciona com script desligado, não abre em nova aba
    // pelo teclado, e o buscador não o segue.
    const html = desenhar();

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<button");
    expect(html.split('href="/entrar"').length - 1).toBeGreaterThanOrEqual(4);
  });

  it("@spec:AC-934 o mundo em três dimensões NÃO está na marcação do servidor", () => {
    // Se ele estivesse aqui, o pacote entraria no primeiro carregamento de todo
    // mundo — inclusive de quem a decisão vai recusar.
    const html = desenhar();

    expect(html).not.toContain("canvas");
    expect(html).not.toContain("sc-lp__mundo");
  });
});

describe("a narrativa tem argumento (AC-937)", () => {
  it("@spec:AC-937 as seções contam começo, meio e fim, nessa ordem", () => {
    // Se elas pudessem ser embaralhadas sem perda, não seria narrativa: seria
    // uma lista com animação.
    const html = desenhar();
    const ordem = [...html.matchAll(/data-capitulo="([a-z]+)"/g)].map(
      (achado) => achado[1],
    );

    // O preço vem por ÚLTIMO, e isso é parte do argumento: perguntado cedo ele
    // é objeção, respondido depois de a pessoa querer o produto ele é alívio.
    expect(ordem).toEqual([
      "abertura",
      "problema",
      "produto",
      "controle",
      "preco",
    ]);
  });

  it("@spec:AC-937 cada capítulo tem caminho para começar, sem voltar ao topo", () => {
    // Quem se convenceu no segundo capítulo não deve precisar rolar até o fim
    // nem subir de volta — a decisão acontece onde ela acontece.
    const html = desenhar();
    const capitulos = html.split('data-capitulo="').slice(1);

    expect(capitulos.length).toBe(5);
    for (const capitulo of capitulos) {
      expect(capitulo).toContain('href="/entrar"');
    }
  });

  it("@spec:AC-937 o convite do meio é discreto, e só o da abertura é cheio", () => {
    // Repetir o botão cheio quatro vezes transforma a página num anúncio, e a
    // pessoa para de ver todos eles.
    const html = desenhar();

    // Cheio só na abertura e no fecho do preço; discreto nos três do meio.
    expect(html.split("sc-lp__comecar--discreto").length - 1).toBe(3);
  });
});

describe("acessibilidade da landing (AC-938)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    document.body.innerHTML = `<main>${desenhar()}</main>`;
    const resultado = await axe.run(document.body);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-938 @principle:P-012 sem violação crítica nem séria", () => {
    // Sem esta primeira asserção, um erro de montagem faria o axe não avaliar
    // nada e o teste passaria com zero violação.
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });

  it("@spec:AC-938 @principle:P-012 há um h1 só, e os níveis não pulam", () => {
    // Quem navega por títulos usa a hierarquia como sumário.
    const html = desenhar();
    const niveis = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));

    expect(niveis.filter((n) => n === 1)).toHaveLength(1);
    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect((niveis[i] ?? 0) - (niveis[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    }
  });
});

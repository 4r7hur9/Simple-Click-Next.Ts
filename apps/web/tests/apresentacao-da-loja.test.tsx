// @vitest-environment jsdom
/**
 * Prova da apresentação da loja (AC-400, AC-401).
 *
 * O componente é desenhado por `renderToStaticMarkup`, e isso é a prova em si:
 * é exatamente o que o servidor entrega antes de qualquer script rodar. Se o
 * conteúdo aparece aqui, ele aparece para quem está em rede ruim, para quem
 * bloqueia script e para o buscador — que é o que o AC-415 exige.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";

import {
  ApresentacaoDaLoja,
  type AberturaNaTela,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";

const LOJA: LojaNaTela = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  tema: { corDestaque: "#0f6e5c", fundoVitrine: null, topoCardapio: null },
  boasVindas: "Comida caseira todo dia",
  logo: "https://exemplo.test/logo.png",
  capa: null,
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  enderecoParaRetirada: {
    logradouro: "Rua das Flores",
    numero: "123",
    complemento: null,
    bairro: "Centro",
    cidade: "São Paulo",
    uf: "SP",
  },
};

const ABERTA: AberturaNaTela = {
  aberta: true,
  proximaAbertura: null,
  motivo: "ABERTA",
};

function desenhar(
  sobrescrita: Partial<Parameters<typeof ApresentacaoDaLoja>[0]> = {},
): string {
  return renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={LOJA}
      abertura={ABERTA}
      linkDoCardapio="/loja/sabor-e-cia/cardapio"
      rotuloDoCatalogo="Cardápio"
      {...sobrescrita}
    />,
  );
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

describe("a página mostra a loja sem depender de script (AC-400)", () => {
  it("@spec:AC-400 nome, boas-vindas e caminho para o cardápio vêm prontos do servidor", () => {
    // Desenhado sem navegador e sem script: é o que chega em rede ruim.
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Sabor & Cia");
    expect(lido).toContain("Comida caseira todo dia");
    expect(lido).toContain("Ver o cardápio");
  });

  it("@spec:AC-400 o caminho para o cardápio é um LINK, e não um botão que navega por script", () => {
    // Link funciona com script desligado, abre em nova aba pelo teclado, e o
    // buscador o segue. Botão com onClick não faz nenhuma das três.
    const html = desenhar();

    expect(html).toContain('href="/loja/sabor-e-cia/cardapio"');
    expect(html).not.toContain("onclick");
  });

  it("@spec:AC-400 as formas de entrega aparecem por extenso, e não em código do banco", () => {
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Entrega");
    expect(lido).toContain("Retirada no local");
    expect(lido).not.toContain("PICKUP");
  });

  it("@spec:AC-400 o endereço de retirada aparece numa linha, sem vírgula sobrando", () => {
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Rua das Flores, 123");
    expect(lido).toContain("São Paulo/SP");
    expect(lido).not.toContain(", ,");
  });

  it("@spec:AC-400 o espaço da logo já vem reservado, para a página não pular", () => {
    // Sem dimensão na marcação, a página salta quando a imagem carrega — e o
    // dedo que ia no botão acerta outra coisa (AC-416).
    const html = desenhar();

    expect(html).toMatch(/width="88"/);
    expect(html).toMatch(/height="88"/);
  });

  it("@spec:AC-400 loja sem apresentação cadastrada não mostra bloco vazio", () => {
    const semNada = { ...LOJA, boasVindas: null };
    const html = desenhar({ loja: semNada });

    expect(html).not.toContain("sc-loja__boas-vindas");
  });

  it("@spec:AC-400 tudo cabe em UMA tela, sem repetir o caminho de saída", () => {
    // A página é uma porta, não um destino: quem chega quer o cardápio. Com uma
    // tela só, repetir o botão seria ruído — ele já está à vista o tempo todo.
    const html = desenhar();
    const quantos = html.split('href="/loja/sabor-e-cia/cardapio"').length - 1;

    expect(quantos).toBe(1);
  });

  it("@spec:AC-015 a página NÃO usa cor de loja: nenhuma variável de cor sai no envelope", () => {
    const html = desenhar();

    expect(html).not.toMatch(/--cor-primaria|--cor-marca|--cor-sobre-marca/);
    expect(html).not.toContain("#0f6e5c");
  });

  it("a foto de fundo da vitrine manda sobre a capa antiga", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = desenhar({
      loja: {
        ...LOJA,
        capa: "https://exemplo.test/capa-antiga.jpg",
        tema: {
          corDestaque: "#0f6e5c",
          fundoVitrine: "https://exemplo.test/fundo.jpg",
          topoCardapio: null,
        },
      },
    });
    expect(caixa.querySelector(".sc-loja__fundo")?.getAttribute("src")).toBe(
      "https://exemplo.test/fundo.jpg",
    );
  });

  it("@spec:AC-015 loja sem tema ainda recebe o envelope do tema escuro, e não um branco", () => {
    const semCor = { ...LOJA, tema: null };

    expect(desenhar({ loja: semCor })).toContain("sc-tema-loja");
  });

  it("@spec:AC-400 a capa é a faixa do cartão da loja; entrega e endereço ficam nos cartões logo abaixo", () => {
    const comCapa = { ...LOJA, capa: "https://exemplo.test/capa.png" };
    const caixa = document.createElement("div");
    caixa.innerHTML = desenhar({ loja: comCapa });
    const painel = caixa.querySelector(".sc-loja__painel");

    expect(painel?.classList.contains("sc-loja__painel--com-capa")).toBe(true);
    expect(
      painel?.querySelector("img.sc-loja__fundo")?.getAttribute("alt"),
    ).toBe("");
    expect(painel?.querySelector(".sc-loja__capa .sc-loja__veu")).not.toBeNull();
    const condicoes = caixa.querySelector(".sc-loja__detalhes");
    expect(condicoes?.textContent).toContain("Como receber");
    expect(condicoes?.querySelector("address")?.textContent).toContain(
      "Rua das Flores",
    );
  });

  it("@spec:AC-400 sem capa, a faixa é um degradê neutro: sem foto, sem padrão de ícones", () => {
    const html = desenhar();

    expect(html).toContain("sc-loja__capa");
    expect(html).not.toContain("sc-loja__fundo");
    expect(html).not.toContain("sc-loja__painel--com-capa");
    expect(html).not.toContain("--capa-url");
    expect(html).not.toContain("sc-loja__trama");
  });

  it("@spec:AC-400 sem boas-vindas, a faixa da descrição traz o Sobre resumido, com o caminho para o texto inteiro", () => {
    const comSobre = { ...LOJA, boasVindas: null, sobre: "Desde 2009 no bairro." };
    const caixa = document.createElement("div");
    caixa.innerHTML = desenhar({ loja: comSobre });

    expect(
      caixa.querySelector(".sc-loja__descricao")?.textContent,
    ).toContain("Desde 2009 no bairro.");
    expect(
      caixa.querySelector('.sc-loja__descricao a[href="/loja/sabor-e-cia/sobre"]'),
    ).not.toBeNull();
  });

  it("@spec:AC-400 o caminho para o Sobre é um link de texto na faixa da descrição, e não outro botão", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = desenhar({ loja: { ...LOJA, sobre: "Desde 2009." } });
    const link = caixa.querySelector('a[href="/loja/sabor-e-cia/sobre"]');

    expect(link?.textContent).toBe("Ler mais sobre a loja");
    expect(link?.closest(".sc-loja__descricao")).not.toBeNull();
    expect(link?.classList.contains("sc-loja__entrar")).toBe(false);
  });

  it("@spec:AC-400 loja sem Sobre não mostra bloco vazio nem o 'Ler mais'", () => {
    const html = desenhar({ loja: { ...LOJA, sobre: null } });

    expect(html).not.toContain("sc-loja__descricao-texto");
    expect(html).not.toContain("Ler mais sobre a loja");
  });

  it("@spec:AC-400 os caminhos para o Sobre abrem a janela, e sem script são links comuns", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = desenhar({ loja: { ...LOJA, sobre: "Desde 2009." } });
    const portas = [...caixa.querySelectorAll("a[data-abre-sobre]")];

    // O "Ler mais" abre a janela e tem endereço de verdade para quem está sem
    // script. (Horários e contato: a faixa de seções da página, card #129.)
    expect(portas.map((porta) => porta.textContent?.trim())).toEqual([
      "Ler mais sobre a loja",
    ]);
    for (const porta of portas) {
      expect(porta.getAttribute("href")).toBe("/loja/sabor-e-cia/sobre");
    }
  });

  it("@spec:AC-400 loja sem logo mostra as iniciais, e não um buraco na composição", () => {
    // A marca de quem ainda não subiu logo continua sendo a dela.
    const semLogo = { ...LOJA, logo: null };
    const html = desenhar({ loja: semLogo });

    expect(html).toContain("SC");
    expect(html).not.toContain("<img");
  });
});

describe("loja fechada avisa e deixa navegar (AC-401)", () => {
  it("@spec:AC-401 o aviso diz que está fechada e quando abre", () => {
    const lido = comoSeLe(
      desenhar({
        abertura: {
          aberta: false,
          proximaAbertura: "abre hoje às 18h",
          motivo: "FORA_DO_HORARIO",
        },
      }),
    );

    expect(lido).toContain("Fechada agora");
    expect(lido).toContain("abre hoje às 18h");
  });

  it("@spec:AC-401 fechada NÃO esconde o cardápio", () => {
    // Esconder faria a loja perder o cliente que ia pedir amanhã.
    const html = desenhar({
      abertura: {
        aberta: false,
        proximaAbertura: null,
        motivo: "FORA_DO_HORARIO",
      },
    });

    expect(html).toContain('href="/loja/sabor-e-cia/cardapio"');
    expect(comoSeLe(html)).toContain("ver o cardápio e voltar depois");
  });

  it("@spec:AC-401 feriado diz o motivo que o dono escreveu", () => {
    const lido = comoSeLe(
      desenhar({
        abertura: {
          aberta: false,
          proximaAbertura: "abre terça às 11h",
          motivo: "EXCECAO",
          explicacaoDaExcecao: "Feriado municipal",
        },
      }),
    );

    expect(lido).toContain("Feriado municipal");
  });

  it("@spec:AC-401 sem previsão de abertura, a tela diz isso em vez de inventar", () => {
    const lido = comoSeLe(
      desenhar({
        abertura: {
          aberta: false,
          proximaAbertura: null,
          motivo: "FORA_DO_HORARIO",
        },
      }),
    );

    expect(lido).toContain("horário não informado");
  });

  it("@spec:AC-401 o aviso não interrompe quem usa leitor de tela", () => {
    // Ele já está na página quando ela abre; anunciá-lo faria o leitor
    // atropelar a leitura do nome da loja.
    const html = desenhar({
      abertura: {
        aberta: false,
        proximaAbertura: null,
        motivo: "FORA_DO_HORARIO",
      },
    });

    expect(html).not.toContain('role="alert"');
  });
});

describe("acessibilidade da apresentação (AC-400)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  let violacoes: Result[] = [];
  let avaliadas = 0;

  beforeAll(async () => {
    document.body.innerHTML = `<main>${desenhar({
      abertura: {
        aberta: false,
        proximaAbertura: "abre hoje às 18h",
        motivo: "FORA_DO_HORARIO",
      },
    })}</main>`;

    const resultado = await axe.run(document.body);
    violacoes = resultado.violations;
    avaliadas = resultado.passes.length + resultado.violations.length;
  });

  it("@spec:AC-400 @principle:P-012 sem violação crítica nem séria", () => {
    // Sem esta primeira asserção, um erro de montagem faria o axe não avaliar
    // nada e o teste passaria com zero violação.
    expect(avaliadas).toBeGreaterThan(0);

    const graves = violacoes
      .filter((v) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, graves.join(" | ")).toEqual([]);
  });

  it("@spec:AC-400 @principle:P-012 a hierarquia de títulos não pula nível", () => {
    // Quem navega por títulos usa a hierarquia como sumário; um salto de h1
    // para h3 esconde a estrutura.
    const html = desenhar();
    const niveis = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));

    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect((niveis[i] ?? 0) - (niveis[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    }
  });
});

describe("a palavra é a do RAMO da loja (AC-400)", () => {
  it("@spec:AC-400 loja de roupa não tem cardápio: o botão diz catálogo", () => {
    // Era o defeito: a tela escrevia "Cardápio" para todo mundo. Acerta na
    // lanchonete e erra na loja de roupas, na autopeça e na de eletrônicos — e
    // o dono percebe no primeiro minuto, porque é a palavra que ele usa o dia
    // inteiro.
    const lido = comoSeLe(desenhar({ rotuloDoCatalogo: "Catálogo" }));

    expect(lido).toContain("Ver o catálogo");
    expect(lido).not.toContain("cardápio");
  });

  it("@spec:AC-400 a lanchonete continua dizendo cardápio", () => {
    const lido = comoSeLe(desenhar({ rotuloDoCatalogo: "Cardápio" }));

    expect(lido).toContain("Ver o cardápio");
  });

  it("@spec:AC-400 a nota de loja fechada usa a mesma palavra", () => {
    // Duas palavras diferentes na mesma tela para a mesma coisa é pior que uma
    // palavra errada: parece que são dois lugares distintos.
    const lido = comoSeLe(
      desenhar({
        rotuloDoCatalogo: "Catálogo",
        abertura: {
          aberta: false,
          proximaAbertura: "abre amanhã às 9h",
          motivo: "FORA_DO_HORARIO",
        },
      }),
    );

    expect(lido).toContain("Você pode ver o catálogo e voltar depois.");
  });
});

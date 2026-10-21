// @vitest-environment jsdom
/** Seções de prova da landing (#87, #95): renderização, fontes e marcação de exemplos. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContaDoAplicativo } from "../src/features/landing/ContaDoAplicativo.tsx";
import {
  OPCOES_DE_VENDA,
  custoNoMesDaOpcao,
  emReaisComCentavos,
  sobraDeCemReais,
} from "../src/features/landing/custo-do-aplicativo.ts";
import {
  CANAIS_DO_DELIVERY,
  COMPRAS_NO_CELULAR,
  DadosDeMercado,
  Depoimentos,
  FaixaDeConfianca,
  FONTES_DA_PROVA,
  FONTES_DAS_TAXAS,
  METODOLOGIA_DOS_DADOS,
  NUMEROS_DE_MERCADO,
  PERGUNTAS_FREQUENTES,
  PerguntasFrequentes,
  pedacosDoNumero,
} from "../src/features/landing/secoes/index.ts";
import { iniciaisDe } from "../src/features/landing/secoes/iniciais.ts";

describe("DadosDeMercado", () => {
  it("mostra cada número, a linha Fontes e metodologia e a ressalva na gaveta", () => {
    const html = renderToStaticMarkup(<DadosDeMercado />);
    for (const n of NUMEROS_DE_MERCADO) expect(html).toContain(n.numero);
    expect(html).toContain("Fontes e metodologia");
    expect(html).toContain("podem variar por plano");
    for (const f of FONTES_DA_PROVA) expect(html).toContain(f.url);
  });

  it("todo número e todo gráfico aponta para uma fonte com link https e data", () => {
    const indices = [
      ...NUMEROS_DE_MERCADO.map((n) => n.fonte),
      ...FONTES_DAS_TAXAS,
      CANAIS_DO_DELIVERY.fonte,
      COMPRAS_NO_CELULAR.fonte,
    ];
    for (const indice of indices) {
      const f = FONTES_DA_PROVA[indice - 1];
      expect(f?.url.startsWith("https://")).toBe(true);
      expect(f?.data).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(f?.curto.length).toBeGreaterThan(0);
    }
  });

  it("título com 'caro' e 'não' em destaque", () => {
    const html = renderToStaticMarkup(<DadosDeMercado />);
    expect(html).toContain('<em class="sc-prova__caro">caro</em>');
    expect(html).toContain('<em class="sc-prova__nao">não</em>');
  });

  it("os quatro cartões 3D são iguais: mesma ordem de peças, sem cartão cheio", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(<DadosDeMercado />);
    const cartoes = [...caixa.querySelectorAll(".sc-dado3d")];
    expect(cartoes).toHaveLength(NUMEROS_DE_MERCADO.length);
    const pecas = (c: Element) =>
      [...c.querySelectorAll(".sc-dado3d__conteudo > *")].map((p) => p.className.split(" ")[0]);
    for (const cartao of cartoes) {
      expect(cartao.hasAttribute("data-destaque")).toBe(false);
      expect(pecas(cartao)).toEqual(pecas(cartoes[0]!));
      // Camadas de profundidade são enfeite; o leitor de tela lê o número final.
      for (const camada of cartao.querySelectorAll(".sc-dado3d__sombra, .sc-dado3d__placa, .sc-dado3d__brilho, .sc-dado3d__mini")) {
        expect(camada.getAttribute("aria-hidden")).toBe("true");
      }
    }
    const numero = cartoes[0]!.querySelector(".sc-dado3d__numero")!;
    expect(numero.querySelector(".sc-prova__so-leitor")?.textContent).toBe(NUMEROS_DE_MERCADO[0]!.numero);
    expect(numero.querySelector('[aria-hidden="true"]')?.textContent).toBe(NUMEROS_DE_MERCADO[0]!.numero);
  });

  it("a fonte de cada cartão é uma legenda pequena que abre a página original", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(<DadosDeMercado />);
    for (const cartao of caixa.querySelectorAll(".sc-dado3d")) {
      const link = cartao.querySelector<HTMLAnchorElement>("a.sc-dados__fonte");
      expect(link?.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.textContent).toContain("(abre em nova aba)");
    }
    // A lista longa "Fontes" e o parágrafo de aviso saíram da seção.
    expect(caixa.querySelector(".sc-prova__fontes, .sc-prova__ressalva")).toBeNull();
  });

  it("as fontes e a metodologia ficam numa gaveta (popover) com datas", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(<DadosDeMercado />);
    const gaveta = caixa.querySelector<HTMLElement>(".sc-dados__gaveta")!;
    expect(gaveta.getAttribute("popover")).toBe("auto");
    expect(gaveta.getAttribute("role")).toBe("dialog");
    const abrir = caixa.querySelector(".sc-dados__abrir-fontes")!;
    expect(abrir.getAttribute("popovertarget")).toBe(gaveta.id);
    expect(abrir.textContent).toBe("Fontes e metodologia");
    expect(gaveta.querySelectorAll("li")).toHaveLength(FONTES_DA_PROVA.length);
    for (const f of FONTES_DA_PROVA) expect(gaveta.textContent).toContain(f.data);
    for (const paragrafo of METODOLOGIA_DOS_DADOS) expect(gaveta.textContent).toContain(paragrafo);
    expect(gaveta.querySelector('[aria-label="Fechar fontes e metodologia"]')?.getAttribute("popovertargetaction")).toBe("hide");
  });

  it("três telas, cada uma com o seu botão", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(<DadosDeMercado id="taxas" />);
    const telas = [...caixa.querySelectorAll<HTMLElement>("[data-tela-de-dados]")];
    expect(telas.map((t) => t.id)).toEqual(["taxas-numeros", "taxas-conta", "taxas-canais"]);
    for (const tela of telas) expect(tela.querySelector(".sc-lp-botao"), tela.id).toBeTruthy();
    expect(telas[0]!.querySelector('a[href="#taxas-conta"]')).toBeTruthy();
    expect(telas[2]!.querySelector(".sc-prova__rosca, .sc-prova__quadros")).toBeTruthy();
  });

  it("cada gráfico é uma imagem descrita, com tabela para leitor de tela", () => {
    const html = renderToStaticMarkup(<DadosDeMercado />);
    const imagens = html.match(/role="img"/g) ?? [];
    expect(imagens).toHaveLength(3);
    for (const rotulo of html.match(/aria-label="[^"]*"/g) ?? []) {
      expect(rotulo.length).toBeGreaterThan(30);
    }
    expect(html.match(/<div class="sc-prova__so-leitor"><table>/g)).toHaveLength(3);
    expect(html).toContain("De cada R$ 100 em pedido");
    expect(html).toContain("R$\u00a084,80");
  });

  it("o botão da conta fecha o resultado, logo depois de 'No seu link: R$ 0'", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(
      <DadosDeMercado chamada={<a href="/cadastrar">Começar</a>} />,
    );
    const conclusao = caixa.querySelector(".sc-prova-conta__resultado .sc-prova-conta__conclusao")!;
    expect(conclusao.textContent?.replace(/\s+/g, " ")).toContain("No seu link: R$ 0 de taxa");
    expect(conclusao.querySelector('a[href="/cadastrar"]')).toBeTruthy();
    // As réguas vêm antes; o gráfico de cada R$ 100 fica na mesma tela.
    const html = caixa.innerHTML;
    expect(html.indexOf('type="range"')).toBeLessThan(html.indexOf('href="/cadastrar"'));
    expect(caixa.querySelector("#mercado-conta .sc-prova__grafico--sobra")).toBeTruthy();
  });
});

describe("contas dos gráficos (tabelas oficiais)", () => {
  it("de cada R$ 100: SimpleClick, loja virtual, iFood Básico e Entrega", () => {
    expect(OPCOES_DE_VENDA.map((o) => o.id)).toEqual([
      "simpleclick",
      "lojaVirtual",
      "basico",
      "entrega",
    ]);
    expect(OPCOES_DE_VENDA.map(sobraDeCemReais)).toEqual([100, 95.81, 84.8, 73.8]);
    expect(emReaisComCentavos(84.8)).toBe("R$\u00a084,80");
  });

  it("custo no mês com mensalidade, para R$ 8.000 vendidos", () => {
    expect(custoNoMesDaOpcao("simpleclick", 8000)).toBe(0);
    expect(custoNoMesDaOpcao("lojaVirtual", 8000)).toBe(404.2);
    expect(custoNoMesDaOpcao("basico", 8000)).toBe(1326);
    expect(custoNoMesDaOpcao("entrega", 8000)).toBe(2246);
    expect(custoNoMesDaOpcao("lojaVirtual", Number.NaN)).toBe(69);
  });

  it("os canais do delivery somam 100", () => {
    const soma = CANAIS_DO_DELIVERY.canais.reduce((t, c) => t + c.parte, 0);
    expect(soma).toBe(100);
  });

  it("separa o número do cartão em texto e números, para a contagem", () => {
    expect(pedacosDoNumero("12% a 23%")).toEqual([
      { tipo: "numero", texto: "12", valor: 12, casas: 0 },
      { tipo: "texto", texto: "% a " },
      { tipo: "numero", texto: "23", valor: 23, casas: 0 },
      { tipo: "texto", texto: "%" },
    ]);
    expect(pedacosDoNumero("R$\u00a01.800")).toEqual([
      { tipo: "texto", texto: "R$\u00a0" },
      { tipo: "numero", texto: "1.800", valor: 1800, casas: 0 },
    ]);
    expect(pedacosDoNumero("3,2%")[0]).toEqual({ tipo: "numero", texto: "3,2", valor: 3.2, casas: 1 });
    expect(pedacosDoNumero("sem número")).toEqual([{ tipo: "texto", texto: "sem número" }]);
  });

  it("a conta chega pronta do servidor: 200 pedidos de R$ 40", () => {
    const html = renderToStaticMarkup(<ContaDoAplicativo />);
    expect(html).toContain("R$\u00a08.000");
    expect(html).toContain("R$\u00a02.246");
    expect(html).toContain("R$\u00a026.952 por ano");
    expect(html).toContain("Pedidos por mês");
    expect(html).toContain("Ticket médio (R$)");
  });
});

describe("Depoimentos", () => {
  it("marca os exemplos e usa iniciais, sem estrelas", () => {
    const html = renderToStaticMarkup(<Depoimentos />);
    expect(html).toContain("Como lojistas usam");
    expect(html).toContain("exemplo ilustrativo");
    expect(html).not.toContain("★");
  });

  it("aceita depoimento real: sem aviso de exemplo", () => {
    const html = renderToStaticMarkup(
      <Depoimentos
        depoimentos={[
          { fala: "Funciona.", nome: "Ana Souza", negocio: "Doceria", cidade: "Recife/PE", ilustrativo: false },
        ]}
      />,
    );
    expect(html).toContain("Ana Souza");
    expect(html).not.toContain("exemplo ilustrativo");
    expect(html).not.toContain("fase beta");
  });

  it("tira as iniciais", () => {
    expect(iniciaisDe("Ana Souza")).toBe("AS");
    expect(iniciaisDe("lojista")).toBe("L");
    expect(iniciaisDe("")).toBe("?");
  });
});

describe("PerguntasFrequentes", () => {
  it("tem de 6 a 8 perguntas em sanfona nativa", () => {
    expect(PERGUNTAS_FREQUENTES.length).toBeGreaterThanOrEqual(6);
    expect(PERGUNTAS_FREQUENTES.length).toBeLessThanOrEqual(8);
    const html = renderToStaticMarkup(<PerguntasFrequentes />);
    expect(html.match(/<details/g)).toHaveLength(PERGUNTAS_FREQUENTES.length);
    expect(html).toContain("<summary");
  });
});

describe("FaixaDeConfianca", () => {
  it("diz grátis, sem comissão, sem mensalidade, e traz 3 garantias", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToStaticMarkup(<FaixaDeConfianca href="/cadastrar" />);
    expect(caixa.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Grátis. Sem comissão. Sem mensalidade.",
    );
    expect(caixa.querySelector('a[href="/cadastrar"]')).toBeTruthy();
    expect(caixa.querySelectorAll(".sc-impacto__garantia")).toHaveLength(3);
  });
});

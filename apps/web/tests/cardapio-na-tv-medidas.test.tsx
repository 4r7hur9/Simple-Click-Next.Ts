// @vitest-environment jsdom
/**
 * Prova das medidas da exibição do cardápio na televisão (AC-926 e AC-927): corpo
 * legível a três metros, contraste da parede e paginação que não corta produto.
 * Apoio comum em `apoio-da-tv.tsx`; o rodízio mora em `cardapio-na-tv.test.tsx`.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";
import {
  CONTRASTE_MINIMO_TEXTO,
  PALETA_ESCURA,
  calcularTemaDaLoja,
  relacaoDeContraste,
} from "@simpleclick/ui";

import {
  CATALOGO,
  comJanela,
  desenhar,
  desligar,
  encontrado,
  esperar,
  FOLHA,
  ligar,
  nomesNaTela,
  produto,
  SEGUNDOS_POR_TELA,
} from "./apoio-da-tv.tsx";

afterEach(desligar);

describe("texto legível a três metros (AC-926)", () => {
  it("@spec:AC-926 nome e preço usam o corpo medido, e o corpo vem da densidade", () => {
    const html = desenhar();

    // O servidor desenha para a televisão mais comum: 45 px de corpo.
    expect(html).toContain("--corpo:45px");
    expect(FOLHA).toMatch(
      /\.sc-exibicao__nome\s*\{[^}]*font-size:\s*var\(--corpo\)/,
    );
    expect(FOLHA).toMatch(
      /\.sc-exibicao__preco\s*\{[^}]*font-size:\s*calc\(var\(--corpo\)\s*\*\s*1\.1\)/,
    );
  });

  it("@spec:AC-926 as cores da parede passam na verificação de contraste, inclusive a cor da loja", () => {
    // A parede é escura: os pares são os do tema escuro do design system.
    expect(
      relacaoDeContraste(PALETA_ESCURA.tinta, PALETA_ESCURA.fundo),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(
      relacaoDeContraste(PALETA_ESCURA.tintaSuave, PALETA_ESCURA.fundo),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);

    // O preço leva a cor da loja como LETRA sobre o fundo escuro: o tema a
    // ajusta até passar, seja qual for a cor que o dono escolheu.
    for (const cor of ["#0f6e5c", "#111111", "#ffff00", "#ff0000"]) {
      const tema = calcularTemaDaLoja(cor, { tema: "escuro" });
      expect(
        relacaoDeContraste(tema.corPrincipalComoTexto, PALETA_ESCURA.fundo),
        cor,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
      expect(
        relacaoDeContraste(tema.corDoTexto, tema.corPrincipal),
        cor,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    }
  });

  it("@spec:AC-926 a tela nunca mostra mais produtos do que cabem no corpo mínimo", () => {
    // Numa Full HD deitada cabem 12 no máximo; o cardápio tem 2 disponíveis
    // em Salgados, e é isso que aparece — sem espremer.
    const html = desenhar();
    const quantos = html.split('class="sc-exibicao__produto"').length - 1;

    expect(quantos).toBe(2);
    expect(quantos).toBeLessThanOrEqual(12);
  });
});

describe("a tela se adapta à televisão (AC-927)", () => {
  it.each([
    { largura: 1080, altura: 1920, capacidade: 9 },
    { largura: 720, altura: 1280, capacidade: 9 },
    { largura: 2160, altura: 3840, capacidade: 9 },
    { largura: 1440, altura: 900, capacidade: 7 },
  ])(
    "@spec:AC-927 $largura × $altura pagina antes de cortar produto, contando respiro e rodapé da folha",
    async ({ largura, altura, capacidade }) => {
      const produtos = Array.from({ length: 10 }, (_, indice) =>
        produto({ id: `produto-${indice}`, nome: `Produto ${indice + 1}` }),
      );
      const catalogo: CatalogoDaVitrineNoContrato = {
        secoes: [{ ...CATALOGO.secoes[0]!, produtos }],
        destaques: [],
        versao: "1",
      };
      comJanela(largura, altura);
      const tela = ligar({
        catalogoInicial: catalogo,
        buscar: async () => encontrado(catalogo),
      });
      const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela")!;
      const corpo = Number.parseFloat(
        principal.style.getPropertyValue("--corpo"),
      );
      const colunas = Number(principal.style.getPropertyValue("--colunas"));

      // jsdom não calcula layout. Lemos as medidas da folha de produção,
      // independentes da função de densidade, para conferir o espaço real.
      const proporcao = (padrao: RegExp): number => {
        const resultado = FOLHA.match(padrao);
        expect(resultado).not.toBeNull();
        return Number(resultado![1]);
      };
      const respiro = proporcao(
        /\.sc-exibicao__tela\s*\{[^}]*padding:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const cabecalho = proporcao(
        /\.sc-exibicao__cabecalho\s*\{[^}]*min-block-size:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const rodape = proporcao(
        /\.sc-exibicao__rodape\s*\{[^}]*block-size:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const linhaDoRodape = proporcao(
        /\.sc-exibicao__rodape\s*\{[^}]*line-height:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const linha = proporcao(
        /grid-auto-rows:\s*calc\(var\(--corpo\)\s*\*\s*([\d.]+)\)/,
      );
      const codigo =
        largura < altura
          ? (altura *
              proporcao(
                /grid-template-rows:\s*auto minmax\(0, 1fr\)\s*([\d.]+)svh auto/,
              )) /
            100
          : 0;
      const alturaDosProdutos =
        Math.ceil(nomesNaTela(tela).length / colunas) * corpo * linha;
      const alturaCompleta =
        corpo * (2 * respiro + cabecalho + rodape) + codigo + alturaDosProdutos;

      expect(linhaDoRodape).toBeLessThanOrEqual(rodape);
      expect(alturaCompleta).toBeLessThanOrEqual(altura);
      expect(nomesNaTela(tela)).toEqual(
        produtos.slice(0, capacidade).map((item) => item.nome),
      );
      await esperar(SEGUNDOS_POR_TELA);
      expect(nomesNaTela(tela)).toEqual(
        produtos.slice(capacidade).map((item) => item.nome),
      );
    },
  );

  it("@spec:AC-927 deitada, a tela tem duas colunas e o código ao lado", () => {
    comJanela(1920, 1080);
    const tela = ligar();
    const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela");

    expect(principal?.dataset["orientacao"]).toBe("deitada");
    expect(principal?.style.getPropertyValue("--colunas")).toBe("2");
  });

  it("@spec:AC-927 em pé, a tela passa a uma coluna e o código vai para baixo", () => {
    comJanela(1080, 1920);
    const tela = ligar();
    const principal = tela.querySelector<HTMLElement>(".sc-exibicao__tela");

    expect(principal?.dataset["orientacao"]).toBe("em-pe");
    expect(principal?.style.getPropertyValue("--colunas")).toBe("1");
    expect(FOLHA).toContain("@media (orientation: portrait)");
  });

  it("@spec:AC-927 sem faixa preta nas bordas: a exibição cobre largura e altura inteiras", () => {
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*inline-size:\s*100vw/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*block-size:\s*100svh/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*inset:\s*0/);
  });

  it("@spec:AC-927 sem produto cortado: a linha do produto tem a mesma altura que a densidade conta", () => {
    // 2,6 corpos por produto nos dois lugares. Se um mudar sem o outro, o
    // último produto sai cortado na borda de baixo.
    expect(FOLHA).toMatch(
      /grid-auto-rows:\s*calc\(var\(--corpo\)\s*\*\s*2\.6\)/,
    );
  });
});

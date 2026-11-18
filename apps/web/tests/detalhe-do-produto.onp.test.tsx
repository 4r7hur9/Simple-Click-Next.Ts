// @vitest-environment jsdom
/**
 * Detalhe do produto (card #109): dados da tela, galeria, cabeçalho e blocos
 * do ramo. Cada teste leva `[CA-n]` (Workflow IA) e `@spec:AC-…` (ONP).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { GaleriaDoProduto } from "../src/features/produto/GaleriaDoProduto";
import {
  blocosDoDetalhe,
  secoesDeEscolha,
} from "../src/features/produto/blocos-do-ramo";
import {
  conviteAEscolher,
  midiasDaGaleria,
  type MidiaNaTela,
} from "../src/lib/produto";
import {
  daApi,
  grupo,
  ID_DE,
  lido,
  montar,
  naTela,
  opcao,
  variacao,
} from "./apoio-produto-onp";

const FOTO = (n: number, texto: string | null = `Foto ${n}`): MidiaNaTela => ({
  tipo: "imagem",
  url: `https://exemplo.test/${n}.jpg`,
  capa: null,
  texto,
  largura: 800,
  altura: 800,
  duracaoSegundos: null,
});
const VIDEO: MidiaNaTela = {
  tipo: "video",
  url: "https://exemplo.test/v.mp4",
  capa: "https://exemplo.test/capa.jpg",
  texto: null,
  largura: null,
  altura: null,
  duracaoSegundos: 12,
};

function montarGaleria(midias: readonly MidiaNaTela[]) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  act(() => raiz.render(<GaleriaDoProduto midias={midias} nome="Pastel" />));
  return {
    caixa,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
    },
  };
}

describe("dados da tela", () => {
  it("[CA-4] @spec:AC-10933 prepararProduto mantém imagens e acrescenta midias na ordem do dono", () => {
    const imagens = [
      { url: "https://exemplo.test/1.jpg", texto: "um", largura: 8, altura: 8 },
    ];
    const produto = naTela({
      imagens,
      midias: [{ ...VIDEO }, { ...FOTO(1), url: imagens[0]!.url }],
    });
    expect(produto.imagens).toEqual(imagens);
    expect(produto.midias?.map((m) => m.tipo)).toEqual(["video", "imagem"]);
  });

  it("[CA-4] @spec:AC-10933 sem midias a galeria usa as fotos de imagens", () => {
    const produto = naTela({
      imagens: [
        {
          url: "https://exemplo.test/a.jpg",
          texto: "a",
          largura: 1,
          altura: 1,
        },
      ],
    });
    expect(midiasDaGaleria(produto)).toEqual([
      expect.objectContaining({
        tipo: "imagem",
        url: "https://exemplo.test/a.jpg",
      }),
    ]);
  });

  it("[CA-14] @spec:AC-10913 o convite usa o rótulo do ramo só quando falta a variação", () => {
    expect(conviteAEscolher("Tamanho", { soFaltaVariacao: true })).toBe(
      "Escolher tamanho",
    );
    expect(conviteAEscolher("Volume", { soFaltaVariacao: true })).toBe(
      "Escolher volume",
    );
    expect(conviteAEscolher("Tamanho", { soFaltaVariacao: false })).toBe(
      "Escolher opções",
    );
  });

  it("[CA-25] @spec:AC-10924 o esgotado não promete reposição nem mostra estoque", () => {
    const produto = naTela({
      disponivel: false,
      motivoIndisponivel: "ESGOTADO",
    });
    const frase = produto.explicacaoDaIndisponibilidade ?? "";
    expect(frase).toContain("acabou");
    expect(frase).not.toMatch(/volta|repor|repuser|avise|estoque/i);
  });
});

describe("galeria", () => {
  beforeEach(() => {
    Element.prototype.scrollTo =
      vi.fn() as unknown as typeof Element.prototype.scrollTo;
  });
  afterEach(() => vi.restoreAllMocks());

  it("[CA-1] @spec:AC-10901 mostra a posição, troca por setas e pelo teclado, e dá texto às fotos", () => {
    const { caixa, desmontar } = montarGaleria([FOTO(1), FOTO(2), VIDEO]);

    expect(lido(caixa)).toContain("1 de 3");
    expect(caixa.querySelectorAll("img")).toHaveLength(2);
    expect(caixa.querySelector("img")?.getAttribute("alt")).toBe("Foto 1");
    expect(caixa.querySelector("video")?.getAttribute("aria-label")).toBe(
      "Vídeo de Pastel",
    );

    act(() => {
      caixa
        .querySelector<HTMLButtonElement>('button[aria-label="Próxima mídia"]')!
        .click();
    });
    expect(lido(caixa)).toContain("2 de 3");

    const grupoEl = caixa.querySelector<HTMLElement>('[role="group"]')!;
    act(() => {
      grupoEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(lido(caixa)).toContain("3 de 3");
    act(() => {
      grupoEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(lido(caixa)).toContain("2 de 3");
    desmontar();
  });

  it("[CA-2] @spec:AC-10902 o vídeo nasce parado, mudo e com botão para reproduzir", () => {
    const { caixa, desmontar } = montarGaleria([VIDEO]);
    const video = caixa.querySelector("video")!;

    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.muted).toBe(true);
    expect(video.getAttribute("poster")).toBe("https://exemplo.test/capa.jpg");
    expect(lido(caixa)).toContain("Reproduzir vídeo");
    expect(video.hasAttribute("controls")).toBe(false);
    desmontar();
  });

  it("[CA-3] @spec:AC-10903 sem mídia mostra a inicial do nome no lugar da galeria", () => {
    const { caixa, desmontar } = montarGaleria([]);
    expect(caixa.querySelector(".sc-detalhe__sem-foto")?.textContent).toBe("P");
    expect(caixa.querySelector("img")).toBeNull();
    desmontar();
  });

  it("[CA-30] @spec:AC-10930 com reduzir movimento a troca de mídia é direta", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const { caixa, desmontar } = montarGaleria([FOTO(1), FOTO(2)]);
    act(() => {
      caixa
        .querySelector<HTMLButtonElement>('button[aria-label="Próxima mídia"]')!
        .click();
    });
    const chamada = (Element.prototype.scrollTo as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0] as { behavior: string };
    expect(chamada.behavior).toBe("auto");
    desmontar();
  });
});

describe("cabeçalho e preço", () => {
  it("[CA-5] @spec:AC-10904 sem variações, o preço e o anterior são lidos como 'De … por …'", () => {
    const { caixa, desmontar } = montar(naTela());
    const texto = lido(caixa.querySelector(".sc-produto__precos")!);
    expect(texto).toMatch(/De\s+R\$\s*24,00\s+por\s+R\$\s*20,00/);
    desmontar();
  });

  it("[CA-5] @spec:AC-10904 com variação resolvida usa o preço dela, e pendente mostra o convite", () => {
    const tamanho = grupo(
      10,
      "Tamanho",
      "VARIATION",
      [opcao(11, "P"), opcao(12, "G")],
      {
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
      },
    );
    const produto = naTela({
      precoCentavos: null,
      precoAnteriorCentavos: null,
      grupos: [tamanho],
      variacoes: [
        variacao(21, "P", 3000, [{ grupoId: tamanho.id, opcaoId: ID_DE(11) }], {
          precoAnteriorCentavos: 3600,
        }),
        variacao(22, "G", 4000, [{ grupoId: tamanho.id, opcaoId: ID_DE(12) }]),
      ],
    });
    const { caixa, desmontar } = montar(produto);

    expect(lido(caixa.querySelector(".sc-produto__preco-convite")!)).toBe(
      "Escolher tamanho",
    );
    const p = caixa.querySelector<HTMLInputElement>(
      `input[value="${ID_DE(11)}"]`,
    )!;
    clicar2(p);
    expect(lido(caixa.querySelector(".sc-produto__precos")!)).toMatch(
      /De\s+R\$\s*36,00\s+por\s+R\$\s*30,00/,
    );
    desmontar();
  });
});

function clicar2(el: HTMLElement) {
  act(() => el.click());
}

describe("blocos do ramo", () => {
  const ingredientes = grupo(30, "Ingredientes", "INGREDIENT", [
    opcao(31, "Cebola"),
  ]);
  const adicionais = grupo(40, "Adicionais", "ADDON", [opcao(41, "Bacon")]);
  const tamanho = grupo(50, "Tamanho", "VARIATION", [opcao(51, "P")], {
    eixoDeVariacao: true,
  });
  const produto = naTela({
    grupos: [adicionais, ingredientes, tamanho],
    variacoes: [
      variacao(61, "P", 1000, [{ grupoId: tamanho.id, opcaoId: ID_DE(51) }]),
    ],
  });

  it("[CA-6] @spec:AC-10905 a lista do ramo ordena as seções (lanchonete: ingredientes antes de adicionais)", () => {
    const secoes = secoesDeEscolha(
      ["fotos", "descricao", "ingredientes", "adicionais"],
      produto.grupos.filter((g) => g.eixoDeVariacao),
      produto.grupos.filter((g) => !g.eixoDeVariacao),
      false,
    );
    expect(secoes.map((s) => s.chave)).toEqual([
      tamanho.id, // variação sem bloco no ramo: vem primeiro
      ingredientes.id,
      adicionais.id,
    ]);
  });

  it("[CA-6] @spec:AC-10905 o ramo pode pôr especificações antes das variações; foto e fotos valem", () => {
    const spec = grupo(70, "Voltagem", "SPEC", [opcao(71, "110 V")]);
    const secoes = secoesDeEscolha(
      ["fotos", "especificacoes", "variacoes"],
      [{ ...produto.grupos.find((g) => g.eixoDeVariacao)! }],
      [naTela({ grupos: [spec] }).grupos[0]!],
      false,
    );
    expect(secoes.map((s) => s.tipo)).toEqual(["grupo", "eixo"]);
    const comFoto = naTela({
      imagens: [
        {
          url: "https://exemplo.test/a.jpg",
          texto: null,
          largura: 1,
          altura: 1,
        },
      ],
    });
    expect(blocosDoDetalhe(["foto"], comFoto)).toEqual(["foto"]);
    expect(blocosDoDetalhe(["fotos"], comFoto)).toEqual(["fotos"]);
  });

  it("[CA-7] @spec:AC-10906 bloco sem dado, desconhecido, aplicacao e compatibilidade não aparecem", () => {
    const lista = [
      "tabela_medidas",
      "garantia",
      "inventado",
      "aplicacao",
      "compatibilidade",
      "especificacoes",
      "descricao",
    ];
    expect(blocosDoDetalhe(lista, naTela({ descricao: null }))).toEqual([]);
    expect(blocosDoDetalhe(lista, naTela())).toEqual(["descricao"]);
  });

  it("[CA-8] @spec:AC-10907 sem lista do ramo nada some: variações primeiro, depois todos os grupos", () => {
    const secoes = secoesDeEscolha(
      [],
      produto.grupos.filter((g) => g.eixoDeVariacao),
      produto.grupos.filter((g) => !g.eixoDeVariacao),
      false,
    );
    expect(secoes.map((s) => s.chave)).toEqual([
      tamanho.id,
      adicionais.id,
      ingredientes.id,
    ]);
    const { caixa, desmontar } = montar(produto, { blocos: [] });
    expect(lido(caixa)).toContain("Adicionais");
    expect(lido(caixa)).toContain("Ingredientes");
    desmontar();
  });
});

void daApi;

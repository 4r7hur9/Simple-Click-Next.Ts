import { REGRAS_DAS_IMAGENS_DA_LOJA } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  ESPACOS_DE_IMAGEM,
  espacoDeImagem,
  medidasDoEspaco,
  textoRecomendado,
  type IdDoEspacoDeImagem,
} from "../src/lib/espacos-de-imagem.ts";

const IDS = Object.keys(ESPACOS_DE_IMAGEM) as IdDoEspacoDeImagem[];

describe("tabela de dimensões por espaço (card #82)", () => {
  it("tem os espaços que o produto usa", () => {
    expect(IDS.sort()).toEqual(
      [
        "avatar",
        "banner-celular",
        "banner-computador",
        "fundo-da-vitrine",
        "logo",
        "produto",
        "story",
        "topo-do-cardapio",
      ].sort(),
    );
  });

  it("as medidas batem com o CSS conferido", () => {
    const medidas = Object.fromEntries(
      IDS.map((id) => [
        id,
        `${String(espacoDeImagem(id).largura)}x${String(espacoDeImagem(id).altura)}`,
      ]),
    );
    expect(medidas).toEqual({
      logo: "512x512", // 1:1
      "fundo-da-vitrine": "1600x1200", // .sc-loja__painel no computador: ~4 / 3
      "topo-do-cardapio": "1600x400", // .sc-vitrine__capa: 4 / 1
      "banner-computador": "1600x500", // faixa de 220–300 px
      "banner-celular": "960x540", // .sc-banners__item: 16 / 9
      produto: "1200x1200", // cartão 1:1, 4:3 e 4:5 cortam do quadrado
      avatar: "256x256",
      story: "1080x1920", // .sc-story-caixa: 9 / 16
    });
  });

  it("o mínimo recomendado nunca passa da saída e mantém a proporção", () => {
    for (const id of IDS) {
      const espaco = espacoDeImagem(id);
      if (espaco.minimo === undefined) continue;
      expect(espaco.minimo.largura, id).toBeLessThanOrEqual(espaco.largura);
      expect(espaco.minimo.altura, id).toBeLessThanOrEqual(espaco.altura);
      const proporcao = espaco.largura / espaco.altura;
      expect(espaco.minimo.largura / espaco.minimo.altura, id).toBeCloseTo(
        proporcao,
        1,
      );
    }
  });

  it("os limites de peso são os mesmos que a API confere", () => {
    expect(espacoDeImagem("logo").limiteDoArquivoEmBytes).toBe(
      REGRAS_DAS_IMAGENS_DA_LOJA.logo.tamanhoMaximoBytes,
    );
    expect(espacoDeImagem("fundo-da-vitrine").limiteDoArquivoEmBytes).toBe(
      REGRAS_DAS_IMAGENS_DA_LOJA.fundo.tamanhoMaximoBytes,
    );
    expect(espacoDeImagem("topo-do-cardapio").limiteDoArquivoEmBytes).toBe(
      REGRAS_DAS_IMAGENS_DA_LOJA.topo.tamanhoMaximoBytes,
    );
  });

  it("fundo da vitrine e topo do cardápio têm uma moldura para cada tela, com proporções diferentes", () => {
    const fundo = espacoDeImagem("fundo-da-vitrine").variantes ?? [];
    const topo = espacoDeImagem("topo-do-cardapio").variantes ?? [];
    const medidas = (variantes: typeof fundo) =>
      variantes.map((v) => `${v.id}:${String(v.largura)}x${String(v.altura)}`);
    expect(medidas(fundo)).toEqual([
      "computador:1600x1200",
      "celular:720x1600",
    ]);
    expect(medidas(topo)).toEqual(["computador:1600x400", "celular:1140x600"]);
    // O celular é outra proporção, e não só um zoom: o fundo vira uma folha em pé.
    expect(fundo[1]!.largura / fundo[1]!.altura).toBeLessThan(1);
    expect(fundo[0]!.largura / fundo[0]!.altura).toBeGreaterThan(1);
    expect(topo[1]!.largura / topo[1]!.altura).toBeLessThan(
      topo[0]!.largura / topo[0]!.altura,
    );
    // A primeira variante é a do espaço (compatibilidade com quem lê largura × altura).
    expect([fundo[0]!.largura, fundo[0]!.altura]).toEqual([
      espacoDeImagem("fundo-da-vitrine").largura,
      espacoDeImagem("fundo-da-vitrine").altura,
    ]);
    for (const variante of [...fundo, ...topo]) {
      expect(variante.larguraDaTela).toBeGreaterThan(0);
      expect(variante.minimo!.largura / variante.minimo!.altura).toBeCloseTo(
        variante.largura / variante.altura,
        1,
      );
      for (const miniatura of variante.miniaturas ?? []) {
        // A prévia tem a mesma proporção da moldura: nada é cortado só na miniatura.
        expect(miniatura.proporcao).toBeCloseTo(
          variante.largura / variante.altura,
          2,
        );
      }
    }
  });

  it("cada espaço tem miniaturas 'como vai aparecer' com proporção e largura válidas", () => {
    for (const id of IDS) {
      for (const miniatura of espacoDeImagem(id).miniaturas ?? []) {
        expect(
          miniatura.proporcao,
          `${id}/${miniatura.rotulo}`,
        ).toBeGreaterThan(0);
        expect(miniatura.largura, `${id}/${miniatura.rotulo}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("logo e avatar são redondos", () => {
    expect(espacoDeImagem("logo").forma).toBe("redondo");
    expect(espacoDeImagem("avatar").forma).toBe("redondo");
  });

  it("escreve a recomendação ao lado de cada campo", () => {
    expect(medidasDoEspaco(espacoDeImagem("logo"))).toBe("512 × 512 px");
    expect(textoRecomendado("fundo-da-vitrine")).toBe(
      "Recomendado: 1600 × 1200 px no computador e 720 × 1600 px no celular, JPG/PNG/WebP até 3 MB cada.",
    );
    expect(textoRecomendado("topo-do-cardapio")).toBe(
      "Recomendado: 1600 × 400 px no computador e 1140 × 600 px no celular, JPG/PNG/WebP até 3 MB cada.",
    );
    expect(textoRecomendado("logo")).toBe(
      "Recomendado: 512 × 512 px, JPG/PNG/WebP até 1 MB.",
    );
    expect(textoRecomendado("banner-celular")).toContain("960 × 540 px");
    expect(textoRecomendado("story")).toContain("1080 × 1920 px");
  });
});

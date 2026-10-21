/**
 * Fotos da loja (card #36): a moldura de cada foto é a do lugar real onde ela
 * aparece, e o painel só pede fotos de onde a loja as guarda.
 */
import { describe, expect, it } from "vitest";

import { enderecoPermitido } from "../src/lib/endereco-de-foto-permitido.ts";
import { espacoDeImagem } from "../src/lib/espacos-de-imagem.ts";

describe("a moldura de cada foto é a do lugar real (o bug do ajuste que 'não chegava' à vitrine)", () => {
  /**
   * O cartão de apresentação da loja (`.sc-loja__painel`) mede, no notebook de
   * 1440 × 900, 1168 × 852 px; no celular de 390 × 844, 358 × 804 px. A foto o
   * COBRE (`object-fit: cover`). Com a moldura antiga (4:1, 1600 × 400) o dono
   * ajustava uma faixa, mas a loja mostrava só o miolo dela, esticado para o
   * cartão: o ajuste não aparecia. Agora a moldura tem a proporção do cartão.
   */
  const CARTAO = { computador: 1168 / 852, celular: 358 / 804 };
  const FAIXA_DO_CARDAPIO = { computador: 1104 / 276, celular: 366 / 192 };

  /** Quanto da foto aparece quando ela cobre uma caixa de outra proporção (0 a 1). */
  const parteVisivel = (foto: number, caixa: number) =>
    foto > caixa ? caixa / foto : foto / caixa;

  it("o fundo da vitrine tem a proporção do cartão, no computador e no celular", () => {
    const [computador, celular] = espacoDeImagem("fundo-da-vitrine").variantes!;
    expect(computador!.largura / computador!.altura).toBeCloseTo(
      CARTAO.computador,
      1,
    );
    expect(celular!.largura / celular!.altura).toBeCloseTo(CARTAO.celular, 1);
    // Quase nada da foto ajustada é cortado na loja (antes: só 29% aparecia).
    expect(
      parteVisivel(computador!.largura / computador!.altura, CARTAO.computador),
    ).toBeGreaterThan(0.95);
    expect(
      parteVisivel(celular!.largura / celular!.altura, CARTAO.celular),
    ).toBeGreaterThan(0.95);
    expect(parteVisivel(4, CARTAO.computador)).toBeLessThan(0.4);
  });

  it("o topo do cardápio tem a proporção da faixa, no computador e no celular", () => {
    const [computador, celular] = espacoDeImagem("topo-do-cardapio").variantes!;
    expect(
      parteVisivel(
        computador!.largura / computador!.altura,
        FAIXA_DO_CARDAPIO.computador,
      ),
    ).toBeGreaterThan(0.95);
    expect(
      parteVisivel(
        celular!.largura / celular!.altura,
        FAIXA_DO_CARDAPIO.celular,
      ),
    ).toBeGreaterThan(0.95);
  });

  it("as duas fotos têm tamanhos de saída diferentes (uma não serve para a outra)", () => {
    const fundo = espacoDeImagem("fundo-da-vitrine");
    const topo = espacoDeImagem("topo-do-cardapio");
    expect([fundo.largura, fundo.altura]).not.toEqual([
      topo.largura,
      topo.altura,
    ]);
  });
});

describe("o painel só busca fotos de onde a loja as guarda", () => {
  const SITE = "http://localhost:3000";
  const API = "http://localhost:3001";

  it("aceita a pasta pública do site, o armazenamento da API e o Cloudinary", () => {
    expect(enderecoPermitido("/demo/loja/logo.webp", SITE, API)?.href).toBe(
      `${SITE}/demo/loja/logo.webp`,
    );
    expect(
      enderecoPermitido(`${API}/v1/midia/arquivos/l/loja/a.webp`, SITE, API),
    ).not.toBeNull();
    expect(
      enderecoPermitido(
        "https://res.cloudinary.com/x/image/upload/a.webp",
        SITE,
        API,
      ),
    ).not.toBeNull();
  });

  it("recusa qualquer outro lugar (rede interna, outros sites, caminhos subindo pastas)", () => {
    for (const pedido of [
      "http://localhost:3001/v1/lojas",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:5432/",
      "https://exemplo.test/foto.jpg",
      "https://res.cloudinary.com.malvado.test/a.jpg",
      "/demo/../../etc/passwd",
      "/api/loja/tema",
      "file:///etc/passwd",
      "isto não é endereço",
      "",
    ]) {
      expect(enderecoPermitido(pedido, SITE, API), pedido).toBeNull();
    }
  });
});

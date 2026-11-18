// @vitest-environment jsdom
/**
 * Card #108 · T-10807 — nada do que funciona hoje quebra: banners de teste só
 * fora de produção, dados estruturados só sem recorte, loja suspensa "não
 * encontrada", o modo cardápio na TV e os testes legados da vitrine existindo,
 * ativos e sem `skip` nem `todo`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BANNERS_DE_DEMONSTRACAO } from "../src/features/vitrine/banners-de-demonstracao";

import { RESUMO, renderizarTela } from "./apoio-do-catalogo-na-tela";

const AQUI = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("banners de teste, dados estruturados e loja suspensa", () => {
  const demo = BANNERS_DE_DEMONSTRACAO[0]!.alt;

  it("[CA-7] @spec:AC-10831 ?banners=demo mostra os banners de exemplo fora de produção", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { html } = await renderizarTela({ banners: "demo" });
    expect(html).toContain(demo);
  });

  it("[CA-7] @spec:AC-10831 ?banners=demo não faz nada em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { html } = await renderizarTela({ banners: "demo" });
    expect(html).not.toContain(demo);
    expect(html).not.toContain("banners-demo/");
  });

  it("[CA-7] @spec:AC-10831 os dados estruturados saem só sem busca, filtro, ordem nem atacado", async () => {
    const semRecorte = await renderizarTela();
    expect(semRecorte.html).toContain("application/ld+json");

    const recortes: Array<Record<string, string | string[]>> = [
      { busca: "pastel" },
      { filtro: ["tamanho=M"] },
      { ordem: "menor-preco" },
      { atacado: "1" },
    ];
    for (const consulta of recortes) {
      const { html } = await renderizarTela(consulta, {
        resumo: {
          ...RESUMO,
          filtros: [{ chave: "tamanho", nome: "Tamanho", valores: ["M"] }],
        },
      });
      expect(html, JSON.stringify(consulta)).not.toContain(
        "application/ld+json",
      );
    }
  });

  it("[CA-7] @spec:AC-10831 loja suspensa ou inexistente continua dando 'não encontrada'", async () => {
    await expect(
      renderizarTela({}, { estadoDaVitrine: "nao-encontrada" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("os testes legados continuam vivos (AC-10830)", () => {
  const LEGADOS = [
    "vitrine-atacado.test.tsx",
    "vitrine-barra-e-ordem.test.tsx",
    "vitrine-busca.test.tsx",
    "vitrine-catalogo.test.tsx",
    "vitrine-filtro-especificacao.test.tsx",
    "vitrine-paginada.test.tsx",
    "vitrine-acessibilidade.test.ts",
    "filtro-atacado.test.tsx",
    "capa-do-catalogo.test.tsx",
    "config-aparencia.test.tsx",
    "cardapio-na-tv.test.tsx",
    "cardapio-na-tv-codigo-e-estados.test.tsx",
    "cardapio-na-tv-medidas.test.tsx",
  ];

  for (const arquivo of LEGADOS) {
    it(`[CA-7] @spec:AC-10830 ${arquivo} existe, tem testes e nenhum está pulado`, () => {
      const texto = readFileSync(resolve(AQUI, arquivo), "utf8");
      expect(texto).toMatch(/\b(it|test)\(/);
      expect(texto).not.toMatch(/\b(it|test|describe)\.(skip|todo|only)\b/);
      expect(texto).not.toMatch(/\b(xit|xdescribe|xtest)\(/);
    });
  }

  it("[CA-7] @spec:AC-10830 o texto que o dono ainda não mudou segue fixado: 'Limpar a busca'", () => {
    const texto = readFileSync(resolve(AQUI, "vitrine-busca.test.tsx"), "utf8");
    expect(texto).toContain("Limpar a busca");
  });
});

describe("o modo cardápio na TV não foi tocado", () => {
  it("[CA-7] @spec:AC-10830 a TV não lê as abas, o chip nem os campos novos do catálogo na tela", () => {
    const pastaTv = resolve(AQUI, "../src/features/tv");
    for (const arquivo of ["ExibicaoDeCardapio.tsx", "useCatalogoDaTv.ts"]) {
      const texto = readFileSync(resolve(pastaTv, arquivo), "utf8");
      expect(texto).not.toMatch(/AbaDeCategoria|filtrosAtivos|totalEncontrado/);
    }
  });
});

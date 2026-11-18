// @vitest-environment jsdom
/**
 * Card #108 · T-10807 — o catálogo é da loja, e não de um segmento: título pelo
 * rótulo do ramo, topo curto (voltar, nome, situação) e textos que não copiam
 * o exemplo do mockup (veículo, chassi, garantia...).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CapaDaVitrine } from "../src/features/vitrine/CapaDaVitrine";

import {
  LOJA,
  renderizarTela,
  vitrineDaLoja,
} from "./apoio-do-catalogo-na-tela";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(AQUI, "../src");

/** Todos os arquivos de código do site, para provar que um texto não existe. */
function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(tsx?|css)$/.test(nome) ? [caminho] : [];
  });
}

describe("o título usa o rótulo do ramo", () => {
  it("[CA-7] @spec:AC-10827 loja de comida: 'Cardápio de Casa do Sabor'", async () => {
    const { documento } = await renderizarTela(
      {},
      { vitrine: vitrineDaLoja({ rotulo: "Cardápio", nome: "Casa do Sabor" }) },
    );
    const titulos = documento.querySelectorAll("h1");
    expect(titulos).toHaveLength(1);
    expect(titulos[0]?.textContent).toBe("Cardápio de Casa do Sabor");
  });

  it("[CA-7] @spec:AC-10827 loja de roupas: 'Catálogo de Moda da Vila'", async () => {
    const { documento } = await renderizarTela(
      {},
      { vitrine: vitrineDaLoja({ rotulo: "Catálogo", nome: "Moda da Vila" }) },
    );
    expect(documento.querySelector("h1")?.textContent).toBe(
      "Catálogo de Moda da Vila",
    );
  });

  it("[CA-7] @spec:AC-10827 'Detalhes do Produto' não aparece na tela nem em nenhum arquivo do site", async () => {
    const { html } = await renderizarTela();
    expect(html).not.toMatch(/Detalhes do Produto/i);

    const comOTexto = arquivosDe(SRC).filter((arquivo) =>
      /Detalhes do Produto/i.test(readFileSync(arquivo, "utf8")),
    );
    expect(comOTexto).toEqual([]);
  });
});

describe("o cabeçalho do catálogo (layout Stitch, card #130)", () => {
  it("[CA-7] @spec:AC-10828 tem Voltar à vitrine, o nome da loja e a situação em texto", async () => {
    const { documento } = await renderizarTela();
    const topo = documento.querySelector("header.sc-catalogo-topo")!;
    expect(topo).not.toBeNull();

    const voltar = topo.querySelector<HTMLAnchorElement>(
      "a.sc-catalogo-topo__voltar",
    )!;
    expect(voltar.textContent?.trim()).toBe("Voltar à vitrine");
    expect(voltar.getAttribute("href")).toBe(`/loja/${LOJA}`);

    expect(topo.querySelector(".sc-catalogo-topo__nome")?.textContent).toContain(
      "Casa do Sabor",
    );
    expect(
      topo.querySelector(".sc-catalogo-topo__situacao")?.textContent,
    ).toContain("Aberta agora");
    // O "i" do Sobre continua, e abre a janela por cima do cardápio.
    expect(topo.querySelector("a[data-abre-sobre]")).not.toBeNull();
  });

  it("[CA-7] @spec:AC-10828 loja fechada diz 'Fechada' em texto, e não só na cor do ponto", async () => {
    const { documento } = await renderizarTela(
      {},
      { vitrine: vitrineDaLoja({ aberta: false }) },
    );
    expect(
      documento.querySelector(".sc-catalogo-topo__situacao")?.textContent,
    ).toContain("Fechada");
  });

  it("[CA-7] @spec:AC-10828 o layout antigo saiu: nem a capa com foto nem a variante compacta", async () => {
    const { html } = await renderizarTela();
    expect(html).not.toContain("sc-vitrine__capa");
    // A capa grande continua existindo para quem a usa, sem o ramo compacto.
    const capa = renderToStaticMarkup(
      <CapaDaVitrine
        apelidoDaLoja="x"
        nomeDaLoja="Loja X"
        rotuloDoCatalogo="Cardápio"
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      />,
    );
    expect(capa).not.toContain("sc-vitrine__capa--compacta");
    expect(capa).not.toContain("Voltar à vitrine");
  });
});

describe("textos que servem a qualquer ramo", () => {
  const PROIBIDOS =
    /ve[ií]culo|placa|chassi|\bOEM\b|c[oó]digo de f[aá]brica|compat[ií]vel|garantia de|nota fiscal|pronta entrega|entrega em \d+ min|modelo, ano/i;

  it("[CA-7] @spec:AC-10829 a tela não fala de veículo, chassi, garantia nem nota que o cadastro não informa", async () => {
    const { documento } = await renderizarTela(
      {},
      {
        vitrine: vitrineDaLoja({ rotulo: "Catálogo", nome: "Moda da Vila" }),
      },
    );
    expect(documento.body.textContent).not.toMatch(PROIBIDOS);
  });

  it("[CA-7] @spec:AC-10829 a busca diz Buscar no catálogo (rótulo do ramo), e não 'por modelo, ano ou código'", async () => {
    const { documento } = await renderizarTela(
      {},
      {
        vitrine: vitrineDaLoja({ rotulo: "Catálogo" }),
      },
    );
    const rotulo = documento.querySelector(
      'form[role="search"] label',
    )?.textContent;
    expect(rotulo).toBe("Buscar no catálogo");
    expect(rotulo).not.toMatch(/modelo|ano|código/i);
  });

  it("[CA-7] @spec:AC-10829 os textos do catálogo no código não trazem os termos do exemplo", () => {
    const pastas = [
      join(SRC, "features/vitrine"),
      join(SRC, "app/(loja)/loja/[slug]/cardapio"),
    ];
    const arquivos = [
      ...pastas.flatMap(arquivosDe),
      join(SRC, "server/catalogo-na-tela.ts"),
      join(SRC, "lib/catalogo.ts"),
    ];
    const achados = arquivos.flatMap((arquivo) => {
      const casa = readFileSync(arquivo, "utf8").match(PROIBIDOS);
      return casa ? [`${arquivo}: ${casa[0]}`] : [];
    });
    expect(achados).toEqual([]);
  });
});

describe("a cor da loja não existe", () => {
  it("[CA-7] @spec:AC-10831 a página NÃO leva a cor de destaque da loja: só o verde SimpleClick", async () => {
    const { html } = await renderizarTela();
    expect(html).not.toContain("#ff8a00");
    expect(html).not.toMatch(/--cor-primaria:|--cor-marca:/);
  });

  it("[CA-7] @spec:AC-10831 chip ativo e foco usam os tokens de cor do SimpleClick", () => {
    const css = readFileSync(
      resolve(AQUI, "../../../packages/ui/styles/componentes.css"),
      "utf8",
    );
    const ativo = css.match(/\.sc-chip--ativo,[^{]*\{([^}]*)\}/)?.[1] ?? "";
    expect(ativo).toContain("--cor-primaria");
    expect(ativo).not.toMatch(/#b7ff00|--marca-verde/i);
    expect(css).toMatch(/\.sc-chip:focus-visible[^{]*\{[^}]*--cor-foco/);
  });
});

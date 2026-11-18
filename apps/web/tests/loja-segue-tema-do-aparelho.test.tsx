import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TemaDaMarca } from "@simpleclick/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * Card #131: a loja (vitrine, catálogo, sobre, detalhe, sacola e
 * acompanhamento do pedido) segue o tema do aparelho, como o resto do site.
 * Nada nela fixa o escuro, e o que era "verde-limão como letra" passa a usar
 * o verde de texto do tema, que se lê no claro e no escuro.
 */
const estilo = (nome: string): string =>
  readFileSync(
    new URL(`../../../packages/ui/styles/${nome}.css`, import.meta.url),
    "utf8",
  );

const fontes = (pasta: string): string[] => {
  const raiz = fileURLToPath(new URL(`../src/${pasta}`, import.meta.url));
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(nome) && !/\.test\./.test(nome))
        achados.push(caminho);
    }
  };
  andar(raiz);
  return achados;
};

/** O corpo da regra cujo seletor é exatamente `seletor`. */
const regra = (css: string, seletor: string): string => {
  const inicio = css.indexOf(`${seletor} {`);
  expect(inicio, `regra ${seletor}`).toBeGreaterThanOrEqual(0);
  return css.slice(inicio, css.indexOf("}", inicio));
};

describe("a loja segue o tema do aparelho", () => {
  it("o envelope da loja não fixa tema nenhum", () => {
    const html = renderToStaticMarkup(
      <TemaDaMarca className="sc-pagina-da-loja">
        <p>oi</p>
      </TemaDaMarca>,
    );
    expect(html).toContain("sc-tema-loja");
    expect(html).not.toContain("data-tema");
  });

  it("nenhuma tela da loja, do catálogo, da sacola ou do pedido força o escuro", () => {
    const pastas = [
      "app/(loja)",
      "features/loja",
      "features/vitrine",
      "features/carrinho",
      "features/pedido",
    ];
    const achados = pastas
      .flatMap(fontes)
      .filter((caminho) =>
        /data-tema=["{]/.test(readFileSync(caminho, "utf8")),
      );
    expect(achados).toEqual([]);
  });

  it("a página da loja pinta com o fundo do tema, e não com o preto fixo", () => {
    const corpo = regra(
      estilo("narrativa"),
      "html:has(.sc-tema-loja),\nhtml:has(.sc-tema-loja) body",
    );
    expect(corpo).toContain("var(--cor-fundo)");
    expect(corpo).not.toMatch(/color-scheme|--marca-preto-tecnologico/);
  });

  it("dentro da loja, o verde como letra é o verde de texto do tema", () => {
    const corpo = regra(
      estilo("componentes"),
      ".sc-tema-loja,\n.sc-tema-loja [data-tema]",
    );
    expect(corpo).toContain("--cor-marca-texto: var(--cor-primaria-texto)");
  });

  it("textos e ícones da vitrine não usam o verde de preenchimento como letra", () => {
    const css = estilo("narrativa") + estilo("vitrine");
    for (const seletor of [
      ".sc-loja__acao--whatsapp",
      ".sc-loja__descricao-icone",
      ".sc-loja__ler-mais",
      ".sc-loja__ficha-icone",
      ".sc-loja__contato-icone",
      ".sc-loja__ver-todas",
    ]) {
      const corpo = regra(css, seletor);
      expect(corpo, seletor).toMatch(/\bcolor: var\(--cor-primaria-texto\)/);
    }
  });
});

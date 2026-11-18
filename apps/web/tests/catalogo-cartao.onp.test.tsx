// @vitest-environment jsdom
/**
 * Card #108 · T-10804 — o cartão em lista (celular) e em grade (tablet e
 * computador): preço, preço anterior, atacado, "Ver opções", esgotado e fora
 * do horário, e os atributos que a janela do produto (#109) lê.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartaoDeProduto } from "../src/features/vitrine/CartaoDeProduto";
import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import type { ProdutoNaTela, SecaoNaTela } from "../src/lib/catalogo";

const FOTO =
  "https://res.cloudinary.com/simpleclick/image/upload/v1/lojas/pastel.webp";

function produto(extra: Partial<ProdutoNaTela> = {}): ProdutoNaTela {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    apelido: "pastel",
    nome: "Pastel de carne",
    chamada: null,
    preco: "R$ 49,90",
    precoCentavos: 4990,
    precoAnterior: null,
    imagem: FOTO,
    disponivel: true,
    link: "/loja/casa-do-sabor/produto/pastel",
    ...extra,
  };
}

function cartao(p: ProdutoNaTela, formato?: "faixa" | "catalogo"): HTMLElement {
  const pagina = document.createElement("div");
  pagina.innerHTML = renderToStaticMarkup(
    <CartaoDeProduto produto={p} {...(formato ? { formato } : {})} />,
  );
  return pagina.querySelector<HTMLElement>(".sc-vitrine__cartao")!;
}

const CSS = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/ui/styles/vitrine.css",
  ),
  "utf8",
);
const BLOCO = CSS.slice(CSS.indexOf("/* --- o cartão do catálogo (#108"));

describe("os dois formatos do cartão", () => {
  it("[CA-2] @spec:AC-10806 o formato catálogo troca o sizes para a foto pequena da lista", () => {
    const foto = cartao(produto(), "catalogo").querySelector("img")!;
    expect(foto.getAttribute("sizes")).toBe(
      "(max-width: 767px) 96px, (max-width: 1279px) 33vw, 320px",
    );
    expect(foto.getAttribute("width")).toBe("320");
    expect(foto.getAttribute("height")).toBe("240");
    expect(
      cartao(produto(), "catalogo").classList.contains(
        "sc-vitrine__cartao--catalogo",
      ),
    ).toBe(true);
  });

  it("[CA-2] @spec:AC-10806 o formato padrão (a faixa de destaques) fica exatamente como era", () => {
    const padrao = cartao(produto());
    expect(padrao.querySelector("img")?.getAttribute("sizes")).toBe(
      "(max-width: 540px) 50vw, 320px",
    );
    expect(padrao.classList.contains("sc-vitrine__cartao--catalogo")).toBe(
      false,
    );
  });

  it("[CA-2] @spec:AC-10806 a grade do catálogo usa o formato catálogo em todos os cartões", () => {
    const secao: SecaoNaTela = {
      id: "s1",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produto(),
        produto({ id: "00000000-0000-4000-8000-000000000002" }),
      ],
      total: 2,
      mais: null,
    };
    const html = renderToStaticMarkup(<GradeDeProdutos secao={secao} />);
    expect(html.match(/sc-vitrine__cartao--catalogo/g)).toHaveLength(2);
  });

  it("[CA-2] @spec:AC-10806 o CSS faz lista de uma coluna no celular e grade de três a partir de 768px", () => {
    expect(BLOCO).toMatch(
      /\.sc-catalogo \.sc-vitrine__grade\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    const tablet = BLOCO.slice(BLOCO.indexOf("@media (min-width: 768px)"));
    expect(tablet).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr))",
    );
    // A foto da lista é pequena e quadrada; na grade ela ocupa a largura do
    // cartão, quadrada como na referência do Stitch (card #130).
    expect(BLOCO).toMatch(/\.sc-vitrine__moldura\s*\{[^}]*inline-size:\s*6rem/);
    expect(tablet).toMatch(
      /\.sc-vitrine__moldura\s*\{[^}]*inline-size:\s*100%;[^}]*aspect-ratio:\s*1;/,
    );
  });
});

describe("preço e condição no cartão", () => {
  it("[CA-2] @spec:AC-10818 mostra o preço e o preço anterior riscado, com 'De' e 'por' para o leitor", () => {
    const el = cartao(
      produto({ preco: "R$ 49,90", precoAnterior: "R$ 59,90" }),
      "catalogo",
    );
    expect(el.querySelector(".sc-vitrine__preco-anterior s")?.textContent).toBe(
      "R$ 59,90",
    );
    expect(el.querySelector(".sc-vitrine__preco")?.textContent).toBe(
      "por R$ 49,90",
    );
    expect(
      el.querySelector(".sc-vitrine__preco-anterior .sc-so-leitor")
        ?.textContent,
    ).toBe("De ");
    expect(
      el.querySelector(".sc-vitrine__preco .sc-so-leitor")?.textContent,
    ).toBe("por ");
  });

  it("[CA-2] @spec:AC-10818 sem preço anterior, nenhum desconto nem selo é inventado", () => {
    const el = cartao(produto(), "catalogo");
    expect(el.querySelector(".sc-vitrine__preco-anterior")).toBeNull();
    expect(el.textContent).not.toMatch(/%|Top|★/);
  });

  it("[CA-2] @spec:AC-10819 a linha de atacado aparece só quando o produto tem atacado", () => {
    const com = cartao(
      produto({ atacado: "Atacado a partir de 12 un.: R$ 7,49" }),
      "catalogo",
    );
    expect(com.querySelector(".sc-vitrine__atacado")?.textContent).toBe(
      "Atacado a partir de 12 un.: R$ 7,49",
    );
    expect(
      cartao(produto(), "catalogo").querySelector(".sc-vitrine__atacado"),
    ).toBeNull();
  });

  it("[CA-2] @spec:AC-10820 preço que depende da escolha mostra o convite, sem inventar 'a partir de'", () => {
    const el = cartao(
      produto({ preco: null, precoCentavos: null }),
      "catalogo",
    );
    expect(el.querySelector(".sc-vitrine__preco--variavel")?.textContent).toBe(
      "Ver opções",
    );
    expect(el.textContent).not.toMatch(/a partir de/i);
    // E tocar no cartão leva ao produto (abre o detalhe), sem adicionar à sacola.
    expect(el.querySelector("a.sc-vitrine__link")?.getAttribute("href")).toBe(
      "/loja/casa-do-sabor/produto/pastel",
    );
  });
});

describe("esgotado e fora do horário", () => {
  it("[CA-2] @spec:AC-10821 cada motivo tem selo em texto e o cartão não tem o botão de adicionar", () => {
    for (const [motivo, texto] of [
      ["ESGOTADO", "Esgotado"],
      ["FORA_DO_HORARIO", "Fora do horário"],
    ] as const) {
      const el = cartao(
        produto({ disponivel: false, motivoIndisponivel: motivo }),
        "catalogo",
      );
      expect(el.querySelector(".sc-vitrine__esgotado-selo")?.textContent).toBe(
        texto,
      );
      expect(el.querySelector("[data-adicionar-produto]")).toBeNull();
      expect(el.classList.contains("sc-vitrine__cartao--esgotado")).toBe(true);
    }
  });

  it("[CA-2] @spec:AC-10821 o cartão não mostra quantidade em estoque", () => {
    const el = cartao(
      produto({ disponivel: false, motivoIndisponivel: "ESGOTADO" }),
      "catalogo",
    );
    expect(el.textContent).not.toMatch(/estoque|\d+\s*(un|unid)/i);
  });
});

describe("o contrato com a janela do produto (#109)", () => {
  it("[CA-2] @spec:AC-10822 o '+' existe só em produto disponível e leva data-adicionar-produto", () => {
    const el = cartao(produto(), "catalogo");
    const mais = el.querySelector<HTMLAnchorElement>("a.sc-vitrine__mais")!;
    expect(mais.getAttribute("data-adicionar-produto")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(mais.getAttribute("aria-label")).toBe(
      "Adicionar Pastel de carne à sacola",
    );
    // Sem JavaScript, o '+' também navega para o produto.
    expect(mais.getAttribute("href")).toBe(
      "/loja/casa-do-sabor/produto/pastel",
    );
  });

  it("[CA-2] @spec:AC-10822 o link do cartão mantém data-abre-produto", () => {
    const link = cartao(produto(), "catalogo").querySelector(
      "a.sc-vitrine__link",
    )!;
    expect(link.getAttribute("data-abre-produto")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("[CA-2] @spec:AC-10822 os dois formatos têm os mesmos atributos data-*", () => {
    const a = cartao(produto(), "catalogo");
    const b = cartao(produto());
    for (const el of [a, b]) {
      expect(el.querySelector("[data-abre-produto]")).not.toBeNull();
      expect(el.querySelector("[data-adicionar-produto]")).not.toBeNull();
    }
  });
});

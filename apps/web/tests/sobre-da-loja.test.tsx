// @vitest-environment jsdom
/**
 * Prova da página Sobre da loja, do lado da tela (AC-421, AC-422, AC-423).
 *
 * O componente é desenhado por `renderToStaticMarkup`, e isso é a prova em si:
 * é exatamente o HTML que o servidor entrega antes de qualquer script rodar.
 * O que aparece aqui aparece para quem desligou o JavaScript.
 *
 * O QUE ESTA PROVA NÃO ALCANÇA fica em outros dois lugares: que a API só manda
 * o WhatsApp marcado como público e nada do cadastro do dono mora em
 * `apps/api/tests/vitrine-sem-dado-sensivel.test.ts`; que a rota existe de
 * verdade no framework e responde sem script mora em
 * `e2e/specs/sobre-da-loja.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SobreDaLoja,
  type DadosSobreDaLoja,
} from "../src/features/loja/SobreDaLoja.tsx";

const LOJA: DadosSobreDaLoja = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  sobre: "Uma história feita de receitas de família.",
  logo: "https://exemplo.test/logo.png",
  capa: "https://exemplo.test/capa.jpg",
  cores: null,
  enderecoParaRetirada: {
    logradouro: "Rua das Flores",
    numero: "10",
    complemento: null,
    bairro: "Centro",
    cidade: "Santos",
    uf: "SP",
  },
  whatsappPublico: "5511999998888",
};

/** O HTML do servidor, já convertido em árvore para as perguntas da prova. */
function desenhar(loja: DadosSobreDaLoja = LOJA): {
  html: string;
  doc: Document;
} {
  const html = renderToStaticMarkup(<SobreDaLoja loja={loja} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc };
}

/** Os endereços de todos os links, na ordem em que aparecem. */
function enderecosDosLinks(doc: Document): string[] {
  return [...doc.querySelectorAll("a")].map(
    (link) => link.getAttribute("href") ?? "",
  );
}

describe("a página Sobre apresenta a loja (AC-421)", () => {
  it("@spec:AC-421 mostra a história, a logo e a capa da loja", () => {
    const { doc } = desenhar();

    expect(doc.querySelector("h1")?.textContent).toBe("Sabor & Cia");
    expect(doc.body.textContent).toContain(
      "Uma história feita de receitas de família.",
    );

    const imagens = [...doc.querySelectorAll("img")].map((imagem) =>
      imagem.getAttribute("src"),
    );
    expect(imagens).toContain("https://exemplo.test/logo.png");
    expect(imagens).toContain("https://exemplo.test/capa.jpg");
  });

  it("@spec:AC-421 oferece um caminho claro de volta para a vitrine", () => {
    const { doc } = desenhar();

    // O caminho de volta é o PRIMEIRO link da página e diz para onde leva:
    // quem chegou pela história da loja precisa achar a vitrine sem procurar.
    const primeiro = doc.querySelector("a");
    expect(primeiro?.getAttribute("href")).toBe("/l/sabor-e-cia");
    expect(primeiro?.textContent).toContain("Voltar para Sabor & Cia");
    expect(enderecosDosLinks(doc)).toContain("/l/sabor-e-cia/catalogo");
  });

  it("@spec:AC-421 loja sem texto próprio não fica com a página em branco", () => {
    const { doc } = desenhar({ ...LOJA, sobre: null, logo: null, capa: null });

    // Sem história escrita, a página ainda diz de quem é; sem imagem, não
    // desenha moldura vazia apontando para lugar nenhum.
    expect(doc.querySelector("h1")?.textContent).toBe("Sabor & Cia");
    expect(doc.body.textContent).toContain(
      "Conheça a história da Sabor & Cia.",
    );
    expect(doc.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("a página Sobre publica só o contato autorizado (AC-422)", () => {
  it("@spec:AC-422 mostra o endereço de retirada e o WhatsApp marcado como público", () => {
    const { html, doc } = desenhar();

    const endereco = doc.querySelector("address")?.textContent ?? "";
    expect(endereco).toContain("Rua das Flores, 10");
    expect(endereco).toContain("Centro");
    expect(endereco).toContain("Santos / SP");
    expect(html).toContain('href="https://wa.me/5511999998888"');
  });

  it("@spec:AC-422 não desenha contato quando o dono não o marcou como público", () => {
    const { html } = desenhar({ ...LOJA, whatsappPublico: null });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("WhatsApp público");
    expect(html).not.toContain("Fale com a loja");
  });

  it("@spec:AC-422 o número publicado vira link só com dígitos", () => {
    // O dono pode ter digitado com máscara; o link do WhatsApp só aceita
    // dígitos, e um número com espaço abriria a conversa com ninguém.
    const { doc } = desenhar({
      ...LOJA,
      whatsappPublico: "+55 (11) 99999-8888",
    });

    expect(enderecosDosLinks(doc)).toContain("https://wa.me/5511999998888");
  });
});

describe("a página Sobre continua útil sem JavaScript (AC-423)", () => {
  it("@spec:AC-423 o HTML do servidor já traz história, retirada, contato e navegação", () => {
    const { html, doc } = desenhar();

    // Nada de script no que o servidor entrega: o conteúdo inteiro está no
    // HTML, e a página não espera o navegador montar nada.
    expect(html).not.toContain("<script");
    expect(doc.body.textContent).toContain(
      "Uma história feita de receitas de família.",
    );
    expect(doc.querySelector("address")?.textContent).toContain(
      "Rua das Flores",
    );

    // Navegação e contato são LINKS de verdade, com endereço: funcionam com o
    // script desligado, ao contrário de um botão que dependesse de clique.
    expect(enderecosDosLinks(doc)).toEqual([
      "/l/sabor-e-cia",
      "/l/sabor-e-cia/catalogo",
      "https://wa.me/5511999998888",
    ]);
    expect(doc.querySelectorAll("button")).toHaveLength(0);
  });

  it("@spec:AC-423 a página e o componente são do servidor, sem pedir script ao navegador", () => {
    // `"use client"` faria o Next mandar o componente como pacote de script
    // para o navegador montar. A página Sobre é conteúdo: nasce pronta.
    const raiz = process.cwd();
    const arquivos = [
      "apps/web/src/features/loja/SobreDaLoja.tsx",
      "apps/web/src/app/(loja)/l/[slug]/sobre/page.tsx",
    ];

    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(raiz, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/^\s*["']use client["']/m);
    }
  });
});

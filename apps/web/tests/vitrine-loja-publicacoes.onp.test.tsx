// @vitest-environment jsdom
/**
 * Card #107 · publicações e Sobre: tudo no HTML do servidor, sem aba escondida.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { desenharPerfil, post } from "./loja-fixtures";

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("publicações e Sobre", () => {
  it("[CA-6] @spec:AC-10714 as publicações aparecem só quando há produto à venda", () => {
    const sem = desenharPerfil({ posts: [] });
    expect(sem.querySelector("#publicacoes")).toBeNull();
    expect(sem.querySelector(".sc-loja__publicacoes-grade")).toBeNull();

    const com = desenharPerfil({ posts: [post("p1", "Pastel de carne")] });
    expect(
      com.querySelector("#publicacoes .sc-loja__publicacoes-grade"),
    ).not.toBeNull();
    expect(com.querySelector("#publicacoes")?.textContent).toContain(
      "Pastel de carne",
    );
  });

  it("[CA-6] @spec:AC-10721 todo o conteúdo está no HTML, sem painel escondido por script", () => {
    const pagina = desenharPerfil({ posts: [post("p1", "Pastel de carne")] });
    expect(pagina.querySelectorAll("[hidden]").length).toBe(0);
    expect(pagina.querySelector("script")).toBeNull();
    expect(pagina.querySelector('[role="tabpanel"]')).toBeNull();
    // O texto do Sobre já vem do servidor, mesmo com a janela fechada.
    expect(pagina.textContent).toContain("Desde 2009 no bairro.");
  });

  it("[CA-6] @spec:AC-10715 o Sobre continua com endereço próprio e canônico próprio", () => {
    const sobre = fonte("apps/web/src/app/(loja)/loja/[slug]/sobre/page.tsx");
    expect(sobre).toContain("enderecoSobreDaLoja(loja.apelido)");
    expect(sobre).toContain("Sobre a ${loja.nome}");
    const pagina = desenharPerfil({ sobreAberto: true });
    expect(pagina.querySelector("dialog[open]")).not.toBeNull();
    expect(
      pagina.querySelector('a[href="/loja/casa-do-ze/sobre"]'),
    ).not.toBeNull();
  });

  it("[CA-6] @spec:AC-10714 o /explorar não muda: o feed.css não ganhou regra solta da página da loja", () => {
    const css = fonte("apps/web/src/features/feed/feed.css");
    expect(css).not.toMatch(/^\s*\.sc-loja__/m);
  });
});

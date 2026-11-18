// @vitest-environment jsdom
/**
 * Card #129 · a vitrine da loja no layout do Stitch: cartão compacto com capa,
 * logo, nome e ações na mesma linha; botão do catálogo de largura total;
 * destaques em grade; nada dos enfeites antigos; só dado real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Vitrine } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  LOJA_DO_PERFIL,
  desenharPerfil,
  destaque,
  post,
} from "./loja-fixtures.tsx";

const RAIZ = join(import.meta.dirname, "..", "..", "..");

function fonte(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

describe("vitrine da loja no layout do Stitch", () => {
  it("[CA-1] @spec:AC-12901 o cartão da loja traz capa, situação, logo, nome sem marca-texto e ações na mesma identidade", () => {
    const pagina = desenharPerfil({
      loja: {
        ...LOJA_DO_PERFIL,
        whatsappPublico: "+55 (11) 91111-0001",
      } as unknown as Vitrine["loja"],
    });
    const painel = pagina.querySelector(".sc-loja__painel");
    expect(
      painel?.querySelector(".sc-loja__capa .sc-loja__situacao"),
    ).not.toBeNull();

    const identidade = painel?.querySelector("header.sc-loja__identidade");
    expect(identidade?.querySelector(".sc-loja__marca")).not.toBeNull();
    const nome = identidade?.querySelector("h1.sc-loja__nome");
    expect(nome?.textContent).toBe("Casa do Zé");
    expect(nome?.querySelector(".sc-marcador")).toBeNull();
    expect(
      identidade?.querySelector('.sc-loja__acoes a[href^="https://wa.me/"]'),
    ).not.toBeNull();
    // Nada do layout antigo: padrão de ícones, trama e o bloco grande do Sobre.
    expect(pagina.innerHTML).not.toMatch(
      /sc-loja__padrao|sc-loja__trama|sc-loja__sobre-texto|sc-loja__seta-caixa/,
    );
  });

  it("[CA-2] @spec:AC-12902 a descrição curta vem numa faixa própria e o catálogo é um link de largura total com 'Explorar'", () => {
    const pagina = desenharPerfil({ contagemDeItens: 11 });
    expect(pagina.querySelector(".sc-loja__descricao")?.textContent).toContain(
      "Tudo fresquinho.",
    );
    const entrar = pagina.querySelector<HTMLAnchorElement>("a.sc-loja__entrar");
    expect(entrar?.getAttribute("href")).toBe("/loja/casa-do-ze/cardapio");
    expect(entrar?.textContent).toContain("Ver o cardápio completo (11 itens)");
    // "Explorar →" é visual: o nome do link continua sendo o do catálogo.
    expect(
      entrar
        ?.querySelector(".sc-loja__entrar-explorar")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("[CA-3] @spec:AC-12903 os destaques da página da loja são uma grade, e não a tira que rola", () => {
    const pagina = desenharPerfil({
      destaques: [destaque("a", "Pastel"), destaque("b", "Coxinha")],
    });
    const grade = pagina.querySelector("ul.sc-vitrine__grade-destaques");
    expect(grade?.querySelectorAll("li")).toHaveLength(2);
    expect(grade?.hasAttribute("tabindex")).toBe(false);
    expect(pagina.querySelector(".sc-vitrine__tira")).toBeNull();
    // Cada cartão mantém o "+" com nome acessível.
    expect(
      grade?.querySelector("a.sc-vitrine__mais")?.getAttribute("aria-label"),
    ).toBe("Adicionar Pastel à sacola");
  });

  it("[CA-4] @spec:AC-12904 nada de nota, avaliação, selo, parcela ou compatibilidade na página", () => {
    const pagina = desenharPerfil({
      destaques: [destaque("a", "Pastel")],
      loja: {
        ...LOJA_DO_PERFIL,
        whatsappPublico: "+55 (11) 91111-0001",
      } as unknown as Vitrine["loja"],
    });
    expect(pagina.textContent).not.toMatch(
      /avalia|★|certificad|garantia|sem juros|\d+x |cashback|placa|chassi|compatib/i,
    );
  });

  it("[CA-5] @spec:AC-12905 a folha da loja não usa cor por loja nem o marca-texto antigo no nome", () => {
    const css = fonte("packages/ui/styles/narrativa.css");
    const blocoDaLoja = css.slice(css.indexOf(".sc-loja {"));
    expect(blocoDaLoja).not.toMatch(/--cor-marca\b|--cor-sobre-marca/);
    expect(blocoDaLoja).not.toMatch(/\.sc-loja__(padrao|trama|base|topo)\s*\{/);
  });

  it("[CA-6] @spec:AC-12906 as publicações são uma grade compacta de até 6, com 'Ver todas' só quando há mais", () => {
    const oito = Array.from({ length: 8 }, (_, i) =>
      post(`p${i}`, `Item ${i}`),
    );
    const pagina = desenharPerfil({ posts: oito });
    const grade = pagina.querySelector(
      "#publicacoes ul.sc-loja__publicacoes-grade",
    );
    expect(grade?.querySelectorAll("li")).toHaveLength(6);
    expect(grade?.querySelector("a")?.getAttribute("href")).toBe(
      "/loja/casa-do-ze/produto/p0",
    );
    // O feed comprido (posts gigantes com curtir/comentar) não está na vitrine.
    expect(pagina.querySelector(".sc-feed--perfil")).toBeNull();
    const todas = pagina.querySelector<HTMLAnchorElement>(
      "a.sc-loja__ver-todas",
    );
    expect(todas?.textContent).toContain("Ver todas as publicações");
    expect(todas?.getAttribute("href")).toBe("/loja/casa-do-ze/cardapio");

    const poucas = desenharPerfil({ posts: oito.slice(0, 3) });
    expect(
      poucas.querySelectorAll(".sc-loja__publicacoes-grade li"),
    ).toHaveLength(3);
    expect(poucas.querySelector("a.sc-loja__ver-todas")).toBeNull();
  });
});

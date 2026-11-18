// @vitest-environment jsdom
/**
 * Card #107 · faixa de chips e destaques: links de verdade, e só com conteúdo.
 */
import { describe, expect, it } from "vitest";

import {
  desenharPerfil,
  destaque,
  LOJA_DO_PERFIL,
  post,
} from "./loja-fixtures";

describe("destaques da loja", () => {
  it("[CA-5] @spec:AC-10713 sem destaques, a seção, o título e o chip não existem", () => {
    const pagina = desenharPerfil({ destaques: [] });
    expect(pagina.querySelector("#destaques")).toBeNull();
    expect(pagina.querySelector(".sc-vitrine__destaques")).toBeNull();
    expect(pagina.querySelector('a[href="#destaques"]')).toBeNull();
  });

  it("[CA-5] @spec:AC-10713 com destaques, mostra nome, preço e link do produto da própria loja", () => {
    const pagina = desenharPerfil({
      destaques: [
        destaque("pastel", "Pastel de carne"),
        destaque("coxinha", "Coxinha"),
      ],
    });
    const secao = pagina.querySelector(".sc-vitrine__destaques");
    expect(secao?.textContent).toContain("Pastel de carne");
    expect(secao?.textContent).toContain("R$ 12,00");
    expect(
      secao?.querySelector('a[href="/loja/casa-do-ze/produto/pastel"]'),
    ).not.toBeNull();
    expect(pagina.querySelector('a[href="#destaques"]')).not.toBeNull();
  });

  it("[CA-6] @spec:AC-10721 a faixa são links, e não abas que dependem de script", () => {
    const pagina = desenharPerfil({
      destaques: [destaque("pastel", "Pastel")],
      posts: [post("p1", "Pastel")],
    });
    const faixa = pagina.querySelector("nav.sc-loja__chips");
    const links = [...(faixa?.querySelectorAll("a") ?? [])].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Destaques", "#destaques"],
      ["Publicações", "#publicacoes"],
      ["Sobre a loja e horários", "/loja/casa-do-ze/sobre"],
    ]);
    expect(
      pagina.querySelector('[role="tab"], [role="tablist"], [role="tabpanel"]'),
    ).toBeNull();
  });

  it("[CA-5] @spec:AC-10712 o botão do catálogo continua um link para o catálogo da loja", () => {
    const pagina = desenharPerfil();
    expect(
      pagina.querySelector("a.sc-loja__entrar")?.getAttribute("href"),
    ).toBe(`/loja/${LOJA_DO_PERFIL.apelido}/cardapio`);
  });
});

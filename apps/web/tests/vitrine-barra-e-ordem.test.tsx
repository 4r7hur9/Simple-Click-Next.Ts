// @vitest-environment jsdom
/**
 * Prova da barra do catálogo e da ordem: categorias, filtro e "Ordenar" numa
 * faixa só, tudo funcionando sem script (card #20).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { BarraDeCatalogo } from "../src/features/vitrine/BarraDeCatalogo";
import { lerOrdem } from "../src/lib/catalogo";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";

const LOJA = "sabor-e-cia";

function produto(
  id: string,
  nome: string,
  precoCentavos: number | null,
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id,
    apelido: nome.toLowerCase(),
    nome,
    chamada: null,
    precoCentavos,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
  };
}

const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produto("11111111-1111-4111-8111-111111111111", "Coxinha", 750),
        produto("22222222-2222-4222-8222-222222222222", "Empada", 900),
        produto("55555555-5555-4555-8555-555555555555", "Kibe", null),
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [
        produto("33333333-3333-4333-8333-333333333333", "Água", 400),
        // O mesmo produto em duas seções aparece uma vez na lista ordenada.
        produto("11111111-1111-4111-8111-111111111111", "Coxinha", 750),
      ],
    },
  ],
  destaques: [produto("44444444-4444-4444-8444-444444444444", "Pastel", 1200)],
  versao: "1",
};

function nomes(ordem?: string, categoria?: string): string[] {
  const naTela = prepararCatalogo(CATALOGO, {
    apelidoDaLoja: LOJA,
    categoriaEscolhida: categoria ?? null,
    ordem: ordem ?? null,
  });
  return naTela.secoes.flatMap((secao) => secao.produtos.map((p) => p.nome));
}

describe("a ordem do catálogo", () => {
  it("sem ordem no endereço, vale a do dono, com as seções e os destaques", () => {
    const naTela = prepararCatalogo(CATALOGO, { apelidoDaLoja: LOJA });
    expect(naTela.ordem).toBe("relevancia");
    expect(naTela.secoes.map((s) => s.nome)).toEqual(["Salgados", "Bebidas"]);
    expect(naTela.destaques).toHaveLength(1);
  });

  it("menor preço junta as seções numa lista só, do mais barato ao mais caro, e o preço variável vai para o fim", () => {
    expect(nomes("menor-preco")).toEqual(["Água", "Coxinha", "Empada", "Kibe"]);
  });

  it("maior preço inverte, e o preço variável continua no fim", () => {
    expect(nomes("maior-preco")).toEqual(["Empada", "Coxinha", "Água", "Kibe"]);
  });

  it("A a Z ordena pelo nome em português, sem ligar para acento", () => {
    expect(nomes("a-z")).toEqual(["Água", "Coxinha", "Empada", "Kibe"]);
  });

  it("a ordem vale dentro da categoria escolhida", () => {
    expect(nomes("maior-preco", "salgados")).toEqual([
      "Empada",
      "Coxinha",
      "Kibe",
    ]);
  });

  it("fora da ordem do dono, os destaques saem — eles são a própria ordem 'destaques primeiro'", () => {
    const naTela = prepararCatalogo(CATALOGO, {
      apelidoDaLoja: LOJA,
      ordem: "menor-preco",
    });
    expect(naTela.destaques).toEqual([]);
  });

  it("valor desconhecido no endereço vale a ordem padrão, sem erro", () => {
    expect(lerOrdem("qualquer-coisa")).toBe("relevancia");
    expect(lerOrdem(null)).toBe("relevancia");
  });

  it("os links das ordens mantêm categoria, busca e filtros; as abas mantêm a ordem", () => {
    const naTela = prepararCatalogo(CATALOGO, {
      apelidoDaLoja: LOJA,
      categoriaEscolhida: "salgados",
      termoBuscado: "co",
      ordem: "a-z",
      filtros: ["recheio=Frango"],
    });
    const menor = naTela.ordens.find((o) => o.valor === "menor-preco");
    expect(menor?.link).toBe(
      `/loja/${LOJA}/cardapio?categoria=salgados&busca=co&filtro=recheio%3DFrango&ordem=menor-preco`,
    );
    expect(naTela.ordens.find((o) => o.emVigor)?.valor).toBe("a-z");
    expect(naTela.abas.find((a) => a.nome === "Bebidas")?.link).toBe(
      `/loja/${LOJA}/cardapio?categoria=bebidas&busca=co&ordem=a-z`,
    );
  });
});

function desenharBarra(ordem = "relevancia", selecionados: string[] = []) {
  const naTela = prepararCatalogo(CATALOGO, {
    apelidoDaLoja: LOJA,
    ordem,
    filtros: selecionados,
  });
  return renderToStaticMarkup(
    <BarraDeCatalogo
      abas={naTela.abas}
      filtroEmVigor={naTela.filtroEmVigor}
      filtros={[{ chave: "recheio", nome: "Recheio", valores: ["Frango"] }]}
      selecionados={selecionados}
      ordens={naTela.ordens}
      ordem={naTela.ordem}
      acao={`/loja/${LOJA}/cardapio`}
      categoria={null}
      busca={null}
    />,
  );
}

describe("a barra do catálogo", () => {
  it("categorias, filtro e ordem estão na mesma faixa, e os painéis abrem por popover (sem script)", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = desenharBarra();
    const barra = pagina.querySelector(".sc-catalogo-barra");
    expect(barra?.querySelector('nav[aria-label="Categorias"]')).not.toBeNull();
    expect(
      barra?.querySelector('[popovertarget="painel-dos-ajustes"]'),
    ).not.toBeNull();
    expect(
      barra?.querySelector('[popovertarget="painel-da-ordem"]'),
    ).not.toBeNull();
    expect(
      barra?.querySelector("#painel-da-ordem")?.getAttribute("popover"),
    ).toBe("auto");
    expect(
      barra?.querySelector("#painel-dos-ajustes form")?.getAttribute("method"),
    ).toBe("get");
    expect(pagina.innerHTML).not.toContain("onclick");
  });

  it("as ordens são links, e a em vigor é marcada para o leitor de tela", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = desenharBarra("maior-preco");
    const emVigor = pagina.querySelector("#painel-da-ordem [aria-current]");
    expect(emVigor?.textContent).toBe("Maior preço");
    // O filtro leva a ordem junto, para filtrar não desfazê-la.
    expect(
      pagina.querySelector<HTMLInputElement>(
        '#painel-dos-ajustes input[name="ordem"]',
      )?.value,
    ).toBe("maior-preco");
  });

  it("o 'Filtrar' conta os filtros marcados e o 'Ordenar' mostra a ordem fora da padrão", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = desenharBarra("a-z", ["recheio=Frango"]);
    const filtrar = pagina.querySelector(
      '.sc-catalogo-barra__botao--filtro[popovertarget="painel-dos-ajustes"]',
    );
    expect(filtrar?.querySelector(".sc-catalogo-barra__selo")?.textContent).toBe(
      ", 1 em vigor",
    );
    const ordenar = pagina.querySelector(
      '.sc-catalogo-barra__botao--ordem[popovertarget="painel-da-ordem"]',
    );
    expect(ordenar?.textContent).toBe("Ordenar: Nome, de A a Z");
  });

  it("não tem violação crítica nem séria de acessibilidade", async () => {
    const pagina = document.createElement("main");
    pagina.innerHTML = desenharBarra("menor-preco", ["recheio=Frango"]);
    document.body.append(pagina);
    const resultado = await axe.run(pagina, {
      rules: { region: { enabled: false } },
    });
    pagina.remove();
    expect(
      resultado.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => v.id),
    ).toEqual([]);
  });
});

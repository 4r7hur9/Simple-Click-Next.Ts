// @vitest-environment jsdom
/**
 * Card #107 · identidade da loja, ações e botão do catálogo.
 * Desenhado por `renderToStaticMarkup`: é o HTML que o servidor entrega, sem
 * script. A prova visual por largura, o axe e o contraste são do #114.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApresentacaoDaLoja,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";
import { BotaoCompartilharLoja } from "../src/features/loja/BotaoCompartilharLoja";
import {
  contagemExataDeItens,
  textoDaContagem,
} from "../src/features/loja/contagem-de-itens";

const LOJA: LojaNaTela = {
  apelido: "oficina-do-ze",
  nome: "Casa do Zé",
  ramo: "FOOD_SNACK",
  tema: {
    corDestaque: "#0f6e5c",
    fundoVitrine: "https://exemplo.test/fundo-pc.webp",
    fundoVitrineCelular: "https://exemplo.test/fundo-celular.webp",
    topoCardapio: null,
  },
  boasVindas: "Tudo fresquinho.",
  logo: "https://exemplo.test/logo.png",
  capa: null,
  formasDeEntrega: [],
  enderecoParaRetirada: null,
};

const ABERTA = { aberta: true, proximaAbertura: null, motivo: "ABERTA" };

function desenhar(
  sobrescrita: Partial<Parameters<typeof ApresentacaoDaLoja>[0]> = {},
): string {
  return renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={LOJA}
      abertura={ABERTA}
      linkDoCardapio="/loja/oficina-do-ze/cardapio"
      rotuloDoCatalogo="Cardápio"
      {...sobrescrita}
    />,
  );
}

function emDocumento(html: string): HTMLElement {
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  return caixa;
}

let raiz: Root | null = null;
afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  raiz = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("identidade da loja", () => {
  it("[CA-1] @spec:AC-10701 o nome é o título da página e a logo e a foto são da loja (a cor é sempre o verde SimpleClick)", () => {
    const pagina = emDocumento(desenhar());
    expect(pagina.querySelector("h1")?.textContent).toBe("Casa do Zé");
    expect(pagina.querySelector("img.sc-loja__logo")?.getAttribute("src")).toBe(
      "https://exemplo.test/logo.png",
    );
    expect(
      pagina.querySelector("img.sc-loja__fundo")?.getAttribute("src"),
    ).toBe("https://exemplo.test/fundo-pc.webp");
    expect(desenhar()).not.toMatch(/--cor-marca|#0f6e5c/);
  });

  it("[CA-1] @spec:AC-10701 nada do mockup do Stitch entra na página", () => {
    const html = desenhar();
    for (const proibido of [
      "Universokar",
      "UNIVERSOKAR",
      "10x",
      "Certificada",
    ]) {
      expect(html).not.toContain(proibido);
    }
  });

  it("[CA-1] @spec:AC-10702 a tela estreita usa a foto do celular, e há um véu entre a foto e o texto", () => {
    const pagina = emDocumento(desenhar());
    const fonte = pagina.querySelector("picture source");
    expect(fonte?.getAttribute("srcset")).toBe(
      "https://exemplo.test/fundo-celular.webp",
    );
    expect(fonte?.getAttribute("media")).toBe("(max-width: 767px)");
    expect(pagina.querySelector(".sc-loja__veu")).not.toBeNull();
  });

  it("[CA-1] @spec:AC-10703 sem logo nem foto, mostra iniciais e a faixa de capa neutra", () => {
    const pagina = emDocumento(
      desenhar({
        loja: {
          ...LOJA,
          logo: null,
          tema: {
            corDestaque: "#0f6e5c",
            fundoVitrine: null,
            topoCardapio: null,
          },
        },
      }),
    );
    expect(pagina.querySelector(".sc-loja__iniciais")?.textContent).toBe("CZ");
    expect(pagina.querySelector("img")).toBeNull();
    // Sem foto, a faixa da capa é um degradê neutro (card #129): nada de padrão.
    expect(pagina.querySelector(".sc-loja__capa")).not.toBeNull();
    expect(pagina.querySelector("[data-capa-padrao]")).toBeNull();
  });
});

describe("botão do catálogo", () => {
  it("[CA-5] @spec:AC-10712 usa a palavra do ramo e é um link que funciona sem script", () => {
    const cardapio = emDocumento(desenhar());
    const link = cardapio.querySelector("a.sc-loja__entrar");
    expect(link?.textContent).toContain("Ver o cardápio");
    expect(link?.getAttribute("href")).toBe("/loja/oficina-do-ze/cardapio");

    const catalogo = emDocumento(desenhar({ rotuloDoCatalogo: "Catálogo" }));
    expect(catalogo.querySelector("a.sc-loja__entrar")?.textContent).toContain(
      "Ver o catálogo",
    );
  });

  it("[CA-5] @spec:AC-10712 a contagem aparece só quando o número é exato", () => {
    expect(desenhar({ contagemDeItens: 32 })).toContain("(32 itens)");
    expect(desenhar({ contagemDeItens: 1 })).toContain("(1 item)");
    expect(desenhar({ contagemDeItens: null })).not.toContain("itens)");
    expect(desenhar({ contagemDeItens: 0 })).not.toContain("0 itens");
  });

  it("[CA-5] @spec:AC-10712 a contagem conta produtos distintos e some se a lista veio cortada", () => {
    const inteira = [
      { total: 2, proximoCursor: null, produtos: [{ id: "a" }, { id: "b" }] },
      { total: 2, proximoCursor: null, produtos: [{ id: "b" }, { id: "c" }] },
    ];
    // "b" está em duas seções: soma ingênua daria 4.
    expect(contagemExataDeItens(inteira)).toBe(3);
    expect(textoDaContagem(3)).toBe("3 itens");

    const cortadaPorCursor = [
      { total: 30, proximoCursor: "x", produtos: [{ id: "a" }] },
    ];
    const cortadaPorTotal = [
      { total: 5, proximoCursor: null, produtos: [{ id: "a" }] },
    ];
    expect(contagemExataDeItens(cortadaPorCursor)).toBeNull();
    expect(contagemExataDeItens(cortadaPorTotal)).toBeNull();
    expect(contagemExataDeItens([])).toBeNull();
  });
});

describe("ações da loja", () => {
  it("[CA-4] @spec:AC-10710 o WhatsApp só aparece com número, com texto neutro", () => {
    const com = emDocumento(
      desenhar({ whatsappPublico: "+55 (11) 91111-0001" }),
    );
    const link = com.querySelector('a[href^="https://wa.me/"]');
    expect(link?.getAttribute("href")).toBe("https://wa.me/5511911110001");
    expect(link?.getAttribute("aria-label")).toContain(
      "Fale com a loja no WhatsApp",
    );
    expect(com.textContent).not.toMatch(/placa|chassi|técnico|minutos/i);

    expect(desenhar({ whatsappPublico: null })).not.toContain("wa.me");
    expect(desenhar({ whatsappPublico: "sem número" })).not.toContain("wa.me");
  });

  it("[CA-7] @spec:AC-10719 Favoritar aparece junto da identidade, sem contador", () => {
    const html = desenhar({ favoritar: { logado: true, favorita: false } });
    const pagina = emDocumento(html);
    const botao = pagina.querySelector(".sc-loja__acoes button[aria-pressed]");
    expect(botao?.getAttribute("aria-label")).toBe("Favoritar loja Casa do Zé");
    expect(pagina.querySelector(".sc-loja__acoes")?.textContent).not.toMatch(
      /\d/,
    );
  });

  it("[CA-8] @spec:AC-10701 o compartilhar não vem no HTML do servidor", () => {
    const html = desenhar({ compartilhar: true });
    expect(html).not.toContain("Compartilhar Casa do Zé");
  });

  it("[CA-8] @spec:AC-10701 depois de montar, usa o compartilhamento nativo", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    const caixa = document.createElement("div");
    document.body.append(caixa);
    raiz = createRoot(caixa);
    act(() =>
      raiz?.render(
        <BotaoCompartilharLoja apelido="oficina-do-ze" nome="Casa do Zé" />,
      ),
    );

    const botao = caixa.querySelector("button");
    expect(botao?.getAttribute("aria-label")).toBe("Compartilhar Casa do Zé");
    await act(async () => botao?.click());
    expect(share).toHaveBeenCalledWith({
      title: "Casa do Zé",
      url: `${window.location.origin}/loja/oficina-do-ze`,
    });
  });

  it("[CA-8] @spec:AC-10701 sem compartilhamento nativo, copia o link e avisa", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const caixa = document.createElement("div");
    document.body.append(caixa);
    raiz = createRoot(caixa);
    act(() =>
      raiz?.render(
        <BotaoCompartilharLoja apelido="oficina-do-ze" nome="Casa do Zé" />,
      ),
    );

    await act(async () => caixa.querySelector("button")?.click());
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/loja/oficina-do-ze`,
    );
    expect(document.body.textContent).toContain("Link da loja copiado.");
  });
});

// @vitest-environment jsdom
/**
 * Card #107 · condições de compra e contato: só o que a loja cadastrou, o
 * pagamento pelo nome (nunca a chave PIX) e sempre um caminho para o Sobre.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApresentacaoDaLoja,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";
import { ContatoDaLoja } from "../src/features/loja/ContatoDaLoja";
import type { Vitrine } from "@simpleclick/contracts";

import { desenharPerfil, LOJA_DO_PERFIL } from "./loja-fixtures.tsx";

const CHAVE = "chave-pix-secreta@exemplo.test";

const VAZIA: LojaNaTela = {
  apelido: "casa-do-ze",
  nome: "Casa do Zé",
  tema: { corDestaque: "#0f6e5c", fundoVitrine: null, topoCardapio: null },
  boasVindas: null,
  logo: null,
  capa: null,
  formasDeEntrega: [],
  enderecoParaRetirada: null,
};

const COMPLETA: LojaNaTela = {
  ...VAZIA,
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  enderecoParaRetirada: {
    logradouro: "Rua das Flores",
    numero: "123",
    complemento: null,
    bairro: "Centro",
    cidade: "São Paulo",
    uf: "SP",
  },
};

function pagina(
  loja: LojaNaTela,
  recebimento?: Parameters<typeof ApresentacaoDaLoja>[0]["recebimento"],
): HTMLElement {
  const caixa = document.createElement("div");
  caixa.innerHTML = renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={loja}
      abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      linkDoCardapio="/loja/casa-do-ze/cardapio"
      rotuloDoCatalogo="Cardápio"
      recebimento={recebimento}
    />,
  );
  return caixa;
}

describe("condições da loja", () => {
  it("[CA-3] @spec:AC-10708 loja sem dados não mostra ficha vazia nem traço", () => {
    const sem = pagina(VAZIA, null);
    // Sem entrega, endereço nem pagamento: nenhum cartão de condição.
    expect(sem.querySelector(".sc-loja__detalhes")).toBeNull();
    expect(sem.querySelector(".sc-loja__ficha")).toBeNull();
    expect(sem.querySelector("address")).toBeNull();
    expect(sem.textContent).not.toMatch(/\s[—–-]\s*$/m);
  });

  it("[CA-3] @spec:AC-10708 o que existe aparece pelo nome, e não pelo código", () => {
    const com = pagina(COMPLETA, {
      formasDePagamento: ["PIX", "CASH", "CARD_ON_DELIVERY"],
      entrega: {} as never,
    });
    const texto = com.textContent ?? "";
    for (const nome of [
      "Entrega",
      "Retirada no local",
      "Pix",
      "Dinheiro",
      "Cartão na entrega",
      "Rua das Flores, 123",
    ]) {
      expect(texto).toContain(nome);
    }
    for (const codigo of ["DELIVERY", "PICKUP", "CARD_ON_DELIVERY", "CASH"]) {
      expect(texto).not.toContain(codigo);
    }
  });

  it("[CA-3] @spec:AC-10709 a chave PIX não aparece em lugar nenhum do HTML", () => {
    const html = renderToStaticMarkup(
      <ApresentacaoDaLoja
        loja={COMPLETA}
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
        linkDoCardapio="/loja/casa-do-ze/cardapio"
        rotuloDoCatalogo="Cardápio"
        recebimento={
          {
            formasDePagamento: ["PIX"],
            entrega: {},
            // Um objeto vindo do fechamento inteiro, com a chave por engano.
            pix: { chave: CHAVE },
            chavePix: CHAVE,
          } as never
        }
      />,
    );
    expect(html).toContain("Pix");
    expect(html).not.toContain(CHAVE);
  });

  it("[CA-3] @spec:AC-10711 'Abrir no mapa' só com endereço que dá para achar", () => {
    const com = pagina(COMPLETA);
    const mapa = [...com.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Abrir no mapa"),
    );
    expect(mapa?.getAttribute("href")).toContain("google.com/maps/search");
    expect(mapa?.getAttribute("href")).toContain(
      encodeURIComponent("Rua das Flores"),
    );

    const semRuaNemCidade = pagina({
      ...COMPLETA,
      enderecoParaRetirada: {
        logradouro: null,
        numero: null,
        complemento: "Fundos",
        bairro: "Centro",
        cidade: null,
        uf: null,
      },
    });
    expect(semRuaNemCidade.textContent).not.toContain("Abrir no mapa");
  });

  it("[CA-3] @spec:AC-10720 sempre há um link de verdade para o Sobre", () => {
    // No layout do Stitch (card #129) o caminho fixo para o Sobre é a faixa de
    // seções da página, presente com ou sem dado da loja.
    const vazia = {
      ...LOJA_DO_PERFIL,
      boasVindas: null,
      sobre: null,
      formasDeEntrega: [],
    } as unknown as Vitrine["loja"];
    for (const loja of [vazia, LOJA_DO_PERFIL]) {
      const link = desenharPerfil({ loja }).querySelector(
        'nav.sc-loja__chips a[href="/loja/casa-do-ze/sobre"]',
      );
      expect(link).not.toBeNull();
    }
  });
});

describe("contato por WhatsApp", () => {
  function contato(numero: string | null): string {
    return renderToStaticMarkup(
      <ContatoDaLoja nome="Casa do Zé" whatsappPublico={numero} />,
    );
  }

  it("[CA-4] @spec:AC-10710 com número, mostra o texto genérico e o link só com dígitos", () => {
    const caixa = document.createElement("div");
    caixa.innerHTML = contato("+55 (11) 91111-0001");
    expect(caixa.querySelector("h2")?.textContent).toBe(
      "Fale com a loja no WhatsApp",
    );
    expect(caixa.querySelector("a")?.getAttribute("href")).toBe(
      "https://wa.me/5511911110001",
    );
    expect(caixa.textContent).not.toMatch(
      /placa|chassi|técnico|minutos|agora|imediat/i,
    );
  });

  it("[CA-4] @spec:AC-10710 sem número útil, não há botão nem link", () => {
    expect(contato(null)).toBe("");
    expect(contato("")).toBe("");
    expect(contato("sem número")).toBe("");
  });
});

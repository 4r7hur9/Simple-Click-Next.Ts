// @vitest-environment jsdom
/**
 * Prova do selo ABERTO/FECHADO sobre a capa (card #64).
 *
 * O selo é uma pílula com fundo próprio, clara ou escura, e o texto e o ponto
 * passam no AA contra ela. No automático, a pílula é a que mais contrasta com
 * a cor medida da capa; no manual, vale a do dono. Verde é aberto, vermelho é
 * fechado, e o texto continua dizendo qual é.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ehAvermelhada, relacaoDeContraste } from "@simpleclick/ui";

import { CapaDaVitrine } from "../src/features/vitrine/CapaDaVitrine";
import {
  ApresentacaoDaLoja,
  type AberturaNaTela,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";

const ABERTA: AberturaNaTela = {
  aberta: true,
  proximaAbertura: null,
  motivo: "ABERTA",
};
const FECHADA: AberturaNaTela = {
  aberta: false,
  proximaAbertura: "abre amanhã às 8h",
  motivo: "FORA_DO_HORARIO",
};

const CAPA_VERMELHA = "https://img.exemplo.test/moto-pecas.webp";

function capa(
  sobrescrita: Partial<Parameters<typeof CapaDaVitrine>[0]> = {},
): HTMLElement {
  const pagina = document.createElement("div");
  pagina.innerHTML = renderToStaticMarkup(
    <CapaDaVitrine
      apelidoDaLoja="moto-pecas-fortal"
      nomeDaLoja="Moto Peças Fortal"
      capa={CAPA_VERMELHA}
      ramo="AUTO_PARTS"
      rotuloDoCatalogo="Catálogo"
      abertura={FECHADA}
      {...sobrescrita}
    />,
  );
  const selo = pagina.querySelector<HTMLElement>(".sc-vitrine__capa-situacao");
  if (!selo) throw new Error("a capa não tem o selo");
  return selo;
}

const cor = (selo: HTMLElement, nome: string) =>
  selo.style.getPropertyValue(nome);

describe("o selo na capa do cardápio", () => {
  it("é uma pílula com fundo próprio, e texto e ponto passam no AA", () => {
    for (const abertura of [ABERTA, FECHADA]) {
      const selo = capa({ abertura });
      expect(selo.classList.contains("sc-selo-status")).toBe(true);
      const fundo = cor(selo, "--selo-fundo");
      expect(
        relacaoDeContraste(cor(selo, "--selo-texto"), fundo),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        relacaoDeContraste(cor(selo, "--selo-ponto"), fundo),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("capa vermelho-escura (Moto Peças Fortal): o automático põe a pílula clara, e o vermelho nunca fica sobre vermelho", () => {
    const selo = capa({ corDaCapa: "#5c1010" });
    expect(selo.dataset["selo"]).toBe("claro");
    expect(ehAvermelhada(cor(selo, "--selo-ponto"))).toBe(true);
    expect(ehAvermelhada(cor(selo, "--selo-fundo"))).toBe(false);
    expect(relacaoDeContraste(cor(selo, "--selo-fundo"), "#5c1010")).toBeGreaterThanOrEqual(3);
  });

  it("sem cor medida, o automático é o escuro; o manual vale sobre o automático", () => {
    expect(capa().dataset["selo"]).toBe("escuro");
    expect(
      capa({ corDaCapa: "#5c1010", seloDeStatus: "ESCURO" }).dataset["selo"],
    ).toBe("escuro");
    expect(capa({ seloDeStatus: "CLARO" }).dataset["selo"]).toBe("claro");
  });

  it("verde é aberto, vermelho é fechado, e o texto diz qual é", () => {
    const aberto = capa({ abertura: ABERTA });
    const fechado = capa({ abertura: FECHADA });
    expect(aberto.textContent).toBe("Aberto");
    expect(fechado.textContent).toBe("Fechado, abre amanhã às 8h");
    expect(ehAvermelhada(cor(aberto, "--selo-ponto"))).toBe(false);
    expect(ehAvermelhada(cor(fechado, "--selo-ponto"))).toBe(true);
  });
});

describe("o selo na página da loja", () => {
  const LOJA: LojaNaTela = {
    apelido: "moto-pecas-fortal",
    nome: "Moto Peças Fortal",
    tema: {
      corDestaque: "#b7ff00",
      fundoVitrine: CAPA_VERMELHA,
      topoCardapio: null,
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: { [CAPA_VERMELHA]: "#5c1010" },
    },
    boasVindas: null,
    logo: null,
    capa: null,
    formasDeEntrega: [],
    enderecoParaRetirada: null,
  };

  function situacao(loja: LojaNaTela = LOJA): HTMLElement {
    const pagina = document.createElement("div");
    pagina.innerHTML = renderToStaticMarkup(
      <ApresentacaoDaLoja
        loja={loja}
        abertura={FECHADA}
        linkDoCardapio="/loja/moto-pecas-fortal/cardapio"
        rotuloDoCatalogo="Catálogo"
      />,
    );
    const selo = pagina.querySelector<HTMLElement>(".sc-loja__situacao");
    if (!selo) throw new Error("a página não tem o selo");
    return selo;
  }

  it("usa a cor medida da foto de fundo e a preferência do dono", () => {
    expect(situacao().dataset["selo"]).toBe("claro");
    expect(
      situacao({
        ...LOJA,
        tema: { ...LOJA.tema!, seloDeStatus: "ESCURO" },
      }).dataset["selo"],
    ).toBe("escuro");
  });

  it("cor medida de outra foto não vale: a foto trocada fica sem cor (escuro)", () => {
    expect(
      situacao({
        ...LOJA,
        tema: { ...LOJA.tema!, fundoVitrine: "https://img.exemplo.test/nova.webp" },
      }).dataset["selo"],
    ).toBe("escuro");
  });
});

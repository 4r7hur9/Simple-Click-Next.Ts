// @vitest-environment jsdom
/**
 * As cenas tipo slide da landing (#90): as contas da navegação (uma rolada,
 * uma cena; a inércia do trackpad não pula cena) e a marcação que o servidor
 * entrega (cenas com âncora, indicador acessível, aparelhos decorativos).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CENAS_DA_NARRATIVA, NarrativaEmCenas } from "../src/features/landing/cenas/Cenas.tsx";
import {
  ancoraDaMesmaPagina,
  cenaDaPosicao,
  criarDetectorDeGesto,
  destinoDoGesto,
  direcaoDaTecla,
  direcaoDoToque,
  fimDaNarrativa,
  posicaoDaCena,
  seguraOGesto,
  zonaDaPosicao,
  type MedidasDaNarrativa,
} from "../src/features/landing/navegacao-por-cenas.ts";

const MEDIDAS: MedidasDaNarrativa = { inicio: 0, passo: 800, total: 7 };

describe("as posições das cenas", () => {
  it("cada cena fica a uma altura de palco da anterior", () => {
    expect(posicaoDaCena(MEDIDAS, 0)).toBe(0);
    expect(posicaoDaCena(MEDIDAS, 3)).toBe(2400);
    expect(posicaoDaCena(MEDIDAS, 99)).toBe(4800);
    expect(fimDaNarrativa(MEDIDAS)).toBe(5600);
  });

  it("as zonas: cenas, saída (o palco já anda) e depois", () => {
    expect(zonaDaPosicao(MEDIDAS, 0)).toBe("cenas");
    expect(zonaDaPosicao(MEDIDAS, 4800)).toBe("cenas");
    expect(zonaDaPosicao(MEDIDAS, 5000)).toBe("saida");
    expect(zonaDaPosicao(MEDIDAS, 5600)).toBe("depois");
    expect(zonaDaPosicao({ ...MEDIDAS, inicio: 300 }, 0)).toBe("antes");
  });

  it("a barra de rolagem leva à cena mais próxima", () => {
    expect(cenaDaPosicao(MEDIDAS, 1190)).toBe(1);
    expect(cenaDaPosicao(MEDIDAS, 1210)).toBe(2);
    expect(cenaDaPosicao(MEDIDAS, 5200)).toBeNull();
  });
});

describe("para onde um gesto leva", () => {
  it("avança e volta uma cena por vez", () => {
    expect(destinoDoGesto(MEDIDAS, 800, 1, 1)).toEqual({ tipo: "cena", indice: 2 });
    expect(destinoDoGesto(MEDIDAS, 800, -1, 1)).toEqual({ tipo: "cena", indice: 0 });
  });

  it("depois da última cena, desliza para a seção seguinte", () => {
    expect(destinoDoGesto(MEDIDAS, 4800, 1, 6)).toEqual({ tipo: "sair", y: 5600 });
  });

  it("subindo na saída, volta inteiro para a última cena", () => {
    expect(destinoDoGesto(MEDIDAS, 5300, -1, 6)).toEqual({ tipo: "voltar", y: 4800, indice: 6 });
  });

  it("encostado na seção seguinte, subir volta ao palco (teclado e roda, sem salto)", () => {
    expect(destinoDoGesto(MEDIDAS, 5600, -1, 6)).toEqual({ tipo: "voltar", y: 4800, indice: 6 });
    expect(seguraOGesto(MEDIDAS, 5600, -1)).toBe(true);
    expect(seguraOGesto(MEDIDAS, 5600, 1)).toBe(false);
    expect(destinoDoGesto(MEDIDAS, 5700, -1, 6)).toBeNull();
  });

  it("no topo e depois da narrativa, a rolagem é do navegador", () => {
    expect(destinoDoGesto(MEDIDAS, 0, -1, 0)).toBeNull();
    expect(seguraOGesto(MEDIDAS, 0, -1)).toBe(false);
    expect(destinoDoGesto(MEDIDAS, 7000, -1, 6)).toBeNull();
    expect(seguraOGesto(MEDIDAS, 7000, 1)).toBe(false);
    expect(seguraOGesto(MEDIDAS, 5300, 1)).toBe(false);
    expect(seguraOGesto(MEDIDAS, 1600, 1)).toBe(true);
  });
});

describe("âncoras da mesma página (menu, bolinhas e rodapé)", () => {
  const PAGINA = "https://simpleclick.com.br/";

  it("aceita #id e /#id (o rodapé), e recusa outra página", () => {
    expect(ancoraDaMesmaPagina("#como-funciona", PAGINA)).toBe("como-funciona");
    expect(ancoraDaMesmaPagina("/#taxas", PAGINA)).toBe("taxas");
    expect(ancoraDaMesmaPagina("/#taxas", "https://simpleclick.com.br/#inicio")).toBe("taxas");
    expect(ancoraDaMesmaPagina("/termos#uso", PAGINA)).toBeNull();
    expect(ancoraDaMesmaPagina("https://outro.site/#taxas", PAGINA)).toBeNull();
    expect(ancoraDaMesmaPagina("/explorar", PAGINA)).toBeNull();
    expect(ancoraDaMesmaPagina("#", PAGINA)).toBeNull();
    expect(ancoraDaMesmaPagina(null, PAGINA)).toBeNull();
  });
});

describe("o gesto: uma rolada vale uma cena", () => {
  /** Um gesto de trackpad do Mac: rampa, pico e uma inércia longa. */
  const TRACKPAD = [2, 6, 14, 28, 46, 60, 64, 58, 50, 42, 36, 30, 25, 21, 18, 15, 13, 11, 9, 8, 7, 6, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1, 1];

  function rolar(detector: ReturnType<typeof criarDetectorDeGesto>, deltas: readonly number[], inicio: number, intervalo = 16) {
    const disparos: number[] = [];
    deltas.forEach((delta, i) => {
      const tempo = inicio + i * intervalo;
      const { disparo } = detector.registrar(tempo, delta);
      if (disparo !== 0) {
        disparos.push(disparo);
        detector.travarAte(tempo + 1000);
      }
    });
    return disparos;
  }

  it("um gesto de trackpad com inércia dispara uma vez só", () => {
    expect(rolar(criarDetectorDeGesto(), TRACKPAD, 0, 45)).toEqual([1]);
  });

  it("a inércia que continua depois da troca não pula outra cena", () => {
    const detector = criarDetectorDeGesto();
    expect(rolar(detector, TRACKPAD, 0, 60)).toEqual([1]);
  });

  it("um dedo novo durante a inércia (salto claro) vale outra cena", () => {
    const detector = criarDetectorDeGesto();
    expect(rolar(detector, TRACKPAD, 0, 45)).toEqual([1]);
    expect(rolar(detector, [1, 1, 14, 30, 50], 2000, 16)).toEqual([1]);
  });

  it("cliques de roda separados por pausa valem uma cena cada", () => {
    const detector = criarDetectorDeGesto();
    expect(rolar(detector, [100], 0)).toEqual([1]);
    expect(rolar(detector, [100], 1500)).toEqual([1]);
    expect(rolar(detector, [-100], 3000)).toEqual([-1]);
  });

  it("um giro rápido de roda dentro da troca não pula cenas", () => {
    expect(rolar(criarDetectorDeGesto(), [100, 100, 100, 100, 100, 100], 0, 30)).toEqual([1]);
  });

  it("fora do palco o gesto só é acompanhado; ao entrar nele, ainda vale", () => {
    const detector = criarDetectorDeGesto();
    for (let i = 0; i < 5; i++) expect(detector.registrar(i * 16, -40, false).disparo).toBe(0);
    expect(detector.registrar(80, -40, true).disparo).toBe(-1);
  });
});

describe("teclado e toque", () => {
  it("setas, PageUp/PageDown e Espaço navegam", () => {
    expect(direcaoDaTecla("ArrowDown")).toBe(1);
    expect(direcaoDaTecla("PageUp")).toBe(-1);
    expect(direcaoDaTecla(" ")).toBe(1);
    expect(direcaoDaTecla(" ", { shift: true })).toBe(-1);
    expect(direcaoDaTecla("Tab")).toBe(0);
  });

  it("em campo de texto nada navega; em botão, o Espaço é do botão", () => {
    expect(direcaoDaTecla("ArrowDown", { alvo: "texto" })).toBe(0);
    expect(direcaoDaTecla(" ", { alvo: "controle" })).toBe(0);
    expect(direcaoDaTecla("PageDown", { alvo: "controle" })).toBe(1);
  });

  it("arrastar o dedo para cima avança; toque curto não conta", () => {
    expect(direcaoDoToque(600, 300)).toBe(1);
    expect(direcaoDoToque(300, 600)).toBe(-1);
    expect(direcaoDoToque(300, 320)).toBe(0);
  });
});

describe("a marcação das cenas", () => {
  const caixa = () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(<NarrativaEmCenas />);
    return div;
  };

  it("sete cenas, cada uma com âncora e título", () => {
    const cenas = caixa().querySelectorAll(".sc-lp-momento");
    expect(cenas).toHaveLength(CENAS_DA_NARRATIVA.length);
    cenas.forEach((cena, i) => {
      expect(cena.id).toBe(CENAS_DA_NARRATIVA[i]!.id);
      expect(cena.getAttribute("data-cena")).toBe(String(i));
      const titulo = cena.getAttribute("aria-labelledby");
      expect(titulo && cena.querySelector(`#${titulo}`), cena.id).toBeTruthy();
    });
  });

  it("a narrativa diz ao CSS quantas cenas tem", () => {
    expect(caixa().querySelector<HTMLElement>(".sc-lp-narrativa")?.style.getPropertyValue("--cenas")).toBe("7");
  });

  it("o indicador é uma navegação com um link por cena e a atual marcada", () => {
    const nav = caixa().querySelector("nav.sc-lp-indicador");
    expect(nav?.getAttribute("aria-label")).toBeTruthy();
    const links = nav!.querySelectorAll("a");
    expect(links).toHaveLength(CENAS_DA_NARRATIVA.length);
    links.forEach((link, i) => {
      expect(link.getAttribute("href")).toBe(`#${CENAS_DA_NARRATIVA[i]!.id}`);
      expect(link.textContent).toContain(CENAS_DA_NARRATIVA[i]!.rotulo);
    });
    expect([...links].filter((link) => link.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(links[0]!.getAttribute("aria-current")).toBe("step");
  });

  it("os aparelhos do palco são decorativos", () => {
    expect(caixa().querySelector(".sc-lp-narrativa__aparelhos")?.getAttribute("aria-hidden")).toBe("true");
    expect(caixa().querySelector(".sc-lp-narrativa__fundo")?.getAttribute("aria-hidden")).toBe("true");
  });
});

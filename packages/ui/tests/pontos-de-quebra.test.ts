/**
 * Prova dos pontos de quebra (P-012).
 *
 * O P-012 exige que nenhuma tela estoure horizontalmente no MENOR ponto de
 * quebra suportado — e uma régua que não está escrita em lugar nenhum não é
 * régua: cada arquivo inventaria a sua, e "o menor" viraria opinião.
 *
 * O piso é 344px, o Galaxy Z Fold fechado. Ele é o menor aparelho da lista do
 * DevTools, e é estreito E comprido ao mesmo tempo — 344 por 882 —, o que
 * quebra layout pensado só em largura.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const TEMA = readFileSync(
  fileURLToPath(new URL("../styles/theme.css", import.meta.url)),
  "utf8",
);

/**
 * Os pontos de LARGURA declarados, lidos da folha e não escritos aqui de novo.
 *
 * `altura-` fica de fora explicitamente. São duas réguas com o mesmo prefixo, e
 * misturá-las faria a lista de larguras conter 600 e 1100 — números que não são
 * largura de aparelho nenhum, e que quebrariam a conferência de ordem sem que a
 * mensagem dissesse por quê.
 */
function pontosDeclarados(): Map<string, number> {
  const achados = new Map<string, number>();
  for (const casou of TEMA.matchAll(
    /--quebra-(?!altura-)([a-z-]+):\s*(\d+)px/g,
  )) {
    achados.set(casou[1] as string, Number(casou[2]));
  }
  return achados;
}

/** Os pontos de altura declarados, lidos da folha. */
function alturasDeclaradas(): Map<string, number> {
  const achados = new Map<string, number>();
  for (const casou of TEMA.matchAll(/--quebra-altura-([a-z-]+):\s*(\d+)px/g)) {
    achados.set(casou[1] as string, Number(casou[2]));
  }
  return achados;
}

/** Quantas seções a folha manda mostrar a partir de cada altura. */
function escadaDeSecoes(): { apartirDe: number; secoes: number }[] {
  const degraus: { apartirDe: number; secoes: number }[] = [];
  const padrao =
    /@media \(min-height:\s*(\d+)px\)\s*\{\s*:root\s*\{\s*--secoes-visiveis:\s*(\d+)/g;
  for (const casou of TEMA.matchAll(padrao)) {
    degraus.push({
      apartirDe: Number(casou[1]),
      secoes: Number(casou[2]),
    });
  }
  return degraus.sort((a, b) => a.apartirDe - b.apartirDe);
}

describe("a régua dos pontos de quebra (P-012)", () => {
  it("@principle:P-012 o menor ponto suportado é o dobrável fechado, em 344px", () => {
    // Se alguém subir este piso, o teste reprova — e subir o piso é decidir que
    // um aparelho de verdade deixou de ser atendido, o que precisa ser decisão
    // e não consequência de um layout que não coube.
    const pontos = pontosDeclarados();

    expect(pontos.get("dobravel")).toBe(344);
    expect(Math.min(...pontos.values())).toBe(344);
  });

  it("@principle:P-012 os pontos sobem sem repetir, para não haver dois nomes na mesma largura", () => {
    // Dois nomes na mesma largura fazem duas regras disputarem a mesma faixa, e
    // quem lê o código não tem como saber qual vale.
    const larguras = [...pontosDeclarados().values()];
    const ordenadas = [...larguras].sort((a, b) => a - b);

    expect(larguras).toEqual(ordenadas);
    expect(new Set(larguras).size).toBe(larguras.length);
  });

  it("@principle:P-012 a régua cobre os aparelhos que o DevTools traz", () => {
    // Cada largura aqui é um aparelho de verdade que alguém usa para pedir
    // comida. Faltar um significa não ter olhado para ele.
    const pontos = new Set(pontosDeclarados().values());

    for (const aparelho of [344, 360, 390, 430, 540, 768, 1024, 1280, 1536]) {
      expect(pontos.has(aparelho), `falta o ponto de ${aparelho}px`).toBe(true);
    }
  });

  it("@principle:P-012 cada ponto diz qual aparelho o justifica", () => {
    // Número sem aparelho ao lado vira número redondo escolhido por gosto, e
    // meses depois ninguém sabe se pode mexer.
    for (const [nome] of pontosDeclarados()) {
      const linha = new RegExp(`--quebra-${nome}:[^\\n]*\\/\\*[^*]+\\*\\/`);
      expect(
        linha.test(TEMA),
        `--quebra-${nome} sem aparelho no comentário`,
      ).toBe(true);
    }
  });
});

describe("a régua de ALTURA, e quantas seções cabem (P-012)", () => {
  it("@principle:P-012 largura sozinha não descreve a tela: existe régua de altura", () => {
    // Um iPad em retrato e um Nest Hub têm a mesma largura de 1024px e alturas
    // de 1366 e 600. A mesma regra serve mal aos dois.
    const alturas = alturasDeclaradas();

    expect(alturas.size).toBeGreaterThanOrEqual(4);
    expect(alturas.get("baixa")).toBe(600);
    expect(alturas.get("muito-alta")).toBe(1700);
  });

  it("@principle:P-012 tela alta mostra MAIS seções, em vez de esticar uma", () => {
    // Numa TV em pé, uma seção de altura cheia vira um bloco de dois mil pixels
    // com vazio no meio. A escada existe para isso não acontecer.
    const escada = escadaDeSecoes();

    expect(escada.length).toBeGreaterThanOrEqual(2);
    expect(escada[0]).toEqual({ apartirDe: 1100, secoes: 2 });
    expect(escada[1]).toEqual({ apartirDe: 1700, secoes: 3 });
  });

  it("@principle:P-012 a escada só sobe: nenhuma altura maior mostra menos seções", () => {
    // Descer no meio faria a tela mais alta mostrar menos conteúdo que a mais
    // baixa, que é o defeito que a escada existe para impedir.
    const escada = escadaDeSecoes();

    for (let i = 1; i < escada.length; i += 1) {
      const anterior = escada[i - 1];
      const atual = escada[i];
      expect(atual?.secoes ?? 0).toBeGreaterThan(anterior?.secoes ?? 0);
    }
  });

  it("@principle:P-012 a altura da seção é dividida pelo número de seções visíveis", () => {
    // Sem a divisão, a régua diria "duas seções" e a folha continuaria
    // desenhando uma de tela cheia — a declaração e o desenho divergiriam em
    // silêncio.
    expect(TEMA).toMatch(
      /--altura-da-secao:\s*calc\(100svh\s*\/\s*var\(--secoes-visiveis\)\)/,
    );
  });

  it("@principle:P-012 a medida é svh, e não vh, por causa da barra de endereço", () => {
    // `vh` conta a tela COM a barra escondida: a seção nasce mais alta que o
    // espaço visível, e o rodapé dela fica cortado até a pessoa rolar.
    expect(TEMA).toContain("100svh");
    expect(TEMA).not.toMatch(/--altura-da-secao:[^;]*\b\d+vh\b/);
  });

  it("@principle:P-012 tela BAIXA e deitada deixa a seção crescer com o conteúdo", () => {
    // Celular na horizontal e Nest Hub têm o problema oposto: altura cheia não
    // dá espaço para o texto respirar. Ali a altura vira mínima, não fixa.
    const trecho =
      /@media \(max-height:\s*600px\)[\s\S]{0,200}--altura-da-secao:\s*auto/;

    expect(trecho.test(TEMA)).toBe(true);
  });
});

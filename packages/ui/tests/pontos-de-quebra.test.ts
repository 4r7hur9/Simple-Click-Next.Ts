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

/** Os pontos declarados, lidos da folha e não escritos aqui de novo. */
function pontosDeclarados(): Map<string, number> {
  const achados = new Map<string, number>();
  for (const casou of TEMA.matchAll(/--quebra-([a-z-]+):\s*(\d+)px/g)) {
    achados.set(casou[1] as string, Number(casou[2]));
  }
  return achados;
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

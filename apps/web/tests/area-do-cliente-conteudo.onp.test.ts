/**
 * Nada do Stitch vira conteúdo de produção e nada de função "A decidir"
 * aparece na área do cliente (card #111, AC-11129).
 *
 * A varredura lê o código das telas da conta e do acompanhamento, sem
 * diferenciar maiúsculas. Ela não substitui a revisão do dono sobre o que
 * aparece na tela, que continua a prova principal.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src");
const PASTAS = [
  "features/conta",
  "features/pedido",
  "app/(conta)/conta",
  "app/(loja)/loja/[slug]/pedido",
];

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(tsx?|css)$/.test(nome) ? [caminho] : [];
  });
}

const FONTES = PASTAS.flatMap((p) => arquivos(join(SRC, p))).map((caminho) => ({
  caminho: caminho.replace(SRC, ""),
  texto: readFileSync(caminho, "utf8"),
}));

const PROIBIDOS: readonly [string, RegExp][] = [
  ["CNPJ", /\bcnpj\b/i],
  ["parcelamento do mockup", /10\s?x\s+sem\s+juros/i],
  ["cupom", /\bcupo(m|ns)\b/i],
  ["fidelidade", /\bfidelidade\b/i],
  ["avaliação e nota", /\bavalia(ç|c)(ão|ões|ao|oes)\b/i],
  ["Universokar", /universokar/i],
  ["placa ou chassi", /\b(placa|chassi)\b/i],
  ["imagem externa do mockup", /googleusercontent/i],
  ["entrega relâmpago", /entrega\s+flash|suporte\s+24h/i],
];

describe("conteúdo da área do cliente (AC-11129)", () => {
  it("[CA-29] @spec:AC-11129 há arquivos para varrer", () => {
    expect(FONTES.length).toBeGreaterThan(15);
  });

  it.each(PROIBIDOS)(
    "[CA-29] @spec:AC-11129 nenhum arquivo cita %s",
    (_nome, padrao) => {
      const achados = FONTES.filter((f) => padrao.test(f.texto)).map((f) => f.caminho);
      expect(achados).toEqual([]);
    },
  );

  it("[CA-29] @spec:AC-11129 nenhuma tela da conta força o tema (claro e escuro seguem os tokens)", () => {
    const achados = FONTES.filter((f) => /data-tema/.test(f.texto)).map((f) => f.caminho);
    expect(achados).toEqual([]);
  });
});

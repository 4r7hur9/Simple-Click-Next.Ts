/**
 * A rede de regressão dos e2e antigos da compra não afrouxa (card #114,
 * AC-11408).
 *
 * O redesign Stitch trocou seletores e textos, e os e2e antigos foram
 * ajustados para o layout novo — só seletor e texto. Este teste lê os arquivos
 * (sem navegador) e trava três coisas, para que ninguém "conserte" um e2e
 * apagando o que ele provava:
 *
 * 1. a CONTAGEM MÍNIMA de asserções (`expect(`, `expect.soft(`, `expect.poll(`)
 *    de cada arquivo, medida ANTES do ajuste (17/11/2026). Mínimo, e não exato:
 *    quem acrescenta prova não quebra nada;
 * 2. as ASSERÇÕES-CHAVE de cada arquivo, pelo texto: o que o critério afirma
 *    (preço, código, 404, nada do cadastro, 44px…) continua escrito ali;
 * 3. nada de `.skip`, `.fixme`, `.only`, `test.fail` nem `expect(true)`.
 *
 * O que só a contagem não pega (trocar uma asserção por outra vazia) a lista
 * das chaves pega; o que a lista não pega (apagar uma asserção sem chave) a
 * contagem pega.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "../../..");
const ler = (arquivo: string) =>
  readFileSync(join(RAIZ, "e2e/specs", arquivo), "utf8");

interface RedeAntiga {
  /** Asserções do arquivo antes do ajuste ao redesign. */
  readonly minimo: number;
  /** Trechos que precisam continuar no arquivo (o que o critério afirma). */
  readonly chaves: readonly string[];
}

/** Design §5 da feature `stitch-validacao-visual`, mais a fila do dono. */
const REDE: Readonly<Record<string, RedeAntiga>> = {
  "vitrine.spec.ts": {
    minimo: 3,
    chaves: [".sc-vitrine__secao h2", '"Pastel do Chef"', "toHaveCount(0)"],
  },
  "produto-detalhe.spec.ts": {
    minimo: 11,
    chaves: [
      '"Sobre o item"',
      "R\\$ 7,00",
      "/Tamanho.*obrigatório/i",
      "/Cor.*obrigatório/i",
    ],
  },
  "produto-opcoes.spec.ts": {
    minimo: 9,
    chaves: [
      ".sc-produto__grupo--pendente",
      "R\\$\\s32,50",
      "R\\$\\s2,50",
      "toHaveCount(0)",
    ],
  },
  "carrinho.spec.ts": {
    minimo: 6,
    chaves: [
      '"R$ 12,00"',
      "sacola está vazia",
      "page.goto(`/loja/${loja.apelido}/carrinho`)",
    ],
  },
  "checkout.spec.ts": {
    minimo: 10,
    chaves: [
      "/[A-Z]-\\d{4}/",
      '"wa.me/5511900000000"',
      '"Olá! Segue meu pedido:"',
      '"Bruno do Teste"',
      "toHaveLength(1)",
    ],
  },
  "acompanhamento.spec.ts": {
    minimo: 22,
    chaves: ['"Pedido não encontrado"', "toBe(404)", "toHaveCount(0)"],
  },
  "a11y-vitrine.spec.ts": {
    minimo: 6,
    chaves: [
      '["critical", "serious"]',
      ">= 44",
      "rolagemHorizontal",
      "toEqual([])",
    ],
  },
  "teclado-vitrine.spec.ts": {
    minimo: 3,
    chaves: ['":solid"', '"Tab"'],
  },
  "desempenho-vitrine.spec.ts": {
    minimo: 14,
    chaves: ['"w_"', "javaScriptEnabled: false"],
  },
  "sobre-da-loja.spec.ts": {
    minimo: 20,
    chaves: ["NUNCA_SAEM", "naturalWidth", "javaScriptEnabled: false"],
  },
  "painel-pedidos.spec.ts": {
    minimo: 10,
    chaves: ['"1 pedido novo"', "expect(recarregou).toBe(false)", ".toBe(1)"],
  },
};

const ASSERCAO = /\bexpect(?:\.soft|\.poll)?\(/g;
const PROIBIDOS: readonly [RegExp, string][] = [
  [/\btest\.(?:skip|fixme|only|fail)\b/, "test.skip/fixme/only/fail"],
  [/\bdescribe\.(?:skip|fixme|only)\b/, "describe.skip/fixme/only"],
  [/\bexpect\(\s*true\s*\)/, "expect(true)"],
];

describe("e2e antigos da compra (AC-11408)", () => {
  for (const [arquivo, rede] of Object.entries(REDE)) {
    const texto = ler(arquivo);

    it(`[CA-11] @spec:AC-11408 ${arquivo} mantém ao menos ${rede.minimo} asserções`, () => {
      const total = texto.match(ASSERCAO)?.length ?? 0;
      expect(total).toBeGreaterThanOrEqual(rede.minimo);
    });

    it(`[CA-11] @spec:AC-11408 ${arquivo} mantém as asserções-chave`, () => {
      const faltam = rede.chaves.filter((chave) => !texto.includes(chave));
      expect(faltam).toEqual([]);
    });

    it(`[CA-11] @spec:AC-11408 ${arquivo} não pula nem esvazia prova`, () => {
      const achados = PROIBIDOS.filter(([padrao]) => padrao.test(texto)).map(
        ([, nome]) => nome,
      );
      expect(achados).toEqual([]);
    });
  }
});

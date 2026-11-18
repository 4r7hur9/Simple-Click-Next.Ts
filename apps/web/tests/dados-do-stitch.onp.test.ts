/**
 * Nada fictício do export do Stitch entra no produto (card #114, AC-11421;
 * princípios P-102, P-103, P-104 e P-105).
 *
 * O export (`stitch_redesign_e_commerce_simpleclick.zip`) traz dados
 * ilustrativos: CNPJ, telefone e endereço de exemplo, "10x sem juros", cupom,
 * prazos, notas, marcas e termos de autopeças, o verde #b2f800 e recursos
 * externos (Tailwind por CDN, Material Symbols, imagens lh3). Este teste lê o
 * código e os estilos das telas e não deixa nada disso entrar como conteúdo.
 *
 * As buscas de P-102, P-103 e P-104 também estão na constituição (o audit as
 * aplica); aqui elas andam junto com as de P-105, que a constituição não tem
 * como busca. O texto PINTADO de cada tela é conferido no navegador, em
 * `e2e/specs/capturas-redesign.onp.spec.ts`.
 *
 * Os guardas (testes que PROÍBEM esses textos e o filtro da API que barra
 * "placa"/"chassi" nas especificações) não são conteúdo e ficam de fora.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "../../..");

function arquivos(pasta: string, extensoes: readonly string[]): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === ".next" || nome === ".turbo")
        continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (extensoes.some((e) => nome.endsWith(e))) achados.push(caminho);
    }
  };
  andar(join(RAIZ, pasta));
  return achados.map((c) => relative(RAIZ, c));
}

/** Código e estilos das telas, sem os testes (guardas) e sem a landing antiga. */
const FONTES = [
  ...arquivos("apps/web/src", [".ts", ".tsx", ".css"]),
  ...arquivos("packages/ui/src", [".ts", ".tsx"]),
  ...arquivos("packages/ui/styles", [".css"]),
].filter((c) => !/\.test\.tsx?$/.test(c));

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

/** Os dados do export, por princípio. Só termos distintivos do Stitch. */
const PROIBIDOS: ReadonlyArray<readonly [string, RegExp]> = [
  ["P-102 verde do Stitch", /#?\bb2f800\b/i],
  ["P-103 Tailwind por CDN", /cdn\.tailwindcss\.com/],
  ["P-103 imagens do export", /lh3\.googleusercontent\.com/],
  ["P-103 Material Symbols", /Material[+ ]Symbols/],
  [
    "P-104 compatibilidade veicular",
    /Compatibilidade R[aá]pida|Trocar Ve[ií]culo|Ve[ií]culo Selecionado/i,
  ],
  ["P-104 chassi", /Checar Chassi|Validar Chassi/i],
  ["P-105 CNPJ de exemplo", /00\.000\.000\/0001-00/],
  ["P-105 telefone de exemplo", /5511999999999/],
  ["P-105 cupom de exemplo", /PRIMEIRACOMPRA/],
  [
    "P-105 parcelamento de exemplo",
    /\b\d{1,2}x\s+(R\$\s*[\d.,]+\s+)?sem\s+juros\b/i,
  ],
  [
    "P-105 endereço de exemplo",
    /Av\.\s*Paulista|Av\.\s*das Ind[uú]strias|Distrito Automotivo/i,
  ],
  ["P-105 empresa de exemplo", /SimpleClick Brasil Ltda/i],
  [
    "P-105 lojas de exemplo",
    /Burger House Garage|Auto VIP Acess|Drop Street|Farma 24h|Banho Flash/,
  ],
  [
    "P-105 marcas de autopeças",
    /\bFREMAX\b|\bFRAS-LE\b|NGK SPARK|VOX FILTROS|BKR6EGP|\bLB55\b/,
  ],
  [
    "P-105 promessas de exemplo",
    /Entrega Flash|Motoboy Express|Tecnologia hiperlocal|Programa Fidelidade/i,
  ],
  [
    "P-105 contagens de exemplo",
    /\(1\.420 avalia|\(342 avalia|1\.086 itens|538 itens encontrados/,
  ],
];

describe("dados do Stitch fora do produto (AC-11421)", () => {
  it("[CA-34] @spec:AC-11421 o teste lê de fato o código das telas", () => {
    expect(FONTES.length).toBeGreaterThan(100);
    expect(
      FONTES.some((c) => c.endsWith("packages/ui/styles/vitrine.css")),
    ).toBe(true);
  });

  for (const [nome, padrao] of PROIBIDOS) {
    it(`[CA-34] @spec:AC-11421 @principle:${nome.slice(0, 5)} nada de "${nome}" no código e nos estilos das telas`, () => {
      const achados = FONTES.filter((c) => padrao.test(ler(c)));
      expect(achados).toEqual([]);
    });
  }
});

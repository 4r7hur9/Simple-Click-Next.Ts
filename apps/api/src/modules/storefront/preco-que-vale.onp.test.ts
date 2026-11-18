/**
 * Card #108 · T-10808b — guardas de TEXTO sobre o SQL da vitrine (não precisam
 * de banco).
 *
 * 1. O "preço que vale" aparece em dois lugares de `catalogo-paginado`: na
 *    ordenação por preço (e por desconto) e no filtro de faixa. O cartão, a
 *    ordem e o filtro precisam concordar, e como o repositório compõe SQL só com
 *    templates marcados, o trecho é copiado — então este teste confere que as
 *    cópias são o mesmo texto.
 * 2. Nada em `storefront/` monta SQL por concatenação.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PASTA = dirname(fileURLToPath(import.meta.url));

const compactar = (texto: string) => texto.replace(/\s+/g, " ").trim();

function trechosDoPreco(fonte: string): string[] {
  const achados: string[] = [];
  const abre = "-- >>> preco que vale";
  const fecha = "-- <<< preco que vale";
  let a = fonte.indexOf(abre);
  while (a !== -1) {
    const b = fonte.indexOf(fecha, a);
    expect(b, "o trecho do preço precisa fechar").toBeGreaterThan(a);
    achados.push(compactar(fonte.slice(a + abre.length, b)));
    a = fonte.indexOf(abre, b);
  }
  return achados;
}

describe("o preço que vale no SQL da vitrine", () => {
  const fonte = readFileSync(
    join(PASTA, "catalogo-paginado.usecase.ts"),
    "utf8",
  );

  /** As duas leituras de preço: a promoção vigente e o preço base vigente. */
  const regras = (trecho: string) =>
    trecho.match(/min\(pp\.amount_cents\) FILTER \( WHERE .*?\)\)/g) ?? [];

  it("[CA-9] @spec:AC-10816 a ordenação por preço e o filtro de faixa usam a MESMA regra, escrita igual", () => {
    const trechos = trechosDoPreco(fonte);
    // Ordenação (por produto) e filtro de faixa (agregado).
    expect(trechos).toHaveLength(2);

    const [ordenacao, faixa] = trechos.map(regras);
    expect(ordenacao).toHaveLength(2);
    expect(faixa).toHaveLength(2);
    expect(faixa).toEqual(ordenacao);

    // É a regra do cartão: promoção vigente primeiro, senão o preço base.
    expect(ordenacao?.[0]).toContain("pp.kind = 'PROMO'");
    expect(ordenacao?.[1]).toContain("pp.kind = 'BASE'");
    expect(trechos[0]).toContain("pp.variant_id IS NULL");
    expect(trechos[1]).toContain("pp.variant_id IS NULL");
  });

  it("[CA-9] @spec:AC-10816 o isolamento por loja tem a segunda trava nas duas leituras", () => {
    const [ordenacao, faixa] = trechosDoPreco(fonte);
    // Por produto, a sonda exige a mesma loja; agregado, agrupa por loja e a
    // junção do filtro exige a mesma loja (a primeira trava é a política de linha).
    expect(ordenacao).toContain("pp.store_id = p.store_id");
    expect(faixa).toContain("GROUP BY pp.store_id, pp.product_id");
    expect(fonte.match(/pc\.store_id = p\.store_id/g)).toHaveLength(1);
  });
});

describe("nenhum SQL por concatenação em storefront/", () => {
  const arquivos = readdirSync(PASTA).filter(
    (nome) => nome.endsWith(".ts") && !/\.test\.ts$/.test(nome),
  );

  for (const nome of arquivos) {
    it(`[CA-9] @spec:AC-10816 ${nome} não usa Prisma.raw nem $queryRawUnsafe`, () => {
      const texto = readFileSync(join(PASTA, nome), "utf8");
      expect(texto).not.toMatch(
        /Prisma\.raw\b|\$queryRawUnsafe|\$executeRawUnsafe/,
      );
    });
  }
});

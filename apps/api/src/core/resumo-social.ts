/**
 * Os números sociais públicos — curtidas, comentários APROVADOS e se a pessoa
 * da sessão curtiu (card #47).
 *
 * Mora no núcleo, e não no módulo social, porque três módulos os leem: o
 * feed (cada post e cada loja), a vitrine e o próprio módulo social — e a
 * tabela de fronteiras não deixa um módulo importar outro. Só leitura, pelas
 * funções de lista fechada da migração 0062.
 */

import type { ResumoSocial } from "@simpleclick/contracts";

import { transacaoAtual } from "./db.ts";

interface LinhaDoResumo {
  readonly chave: string;
  readonly likes: bigint;
  readonly comments: bigint;
  readonly liked: boolean;
}

function resumo(linha: LinhaDoResumo | undefined): ResumoSocial {
  return {
    curtidas: Number(linha?.likes ?? 0),
    comentarios: Number(linha?.comments ?? 0),
    curtiu: linha?.liked ?? false,
  };
}

/**
 * Os números sociais de vários produtos de uma vez (uma consulta para a
 * página inteira do feed). Produto sem linha sai zerado.
 */
export async function socialDosProdutos(
  ids: readonly string[],
): Promise<Map<string, ResumoSocial>> {
  const porProduto = new Map<string, ResumoSocial>();
  if (ids.length === 0) return porProduto;
  const linhas = await transacaoAtual().$queryRaw<LinhaDoResumo[]>`
    SELECT product_id::text AS chave, likes, comments, liked
      FROM app.social_dos_produtos(${[...ids]}::uuid[])`;
  for (const linha of linhas) porProduto.set(linha.chave, resumo(linha));
  return porProduto;
}

/** Os números sociais de várias lojas, pelo apelido (minúsculo). */
export async function socialDasLojas(
  apelidos: readonly string[],
): Promise<Map<string, ResumoSocial>> {
  const porLoja = new Map<string, ResumoSocial>();
  if (apelidos.length === 0) return porLoja;
  const linhas = await transacaoAtual().$queryRaw<LinhaDoResumo[]>`
    SELECT lower(slug) AS chave, likes, comments, liked
      FROM app.social_das_lojas(${[...apelidos]}::text[])`;
  for (const linha of linhas) porLoja.set(linha.chave, resumo(linha));
  return porLoja;
}

/** O resumo de um produto ou loja — zerado quando não há nada. */
export function resumoOuZero(
  mapa: ReadonlyMap<string, ResumoSocial>,
  chave: string,
): ResumoSocial {
  return mapa.get(chave) ?? { curtidas: 0, comentarios: 0, curtiu: false };
}

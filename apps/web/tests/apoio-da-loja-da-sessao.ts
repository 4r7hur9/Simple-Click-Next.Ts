/**
 * Apoio das provas do site que dependem da loja da sessão (T-115).
 *
 * A resposta de mentira da rota "quem sou eu" (`GET /v1/eu`): é por ela que o
 * site descobre a loja do painel. Fica num lugar só para todas as provas
 * falarem da mesma loja e da mesma dona.
 */

/** A loja da sessão da dona, como a API a devolve. */
export const LOJA_DA_SESSAO = {
  apelido: "acai-da-vila",
  nome: "Açaí & Guaraná da Vila",
  papel: "OWNER",
  situacao: "ACTIVE",
} as const;

/** Uma segunda loja da mesma dona. */
export const OUTRA_LOJA_DA_SESSAO = {
  apelido: "acai-do-centro",
  nome: "Açaí do Centro",
  papel: "OWNER",
  situacao: "ACTIVE",
} as const;

/** O corpo de `GET /v1/eu` para a dona, com as lojas informadas. */
export function quemSouEu(lojas: readonly unknown[] = [LOJA_DA_SESSAO]) {
  return {
    identidade: {
      id: "5d1f0c7a-2b3e-4c5d-8e9f-0a1b2c3d4e5f",
      email: "dona@exemplo.test",
      nome: "Dona",
      papel: "OWNER",
    },
    lojas,
  };
}

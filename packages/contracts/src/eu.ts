/**
 * Contrato da rota "quem sou eu" (T-115, AC-134).
 *
 * O painel precisa saber de qual loja é o dono sem ler loja nenhuma da
 * configuração do servidor. Esta rota devolve a pessoa da sessão e as lojas em
 * que ela tem vínculo ativo; o site escolhe a loja a partir daqui, e a API
 * confere o vínculo de novo em cada rota do dono.
 */
import { z } from "zod";

import { esquemaDoPapelDaSessao } from "./auth.ts";
import { definirRota } from "./rota.ts";

/** Uma loja em que a pessoa tem vínculo ativo. Sem identificador interno. */
export const esquemaDaLojaDaSessao = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  papel: z.enum(["OWNER", "STAFF"]),
  situacao: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]),
});

/** `GET /v1/eu` — a pessoa da sessão e as lojas dela. */
export const esquemaDoEu = z.strictObject({
  identidade: z.strictObject({
    id: z.uuid(),
    email: z.string(),
    nome: z.string().nullable(),
    papel: esquemaDoPapelDaSessao,
  }),
  lojas: z.array(esquemaDaLojaDaSessao),
});

export type LojaDaSessao = z.infer<typeof esquemaDaLojaDaSessao>;
export type EuNoContrato = z.infer<typeof esquemaDoEu>;

/** A rota no catálogo do contrato publicado. */
export const rotaDoEu = definirRota({
  metodo: "get",
  caminho: "/v1/eu",
  etiqueta: "identidade",
  resumo: "Quem está logado e de quais lojas",
  descricao:
    "Devolve a pessoa do token de acesso e as lojas em que ela tem vínculo ativo com o papel da sessão. Cliente e administração recebem a lista vazia. Sem token válido, 401.",
  resposta: esquemaDoEu,
  errosPossiveis: [401],
});

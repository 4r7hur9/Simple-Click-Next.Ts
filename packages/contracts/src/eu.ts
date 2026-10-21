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
import {
  esquemaDaPermissaoDaLoja,
  esquemaDaPermissaoDaPlataforma,
} from "./permissoes.ts";
import { definirRota } from "./rota.ts";

/** Uma loja em que a pessoa tem vínculo ativo. Sem identificador interno. */
export const esquemaDaLojaDaSessao = z.strictObject({
  apelido: z.string(),
  nome: z.string(),
  papel: z.enum(["OWNER", "STAFF"]),
  situacao: z.enum(["PENDING_APPROVAL", "ACTIVE", "REJECTED", "INACTIVE"]),
  /**
   * O que a conta pode NESTA loja, pela matriz de permissões do papel
   * (`MATRIZ_DE_PERMISSOES`, card #25). O site usa para montar o menu.
   */
  permissoes: z.array(esquemaDaPermissaoDaLoja).optional(),
});

/**
 * O papel efetivo da conta, decidido pelo que ela tem — e não pelo login:
 * administração da plataforma vence; depois dono de alguma loja; depois
 * equipe de alguma loja; senão, cliente.
 */
export const esquemaDoPapelEfetivo = z.enum([
  "ADMIN",
  "DONO",
  "EQUIPE",
  "CLIENTE",
]);

/** `GET /v1/eu` — a pessoa da sessão e as lojas dela. */
export const esquemaDoEu = z.strictObject({
  identidade: z.strictObject({
    id: z.uuid(),
    email: z.string(),
    nome: z.string().nullable(),
    papel: esquemaDoPapelDaSessao,
    /** Telefone da conta (E.164), ou nulo quando ainda não informado. */
    telefone: z.string().nullable().optional(),
  }),
  /** As lojas do papel da SESSÃO (só dono recebe); é o que o painel usa. */
  lojas: z.array(esquemaDaLojaDaSessao),
  /** Papel efetivo da conta (barra de usuário e checkout). */
  papelEfetivo: esquemaDoPapelEfetivo.optional(),
  /** Verdadeiro quando a conta administra a plataforma. */
  adminDaPlataforma: z.boolean().optional(),
  /** Todas as lojas em que a conta é dono OU equipe, seja qual for a sessão. */
  lojasDaConta: z.array(esquemaDaLojaDaSessao).optional(),
  /** O que a conta pode na administração da plataforma (vazio se não é admin). */
  permissoesDaPlataforma: z.array(esquemaDaPermissaoDaPlataforma).optional(),
});

export type PapelEfetivo = z.infer<typeof esquemaDoPapelEfetivo>;
export type LojaDaSessao = z.infer<typeof esquemaDaLojaDaSessao>;
export type EuNoContrato = z.infer<typeof esquemaDoEu>;

/** A rota no catálogo do contrato publicado. */
export const rotaDoEu = definirRota({
  metodo: "get",
  caminho: "/v1/eu",
  etiqueta: "identidade",
  resumo: "Quem está logado e de quais lojas",
  descricao:
    "Devolve a pessoa do token de acesso (nome, e-mail, telefone), o papel efetivo da conta (ADMIN, DONO, EQUIPE ou CLIENTE), se ela administra a plataforma, todas as lojas em que é dono ou equipe (`lojasDaConta`) e, em `lojas`, as lojas do papel da sessão (cliente e administração recebem a lista vazia). Cada loja traz `permissoes`, o que a conta pode nela pela matriz do papel (dono: tudo; equipe: catálogo, pedidos, clientes, pedido manual e métricas), e `permissoesDaPlataforma` diz o que ela pode na administração. Sem token válido, 401.",
  resposta: esquemaDoEu,
  errosPossiveis: [401],
});

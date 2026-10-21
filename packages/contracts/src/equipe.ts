/**
 * A equipe da loja e a loja aberta pelo próprio lojista (card #25).
 *
 * EQUIPE (`/v1/lojas/:apelido/equipe`, só o dono). Cadastrar alguém pede nome
 * e e-mail. Se o e-mail ainda não tem conta, a senha também: a conta nasce com
 * ela e fica GERENCIADA pela loja — só nesse caso o dono troca a senha depois.
 * Se o e-mail já tem conta, a pessoa só ganha o vínculo e entra com a senha
 * dela. Cada cadastro respeita o limite de equipe da loja (409
 * `limite_atingido`).
 *
 * LOJA SOLICITADA (`POST /v1/auth/lojas`, qualquer conta). A loja nasce
 * AGUARDANDO APROVAÇÃO, com a pessoa como dona; respeita o limite de lojas por
 * dono. A resposta abre uma sessão nova (o papel da conta passa a ser dono).
 */

import { z } from "zod";

import { esquemaDaSessaoAberta } from "./auth.ts";
import { esquemaDoAceiteDoLojista } from "./legal.ts";
import { esquemaDoPapelNaLoja } from "./permissoes.ts";
import { definirRota } from "./rota.ts";

const nome = z
  .string("Informe o nome.")
  .trim()
  .min(2, "Nome: use ao menos 2 letras.")
  .max(80, "Nome: use no máximo 80 caracteres.");

const email = z
  .string("Informe o e-mail.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido.").max(254));

const senha = z
  .string("Informe a senha.")
  .min(8, "A senha precisa de ao menos 8 caracteres.")
  .max(128, "A senha cabe em até 128 caracteres.");

/** Uma pessoa da equipe, como o dono a vê. */
export const esquemaDoMembroDaEquipe = z.strictObject({
  /** Identificador do VÍNCULO (é ele que as rotas de edição usam). */
  id: z.string(),
  nome: z.string().nullable(),
  email: z.string(),
  papel: esquemaDoPapelNaLoja,
  /** Falso depois de desativado ou removido. */
  ativo: z.boolean(),
  /** A conta foi criada pela loja: o dono pode trocar a senha. */
  contaGerenciada: z.boolean(),
  /** Instante do vínculo, em ISO 8601. */
  desde: z.string(),
});

export type MembroDaEquipe = z.infer<typeof esquemaDoMembroDaEquipe>;

/** `GET /v1/lojas/:apelido/equipe` */
export const esquemaDaEquipe = z.strictObject({
  membros: z.array(esquemaDoMembroDaEquipe),
  /** Pessoas de equipe (STAFF) ativas e quantas a loja pode ter. */
  limite: z.strictObject({
    limite: z.number().int().nonnegative(),
    uso: z.number().int().nonnegative(),
  }),
});

/** `POST /v1/lojas/:apelido/equipe` */
export const esquemaDoNovoMembroDaEquipe = z.strictObject({
  nome,
  email,
  /** Obrigatória quando o e-mail ainda não tem conta (422 `senha_obrigatoria`). */
  senha: senha.optional(),
});

/** `PATCH /v1/lojas/:apelido/equipe/:id` — reativar respeita o limite. */
export const esquemaDaEdicaoDoMembroDaEquipe = z.strictObject({
  ativo: z.boolean(),
});

/** `PUT /v1/lojas/:apelido/equipe/:id/senha` */
export const esquemaDaTrocaDeSenhaDaEquipe = z.strictObject({ senha });

export const MENSAGENS_DA_EQUIPE = Object.freeze({
  senhaObrigatoria:
    "Este e-mail ainda não tem conta. Defina uma senha para a pessoa entrar.",
  jaEMembro: "Esta pessoa já faz parte da loja.",
  senhaNaoGerenciada:
    "Só dá para trocar a senha de quem a loja cadastrou. Peça para a pessoa usar 'Esqueci a senha'.",
  donoNaoSai: "O dono não pode ser removido da própria loja.",
});

// ---------------------------------------------------------------------------
// A loja que o próprio lojista abre
// ---------------------------------------------------------------------------

const apelido = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/,
    "Endereço: use de 3 a 63 letras sem acento, números e hífen.",
  );

/** `POST /v1/auth/lojas` */
export const esquemaDaLojaSolicitada = z.strictObject({
  nome: z
    .string("Informe o nome da loja.")
    .trim()
    .min(2, "Nome da loja: use ao menos 2 letras.")
    .max(80, "Nome da loja: use no máximo 80 caracteres."),
  /** Código do tipo de negócio (lista de `GET /v1/tipos-de-negocio`). */
  tipoDeNegocio: z
    .string()
    .trim()
    .regex(/^[A-Z_]{2,40}$/, "Escolha um tipo de negócio da lista."),
  /** Endereço da loja (`/loja/<apelido>`). Sem ele, sai do nome. */
  apelido: apelido.optional(),
  whatsapp: z.string().trim().max(20).optional(),
  cidade: z.string().trim().max(80).optional(),
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "UF: use as duas letras do estado.")
    .optional(),
  /** Aceite dos Termos do Lojista (card #79). */
  aceitouTermosDoLojista: esquemaDoAceiteDoLojista,
});

export type LojaSolicitadaNoContrato = z.output<typeof esquemaDaLojaSolicitada>;

/** A loja criada, dentro da resposta de `POST /v1/auth/lojas`. */
export const esquemaDaLojaSolicitadaCriada = z.strictObject({
  codigo: z.string(),
  apelido: z.string(),
  status: z.literal("PENDING_APPROVAL"),
});

/** A resposta de `POST /v1/auth/lojas`: a sessão nova, já como dono. */
export const esquemaDaLojaSolicitadaComSessao = esquemaDaSessaoAberta.extend({
  mensagem: z.string(),
  loja: esquemaDaLojaSolicitadaCriada,
});

export const rotaDaLojaSolicitada = definirRota({
  metodo: "post",
  caminho: "/v1/auth/lojas",
  etiqueta: "identidade",
  resumo: "Abre uma loja para a conta logada",
  descricao:
    "Qualquer conta logada (Bearer ou cookie sc_access) abre a própria loja: ela nasce AGUARDANDO APROVAÇÃO (PENDING_APPROVAL), com a pessoa como dona, e não aparece na vitrine nem no feed até a administração aprovar. Sem `apelido`, o endereço sai do nome (com sufixo se preciso); `apelido` escolhido que já existe volta 409 `apelido_em_uso` com `sugestao`. Passou do limite de lojas por dono: 409 `limite_atingido` {recurso: 'lojas', limite, uso}. Tipo de negócio fora da lista: 400 `tipo_desconhecido`. A resposta é a SESSÃO NOVA (o papel da conta passa a ser dono), como no login, com a loja em `loja`.",
  corpo: esquemaDaLojaSolicitada,
  resposta: esquemaDaLojaSolicitadaComSessao,
  status: 201,
  errosPossiveis: [400, 401, 409],
});

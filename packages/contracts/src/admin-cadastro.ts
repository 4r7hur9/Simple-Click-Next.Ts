/**
 * Cadastro de loja pela administração (AC-200, AC-201, AC-202). Site e API
 * validam com ESTES esquemas: a recusa sai na tela e de novo na API, porque
 * quem chama a API direto não passa pelo formulário. As mensagens são a frase
 * que aparece embaixo do campo, escritas para quem preenche.
 */

import { z } from "zod";

import {
  conferirDocumento,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
  somenteDigitos,
} from "./documento.ts";

// ---------------------------------------------------------------------------
// Apelido — o endereço da loja na web
// ---------------------------------------------------------------------------

/** Minúsculas, números e hífen no meio, de 2 a 63 caracteres (rótulo de DNS). */
export const FORMATO_DO_APELIDO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/** Nomes que a plataforma reserva para si e que nunca viram apelido de loja. */
export const APELIDOS_RESERVADOS: readonly string[] = [
  "www",
  "app",
  "api",
  "painel",
  "admin",
  "static",
  "cdn",
  "mail",
  "loja",
  "conta",
  "explorar",
  "entrar",
  "imprimir",
];

export const MENSAGEM_DE_APELIDO_EM_USO =
  "Este endereço já está em uso por outra loja.";

export const esquemaDoApelidoDaLoja = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    FORMATO_DO_APELIDO,
    "Use de 2 a 63 letras minúsculas, números e hífen, sem hífen no começo nem no fim.",
  )
  .refine((apelido) => !APELIDOS_RESERVADOS.includes(apelido), {
    message: "Este endereço é reservado pela plataforma.",
  });

// ---------------------------------------------------------------------------
// Campos de cadastro
// ---------------------------------------------------------------------------

/** CPF ou CNPJ, com ou sem máscara. Sai só com dígitos (AC-202). */
export const esquemaDoDocumento = z
  .string()
  .trim()
  .min(1, "Informe o CPF ou o CNPJ.")
  .refine((valor) => conferirDocumento(valor).valido, {
    message: MENSAGEM_DE_DOCUMENTO_INVALIDO,
  })
  .transform((valor) => somenteDigitos(valor));

/** Telefone brasileiro com DDD. Sai no formato internacional (+55…). */
export const esquemaDoTelefone = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/[\s().-]/g, ""))
  .refine((valor) => /^(\+?55)?\d{10,11}$/.test(valor), {
    message: "Informe o telefone com DDD, só números.",
  })
  .transform((valor) => {
    const digitos = valor.replace(/^\+/, "");
    return digitos.length > 11 ? `+${digitos}` : `+55${digitos}`;
  });

export const esquemaDoEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "O e-mail está longo demais.")
  .pipe(z.email("Informe um e-mail válido."));

/** As 27 unidades da federação. Sigla fora da lista é erro de digitação. */
export const UNIDADES_DA_FEDERACAO = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

/** Texto obrigatório com teto, e a recusa dita com o rótulo do campo. */
export const textoObrigatorio = (rotulo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(
      maximo,
      `${rotulo[0]?.toUpperCase() ?? ""}${rotulo.slice(1)} está longo demais.`,
    );

export const esquemaDoEnderecoDaLoja = z.strictObject({
  cep: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor.length === 8, {
      message: "Informe o CEP com 8 números.",
    }),
  logradouro: textoObrigatorio("o logradouro", 160),
  numero: textoObrigatorio("o número", 20),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: textoObrigatorio("o bairro", 80),
  cidade: textoObrigatorio("a cidade", 80),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(UNIDADES_DA_FEDERACAO, "Escolha a UF da loja.")),
});

/** Código de um tipo de negócio (`vertical_presets.code`), como FOOD_SNACK. */
export const esquemaDoTipoDeNegocio = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z_]{1,40}$/, "Escolha o tipo de negócio.");

// ---------------------------------------------------------------------------
// Cadastro de loja (AC-200, AC-201, AC-202)
// ---------------------------------------------------------------------------

export const esquemaDaNovaLoja = z.strictObject({
  /** Nome da loja, ou a razão social quando não há nome fantasia. */
  nome: textoObrigatorio("o nome ou a razão social", 120),
  razaoSocial: z.string().trim().max(160).nullable().optional(),
  documento: esquemaDoDocumento,
  responsavel: z.strictObject({
    nome: textoObrigatorio("o nome do responsável", 120),
    email: esquemaDoEmail,
    telefone: esquemaDoTelefone,
  }),
  endereco: esquemaDoEnderecoDaLoja,
  tipoDeNegocio: esquemaDoTipoDeNegocio,
  apelido: esquemaDoApelidoDaLoja,
});

export type NovaLojaNoContrato = z.output<typeof esquemaDaNovaLoja>;
export type NovaLojaEnviada = z.input<typeof esquemaDaNovaLoja>;

/**
 * Situações de uma loja, na língua de quem administra (card #25):
 *
 * - `PENDING_APPROVAL` loja nova, aguardando a aprovação da administração;
 *   não aparece na vitrine nem no feed.
 * - `ACTIVE` aprovada e no ar.
 * - `REJECTED` recusada, com motivo.
 * - `INACTIVE` desativada pela administração: fora da vitrine e do feed, sem
 *   pedido novo (quem já pediu continua acompanhando).
 * - `DELETED` excluída, restaurável por prazo.
 */
export const SITUACOES_DA_LOJA = [
  "PENDING_APPROVAL",
  "ACTIVE",
  "REJECTED",
  "INACTIVE",
  "DELETED",
] as const;

export const esquemaDaSituacaoDaLoja = z.enum(SITUACOES_DA_LOJA);

export const esquemaDaLojaCriada = z.strictObject({
  id: z.string(),
  /** Código humano de atendimento, sequencial, com quatro dígitos: `0002`. */
  codigo: z.string().regex(/^\d{4,}$/),
  apelido: z.string(),
  status: esquemaDaSituacaoDaLoja,
  /** Falso quando a loja foi criada mas o e-mail ainda não saiu. */
  conviteEnviado: z.boolean(),
});

export type LojaCriadaNoContrato = z.infer<typeof esquemaDaLojaCriada>;

/**
 * Recusa de campo, no mesmo formato da borda de validação da API
 * (`core/validar.ts`): é o que permite ao formulário apontar o campo.
 */
export const esquemaDoCampoRecusado = z.strictObject({
  onde: z.string(),
  caminho: z.string(),
  mensagem: z.string(),
});

export const esquemaDaRecusaDeCadastro = z.strictObject({
  erro: z.enum(["entrada_invalida", "apelido_em_uso", "tipo_desconhecido"]),
  campos: z.array(esquemaDoCampoRecusado),
  /** Um apelido livre parecido, quando o pedido foi recusado por repetição. */
  sugestao: z.string().nullable().optional(),
});

/** Os tipos de negócio que o formulário oferece. */
export const esquemaDoTipoDeNegocioDisponivel = z.strictObject({
  codigo: z.string(),
  nome: z.string(),
  controlaEstoque: z.boolean(),
});

export const esquemaDosTiposDeNegocio = z.strictObject({
  tipos: z.array(esquemaDoTipoDeNegocioDisponivel),
});

export type TipoDeNegocioNoContrato = z.infer<
  typeof esquemaDoTipoDeNegocioDisponivel
>;

export type SituacaoDaLoja = (typeof SITUACOES_DA_LOJA)[number];

/** Como cada situação se chama na tela da administração. */
export const ROTULOS_DAS_SITUACOES: Readonly<Record<SituacaoDaLoja, string>> = {
  PENDING_APPROVAL: "Aguardando aprovação",
  ACTIVE: "Ativa",
  REJECTED: "Recusada",
  INACTIVE: "Desativada",
  DELETED: "Excluída",
};

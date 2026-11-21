/**
 * Pessoas, vínculos e auditoria da plataforma na administração (card #170).
 *
 * Contratos ADITIVOS: o `/v1/admin/contas` antigo (admin-gestao.ts) segue
 * como está até a migração do site. Nenhum corpo de escrita aceita papel ou
 * admin (todos `strictObject`): quem a pessoa é na loja muda só pelos
 * vínculos, e a administração da plataforma nunca é concedida por aqui.
 */

import { z } from "zod";

import {
  esquemaDoEmail,
  esquemaDoTelefone,
  esquemaDaSituacaoDaLoja,
  textoObrigatorio,
} from "./admin-cadastro.ts";
import { esquemaDoRegistroDaTrilha } from "./admin-ficha.ts";
import { esquemaDoPapelNaLoja } from "./permissoes.ts";
import {
  FORMATO_DO_ATO,
  FORMATO_DO_DIA,
} from "./admin-auditoria.ts";

const naoNegativo = z.number().int().min(0);

/** Motivo de um ato sensível: obrigatório, vai para a auditoria da plataforma. */
export const esquemaDoMotivoDaPessoa = textoObrigatorio("o motivo", 300);

/** Campo vazio do formulário é "sem filtro". */
const vazioViraAusente = (valor: unknown): unknown =>
  valor === "" ? undefined : valor;

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

export const TIPOS_DE_PESSOA = ["todas", "clientes", "donos", "equipe"] as const;
export type TipoDePessoa = (typeof TIPOS_DE_PESSOA)[number];

export const SITUACOES_DA_PESSOA = ["ativas", "desativadas", "todas"] as const;
export type SituacaoDaPessoa = (typeof SITUACOES_DA_PESSOA)[number];

/** `GET /v1/admin/pessoas` — a busca é por nome ou e-mail (nunca telefone). */
export const esquemaDaConsultaDePessoas = z.object({
  tipo: z.enum(TIPOS_DE_PESSOA).default("todas"),
  situacao: z.enum(SITUACOES_DA_PESSOA).default("ativas"),
  busca: z.preprocess(vazioViraAusente, z.string().trim().max(80).optional()),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConsultaDePessoasNoContrato = z.output<
  typeof esquemaDaConsultaDePessoas
>;

/** A lista mostra o mínimo: sem telefone, documento nem endereço. */
export const esquemaDoItemDePessoa = z.strictObject({
  identidadeId: z.string(),
  nome: z.string().nullable(),
  email: z.string(),
  criadaEm: z.string(),
  desativada: z.boolean(),
  /** Tem senha definida (conta pronta para entrar). */
  temSenha: z.boolean(),
  donoDeLojas: naoNegativo,
  equipeDeLojas: naoNegativo,
  /** Nada de papel de plataforma aqui: só informa se a pessoa é protegida. */
  protegida: z.boolean(),
});

export const esquemaDaListaDePessoas = z.strictObject({
  pessoas: z.array(esquemaDoItemDePessoa),
  total: naoNegativo,
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  /** Quantas pessoas de cada tipo existem, com a mesma busca e situação. */
  contagens: z.strictObject({
    todas: naoNegativo,
    clientes: naoNegativo,
    donos: naoNegativo,
    equipe: naoNegativo,
  }),
});

export const esquemaDoVinculoDaPessoa = z.strictObject({
  lojaId: z.string(),
  nome: z.string(),
  apelido: z.string(),
  status: esquemaDaSituacaoDaLoja,
  papel: esquemaDoPapelNaLoja,
});

export const esquemaDosPedidosDaPessoa = z.strictObject({
  total: naoNegativo,
  ultimoEm: z.string().nullable(),
  porLoja: z.array(
    z.strictObject({
      lojaId: z.string(),
      nome: z.string(),
      total: naoNegativo,
    }),
  ),
});

/** A ficha: contato só para a administração; sem CPF nem endereço. */
export const esquemaDaFichaDaPessoa = z.strictObject({
  ...esquemaDoItemDePessoa.shape,
  telefone: z.string().nullable(),
  desativadaEm: z.string().nullable(),
  vinculos: z.array(esquemaDoVinculoDaPessoa),
  pedidos: esquemaDosPedidosDaPessoa,
  historico: z.array(esquemaDoRegistroDaTrilha),
});

/** `POST /v1/admin/pessoas` — cria a identidade SEM senha e sem papel. */
export const esquemaDoCadastroDePessoa = z.strictObject({
  nome: textoObrigatorio("o nome", 120),
  email: esquemaDoEmail,
  telefone: z.preprocess(vazioViraAusente, esquemaDoTelefone.optional()),
});

/** `PATCH /v1/admin/pessoas/:id` — só nome e telefone. */
export const esquemaDaEdicaoDePessoa = z
  .strictObject({
    nome: textoObrigatorio("o nome", 120).optional(),
    telefone: esquemaDoTelefone.nullable().optional(),
  })
  .refine((corpo) => Object.keys(corpo).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

/** `POST /v1/admin/pessoas/:id/desativar` */
export const esquemaDaDesativacaoDePessoa = z.strictObject({
  motivo: esquemaDoMotivoDaPessoa,
  /** Ciência de que lojas ativas ficarão sem dono (resposta 409 dono_unico). */
  lojasSemDonoCiente: z.boolean().optional(),
});

/** `POST /v1/admin/pessoas/:id/reativar` */
export const esquemaDaReativacaoDePessoa = z.strictObject({
  motivo: esquemaDoMotivoDaPessoa,
});

/** `POST /v1/admin/pessoas/:id/acesso` — link único de acesso. */
export const esquemaDoPedidoDeAcesso = z.strictObject({
  motivo: esquemaDoMotivoDaPessoa,
});

/** O caminho aparece uma vez; só o hash fica guardado. */
export const esquemaDoAcessoGerado = z.strictObject({
  caminho: z.string(),
  expiraEm: z.string(),
  emailEnviado: z.boolean(),
});

/** Resposta de 409 `email_em_uso`: aponta a identidade já existente. */
export const esquemaDoEmailEmUso = z.strictObject({
  identidadeId: z.string(),
});

export type ItemDePessoaNoContrato = z.infer<typeof esquemaDoItemDePessoa>;
export type ListaDePessoasNoContrato = z.infer<typeof esquemaDaListaDePessoas>;
export type FichaDaPessoaNoContrato = z.infer<typeof esquemaDaFichaDaPessoa>;
export type CadastroDePessoaNoContrato = z.output<
  typeof esquemaDoCadastroDePessoa
>;
export type EdicaoDePessoaNoContrato = z.output<typeof esquemaDaEdicaoDePessoa>;
export type DesativacaoDePessoaNoContrato = z.output<
  typeof esquemaDaDesativacaoDePessoa
>;
export type AcessoGeradoNoContrato = z.infer<typeof esquemaDoAcessoGerado>;

// ---------------------------------------------------------------------------
// Vínculos (donos e equipes)
// ---------------------------------------------------------------------------

export const TIPOS_DE_VINCULO = ["donos", "equipe"] as const;
export type TipoDeVinculo = (typeof TIPOS_DE_VINCULO)[number];

/** `GET /v1/admin/vinculos` — por loja, filtrando por papel. */
export const esquemaDaConsultaDeVinculos = z.object({
  tipo: z.enum(TIPOS_DE_VINCULO).default("donos"),
  busca: z.preprocess(vazioViraAusente, z.string().trim().max(80).optional()),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConsultaDeVinculosNoContrato = z.output<
  typeof esquemaDaConsultaDeVinculos
>;

export const esquemaDoItemDeVinculo = z.strictObject({
  lojaId: z.string(),
  lojaNome: z.string(),
  lojaApelido: z.string(),
  lojaStatus: esquemaDaSituacaoDaLoja,
  identidadeId: z.string(),
  pessoaNome: z.string().nullable(),
  pessoaEmail: z.string(),
  papel: esquemaDoPapelNaLoja,
  desde: z.string(),
});

export const esquemaDaListaDeVinculos = z.strictObject({
  vinculos: z.array(esquemaDoItemDeVinculo),
  total: naoNegativo,
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
});

/** `POST /v1/admin/lojas/:id/donos` — atribui um dono (pessoa já existente). */
export const esquemaDaAtribuicaoDeDono = z.strictObject({
  identidadeId: z.uuid("Pessoa inválida."),
  motivo: esquemaDoMotivoDaPessoa,
});

/** `POST /v1/admin/lojas/:id/donos/:identidadeId/substituir` */
export const esquemaDaSubstituicaoDeDono = z.strictObject({
  novoDonoId: z.uuid("Pessoa inválida."),
  motivo: esquemaDoMotivoDaPessoa,
});

/** `DELETE`-equivalente de dono: remover exige motivo. */
export const esquemaDaRemocaoDeVinculo = z.strictObject({
  motivo: esquemaDoMotivoDaPessoa,
});

/** `POST /v1/admin/lojas/:id/equipe` — atribui alguém à equipe da loja. */
export const esquemaDaAtribuicaoDeEquipe = z.strictObject({
  identidadeId: z.uuid("Pessoa inválida."),
  motivo: esquemaDoMotivoDaPessoa,
});

export type ItemDeVinculoNoContrato = z.infer<typeof esquemaDoItemDeVinculo>;
export type ListaDeVinculosNoContrato = z.infer<
  typeof esquemaDaListaDeVinculos
>;
export type AtribuicaoDeDonoNoContrato = z.output<
  typeof esquemaDaAtribuicaoDeDono
>;
export type SubstituicaoDeDonoNoContrato = z.output<
  typeof esquemaDaSubstituicaoDeDono
>;

// ---------------------------------------------------------------------------
// Auditoria da plataforma (audit_platform)
// ---------------------------------------------------------------------------

/** `GET /v1/admin/auditoria/plataforma?ato=&de=&ate=&pagina=&porPagina=` */
export const esquemaDaConsultaDaAuditoriaDaPlataforma = z
  .object({
    ato: z.preprocess(
      vazioViraAusente,
      z.string().regex(FORMATO_DO_ATO, "Ato desconhecido.").optional(),
    ),
    de: z.preprocess(
      vazioViraAusente,
      z.string().regex(FORMATO_DO_DIA, "Informe a data.").optional(),
    ),
    ate: z.preprocess(
      vazioViraAusente,
      z.string().regex(FORMATO_DO_DIA, "Informe a data.").optional(),
    ),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((c) => c.de === undefined || c.ate === undefined || c.de <= c.ate, {
    path: ["ate"],
    message: "O fim do período vem depois do começo.",
  });

export type ConsultaDaAuditoriaDaPlataformaNoContrato = z.output<
  typeof esquemaDaConsultaDaAuditoriaDaPlataforma
>;

/** Ato da plataforma: o registro da trilha mais o objeto atingido. */
export const esquemaDoRegistroDaAuditoriaDaPlataforma = z.strictObject({
  ...esquemaDoRegistroDaTrilha.shape,
  /** `identity` ou `store`, como o ato foi gravado. */
  entidade: z.string(),
  entidadeId: z.string().nullable(),
});

export const esquemaDaPaginaDaAuditoriaDaPlataforma = z.strictObject({
  registros: z.array(esquemaDoRegistroDaAuditoriaDaPlataforma),
  total: naoNegativo,
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
});

export type RegistroDaAuditoriaDaPlataformaNoContrato = z.infer<
  typeof esquemaDoRegistroDaAuditoriaDaPlataforma
>;
export type PaginaDaAuditoriaDaPlataformaNoContrato = z.infer<
  typeof esquemaDaPaginaDaAuditoriaDaPlataforma
>;

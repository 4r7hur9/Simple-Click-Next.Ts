/**
 * Gestão de lojas e contas pela administração (card #29): números por loja,
 * equipe da loja e a lista de contas (donos e equipe).
 *
 *   GET /v1/admin/lojas/:id/metricas?dias=30
 *   GET /v1/admin/lojas/:id/equipe
 *   GET /v1/admin/contas?tipo=donos|equipe&busca=&pagina=&porPagina=
 *   GET /v1/admin/contas/:identidadeId
 *
 * A lista de lojas (`admin-lista.ts`) ganhou dono, pedidos e faturamento, e a
 * consulta ganhou tipo de negócio e ordenação.
 */

import { z } from "zod";

import { esquemaDaSituacaoDaLoja } from "./admin-cadastro.ts";

/** Como a lista de lojas pode ser ordenada. */
export const ORDENS_DA_LISTA_DE_LOJAS = [
  "recentes",
  "antigas",
  "nome",
  "pedidos",
  "faturamento",
] as const;

export type OrdemDaListaDeLojas = (typeof ORDENS_DA_LISTA_DE_LOJAS)[number];

export const ROTULOS_DAS_ORDENS_DA_LISTA: Readonly<
  Record<OrdemDaListaDeLojas, string>
> = {
  recentes: "Mais recentes",
  antigas: "Mais antigas",
  nome: "Nome (A a Z)",
  pedidos: "Mais pedidos",
  faturamento: "Maior faturamento",
};

/** Períodos que a ficha oferece para o faturamento e os pedidos. */
export const PERIODOS_DA_FICHA_EM_DIAS = [7, 30, 90, 365] as const;

export const esquemaDaConsultaDeMetricasDaLoja = z.object({
  dias: z.coerce
    .number()
    .int()
    .refine(
      (dias) => (PERIODOS_DA_FICHA_EM_DIAS as readonly number[]).includes(dias),
      "Período inválido.",
    )
    .default(30),
});

export type ConsultaDeMetricasDaLoja = z.output<
  typeof esquemaDaConsultaDeMetricasDaLoja
>;

/** `GET /v1/admin/lojas/:id/metricas` — sem dado pessoal. */
export const esquemaDasMetricasDaLoja = z.strictObject({
  dias: z.number().int().min(1),
  faturamento: z.strictObject({
    totalCentavos: z.number().int().min(0),
    periodoCentavos: z.number().int().min(0),
  }),
  /** Pedidos feitos, sem contar os cancelados. */
  pedidos: z.strictObject({
    total: z.number().int().min(0),
    periodo: z.number().int().min(0),
  }),
  /** Pedidos que viraram venda (a régua do painel do dono). */
  vendas: z.strictObject({
    total: z.number().int().min(0),
    periodo: z.number().int().min(0),
  }),
  clientes: z.number().int().min(0),
  produtos: z.number().int().min(0),
  categorias: z.number().int().min(0),
  /** Faturamento total dividido pelas vendas; nulo sem nenhuma venda. */
  ticketMedioCentavos: z.number().int().min(0).nullable(),
  ultimoPedidoEm: z.string().nullable(),
  cadastradaEm: z.string(),
});

export type MetricasDaLojaNoContrato = z.infer<typeof esquemaDasMetricasDaLoja>;

/** Uma pessoa com acesso à loja. */
export const esquemaDoMembroNaAdministracao = z.strictObject({
  /** Identificador do vínculo com a loja. */
  id: z.string(),
  identidadeId: z.string(),
  nome: z.string().nullable(),
  email: z.string(),
  papel: z.enum(["OWNER", "STAFF"]),
  /** Falso quando o acesso foi retirado. */
  ativo: z.boolean(),
  conviteAceito: z.boolean(),
  desde: z.string(),
});

export const esquemaDaEquipeDaLojaNaAdministracao = z.strictObject({
  membros: z.array(esquemaDoMembroNaAdministracao),
});

export type MembroNaAdministracaoNoContrato = z.infer<
  typeof esquemaDoMembroNaAdministracao
>;
export type EquipeDaLojaNaAdministracaoNoContrato = z.infer<
  typeof esquemaDaEquipeDaLojaNaAdministracao
>;

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export const TIPOS_DE_CONTA_NA_ADMINISTRACAO = ["donos", "equipe"] as const;

export type TipoDeContaNaAdministracao =
  (typeof TIPOS_DE_CONTA_NA_ADMINISTRACAO)[number];

export const esquemaDaConsultaDeContas = z.object({
  tipo: z.enum(TIPOS_DE_CONTA_NA_ADMINISTRACAO).default("donos"),
  busca: z.string().trim().max(80).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConsultaDeContasNoContrato = z.output<
  typeof esquemaDaConsultaDeContas
>;

export const esquemaDaLojaDaConta = z.strictObject({
  id: z.string(),
  nome: z.string(),
  apelido: z.string(),
  status: esquemaDaSituacaoDaLoja,
  papel: z.enum(["OWNER", "STAFF"]),
});

export const esquemaDaContaNaAdministracao = z.strictObject({
  identidadeId: z.string(),
  nome: z.string().nullable(),
  email: z.string(),
  telefone: z.string().nullable(),
  criadaEm: z.string(),
  /** Dono quando tem ao menos uma loja como dono; senão, equipe. */
  tipo: z.enum(["DONO", "EQUIPE"]),
  lojas: z.array(esquemaDaLojaDaConta),
  /** Lojas deste dono aguardando aprovação. */
  pendentes: z.number().int().min(0),
  /** Quantas lojas ocupam vaga e quantas podem; só para dono. */
  lojasEmUso: z.number().int().min(0),
  limiteDeLojas: z.number().int().min(0).nullable(),
});

export const esquemaDaListaDeContas = z.strictObject({
  contas: z.array(esquemaDaContaNaAdministracao),
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  /** Quantas contas de cada tipo existem, com a mesma busca. */
  contagens: z.strictObject({
    donos: z.number().int().min(0),
    equipe: z.number().int().min(0),
  }),
});

export type ContaNaAdministracaoNoContrato = z.infer<
  typeof esquemaDaContaNaAdministracao
>;
export type ListaDeContasNoContrato = z.infer<typeof esquemaDaListaDeContas>;

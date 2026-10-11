/**
 * Contrato do histórico de auditoria consultável (T-208, AC-215).
 *
 * A administração consulta a trilha da plataforma inteira, de página em
 * página, filtrando por loja, por ato e por período. Cada registro é o mesmo
 * da ficha da loja (`esquemaDoRegistroDaTrilha`), com a loja a que pertence.
 * A trilha chega com o dado pessoal já mascarado (P-009).
 */

import { z } from "zod";

import { esquemaDoRegistroDaTrilha } from "./admin-ficha.ts";

/** Dia do calendário, como o campo de data do navegador o envia. */
export const FORMATO_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Código de ato da trilha: maiúsculas e sublinhado (`LOJA_SUSPENSA`). */
export const FORMATO_DO_ATO = /^[A-Z][A-Z_]{1,59}$/;

/** Campo vazio do formulário é "sem filtro", e não um filtro inválido. */
const vazioViraAusente = (valor: unknown): unknown =>
  valor === "" ? undefined : valor;

const esquemaDoDia = z.preprocess(
  vazioViraAusente,
  z
    .string()
    .regex(FORMATO_DO_DIA, "Informe a data como dia/mês/ano.")
    .refine(
      (dia) => !Number.isNaN(Date.parse(`${dia}T00:00:00Z`)),
      "Informe uma data que exista.",
    )
    .optional(),
);

/** `GET /v1/admin/auditoria?loja=&ato=&de=&ate=&pagina=&porPagina=` */
export const esquemaDaConsultaDaAuditoria = z
  .object({
    loja: z.preprocess(vazioViraAusente, z.uuid("Loja inválida.").optional()),
    ato: z.preprocess(
      vazioViraAusente,
      z.string().regex(FORMATO_DO_ATO, "Ato desconhecido.").optional(),
    ),
    /** Primeiro dia do período, inclusive, no horário de Brasília. */
    de: esquemaDoDia,
    /** Último dia do período, inclusive, no horário de Brasília. */
    ate: esquemaDoDia,
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (consulta) =>
      consulta.de === undefined ||
      consulta.ate === undefined ||
      consulta.de <= consulta.ate,
    { path: ["ate"], message: "O fim do período vem depois do começo." },
  );

export type ConsultaDaAuditoriaNoContrato = z.output<
  typeof esquemaDaConsultaDaAuditoria
>;

/** A loja do registro, pelo que a identifica — e nada do responsável. */
export const esquemaDaLojaDoRegistro = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  nome: z.string(),
});

/** Um ato da trilha com a loja a que ele pertence. */
export const esquemaDoRegistroDaAuditoria = z.strictObject({
  ...esquemaDoRegistroDaTrilha.shape,
  loja: esquemaDaLojaDoRegistro,
});

/** Uma página do histórico, com o total para a tela saber quantas existem. */
export const esquemaDaPaginaDaAuditoria = z.strictObject({
  registros: z.array(esquemaDoRegistroDaAuditoria),
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
});

export type RegistroDaAuditoriaNoContrato = z.infer<
  typeof esquemaDoRegistroDaAuditoria
>;
export type PaginaDaAuditoriaNoContrato = z.infer<
  typeof esquemaDaPaginaDaAuditoria
>;

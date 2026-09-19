/**
 * Persistência da trilha de acesso administrativo.
 *
 * O executor é recebido da camada de dados já autenticada como `sc_admin`.
 * Assim este módulo não cria cliente de banco e continua obedecendo P-004.
 */

import type { RegistroDeAcessoAdministrativo } from "../auth/autorizar.ts";

export interface ExecutorSqlDeAuditoria {
  executar(
    sql: string,
    valores: readonly (string | Date | null)[],
  ): Promise<unknown>;
}

export interface RepositorioDeAuditoria {
  registrarAcesso(registro: RegistroDeAcessoAdministrativo): Promise<void>;
}

/**
 * Escreve somente metadados necessários para responder quem acessou o quê e
 * quando. Não há e-mail, telefone, endereço ou o conteúdo do dado consultado.
 */
export function criarRepositorioDeAuditoria(
  executor: ExecutorSqlDeAuditoria,
): RepositorioDeAuditoria {
  return {
    async registrarAcesso(registro): Promise<void> {
      await executor.executar(
        `INSERT INTO app.audit_log
           (store_id, actor_id, actor_role, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          registro.lojaId,
          registro.atorId,
          registro.papelDoAtor,
          registro.acao,
          registro.entidade,
          registro.entidadeId ?? null,
          registro.ocorridoEm,
        ],
      );
    },
  };
}

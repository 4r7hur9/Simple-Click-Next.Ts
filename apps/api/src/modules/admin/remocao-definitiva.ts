/**
 * A remoção definitiva das lojas excluídas, pronta para o segundo plano
 * (AC-211; decisão de 03/10/2026 em `design/decisoes.md`).
 *
 * Junta o caso de uso (`removerLojasVencidas`), o banco pela credencial da
 * administração e o armazenamento privado dos documentos. Quem agenda é
 * `jobs/retencao.job.ts`, por meio de `montarSegundoPlano` — a fila não
 * importa módulo de domínio: recebe esta função pronta de quem compõe o
 * processo.
 *
 * Os arquivos saem DEPOIS de a transação da loja confirmar: apagar antes
 * deixaria a linha apontando para um arquivo que não existe se o banco
 * desfizesse a remoção. Arquivo que não sai fica registrado, sem o nome
 * dele (P-009), para ser apagado à mão — a linha do banco já saiu e o
 * documento não aparece em lugar nenhum da plataforma.
 */

import {
  armazenamentoPrivadoDoAmbiente,
  type ArmazenamentoPrivado,
} from "../../core/arquivo-privado.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import { bancoDaAdministracao, type AcessoAoBanco } from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import { repositorioDaRemocao } from "./situacao.repo.ts";
import { removerLojasVencidas } from "./status-loja.usecase.ts";

export interface OpcoesDaRemocaoDefinitiva {
  /** Acesso pela credencial `sc_admin`. Padrão: o do ambiente. */
  readonly acesso?: AcessoAoBanco;
  /** Onde moram os documentos. Padrão: o que o ambiente oferece. */
  readonly armazenamentoPrivado?: ArmazenamentoPrivado;
}

/**
 * A remoção definitiva como função do relógio: remove o que venceu até
 * `agora` e devolve quantas lojas saíram.
 */
export function criarRemocaoDefinitiva(
  opcoes: OpcoesDaRemocaoDefinitiva = {},
): (agora: Date) => Promise<number> {
  // Preguiçoso, como nas rotas: montar a composição não abre conexão.
  let acessoMontado: AcessoAoBanco | undefined = opcoes.acesso;
  const acesso = (): AcessoAoBanco =>
    (acessoMontado ??= bancoDaAdministracao());
  const armazenamento =
    opcoes.armazenamentoPrivado ?? armazenamentoPrivadoDoAmbiente();

  return async (agora) => {
    const removidas = await executarComoRequisicao({}, () =>
      removerLojasVencidas(agora, (trabalho) =>
        acesso().emTransacao(() => trabalho(repositorioDaRemocao())),
      ),
    );

    for (const loja of removidas) {
      for (const chave of loja.chavesDeArquivo) {
        try {
          await armazenamento.apagar(chave);
        } catch {
          registrar.aviso("admin.documento_nao_apagado", {
            lojaId: loja.lojaId,
            recurso: "documento",
          });
        }
      }
      registrar.info("admin.loja_removida", {
        lojaId: loja.lojaId,
        quantidade: loja.chavesDeArquivo.length,
      });
    }
    return removidas.length;
  };
}

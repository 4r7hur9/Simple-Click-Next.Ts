/**
 * Funcionalidades liberadas por loja, pela administração (US-204 — AC-212,
 * AC-213).
 *
 * A administração LÊ todas as funcionalidades do catálogo como valem para a
 * loja (padrão ou exceção) e ALTERA uma de cada vez. Desligar grava a exceção;
 * religar a apaga, e a loja volta ao padrão ligado da versão 1 (AC-213).
 * Só a funcionalidade que algum ponto do sistema consulta (`temEfeito`) pode
 * ser desligada: as outras respondem `SEM_EFEITO`.
 *
 * Cada alteração entra na trilha na MESMA transação, com o motivo, e
 * `FUNCIONALIDADE_DESLIGADA` ou `FUNCIONALIDADE_RELIGADA`. Alterar para o
 * estado em que já está não grava nada.
 *
 * Funções puras sobre um repositório: a regra é provada sem banco
 * (`funcionalidades.usecase.test.ts`) e a costura, contra o banco
 * (`apps/api/tests/admin-funcionalidades.test.ts`).
 */

import type { FuncionalidadesDaLojaNoContrato } from "@simpleclick/contracts";
import {
  CATALOGO_DE_FUNCIONALIDADES,
  ehChaveDeFuncionalidade,
} from "@simpleclick/core";

/** A exceção como o banco a guarda, já com o nome de quem a gravou. */
export interface ExcecaoGravada {
  readonly chave: string;
  readonly ligada: boolean;
  readonly limite: number | null;
  readonly motivo: string;
  readonly definidaEm: Date;
  readonly definidaPor: { readonly id: string; readonly nome: string } | null;
}

export interface LojaDasFuncionalidades {
  readonly id: string;
  readonly nome: string;
  readonly excluida: boolean;
}

export type AtoDeFuncionalidade =
  "FUNCIONALIDADE_DESLIGADA" | "FUNCIONALIDADE_RELIGADA";

export interface RepositorioDasFuncionalidades {
  /** A loja, com a linha travada até o fim da transação; `null` se não existe. */
  lerLoja(lojaId: string): Promise<LojaDasFuncionalidades | null>;
  lerExcecoes(lojaId: string): Promise<readonly ExcecaoGravada[]>;
  gravarExcecao(excecao: {
    readonly lojaId: string;
    readonly chave: string;
    readonly ligada: boolean;
    readonly motivo: string;
    readonly atorId: string;
  }): Promise<void>;
  apagarExcecao(lojaId: string, chave: string): Promise<void>;
  registrar(registro: {
    readonly lojaId: string;
    readonly atorId: string;
    readonly acao: AtoDeFuncionalidade;
    readonly antes: Readonly<Record<string, unknown>>;
    readonly depois: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}

/** O que a tela da administração recebe: o catálogo inteiro, como vale. */
export function montarFuncionalidades(
  loja: LojaDasFuncionalidades,
  excecoes: readonly ExcecaoGravada[],
): FuncionalidadesDaLojaNoContrato {
  return {
    loja: { id: loja.id, nome: loja.nome },
    funcionalidades: CATALOGO_DE_FUNCIONALIDADES.map((descricao) => {
      const excecao = excecoes.find((item) => item.chave === descricao.chave);
      return {
        chave: descricao.chave,
        rotulo: descricao.rotulo,
        descricao: descricao.descricao,
        temEfeito: descricao.temEfeito,
        ligada: excecao?.ligada ?? true,
        limite: excecao?.limite ?? null,
        excecao:
          excecao === undefined
            ? null
            : {
                motivo: excecao.motivo,
                definidaEm: excecao.definidaEm.toISOString(),
                definidaPor: excecao.definidaPor,
              },
      };
    }),
  };
}

export async function lerFuncionalidadesDaLoja(
  lojaId: string,
  repositorio: RepositorioDasFuncionalidades,
): Promise<FuncionalidadesDaLojaNoContrato | null> {
  const loja = await repositorio.lerLoja(lojaId);
  if (loja === null) return null;
  return montarFuncionalidades(loja, await repositorio.lerExcecoes(lojaId));
}

export type ResultadoDaAlteracao =
  | {
      readonly ok: true;
      readonly funcionalidades: FuncionalidadesDaLojaNoContrato;
    }
  | {
      readonly ok: false;
      readonly motivo:
        "NAO_ENCONTRADA" | "EXCLUIDA" | "CHAVE_DESCONHECIDA" | "SEM_EFEITO";
    };

export async function alterarFuncionalidade(
  pedido: {
    readonly lojaId: string;
    readonly chave: string;
    readonly ligada: boolean;
    readonly motivo: string;
    readonly atorId: string;
  },
  repositorio: RepositorioDasFuncionalidades,
): Promise<ResultadoDaAlteracao> {
  if (!ehChaveDeFuncionalidade(pedido.chave)) {
    return { ok: false, motivo: "CHAVE_DESCONHECIDA" };
  }
  const descricao = CATALOGO_DE_FUNCIONALIDADES.find(
    (item) => item.chave === pedido.chave,
  );
  if (descricao === undefined || !descricao.temEfeito) {
    return { ok: false, motivo: "SEM_EFEITO" };
  }

  const loja = await repositorio.lerLoja(pedido.lojaId);
  if (loja === null) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (loja.excluida) return { ok: false, motivo: "EXCLUIDA" };

  const excecoes = await repositorio.lerExcecoes(pedido.lojaId);
  const atual = excecoes.find((item) => item.chave === pedido.chave);
  const ligadaAntes = atual?.ligada ?? true;

  if (ligadaAntes !== pedido.ligada) {
    if (pedido.ligada) {
      await repositorio.apagarExcecao(pedido.lojaId, pedido.chave);
    } else {
      await repositorio.gravarExcecao(pedido);
    }
    await repositorio.registrar({
      lojaId: pedido.lojaId,
      atorId: pedido.atorId,
      acao: pedido.ligada
        ? "FUNCIONALIDADE_RELIGADA"
        : "FUNCIONALIDADE_DESLIGADA",
      antes: { funcionalidade: descricao.rotulo, ligada: ligadaAntes },
      depois: {
        funcionalidade: descricao.rotulo,
        ligada: pedido.ligada,
        motivo: pedido.motivo,
      },
    });
  }

  return {
    ok: true,
    funcionalidades: montarFuncionalidades(
      loja,
      await repositorio.lerExcecoes(pedido.lojaId),
    ),
  };
}

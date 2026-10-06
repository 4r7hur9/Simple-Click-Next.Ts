/**
 * Suspender, reativar, excluir e restaurar uma loja (AC-209, AC-210, AC-211).
 *
 * NADA AQUI APAGA PRODUTO OU PEDIDO. Suspender e excluir mudam a SITUAÇÃO da
 * loja, e é a situação que tira a vitrine do ar: a resolução pública só
 * enxerga loja ativa (AC-402), e a política de `stores` repete a regra no
 * banco. O catálogo, os pedidos e a configuração continuam onde estavam — é
 * isso que faz a reativação devolver a loja "como estava" (AC-210).
 *
 * A EXCLUSÃO É REVERSÍVEL POR PRAZO. Ela marca a loja (`deleted_at`) e fixa a
 * data da remoção definitiva (`purge_after`, 30 dias depois — ASM-204). Até
 * lá, a administração restaura; depois, a remoção definitiva
 * (`removerLojasVencidas`) apaga o que só servia para operar e anonimiza o
 * que identifica pessoas. Pedidos e trilha ficam: guarda fiscal e trilha
 * imutável (decisão de 03/10/2026 em `design/decisoes.md`).
 *
 * Cada ato entra na trilha na MESMA transação da mudança, com quem fez e o
 * que mudou. A suspensão leva o motivo; a reativação leva o PERÍODO inteiro
 * da suspensão (desde, até e por quê), que é o que o AC-210 pede ao
 * histórico.
 *
 * Funções puras sobre um repositório: a regra é provada sem banco
 * (`status-loja.usecase.test.ts`) e a costura, contra o banco
 * (`apps/api/tests/admin-situacao.test.ts`).
 */

import {
  confirmacaoConfere,
  DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";

/** O prazo de retenção da loja excluída, em milissegundos. */
export const RETENCAO_DA_LOJA_EXCLUIDA_EM_MS =
  DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA * 24 * 60 * 60 * 1000;

/** A situação da loja como o banco a guarda. */
export interface SituacaoGravada {
  readonly status: SituacaoDaLoja;
  readonly nome: string;
  readonly excluidaEm: Date | null;
  /** Até quando a excluída pode voltar. Nulo depois da remoção definitiva. */
  readonly removerApos: Date | null;
}

/** A suspensão em curso, como a trilha a registrou. */
export interface SuspensaoRegistrada {
  readonly desde: Date;
  readonly motivo: string;
}

/** Os atos que estes casos de uso registram na trilha. */
export type AtoDeSituacao =
  "LOJA_SUSPENSA" | "LOJA_REATIVADA" | "LOJA_EXCLUIDA" | "LOJA_RESTAURADA";

export interface RegistroDeSituacao {
  readonly lojaId: string;
  readonly atorId: string;
  readonly acao: AtoDeSituacao;
  readonly antes: Readonly<Record<string, unknown>>;
  readonly depois: Readonly<Record<string, unknown>>;
}

/** O que os casos de uso precisam do banco, dentro da transação. */
export interface RepositorioDaSituacao {
  /** A situação atual, com a linha da loja TRAVADA. `null` se não existe. */
  lerSituacao(lojaId: string): Promise<SituacaoGravada | null>;
  /** A suspensão em curso (o último `LOJA_SUSPENSA`), se houver. */
  suspensaoEmCurso(lojaId: string): Promise<SuspensaoRegistrada | null>;
  /** A situação de antes da exclusão, como o `LOJA_EXCLUIDA` a guardou. */
  situacaoAntesDaExclusao(lojaId: string): Promise<SituacaoDaLoja | null>;
  /** Troca só a situação: suspender e reativar. */
  gravarStatus(
    lojaId: string,
    status: Exclude<SituacaoDaLoja, "DELETED">,
  ): Promise<void>;
  /** Marca a exclusão e a data da remoção definitiva. */
  gravarExclusao(
    lojaId: string,
    excluidaEm: Date,
    removerApos: Date,
  ): Promise<void>;
  /**
   * Desfaz a exclusão, voltando à situação dada. Lança `ErroDeApelidoTomado`
   * se outra loja ocupou o apelido nesse meio-tempo.
   */
  gravarRestauracao(
    lojaId: string,
    status: Exclude<SituacaoDaLoja, "DELETED">,
  ): Promise<void>;
  registrar(registro: RegistroDeSituacao): Promise<void>;
}

type NaoEncontrada = { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" };
const NAO_ENCONTRADA: NaoEncontrada = { ok: false, motivo: "NAO_ENCONTRADA" };

/** A loja excluída não é suspensa nem reativada: ela é RESTAURADA. */
type Excluida = { readonly ok: false; readonly motivo: "EXCLUIDA" };
const EXCLUIDA: Excluida = { ok: false, motivo: "EXCLUIDA" };

export type ResultadoDaMudanca =
  { readonly ok: true; readonly mudou: boolean } | NaoEncontrada | Excluida;

export type ResultadoDaExclusao =
  | { readonly ok: true; readonly mudou: boolean }
  | NaoEncontrada
  | { readonly ok: false; readonly motivo: "CONFIRMACAO_DIFERENTE" };

export type ResultadoDaRestauracao =
  | { readonly ok: true; readonly mudou: boolean }
  | NaoEncontrada
  | { readonly ok: false; readonly motivo: "PRAZO_VENCIDO" };

/**
 * Suspende a loja, com o motivo. A vitrine sai do ar; o dono, ao entrar, lê o
 * motivo (AC-209). Suspender a que já está suspensa não muda nada nem grava.
 */
export async function suspenderLoja(
  lojaId: string,
  motivo: string,
  administradorId: string,
  repositorio: RepositorioDaSituacao,
): Promise<ResultadoDaMudanca> {
  const atual = await repositorio.lerSituacao(lojaId);
  if (atual === null) return NAO_ENCONTRADA;
  if (atual.status === "DELETED") return EXCLUIDA;
  if (atual.status === "SUSPENDED") return { ok: true, mudou: false };

  await repositorio.gravarStatus(lojaId, "SUSPENDED");
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "LOJA_SUSPENSA",
    antes: { status: atual.status },
    depois: { status: "SUSPENDED", motivo },
  });
  return { ok: true, mudou: true };
}

/**
 * Reativa a loja suspensa: a vitrine volta com o mesmo catálogo, porque nada
 * foi tocado, e a trilha guarda o período inteiro da suspensão (AC-210).
 */
export async function reativarLoja(
  lojaId: string,
  administradorId: string,
  repositorio: RepositorioDaSituacao,
  agora: Date,
): Promise<ResultadoDaMudanca> {
  const atual = await repositorio.lerSituacao(lojaId);
  if (atual === null) return NAO_ENCONTRADA;
  if (atual.status === "DELETED") return EXCLUIDA;
  if (atual.status !== "SUSPENDED") return { ok: true, mudou: false };

  const suspensao = await repositorio.suspensaoEmCurso(lojaId);
  await repositorio.gravarStatus(lojaId, "ACTIVE");
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "LOJA_REATIVADA",
    antes: { status: "SUSPENDED" },
    depois: {
      status: "ACTIVE",
      suspensaDesde: suspensao?.desde.toISOString() ?? null,
      suspensaAte: agora.toISOString(),
      motivo: suspensao?.motivo ?? null,
    },
  });
  return { ok: true, mudou: true };
}

/**
 * Exclui a loja, se a confirmação for o nome dela digitado (AC-211). A loja
 * sai das listagens e do ar na hora; os dados ficam retidos até a remoção
 * definitiva, 30 dias depois. Excluir a que já está excluída não muda o
 * prazo — senão cada clique empurraria a remoção para a frente.
 */
export async function excluirLoja(
  pedido: {
    readonly lojaId: string;
    /** O nome da loja, como a pessoa o digitou. */
    readonly confirmacao: string;
    readonly administradorId: string;
  },
  repositorio: RepositorioDaSituacao,
  agora: Date,
): Promise<ResultadoDaExclusao> {
  const { lojaId, confirmacao, administradorId } = pedido;
  const atual = await repositorio.lerSituacao(lojaId);
  if (atual === null) return NAO_ENCONTRADA;
  if (atual.status === "DELETED") return { ok: true, mudou: false };
  if (!confirmacaoConfere(confirmacao, atual.nome)) {
    return { ok: false, motivo: "CONFIRMACAO_DIFERENTE" };
  }

  const removerApos = new Date(
    agora.getTime() + RETENCAO_DA_LOJA_EXCLUIDA_EM_MS,
  );
  await repositorio.gravarExclusao(lojaId, agora, removerApos);
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "LOJA_EXCLUIDA",
    antes: { status: atual.status },
    depois: { status: "DELETED", removerApos: removerApos.toISOString() },
  });
  return { ok: true, mudou: true };
}

/**
 * Restaura a loja excluída, dentro do prazo. Ela volta à situação de antes
 * da exclusão — a suspensa volta suspensa: restaurar não é atalho para
 * desfazer uma suspensão. Vencido o prazo, não há o que restaurar.
 */
export async function restaurarLoja(
  lojaId: string,
  administradorId: string,
  repositorio: RepositorioDaSituacao,
  agora: Date,
): Promise<ResultadoDaRestauracao> {
  const atual = await repositorio.lerSituacao(lojaId);
  if (atual === null) return NAO_ENCONTRADA;
  if (atual.status !== "DELETED") return { ok: true, mudou: false };
  if (
    atual.removerApos === null ||
    atual.removerApos.getTime() <= agora.getTime()
  ) {
    return { ok: false, motivo: "PRAZO_VENCIDO" };
  }

  const anterior = await repositorio.situacaoAntesDaExclusao(lojaId);
  const volta: Exclude<SituacaoDaLoja, "DELETED"> =
    anterior === null || anterior === "DELETED" ? "ACTIVE" : anterior;
  await repositorio.gravarRestauracao(lojaId, volta);
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "LOJA_RESTAURADA",
    antes: {
      status: "DELETED",
      excluidaEm: atual.excluidaEm?.toISOString() ?? null,
      removerApos: atual.removerApos.toISOString(),
    },
    depois: { status: volta },
  });
  return { ok: true, mudou: true };
}

// ---------------------------------------------------------------------------
// Remoção definitiva, vencido o prazo (AC-211)
// ---------------------------------------------------------------------------

/** O que a remoção definitiva precisa do banco. */
export interface RepositorioDaRemocao {
  /** As lojas excluídas cujo prazo venceu até `agora`, no máximo `limite`. */
  lojasVencidas(agora: Date, limite: number): Promise<readonly string[]>;
  /**
   * Apaga e anonimiza UMA loja, se ela ainda estiver vencida e ninguém mais
   * a estiver removendo (trava que pula a linha já reivindicada). Devolve as
   * chaves dos arquivos cujos registros saíram, ou `null` quando a loja não
   * foi removida nesta rodada.
   */
  removerEmDefinitivo(
    lojaId: string,
    agora: Date,
  ): Promise<readonly string[] | null>;
}

/** Uma loja removida, e os arquivos que o armazenamento ainda precisa apagar. */
export interface LojaRemovida {
  readonly lojaId: string;
  readonly chavesDeArquivo: readonly string[];
}

/** Quantas lojas uma rodada remove, no máximo. A seguinte continua. */
export const LOJAS_POR_RODADA = 20;

/** Roda um trabalho numa transação PRÓPRIA da credencial da administração. */
export type TransacaoDaRemocao = <T>(
  trabalho: (repositorio: RepositorioDaRemocao) => Promise<T>,
) => Promise<T>;

/**
 * Remove em definitivo as lojas excluídas cujo prazo venceu. Cada loja é uma
 * transação própria: a falha de uma não desfaz a das outras, e a que falhou
 * volta na rodada seguinte, porque o que guia a remoção é a data, e não uma
 * fila que esquece.
 */
export async function removerLojasVencidas(
  agora: Date,
  emTransacao: TransacaoDaRemocao,
): Promise<LojaRemovida[]> {
  const vencidas = await emTransacao((repositorio) =>
    repositorio.lojasVencidas(agora, LOJAS_POR_RODADA),
  );
  const removidas: LojaRemovida[] = [];
  for (const lojaId of vencidas) {
    const chaves = await emTransacao((repositorio) =>
      repositorio.removerEmDefinitivo(lojaId, agora),
    );
    if (chaves !== null) removidas.push({ lojaId, chavesDeArquivo: chaves });
  }
  return removidas;
}

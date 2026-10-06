/**
 * O portão de funcionalidade por loja (T-207 — AC-212).
 *
 * `exigirFuncionalidade(chave, …)` é o PONTO ÚNICO em que uma rota passa a
 * depender de a funcionalidade estar ligada para a loja do endereço. A loja é
 * resolvida pelo apelido (`:apelido`), sem contexto, e a pergunta vai ao banco
 * pela função `app.store_feature_enabled` (migração 0040), que já carrega a
 * regra do padrão ligado (AC-213) e responde só um booleano.
 *
 * Roda ANTES da rota e de saber quem chamou — o agente de impressão não é
 * equipe da loja —, por isso não depende de sessão. Loja que não existe passa
 * adiante: quem responde 404 é a própria rota, como sempre respondeu.
 *
 * Desligada, a resposta é 403 `funcionalidade_indisponivel`, a mesma para
 * qualquer rota da área: acessada direto pelo endereço, ela não existe para a
 * loja (AC-212).
 */
import type { RequestHandler } from "express";
import type { ChaveDeFuncionalidade } from "@simpleclick/core";

import { executarComoRequisicao } from "./contexto.ts";
import { banco, transacaoAtual, type AcessoAoBanco } from "./db.ts";

export const RECUSA_DE_FUNCIONALIDADE = {
  erro: "funcionalidade_indisponivel",
  mensagem: "Este recurso não está disponível para esta loja.",
} as const;

export interface OpcoesDoPortaoDeFuncionalidade {
  /** Padrão: o acesso das lojas, aberto na primeira requisição. */
  readonly acesso?: AcessoAoBanco;
  /** Resolve a loja pelo apelido, sem contexto (a da vitrine). */
  readonly resolverLoja: (chegada: {
    readonly apelido: string;
  }) => Promise<
    | { readonly encontrada: true; readonly id: string }
    | { readonly encontrada: false }
  >;
}

/** A funcionalidade está ligada para a loja do contexto? */
export async function funcionalidadeLigadaNaLoja(
  chave: ChaveDeFuncionalidade,
): Promise<boolean> {
  const linhas = await transacaoAtual().$queryRaw<{ ligada: boolean }[]>`
    SELECT app.store_feature_enabled(${chave}) AS ligada`;
  return linhas[0]?.ligada === true;
}

export function exigirFuncionalidade(
  chave: ChaveDeFuncionalidade,
  opcoes: OpcoesDoPortaoDeFuncionalidade,
): RequestHandler {
  return (requisicao, resposta, proximo) => {
    const apelido = requisicao.params.apelido;
    if (typeof apelido !== "string" || apelido === "") {
      proximo();
      return;
    }
    const acesso = opcoes.acesso ?? banco();

    void (async () => {
      const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
        acesso.emTransacao(() => opcoes.resolverLoja({ apelido })),
      );
      if (!loja.encontrada) return true;
      return executarComoRequisicao({ lojaId: loja.id, papel: "PUBLIC" }, () =>
        acesso.emTransacao(() => funcionalidadeLigadaNaLoja(chave)),
      );
    })().then(
      (ligada) => {
        if (ligada) {
          proximo();
          return;
        }
        resposta.setHeader("cache-control", "no-store");
        resposta.status(403).json(RECUSA_DE_FUNCIONALIDADE);
      },
      (causa: unknown) => proximo(causa),
    );
  };
}

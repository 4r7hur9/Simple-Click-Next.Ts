/**
 * Apoio comum às provas das configurações da loja (T-900 a T-907).
 *
 * As provas passam pela aplicação montada de verdade — autenticação, borda de
 * validação, transação com a loja declarada —, e não pelo caso de uso solto:
 * o que se prova aqui é o que o dono vive ao salvar, inclusive a recusa.
 *
 * O TOKEN É ASSINADO COM O SEGREDO DO AMBIENTE, lido em tempo de execução, e
 * carrega uma identidade de verdade criada pelo teste. Nada de segredo escrito
 * no código (P-002), e nada de "usuário de mentira" que a trilha de auditoria
 * não conseguiria ligar a ninguém.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";

import { criarApp, type OpcoesDoApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { assinarTokenDeAcesso } from "../src/modules/auth/token.ts";
import { exigirVariavel } from "./apoio-de-isolamento.ts";

/** A origem autorizada: método que muda estado exige origem confiável. */
export const ORIGEM_DO_PAINEL = "https://painel.exemplo.test";

/** Monta a aplicação com todas as rotas no banco descartável do arquivo. */
export function montarAppDaConfiguracao(
  acesso: AcessoAoBanco,
  extras: Partial<OpcoesDoApp> = {},
): ReturnType<typeof criarApp> {
  return criarApp({
    origens: [ORIGEM_DO_PAINEL],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
    ...extras,
    configuracoes: { acesso, ...extras.configuracoes },
  });
}

/** Um token de dono para a identidade informada, válido por quinze minutos. */
export function tokenDoDono(identidadeId: string): string {
  return assinarTokenDeAcesso(
    {
      identidadeId,
      papel: "OWNER",
      sessaoId: randomUUID(),
      familiaId: randomUUID(),
    },
    exigirVariavel("JWT_SECRET"),
  );
}

/** Lê uma seção como o painel lê. */
export function lerSecao(
  app: ReturnType<typeof criarApp>,
  apelido: string,
  secao: string,
  token: string,
) {
  return request(app)
    .get(`/v1/lojas/${apelido}/configuracao/${secao}`)
    .set("Authorization", `Bearer ${token}`);
}

/** O que uma gravação de seção leva. */
export interface GravacaoDeSecao {
  readonly apelido: string;
  readonly secao: string;
  readonly corpo: unknown;
  readonly token: string;
}

/** Grava uma seção como o painel grava. */
export function gravarSecao(
  app: ReturnType<typeof criarApp>,
  { apelido, secao, corpo, token }: GravacaoDeSecao,
) {
  return request(app)
    .put(`/v1/lojas/${apelido}/configuracao/${secao}`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", `Bearer ${token}`)
    .send(corpo as object);
}

/** O caminho de cada campo recusado, como a tela os recebe. */
export function camposRecusados(corpo: {
  readonly campos?: readonly { readonly caminho: string }[];
}): string[] {
  return (corpo.campos ?? []).map((campo) => campo.caminho).sort();
}

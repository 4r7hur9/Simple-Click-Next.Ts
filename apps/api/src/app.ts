import express, { type Express } from "express";

import { corsDeOrigensFechadas, origensDoAmbiente } from "./core/cors.ts";

/** Identificação que a raiz devolve. Sem dado de negócio: só sinal de vida. */
export const IDENTIFICACAO_DA_API = {
  servico: "simpleclick-api",
  status: "viva",
} as const;

/** Ajustes da composição. Tudo tem padrão; teste sobrescreve o que precisa. */
export interface OpcoesDoApp {
  /**
   * Lista fechada de origens autorizadas. Sem ela, vale `ORIGENS_PERMITIDAS`
   * do ambiente — e, na falta das duas, a lista fica VAZIA: nenhuma origem
   * autorizada a mudar estado. Ambiente mal configurado fecha a porta em vez
   * de abrir todas.
   */
  readonly origens?: readonly string[];
}

/**
 * Monta o Express e devolve a aplicação **sem escutar porta**.
 *
 * A composição e a escuta ficam separadas de propósito: teste de integração
 * precisa da aplicação montada, mas não pode disputar porta com o ambiente
 * local nem com outro teste rodando em paralelo. Quem escuta é `main.ts`.
 */
export function criarApp(opcoes: OpcoesDoApp = {}): Express {
  const app = express();

  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  app.disable("x-powered-by");

  // Antes de qualquer leitura de corpo: requisição de origem estranha é
  // recusada sem que a API gaste trabalho lendo o que ela mandou (AC-125..128).
  app.use(
    corsDeOrigensFechadas({
      origens:
        opcoes.origens ?? origensDoAmbiente(process.env.ORIGENS_PERMITIDAS),
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json(IDENTIFICACAO_DA_API);
  });

  // Rota desconhecida responde em JSON como todo o resto da API, para que o
  // cliente não precise adivinhar o formato da resposta de erro.
  app.use((_req, res) => {
    res.status(404).json({ erro: "nao_encontrado" });
  });

  return app;
}

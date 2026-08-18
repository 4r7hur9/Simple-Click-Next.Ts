import express, { type Express } from "express";

import { corsDeOrigensFechadas, origensDoAmbiente } from "./core/cors.ts";
import { manipuladorDeErros } from "./core/erros.ts";
import { middlewareDeRegistro } from "./core/log.ts";
import { criarRotasDeSaude } from "./modules/health/health.routes.ts";

/** Identificação que a raiz devolve. Sem dado de negócio: só sinal de vida. */
export const IDENTIFICACAO_DA_API = {
  servico: "simpleclick-api",
  status: "viva",
} as const;

/** Onde as verificações de saúde ficam montadas (AC-023). */
export const PREFIXO_DE_SAUDE = "/v1/health";

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

  // Primeiro de todos: é ele que abre o contexto da requisição, e tudo que
  // vier depois precisa do identificador já existindo para que as linhas de
  // registro casem umas com as outras (AC-021) — inclusive a recusa por
  // origem, que sem isso seria registrada solta, sem dizer de qual requisição
  // veio.
  app.use(middlewareDeRegistro());

  // Logo em seguida, e antes de qualquer leitura de corpo: requisição de origem
  // estranha é recusada sem que a API gaste trabalho lendo o que ela mandou
  // (AC-125..AC-128).
  app.use(
    corsDeOrigensFechadas({
      origens:
        opcoes.origens ?? origensDoAmbiente(process.env.ORIGENS_PERMITIDAS),
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  // Antes das rotas de negócio: saber se a API pode receber tráfego não pode
  // depender de nada que ela ainda esteja montando (AC-023).
  app.use(PREFIXO_DE_SAUDE, criarRotasDeSaude());

  app.get("/", (_req, res) => {
    res.json(IDENTIFICACAO_DA_API);
  });

  // Rota desconhecida responde em JSON como todo o resto da API, para que o
  // cliente não precise adivinhar o formato da resposta de erro.
  app.use((_req, res) => {
    res.status(404).json({ erro: "nao_encontrado" });
  });

  // Último de todos: o Express só entrega a falha a um middleware de quatro
  // parâmetros, e só ao que estiver depois de tudo que pode falhar (AC-024).
  app.use(manipuladorDeErros());

  return app;
}

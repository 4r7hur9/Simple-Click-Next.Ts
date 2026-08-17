import express, { type Express } from "express";

/** Identificação que a raiz devolve. Sem dado de negócio: só sinal de vida. */
export const IDENTIFICACAO_DA_API = {
  servico: "simpleclick-api",
  status: "viva",
} as const;

/**
 * Monta o Express e devolve a aplicação **sem escutar porta**.
 *
 * A composição e a escuta ficam separadas de propósito: teste de integração
 * precisa da aplicação montada, mas não pode disputar porta com o ambiente
 * local nem com outro teste rodando em paralelo. Quem escuta é `main.ts`.
 */
export function criarApp(): Express {
  const app = express();

  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  app.disable("x-powered-by");

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

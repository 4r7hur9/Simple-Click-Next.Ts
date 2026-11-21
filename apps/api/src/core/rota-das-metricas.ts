/**
 * A rota `GET /metrics`, protegida (card #139, D-4).
 *
 * Fechada por padrão: quem monta o app só a registra quando a configuração
 * pede (`token` ou `aberto`). Com token, exige `Authorization: Bearer` exato;
 * a comparação é por `timingSafeEqual` sobre o sha256, para não vazar o
 * tamanho nem o prefixo do token pelo tempo de resposta.
 *
 * É montada ANTES do registro de requisição: não gera log, span nem métrica
 * (um Prometheus raspando a cada 15 s encheria tudo de ruído).
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { Router, type Request, type Response } from "express";
import type { Registry } from "prom-client";

import type { AcessoAoMetricas } from "./observabilidade.ts";

/** Caminho do endpoint. */
export const CAMINHO_DAS_METRICAS = "/metrics";

function resumo(valor: string): Buffer {
  return createHash("sha256").update(valor).digest();
}

function tokenConfere(req: Request, esperado: string): boolean {
  const cabecalho = req.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(cabecalho);
  const recebido = m?.[1] ?? "";
  // Sempre compara dois resumos de mesmo tamanho; nunca sai antes.
  return timingSafeEqual(resumo(recebido), resumo(esperado));
}

export function criarRotaDasMetricas(
  registro: Registry,
  acesso: Exclude<AcessoAoMetricas, { tipo: "desligado" }>,
): Router {
  const roteador = Router();
  roteador.get(CAMINHO_DAS_METRICAS, (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (acesso.tipo === "token" && !tokenConfere(req, acesso.token)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).type("text/plain").send("não autorizado");
      return;
    }
    registro
      .metrics()
      .then((texto) => {
        res.status(200).type(registro.contentType).send(texto);
      })
      .catch(() => {
        res.status(500).type("text/plain").send("falha ao coletar métricas");
      });
  });
  return roteador;
}

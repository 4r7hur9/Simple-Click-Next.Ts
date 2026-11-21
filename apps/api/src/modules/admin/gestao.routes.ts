/**
 * Gestão de lojas, na administração da plataforma (card #29):
 *
 *   GET /v1/admin/lojas/:id/metricas?dias=30   números da loja
 *   GET /v1/admin/lojas/:id/equipe             dono e equipe da loja
 *
 * Montadas depois da trava do token, e cada uma passa pela segunda trava
 * (`comoAdministrador`) antes de ler o banco. Quem consulta dados de uma loja
 * deixa o registro da consulta na trilha, como a abertura da ficha.
 *
 * As contas (donos e equipe) agora são as Pessoas, em `pessoas.routes.ts`
 * (card #170): o `/contas` antigo saiu.
 */
import type { Response, Router } from "express";
import { esquemaDaConsultaDeMetricasDaLoja } from "@simpleclick/contracts";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { esquemaDoCaminhoDaLoja } from "./admin.schema.ts";
import { lerEquipeDaLoja, lerMetricasDaLoja } from "./gestao.repo.ts";
import { registrarConsultaDaAdministracao } from "./lojas.repo.ts";

export interface DependenciasDaGestao {
  readonly acesso: () => AcessoAoBanco;
  readonly agora: () => Date;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

export function montarRotasDaGestao(
  rotas: Router,
  { acesso, agora, comoAdministrador }: DependenciasDaGestao,
): void {
  const metricas = validar({
    params: esquemaDoCaminhoDaLoja,
    query: esquemaDaConsultaDeMetricasDaLoja,
  });
  rotas.get(
    "/lojas/:id/metricas",
    metricas,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, query } = metricas.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const lidas = await acesso().emTransacao(async () => {
            const numeros = await lerMetricasDaLoja(
              params.id,
              query.dias,
              agora(),
            );
            if (numeros !== null) {
              await registrarConsultaDaAdministracao({
                lojaId: params.id,
                atorId: administradorId,
                entidade: "orders",
              });
            }
            return numeros;
          });
          resposta.setHeader("cache-control", "no-store");
          if (lidas === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(lidas);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const daLoja = validar({ params: esquemaDoCaminhoDaLoja });
  rotas.get(
    "/lojas/:id/equipe",
    daLoja,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = daLoja.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const equipe = await acesso().emTransacao(async () => {
            const lida = await lerEquipeDaLoja(params.id);
            if (lida !== null) {
              await registrarConsultaDaAdministracao({
                lojaId: params.id,
                atorId: administradorId,
                entidade: "store_members",
              });
            }
            return lida;
          });
          resposta.setHeader("cache-control", "no-store");
          if (equipe === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(equipe);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

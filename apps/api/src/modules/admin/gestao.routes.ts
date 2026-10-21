/**
 * Gestão de lojas e contas, na administração da plataforma (card #29):
 *
 *   GET /v1/admin/lojas/:id/metricas?dias=30   números da loja
 *   GET /v1/admin/lojas/:id/equipe             dono e equipe da loja
 *   GET /v1/admin/contas?tipo=&busca=          donos e equipe da plataforma
 *   GET /v1/admin/contas/:identidadeId         uma conta e as lojas dela
 *
 * Montadas depois da trava do token, e cada uma passa pela segunda trava
 * (`comoAdministrador`) antes de ler o banco. Quem consulta dados de uma loja
 * deixa o registro da consulta na trilha, como a abertura da ficha.
 */
import type { Response, Router } from "express";
import {
  esquemaDaConsultaDeContas,
  esquemaDaConsultaDeMetricasDaLoja,
} from "@simpleclick/contracts";
import { z } from "zod";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { esquemaDoCaminhoDaLoja } from "./admin.schema.ts";
import {
  lerConta,
  lerEquipeDaLoja,
  lerMetricasDaLoja,
  listarContas,
} from "./gestao.repo.ts";
import { registrarConsultaDaAdministracao } from "./lojas.repo.ts";

export interface DependenciasDaGestao {
  readonly acesso: () => AcessoAoBanco;
  readonly agora: () => Date;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

const esquemaDoCaminhoDaConta = z.object({
  identidadeId: z.uuid("Conta inválida."),
});

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

  const listagem = validar({ query: esquemaDaConsultaDeContas });
  rotas.get("/contas", listagem, async (requisicao, resposta, proximo) => {
    try {
      const { query } = listagem.dados(requisicao);
      await comoAdministrador(resposta, async () => {
        const lista = await acesso().emTransacao(() => listarContas(query));
        resposta.setHeader("cache-control", "no-store");
        resposta.json(lista);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  const daConta = validar({ params: esquemaDoCaminhoDaConta });
  rotas.get(
    "/contas/:identidadeId",
    daConta,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = daConta.dados(requisicao);
        await comoAdministrador(resposta, async () => {
          const conta = await acesso().emTransacao(() =>
            lerConta(params.identidadeId),
          );
          resposta.setHeader("cache-control", "no-store");
          if (conta === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(conta);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

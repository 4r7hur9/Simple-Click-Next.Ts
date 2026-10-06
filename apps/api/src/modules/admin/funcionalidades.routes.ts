/**
 * Rotas das funcionalidades liberadas por loja (T-207 — AC-212, AC-213).
 *
 *   GET /v1/admin/lojas/:id/funcionalidades         o catálogo, como vale
 *   PUT /v1/admin/lojas/:id/funcionalidades/:chave  liga ou desliga uma
 *
 * Montadas no roteador da administração, DEPOIS da trava do token; cada uma
 * passa pela segunda trava (`comoAdministrador`, a tabela de administradores)
 * antes de ler o banco. Ler as exceções é acesso a dado da loja e vai para a
 * trilha (AC-118); alterar vai para a trilha com o motivo.
 */
import type { Response, Router } from "express";
import { esquemaDaAlteracaoDeFuncionalidade } from "@simpleclick/contracts";
import { z } from "zod";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { esquemaDoCaminhoDaLoja } from "./admin.schema.ts";
import { repositorioDasFuncionalidades } from "./funcionalidades.repo.ts";
import {
  alterarFuncionalidade,
  lerFuncionalidadesDaLoja,
} from "./funcionalidades.usecase.ts";
import { registrarConsultaDaAdministracao } from "./lojas.repo.ts";

export interface DependenciasDasFuncionalidades {
  readonly acesso: () => AcessoAoBanco;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

const esquemasDaLeitura = { params: esquemaDoCaminhoDaLoja };

const esquemasDaAlteracao = {
  params: esquemaDoCaminhoDaLoja.extend({
    chave: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,62}$/, "Funcionalidade inválida."),
  }),
  body: esquemaDaAlteracaoDeFuncionalidade,
};

export function montarRotasDasFuncionalidades(
  rotas: Router,
  { acesso, comoAdministrador }: DependenciasDasFuncionalidades,
): void {
  const entradaDaLeitura = validar(esquemasDaLeitura);
  rotas.get(
    "/lojas/:id/funcionalidades",
    entradaDaLeitura,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDaLeitura.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const lidas = await acesso().emTransacao(async () => {
            const encontradas = await lerFuncionalidadesDaLoja(
              params.id,
              repositorioDasFuncionalidades(),
            );
            if (encontradas === null) return null;
            await registrarConsultaDaAdministracao({
              lojaId: params.id,
              atorId: administradorId,
              entidade: "store_feature_overrides",
            });
            return encontradas;
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

  const entradaDaAlteracao = validar(esquemasDaAlteracao);
  rotas.put(
    "/lojas/:id/funcionalidades/:chave",
    entradaDaAlteracao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaAlteracao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(() =>
            alterarFuncionalidade(
              {
                lojaId: params.id,
                chave: params.chave,
                ligada: body.ligada,
                motivo: body.motivo,
                atorId: administradorId,
              },
              repositorioDasFuncionalidades(),
            ),
          );
          resposta.setHeader("cache-control", "no-store");
          if (resultado.ok) {
            resposta.json(resultado.funcionalidades);
            return;
          }
          switch (resultado.motivo) {
            case "NAO_ENCONTRADA":
            case "CHAVE_DESCONHECIDA":
              resposta.status(404).json({ erro: "nao_encontrado" });
              return;
            case "EXCLUIDA":
              resposta.status(409).json({
                erro: "loja_excluida",
                mensagem:
                  "Esta loja está excluída. Restaure-a antes de mudar o que ela usa.",
              });
              return;
            case "SEM_EFEITO":
              resposta.status(422).json({
                erro: "funcionalidade_sem_efeito",
                mensagem:
                  "Nesta versão esta funcionalidade fica sempre ligada para todas as lojas.",
              });
              return;
          }
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

/**
 * Aprovação de loja e limites, na administração da plataforma (card #25):
 *
 *   POST  /v1/admin/lojas/:id/aprovar      PENDING_APPROVAL|REJECTED → ACTIVE
 *   POST  /v1/admin/lojas/:id/recusar      PENDING_APPROVAL → REJECTED {motivo}
 *   POST  /v1/admin/lojas/:id/ativar       INACTIVE → ACTIVE
 *   POST  /v1/admin/lojas/:id/desativar    ACTIVE → INACTIVE {motivo?}
 *   GET   /v1/admin/limites                padrões da plataforma
 *   PATCH /v1/admin/limites
 *   GET   /v1/admin/lojas/:id/limites      uso, limite e ajustes da loja
 *   PATCH /v1/admin/lojas/:id/limites
 *   GET   /v1/admin/donos/:identidadeId/limites
 *   PATCH /v1/admin/donos/:identidadeId/limites
 *
 * Montadas no roteador da administração, DEPOIS da trava do token; cada uma
 * passa pela segunda trava (`comoAdministrador`) antes de ler o banco. Cada
 * ato entra na trilha na mesma transação. A resposta dos atos de situação é a
 * ficha nova da loja, como a das rotas de suspender e reativar.
 */
import type { Response, Router } from "express";
import {
  esquemaDaDesativacaoDaLoja,
  esquemaDaEdicaoDoLimiteDoDono,
  esquemaDaEdicaoDosLimitesDaLoja,
  esquemaDaEdicaoDosPadroesDeLimite,
  esquemaDaRecusaDaLoja,
  esquemaDoAtoSemCorpo,
  ROTULOS_DAS_SITUACOES,
  type AtoDaAprovacao,
} from "@simpleclick/contracts";
import { z } from "zod";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { esquemaDoCaminhoDaLoja } from "./admin.schema.ts";
import {
  gravarLimiteDoDono,
  gravarLimitesDaLoja,
  gravarPadroesDeLimite,
  lerLimiteDoDono,
  lerLimitesDaLoja,
  lerPadroesDeLimite,
} from "./limites.repo.ts";
import {
  lerFichaDaLoja,
  registrarConsultaDaAdministracao,
} from "./lojas.repo.ts";
import { repositorioDaSituacao } from "./situacao.repo.ts";
import { mudarSituacaoDaLoja } from "./status-loja.usecase.ts";

export interface DependenciasDaAprovacao {
  readonly acesso: () => AcessoAoBanco;
  readonly agora: () => Date;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

const CORPO_DO_ATO: Readonly<Record<AtoDaAprovacao, z.ZodType>> = {
  aprovar: esquemaDoAtoSemCorpo,
  recusar: esquemaDaRecusaDaLoja,
  ativar: esquemaDoAtoSemCorpo,
  desativar: esquemaDaDesativacaoDaLoja,
};

const esquemaDoCaminhoDoDono = z.object({
  identidadeId: z.uuid("Conta inválida."),
});

export function montarRotasDaAprovacao(
  rotas: Router,
  { acesso, agora, comoAdministrador }: DependenciasDaAprovacao,
): void {
  for (const ato of Object.keys(CORPO_DO_ATO) as AtoDaAprovacao[]) {
    const entrada = validar({
      params: esquemaDoCaminhoDaLoja,
      body: CORPO_DO_ATO[ato],
    });
    rotas.post(
      `/lojas/:id/${ato}`,
      entrada,
      async (requisicao, resposta, proximo) => {
        try {
          const { params, body } = entrada.dados(requisicao);
          const motivo =
            typeof body === "object" && body !== null && "motivo" in body
              ? (body as { motivo?: string }).motivo
              : undefined;
          await comoAdministrador(resposta, async (administradorId) => {
            const resultado = await acesso().emTransacao(async () => {
              const mudanca = await mudarSituacaoDaLoja(
                ato,
                { lojaId: params.id, administradorId, motivo },
                repositorioDaSituacao(),
                agora(),
              );
              return mudanca.ok
                ? { mudanca, ficha: await lerFichaDaLoja(params.id) }
                : { mudanca, ficha: null };
            });
            resposta.setHeader("cache-control", "no-store");
            const { mudanca, ficha } = resultado;
            if (!mudanca.ok && mudanca.motivo === "EXCLUIDA") {
              resposta.status(409).json({
                erro: "loja_excluida",
                mensagem:
                  "Esta loja está excluída. Para trazê-la de volta, use a restauração, dentro do prazo.",
              });
              return;
            }
            if (!mudanca.ok && mudanca.motivo === "TRANSICAO_INVALIDA") {
              resposta.status(409).json({
                erro: "transicao_invalida",
                status: mudanca.status,
                mensagem: `Não dá para ${ato} uma loja que está "${ROTULOS_DAS_SITUACOES[mudanca.status]}".`,
              });
              return;
            }
            if (ficha === null) {
              resposta.status(404).json({ erro: "nao_encontrado" });
              return;
            }
            resposta.json(ficha);
          });
        } catch (causa) {
          proximo(causa);
        }
      },
    );
  }

  // ── Padrões da plataforma ────────────────────────────────────────────────
  rotas.get("/limites", async (_requisicao, resposta, proximo) => {
    try {
      await comoAdministrador(resposta, async () => {
        const padroes = await acesso().emTransacao(() => lerPadroesDeLimite());
        resposta.setHeader("cache-control", "no-store");
        resposta.json(padroes);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  const edicaoDosPadroes = validar({ body: esquemaDaEdicaoDosPadroesDeLimite });
  rotas.patch(
    "/limites",
    edicaoDosPadroes,
    async (requisicao, resposta, proximo) => {
      try {
        const { body } = edicaoDosPadroes.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const padroes = await acesso().emTransacao(() =>
            gravarPadroesDeLimite(body, administradorId),
          );
          resposta.setHeader("cache-control", "no-store");
          resposta.json(padroes);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Limites de uma loja ──────────────────────────────────────────────────
  const daLoja = validar({ params: esquemaDoCaminhoDaLoja });
  rotas.get(
    "/lojas/:id/limites",
    daLoja,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = daLoja.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const limites = await acesso().emTransacao(async () => {
            const lidos = await lerLimitesDaLoja(params.id);
            if (lidos !== null) {
              await registrarConsultaDaAdministracao({
                lojaId: params.id,
                atorId: administradorId,
                entidade: "store_limits",
              });
            }
            return lidos;
          });
          resposta.setHeader("cache-control", "no-store");
          if (limites === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(limites);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const edicaoDaLoja = validar({
    params: esquemaDoCaminhoDaLoja,
    body: esquemaDaEdicaoDosLimitesDaLoja,
  });
  rotas.patch(
    "/lojas/:id/limites",
    edicaoDaLoja,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = edicaoDaLoja.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const limites = await acesso().emTransacao(() =>
            gravarLimitesDaLoja(params.id, body, administradorId),
          );
          resposta.setHeader("cache-control", "no-store");
          if (limites === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(limites);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Limite de lojas de um dono ───────────────────────────────────────────
  const doDono = validar({ params: esquemaDoCaminhoDoDono });
  rotas.get(
    "/donos/:identidadeId/limites",
    doDono,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doDono.dados(requisicao);
        await comoAdministrador(resposta, async () => {
          const limite = await acesso().emTransacao(() =>
            lerLimiteDoDono(params.identidadeId),
          );
          resposta.setHeader("cache-control", "no-store");
          if (limite === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(limite);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const edicaoDoDono = validar({
    params: esquemaDoCaminhoDoDono,
    body: esquemaDaEdicaoDoLimiteDoDono,
  });
  rotas.patch(
    "/donos/:identidadeId/limites",
    edicaoDoDono,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = edicaoDoDono.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const limite = await acesso().emTransacao(() =>
            gravarLimiteDoDono(
              params.identidadeId,
              body.lojas,
              administradorId,
            ),
          );
          resposta.setHeader("cache-control", "no-store");
          if (limite === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(limite);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

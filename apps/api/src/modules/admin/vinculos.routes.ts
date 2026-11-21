/**
 * Donos e equipes pela administração da plataforma (card #170, T-4):
 *
 *   GET    /v1/admin/vinculos?tipo=&busca=&pagina=&porPagina=
 *   POST   /v1/admin/lojas/:id/donos                               201 o vínculo
 *   PUT    /v1/admin/lojas/:id/donos/:identidadeId/substituicao    200 o novo
 *   DELETE /v1/admin/lojas/:id/donos/:identidadeId                 204
 *   POST   /v1/admin/lojas/:id/equipe                              201 (200 se já era)
 *   DELETE /v1/admin/lojas/:id/equipe/:identidadeId                204
 *
 * Toda escrita leva `motivo` (vai só para a trilha da plataforma). Corpos
 * `strictObject`: papel ou admin no corpo é 400. Recusas:
 *   409 ultimo_dono | ja_e_dono | sem_acesso_definido | conta_desativada |
 *       conta_protegida | limite_atingido {recurso, limite, uso}
 *   422 mesma_pessoa
 *   404 nao_encontrado (loja, pessoa, ou vínculo do papel da rota)
 *
 * Montadas depois da trava do token (trava 1); cada uma passa pela tabela de
 * administradores (trava 2, `comoAdministrador`) e fala pela credencial
 * `sc_admin`. Mutação sem origem autorizada já foi recusada antes (AC-126).
 */

import type { Response, Router } from "express";
import {
  esquemaDaAtribuicaoDeDono,
  esquemaDaAtribuicaoDeEquipe,
  esquemaDaConsultaDeVinculos,
  esquemaDaRemocaoDeVinculo,
  esquemaDaSubstituicaoDeDono,
  mensagemDoLimiteAtingido,
  type ItemDeVinculoNoContrato,
} from "@simpleclick/contracts";
import { z } from "zod";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  lerVinculo,
  listarVinculos,
  repositorioDeVinculos,
} from "./vinculos.repo.ts";
import {
  adicionarDono,
  adicionarEquipe,
  removerDono,
  removerEquipe,
  substituirDono,
  type RecusaDoVinculo,
  type ResultadoDaRemocao,
  type ResultadoDoVinculo,
} from "./vinculos.usecase.ts";

export interface DependenciasDosVinculos {
  readonly acesso: () => AcessoAoBanco;
  readonly agora: () => Date;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

const esquemaDaLoja = z.object({ id: z.uuid("Loja inválida.") });
const esquemaDoVinculoNaLoja = z.object({
  id: z.uuid("Loja inválida."),
  identidadeId: z.uuid("Pessoa inválida."),
});

type RecusaSemLimite = Exclude<
  RecusaDoVinculo,
  { motivo: "LIMITE_ATINGIDO" }
>["motivo"];

/** As recusas dos atos, com o código do contrato. */
const RECUSAS: Readonly<
  Record<RecusaSemLimite, { status: number; erro: string; mensagem: string }>
> = {
  LOJA_NAO_ENCONTRADA: {
    status: 404,
    erro: "nao_encontrado",
    mensagem: "Loja não encontrada.",
  },
  PESSOA_NAO_ENCONTRADA: {
    status: 404,
    erro: "nao_encontrado",
    mensagem: "Pessoa não encontrada.",
  },
  VINCULO_NAO_ENCONTRADO: {
    status: 404,
    erro: "nao_encontrado",
    mensagem: "Esta pessoa não tem este papel nesta loja.",
  },
  PROTEGIDA: {
    status: 409,
    erro: "conta_protegida",
    mensagem:
      "Esta conta é da administração da plataforma e não recebe nem perde vínculo por aqui.",
  },
  DESATIVADA: {
    status: 409,
    erro: "conta_desativada",
    mensagem: "Esta conta está desativada. Reative-a antes.",
  },
  SEM_ACESSO_DEFINIDO: {
    status: 409,
    erro: "sem_acesso_definido",
    mensagem:
      "Esta pessoa ainda não definiu a senha. Gere o link de acesso na ficha dela e vincule depois.",
  },
  JA_E_DONO: {
    status: 409,
    erro: "ja_e_dono",
    mensagem: "Esta pessoa já é dona desta loja.",
  },
  ULTIMO_DONO: {
    status: 409,
    erro: "ultimo_dono",
    mensagem:
      "A loja ficaria sem dono ativo. Use a troca de dono ou adicione outro dono antes.",
  },
  MESMA_PESSOA: {
    status: 422,
    erro: "mesma_pessoa",
    mensagem: "O novo dono precisa ser outra pessoa.",
  },
};

function recusar(resposta: Response, recusa: RecusaDoVinculo): void {
  resposta.setHeader("cache-control", "no-store");
  if (recusa.motivo === "LIMITE_ATINGIDO") {
    resposta.status(409).json({
      erro: "limite_atingido",
      recurso: recusa.recurso,
      limite: recusa.limite,
      uso: recusa.uso,
      mensagem: mensagemDoLimiteAtingido(recusa.recurso, recusa.limite),
    });
    return;
  }
  const { status, erro, mensagem } = RECUSAS[recusa.motivo];
  resposta.status(status).json({ erro, mensagem });
}

export function montarRotasDosVinculos(
  rotas: Router,
  dependencias: DependenciasDosVinculos,
): void {
  const { acesso, agora, comoAdministrador } = dependencias;
  const dosAtos = () => ({ repositorio: repositorioDeVinculos(), agora });

  /**
   * Roda o ato e lê o vínculo resultante na MESMA transação: a resposta é o
   * que ficou gravado.
   */
  async function atoQueVincula(
    resposta: Response,
    ato: () => Promise<ResultadoDoVinculo>,
  ): Promise<void> {
    const { resultado, vinculo } = await acesso().emTransacao(async () => {
      const feito = await ato();
      return {
        resultado: feito,
        vinculo: feito.ok ? await lerVinculo(feito.vinculoId) : null,
      };
    });
    if (!resultado.ok) {
      recusar(resposta, resultado);
      return;
    }
    if (vinculo === null) throw new Error("vínculo gravado não foi lido");
    resposta.setHeader("cache-control", "no-store");
    resposta
      .status(resultado.criado ? 201 : 200)
      .json(vinculo satisfies ItemDeVinculoNoContrato);
  }

  async function atoQueRemove(
    resposta: Response,
    ato: () => Promise<ResultadoDaRemocao>,
  ): Promise<void> {
    const resultado = await acesso().emTransacao(ato);
    if (!resultado.ok) {
      recusar(resposta, resultado);
      return;
    }
    resposta.setHeader("cache-control", "no-store");
    resposta.status(204).end();
  }

  // ── Lista ───────────────────────────────────────────────────────────────
  const listagem = validar({ query: esquemaDaConsultaDeVinculos });
  rotas.get("/vinculos", listagem, async (requisicao, resposta, proximo) => {
    try {
      const { query } = listagem.dados(requisicao);
      await comoAdministrador(resposta, async () => {
        const lista = await acesso().emTransacao(() => listarVinculos(query));
        resposta.setHeader("cache-control", "no-store");
        resposta.json(lista);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Donos ───────────────────────────────────────────────────────────────
  const novoDono = validar({
    params: esquemaDaLoja,
    body: esquemaDaAtribuicaoDeDono,
  });
  rotas.post(
    "/lojas/:id/donos",
    novoDono,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = novoDono.dados(requisicao);
        await comoAdministrador(resposta, (administradorId) =>
          atoQueVincula(resposta, () =>
            adicionarDono(
              {
                lojaId: params.id,
                identidadeId: body.identidadeId,
                motivo: body.motivo,
              },
              administradorId,
              dosAtos(),
            ),
          ),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const troca = validar({
    params: esquemaDoVinculoNaLoja,
    body: esquemaDaSubstituicaoDeDono,
  });
  rotas.put(
    "/lojas/:id/donos/:identidadeId/substituicao",
    troca,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = troca.dados(requisicao);
        await comoAdministrador(resposta, (administradorId) =>
          atoQueVincula(resposta, async () => {
            const feito = await substituirDono(
              {
                lojaId: params.id,
                antigoId: params.identidadeId,
                novoId: body.novoDonoId,
                motivo: body.motivo,
              },
              administradorId,
              dosAtos(),
            );
            // A troca responde 200: o recurso da rota (o dono da loja) já
            // existia e foi substituído.
            return feito.ok ? { ...feito, criado: false } : feito;
          }),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const remocaoDeDono = validar({
    params: esquemaDoVinculoNaLoja,
    body: esquemaDaRemocaoDeVinculo,
  });
  rotas.delete(
    "/lojas/:id/donos/:identidadeId",
    remocaoDeDono,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = remocaoDeDono.dados(requisicao);
        await comoAdministrador(resposta, (administradorId) =>
          atoQueRemove(resposta, () =>
            removerDono(
              {
                lojaId: params.id,
                identidadeId: params.identidadeId,
                motivo: body.motivo,
              },
              administradorId,
              dosAtos(),
            ),
          ),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Equipe ──────────────────────────────────────────────────────────────
  const novaEquipe = validar({
    params: esquemaDaLoja,
    body: esquemaDaAtribuicaoDeEquipe,
  });
  rotas.post(
    "/lojas/:id/equipe",
    novaEquipe,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = novaEquipe.dados(requisicao);
        await comoAdministrador(resposta, (administradorId) =>
          atoQueVincula(resposta, () =>
            adicionarEquipe(
              {
                lojaId: params.id,
                identidadeId: body.identidadeId,
                motivo: body.motivo,
              },
              administradorId,
              dosAtos(),
            ),
          ),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const remocaoDeEquipe = validar({
    params: esquemaDoVinculoNaLoja,
    body: esquemaDaRemocaoDeVinculo,
  });
  rotas.delete(
    "/lojas/:id/equipe/:identidadeId",
    remocaoDeEquipe,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = remocaoDeEquipe.dados(requisicao);
        await comoAdministrador(resposta, (administradorId) =>
          atoQueRemove(resposta, () =>
            removerEquipe(
              {
                lojaId: params.id,
                identidadeId: params.identidadeId,
                motivo: body.motivo,
              },
              administradorId,
              dosAtos(),
            ),
          ),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

/**
 * Pessoas na administração da plataforma (card #170, T-3):
 *
 *   GET   /v1/admin/pessoas?tipo=&situacao=&busca=&pagina=&porPagina=
 *   POST  /v1/admin/pessoas                    cadastra (sem senha) e gera o link
 *   GET   /v1/admin/pessoas/:id                ficha (fica na trilha)
 *   PATCH /v1/admin/pessoas/:id                só nome e telefone
 *   PUT   /v1/admin/pessoas/:id/desativacao    com motivo
 *   PUT   /v1/admin/pessoas/:id/reativacao     com motivo
 *   POST  /v1/admin/pessoas/:id/acesso         link de uso único, com motivo
 *
 * Montadas depois da trava do token (trava 1); cada uma passa pela tabela de
 * administradores (trava 2, `comoAdministrador`) antes de ler o corpo no
 * banco, e fala pela credencial `sc_admin`. Mutação sem origem autorizada já
 * foi recusada antes (AC-126). Corpos `strictObject`: papel ou admin no corpo
 * é 400.
 *
 * O LINK aparece UMA vez, na resposta do ato, com `no-store`, como caminho
 * relativo. Nenhum registro de log leva o token, o resumo ou o link; o aviso
 * de envio que falhou leva só o evento.
 */

import type { Response, Router } from "express";
import {
  esquemaDaConsultaDePessoas,
  esquemaDaDesativacaoDePessoa,
  esquemaDaEdicaoDePessoa,
  esquemaDaReativacaoDePessoa,
  esquemaDoCadastroDePessoa,
  esquemaDoPedidoDeAcesso,
  type AcessoGeradoNoContrato,
  type FichaDaPessoaNoContrato,
} from "@simpleclick/contracts";
import { z } from "zod";

import type { AcessoAoBanco } from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import { validar } from "../../core/validar.ts";
import {
  lerFichaDaPessoa,
  listarPessoas,
  registrarConsultaDaPessoa,
  repositorioDePessoas,
} from "./pessoas.repo.ts";
import {
  cadastrarPessoa,
  caminhoDoAcesso,
  desativarPessoa,
  editarPessoa,
  gerarAcessoDaPessoa,
  reativarPessoa,
  type AcessoGerado,
  type GeradorDeAcesso,
  type RecusaDoAto,
} from "./pessoas.usecase.ts";

/**
 * Manda o link à pessoa, quando há provedor. `false`: não saiu (sem provedor
 * ou falha), e o administrador entrega o link por outro meio.
 */
export type EnviarAcessoDaPessoa = (envio: {
  readonly para: string;
  readonly token: string;
  readonly expiraEm: Date;
}) => Promise<boolean>;

export interface DependenciasDasPessoas extends GeradorDeAcesso {
  readonly acesso: () => AcessoAoBanco;
  readonly agora: () => Date;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
  readonly enviarAcesso: EnviarAcessoDaPessoa;
}

const esquemaDoCaminhoDaPessoa = z.object({
  id: z.uuid("Pessoa inválida."),
});

/** As recusas dos atos, com o código do contrato. */
const RECUSAS: Readonly<
  Record<
    RecusaDoAto["motivo"],
    { status: number; erro: string; mensagem: string }
  >
> = {
  NAO_ENCONTRADA: {
    status: 404,
    erro: "nao_encontrado",
    mensagem: "Pessoa não encontrada.",
  },
  PROTEGIDA: {
    status: 409,
    erro: "conta_protegida",
    mensagem:
      "Esta conta é da administração da plataforma e não é alterada por aqui.",
  },
  DESATIVADA: {
    status: 409,
    erro: "conta_desativada",
    mensagem: "Esta conta está desativada. Reative-a antes.",
  },
};

function recusar(resposta: Response, recusa: RecusaDoAto): void {
  const { status, erro, mensagem } = RECUSAS[recusa.motivo];
  resposta.setHeader("cache-control", "no-store");
  resposta.status(status).json({ erro, mensagem });
}

function responderComFicha(
  resposta: Response,
  ficha: FichaDaPessoaNoContrato | null,
): void {
  resposta.setHeader("cache-control", "no-store");
  if (ficha === null) {
    resposta.status(404).json({ erro: "nao_encontrado" });
    return;
  }
  resposta.json(ficha);
}

export function montarRotasDePessoas(
  rotas: Router,
  dependencias: DependenciasDasPessoas,
): void {
  const { acesso, agora, comoAdministrador } = dependencias;
  const dosAtos = () => ({
    repositorio: repositorioDePessoas(),
    agora,
    gerarToken: dependencias.gerarToken,
    resumirToken: dependencias.resumirToken,
  });

  /**
   * Depois do commit: tenta mandar o link e monta a resposta do contrato. O
   * envio que falha não desfaz nada — o link já vale, e aparece na tela.
   */
  async function acessoParaResponder(
    para: string,
    gerado: AcessoGerado,
  ): Promise<AcessoGeradoNoContrato> {
    let emailEnviado = false;
    try {
      emailEnviado = await dependencias.enviarAcesso({
        para,
        token: gerado.token,
        expiraEm: gerado.expiraEm,
      });
    } catch {
      registrar.aviso("admin.acesso_nao_enviado", { recurso: "acesso" });
    }
    return {
      caminho: caminhoDoAcesso(gerado.token),
      expiraEm: gerado.expiraEm.toISOString(),
      emailEnviado,
    };
  }

  // ── Lista ───────────────────────────────────────────────────────────────
  const listagem = validar({ query: esquemaDaConsultaDePessoas });
  rotas.get("/pessoas", listagem, async (requisicao, resposta, proximo) => {
    try {
      const { query } = listagem.dados(requisicao);
      await comoAdministrador(resposta, async () => {
        const lista = await acesso().emTransacao(() => listarPessoas(query));
        resposta.setHeader("cache-control", "no-store");
        resposta.json(lista);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Cadastro ────────────────────────────────────────────────────────────
  const cadastro = validar({ body: esquemaDoCadastroDePessoa });
  rotas.post("/pessoas", cadastro, async (requisicao, resposta, proximo) => {
    try {
      const { body } = cadastro.dados(requisicao);
      await comoAdministrador(resposta, async (administradorId) => {
        const resultado = await acesso().emTransacao(() =>
          cadastrarPessoa(body, administradorId, dosAtos()),
        );
        resposta.setHeader("cache-control", "no-store");
        if (!resultado.ok) {
          resposta.status(409).json({
            erro: "email_em_uso",
            mensagem: "Já existe uma conta com este e-mail.",
            identidadeId: resultado.identidadeId,
          });
          return;
        }
        resposta.status(201).json({
          identidadeId: resultado.identidadeId,
          acesso: await acessoParaResponder(body.email, resultado.acesso),
        });
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Ficha (a abertura fica na trilha da plataforma) ─────────────────────
  const daPessoa = validar({ params: esquemaDoCaminhoDaPessoa });
  rotas.get("/pessoas/:id", daPessoa, async (requisicao, resposta, proximo) => {
    try {
      const { params } = daPessoa.dados(requisicao);
      await comoAdministrador(resposta, async (administradorId) => {
        const ficha = await acesso().emTransacao(async () => {
          const lida = await lerFichaDaPessoa(params.id);
          if (lida === null) return null;
          await registrarConsultaDaPessoa(params.id, administradorId);
          return lida;
        });
        responderComFicha(resposta, ficha);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Edição: nome e telefone ─────────────────────────────────────────────
  const edicao = validar({
    params: esquemaDoCaminhoDaPessoa,
    body: esquemaDaEdicaoDePessoa,
  });
  rotas.patch("/pessoas/:id", edicao, async (requisicao, resposta, proximo) => {
    try {
      const { params, body } = edicao.dados(requisicao);
      await comoAdministrador(resposta, async (administradorId) => {
        const resultado = await acesso().emTransacao(async () => {
          const ato = await editarPessoa(
            params.id,
            body,
            administradorId,
            repositorioDePessoas(),
          );
          return ato.ok
            ? { ato, ficha: await lerFichaDaPessoa(params.id) }
            : { ato, ficha: null };
        });
        if (!resultado.ato.ok) return recusar(resposta, resultado.ato);
        responderComFicha(resposta, resultado.ficha);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Desativar ───────────────────────────────────────────────────────────
  const desativacao = validar({
    params: esquemaDoCaminhoDaPessoa,
    body: esquemaDaDesativacaoDePessoa,
  });
  rotas.put(
    "/pessoas/:id/desativacao",
    desativacao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = desativacao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const ato = await desativarPessoa(
              params.id,
              body,
              administradorId,
              {
                repositorio: repositorioDePessoas(),
                agora,
              },
            );
            return ato.ok
              ? { ato, ficha: await lerFichaDaPessoa(params.id) }
              : { ato, ficha: null };
          });
          const { ato } = resultado;
          if (!ato.ok && ato.motivo === "DONO_UNICO") {
            resposta.setHeader("cache-control", "no-store");
            resposta.status(409).json({
              erro: "dono_unico",
              mensagem:
                "Esta pessoa é a única dona ativa destas lojas. Confirme que elas ficarão sem dono, ou atribua outro dono antes.",
              lojas: ato.lojas,
            });
            return;
          }
          if (!ato.ok) return recusar(resposta, ato);
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Reativar ────────────────────────────────────────────────────────────
  const reativacao = validar({
    params: esquemaDoCaminhoDaPessoa,
    body: esquemaDaReativacaoDePessoa,
  });
  rotas.put(
    "/pessoas/:id/reativacao",
    reativacao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = reativacao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const ato = await reativarPessoa(
              params.id,
              body,
              administradorId,
              repositorioDePessoas(),
            );
            return ato.ok
              ? { ato, ficha: await lerFichaDaPessoa(params.id) }
              : { ato, ficha: null };
          });
          if (!resultado.ato.ok) return recusar(resposta, resultado.ato);
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Link de acesso de uso único ─────────────────────────────────────────
  const pedidoDeAcesso = validar({
    params: esquemaDoCaminhoDaPessoa,
    body: esquemaDoPedidoDeAcesso,
  });
  rotas.post(
    "/pessoas/:id/acesso",
    pedidoDeAcesso,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = pedidoDeAcesso.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(() =>
            gerarAcessoDaPessoa(params.id, body, administradorId, dosAtos()),
          );
          if (!resultado.ok) return recusar(resposta, resultado);
          const corpo = await acessoParaResponder(
            resultado.email,
            resultado.acesso,
          );
          resposta.setHeader("cache-control", "no-store");
          resposta.setHeader("pragma", "no-cache");
          resposta.status(201).json(corpo);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}

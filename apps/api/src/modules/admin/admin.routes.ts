/**
 * Rotas da administração da plataforma: `/v1/admin/*`.
 *
 * DUAS TRAVAS antes de qualquer consulta, e nenhuma delas é o parâmetro da URL:
 *
 * 1. O token de acesso precisa dizer ADMIN. Dono de loja e cliente final param
 *    aqui, com a mesma resposta para qualquer caminho — recusar de um jeito
 *    num endereço e de outro no vizinho contaria quais endereços existem.
 * 2. A identidade precisa estar em `platform_admins`, sem revogação, AGORA. O
 *    token vale quinze minutos e o poder pode ter sido retirado nesse meio.
 *
 * E o banco é a terceira: estas rotas falam pela credencial `sc_admin`, que é
 * a única que enxerga todas as lojas. A rota do lojista não tem essa senha.
 *
 * A composição com os outros módulos (autenticação, envio do convite) é feita
 * em `app.ts` e chega aqui por parâmetro: módulo não importa módulo.
 */

import { Router, type Request, type Response } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { bancoDaAdministracao, type AcessoAoBanco } from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import { validar } from "../../core/validar.ts";
import { MENSAGEM_DE_APELIDO_EM_USO } from "@simpleclick/contracts";

import { esquemasDaListagem, esquemasDoCadastro } from "./admin.schema.ts";
import {
  cadastrarLoja,
  type DependenciasDoCadastro,
} from "./criar-loja.usecase.ts";
import { listarLojas } from "./listar-lojas.usecase.ts";
import {
  administradorAtivo,
  buscarLojas,
  listarTiposDeNegocio,
  repositorioDoCadastro,
} from "./lojas.repo.ts";

/** Papéis que uma sessão pode carregar, do jeito que o token os declara. */
export type PapelDaSessaoNaAdministracao = "CUSTOMER" | "OWNER" | "ADMIN";

/** Quem chamou, segundo o token — ainda sem a conferência no banco. */
export interface SessaoNaAdministracao {
  readonly identidadeId: string;
  readonly papel: PapelDaSessaoNaAdministracao;
}

/** A recusa de quem não é administrador. A mesma frase para todo caminho. */
export const RECUSA_DA_ADMINISTRACAO = {
  erro: "acesso_negado",
  mensagem: "Este ajuste é feito pela administração da plataforma.",
} as const;

export interface OpcoesDaAdministracao {
  /** Acesso pela credencial `sc_admin`. Padrão: o do ambiente. */
  readonly acesso?: AcessoAoBanco;
  /** Lê e confere o token do cabeçalho. `null` quando não há sessão válida. */
  readonly autenticar: (requisicao: Request) => SessaoNaAdministracao | null;
  readonly enviarConvite: DependenciasDoCadastro["enviarConvite"];
  readonly gerarTokenDeConvite: () => string;
  readonly resumirTokenDeConvite: (token: string) => string;
  readonly agora?: () => Date;
}

function recusar(resposta: Response): void {
  resposta.status(403).json(RECUSA_DA_ADMINISTRACAO);
}

export function criarRotasDaAdministracao(
  opcoes: OpcoesDaAdministracao,
): Router {
  const rotas = Router();
  // Preguiçoso: montar a composição não pode abrir conexão, e o teste que não
  // chama rota de administração não deveria precisar da senha dela.
  let acessoMontado: AcessoAoBanco | undefined = opcoes.acesso;
  const acesso = (): AcessoAoBanco =>
    (acessoMontado ??= bancoDaAdministracao());
  const agora = opcoes.agora ?? (() => new Date());

  // Trava 1 — o token. Antes de ler corpo, parâmetro ou banco.
  rotas.use((requisicao, resposta, proximo) => {
    const sessao = opcoes.autenticar(requisicao);
    if (sessao === null) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return;
    }
    if (sessao.papel !== "ADMIN") {
      recusar(resposta);
      return;
    }
    resposta.locals.administrador = sessao.identidadeId;
    proximo();
  });

  /**
   * Trava 2 — a tabela de administradores, e então o trabalho.
   *
   * O contexto leva quem é o administrador, e cada transação aberta dentro do
   * trabalho é da credencial `sc_admin`. A conferência roda numa transação
   * própria e curta: o cadastro precisa GRAVAR antes de mandar o convite, e
   * isso só acontece se a gravação for uma transação que termina.
   */
  async function comoAdministrador(
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ): Promise<void> {
    const administradorId = String(resposta.locals.administrador);
    await executarComoRequisicao({ usuarioId: administradorId }, async () => {
      const ativo = await acesso().emTransacao(() =>
        administradorAtivo(administradorId),
      );
      if (!ativo) {
        recusar(resposta);
        return;
      }
      await trabalho(administradorId);
    });
  }

  rotas.get("/tipos-de-negocio", async (_requisicao, resposta, proximo) => {
    try {
      await comoAdministrador(resposta, async () => {
        const tipos = await acesso().emTransacao(() => listarTiposDeNegocio());
        resposta.json({ tipos });
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Lista e busca (AC-206) ──────────────────────────────────────────────
  const entradaDaListagem = validar(esquemasDaListagem);
  rotas.get(
    "/lojas",
    entradaDaListagem,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = entradaDaListagem.dados(requisicao);
        await comoAdministrador(resposta, async () => {
          const lista = await acesso().emTransacao(() =>
            listarLojas(query, { buscarLojas }),
          );
          resposta.setHeader("cache-control", "no-store");
          resposta.json(lista);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Cadastro de loja (AC-200, AC-201, AC-202) ───────────────────────────
  const entradaDoCadastro = validar(esquemasDoCadastro);
  rotas.post(
    "/lojas",
    entradaDoCadastro,
    async (requisicao, resposta, proximo) => {
      try {
        const { body } = entradaDoCadastro.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await cadastrarLoja(body, administradorId, {
            executar: (trabalho) =>
              acesso().emTransacao(() => trabalho(repositorioDoCadastro())),
            enviarConvite: opcoes.enviarConvite,
            gerarToken: opcoes.gerarTokenDeConvite,
            resumirToken: opcoes.resumirTokenDeConvite,
            agora,
            avisarConviteNaoEnviado: (lojaId) =>
              registrar.aviso("admin.convite_nao_enviado", {
                lojaId,
                recurso: "convite",
              }),
          });

          if (resultado.ok) {
            resposta.status(201).json({
              id: resultado.loja.id,
              codigo: resultado.loja.codigo,
              apelido: resultado.loja.apelido,
              status: resultado.loja.status,
              conviteEnviado: resultado.conviteEnviado,
            });
            return;
          }
          if (resultado.motivo === "APELIDO_EM_USO") {
            resposta.status(409).json({
              erro: "apelido_em_uso",
              campos: [
                {
                  onde: "body",
                  caminho: "apelido",
                  mensagem: MENSAGEM_DE_APELIDO_EM_USO,
                },
              ],
              sugestao: resultado.sugestao,
            });
            return;
          }
          resposta.status(400).json({
            erro: "tipo_desconhecido",
            campos: [
              {
                onde: "body",
                caminho: "tipoDeNegocio",
                mensagem: "Escolha um tipo de negócio da lista.",
              },
            ],
          });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

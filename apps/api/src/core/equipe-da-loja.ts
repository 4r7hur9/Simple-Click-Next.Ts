/**
 * O portão da equipe: quem entra no painel de uma loja, e com que papel
 * (card #25).
 *
 * ANTES, toda rota do painel aceitava só a sessão de DONO — a equipe não
 * tinha como entrar, e quem era administração E dona de uma loja (sessão
 * ADMIN) também não. AGORA o papel vem do VÍNCULO da conta com AQUELA loja
 * (`store_members`), e não do papel da sessão: uma conta pode ser cliente
 * numa loja, equipe noutra e dona de uma terceira.
 *
 * O portão roda uma vez por requisição em `/v1/lojas/:apelido/*`, antes de
 * todas as rotas do painel:
 *
 *   1. confere o token (qualquer papel de sessão);
 *   2. pergunta ao banco o papel da conta NESTA loja (`app.minhas_lojas()`);
 *   3. confere a rota contra a matriz de permissões do contrato
 *      (`MATRIZ_DE_PERMISSOES`): equipe que tenta o que não pode recebe
 *      `403 sem_permissao {permissao}`;
 *   4. deixa o papel em `res.locals`, de onde cada rota o lê
 *      (`equipeDaRequisicao`) e o leva ao contexto do banco — onde as
 *      políticas e o vínculo (`core/db.ts`, regra 7) conferem de novo.
 *
 * Sem vínculo com a loja, o comportamento de antes vale: sessão de dono segue
 * como OWNER e o banco recusa com 404 (não conta que a loja existe); as outras
 * param em 401.
 *
 * Rota nova do painel que não estiver na tabela `PERMISSOES_POR_ROTA` é só do
 * dono: o padrão fecha, não abre.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  MENSAGEM_DE_SEM_PERMISSAO,
  podeNaLoja,
  type PapelNaLoja,
  type PermissaoDaLoja,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "./contexto.ts";
import { banco, type AcessoAoBanco } from "./db.ts";

/** Quem está no painel da loja, e com que papel no vínculo. */
export interface EquipeDaRequisicao {
  readonly identidadeId: string;
  readonly papel: PapelNaLoja;
}

/** A sessão do token, ainda sem saber da loja. */
export interface SessaoDaRequisicao {
  readonly identidadeId: string;
  readonly papel: string;
}

/**
 * Qual permissão cada rota do painel exige, pelo caminho depois de
 * `/v1/lojas/:apelido`. A primeira regra que casar vale.
 */
export const PERMISSOES_POR_ROTA: readonly {
  readonly caminho: RegExp;
  readonly permissao: PermissaoDaLoja;
}[] = Object.freeze([
  {
    caminho: /^\/catalogo\/categorias(\/|$)/,
    permissao: "catalogo.categorias",
  },
  { caminho: /^\/catalogo\/produtos(\/|$)/, permissao: "catalogo.produtos" },
  // A visão geral de estoque, variações e opções (card #52).
  { caminho: /^\/catalogo\/visao-geral$/, permissao: "catalogo.produtos" },
  // Stories da loja (card #46): quem cuida dos produtos posta stories.
  { caminho: /^\/stories(\/|$)/, permissao: "catalogo.produtos" },
  // Comentários dos clientes (card #47): a configuração (aprovar sozinho) é
  // do dono; o resto é da moderação.
  { caminho: /^\/comentarios\/configuracao$/, permissao: "configuracoes" },
  { caminho: /^\/comentarios(\/|$)/, permissao: "moderar_comentarios" },
  { caminho: /^\/pedidos\/manual$/, permissao: "pedidos.manual" },
  { caminho: /^\/pedidos\/[^/]+\/repetir$/, permissao: "pedidos.manual" },
  { caminho: /^\/pedidos(\/|$)/, permissao: "pedidos.operar" },
  { caminho: /^\/impressao\/(estado|pendentes)$/, permissao: "pedidos.operar" },
  { caminho: /^\/impressao(\/|$)/, permissao: "configuracoes" },
  { caminho: /^\/clientes(\/|$)/, permissao: "clientes" },
  { caminho: /^\/metricas(\/|$)/, permissao: "metricas" },
  { caminho: /^\/(situacao|funcionalidades|limites)$/, permissao: "loja.ver" },
  { caminho: /^\/configuracao(\/|$)/, permissao: "configuracoes" },
  { caminho: /^\/equipe(\/|$)/, permissao: "equipe" },
  { caminho: /^\/feed(\/|$)/, permissao: "feed" },
  { caminho: /^\/tema(\/|$)/, permissao: "personalizacao" },
]);

/**
 * A permissão que a rota exige. Rota que não está na tabela exige
 * `configuracoes` — ou seja, é só do dono.
 */
export function permissaoDaRota(caminho: string): PermissaoDaLoja {
  const limpo = caminho.replace(/\/+$/, "") || "/";
  return (
    PERMISSOES_POR_ROTA.find((regra) => regra.caminho.test(limpo))?.permissao ??
    "configuracoes"
  );
}

const CHAVE = "equipeDaLoja";

/** Forma de um identificador de identidade. */
const FORMATO_DE_IDENTIDADE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O papel da conta na loja, decidido pelo portão. `null` sem vínculo. */
export function equipeDaRequisicao(
  requisicao: Request,
): EquipeDaRequisicao | null {
  const valor: unknown = requisicao.res?.locals[CHAVE];
  if (typeof valor !== "object" || valor === null) return null;
  return valor as EquipeDaRequisicao;
}

/** O papel da conta na loja do apelido, pelo vínculo ativo. */
export async function papelDaContaNaLoja(
  identidadeId: string,
  apelido: string,
  acesso: AcessoAoBanco = banco(),
): Promise<PapelNaLoja | null> {
  // Sujeito que não é uma identidade (token forjado, usuário de teste antigo)
  // não tem vínculo — e perguntar ao banco viraria erro interno.
  if (!FORMATO_DE_IDENTIDADE.test(identidadeId)) return null;
  const linhas = await executarComoRequisicao(
    { usuarioId: identidadeId, papel: "CUSTOMER" },
    () =>
      acesso.emTransacao(
        (tx) => tx.$queryRaw<{ member_role: string }[]>`
          SELECT member_role FROM app.minhas_lojas()
           WHERE lower(store_slug) = lower(${apelido})`,
      ),
  );
  const papeis = linhas.map((linha) => linha.member_role);
  if (papeis.includes("OWNER")) return "OWNER";
  if (papeis.includes("STAFF")) return "STAFF";
  return null;
}

export interface OpcoesDoPortaoDaEquipe {
  /** Lê e confere o token. `null` sem sessão válida. */
  readonly identificar: (requisicao: Request) => SessaoDaRequisicao | null;
  /** O papel da conta na loja. Padrão: pelo banco da aplicação. */
  readonly papelNaLoja?: (
    identidadeId: string,
    apelido: string,
  ) => Promise<PapelNaLoja | null>;
}

/**
 * O portão, para montar em `/v1/lojas/:apelido`. Sem sessão, deixa passar:
 * cada rota responde 401 do jeito que sempre respondeu.
 */
export function portaoDaEquipe(opcoes: OpcoesDoPortaoDaEquipe): RequestHandler {
  const papelNaLoja =
    opcoes.papelNaLoja ??
    ((identidadeId: string, apelido: string) =>
      papelDaContaNaLoja(identidadeId, apelido));

  return (requisicao: Request, resposta: Response, proximo: NextFunction) => {
    const sessao = opcoes.identificar(requisicao);
    const apelido = requisicao.params["apelido"];
    if (sessao === null || typeof apelido !== "string" || apelido === "") {
      proximo();
      return;
    }

    papelNaLoja(sessao.identidadeId, apelido)
      .then((papel) => {
        if (papel === null) {
          if (sessao.papel === "OWNER") {
            resposta.locals[CHAVE] = {
              identidadeId: sessao.identidadeId,
              papel: "OWNER",
            } satisfies EquipeDaRequisicao;
          }
          proximo();
          return;
        }

        const permissao = permissaoDaRota(requisicao.path);
        if (!podeNaLoja(papel, permissao)) {
          resposta.status(403).json({
            erro: "sem_permissao",
            permissao,
            mensagem: MENSAGEM_DE_SEM_PERMISSAO,
          });
          return;
        }

        resposta.locals[CHAVE] = {
          identidadeId: sessao.identidadeId,
          papel,
        } satisfies EquipeDaRequisicao;
        proximo();
      })
      .catch(proximo);
  };
}

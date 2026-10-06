/**
 * A rota "quem sou eu" (`GET /v1/eu`, T-115, AC-134).
 *
 * Devolve a pessoa do token de acesso e as lojas em que ela tem vínculo ativo.
 * É por aqui que o site descobre a loja do painel, em vez de ler uma loja da
 * configuração do servidor. A leitura roda num contexto só daquela pessoa e
 * sem loja: a identidade sai pela política "só a própria identidade", e as
 * lojas pela função dedicada `app.lojas_da_sessao()` (migração 0046), que
 * aplica a mesma regra de vínculo ativo que as rotas do dono conferem.
 */
import { esquemaDoEu, type EuNoContrato } from "@simpleclick/contracts";
import { Router, type Request } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, transacaoAtual, type AcessoAoBanco } from "../../core/db.ts";
import {
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
  type PapelDaSessao,
} from "./token.ts";

/** Onde a rota fica montada. */
export const CAMINHO_DO_EU = "/v1/eu";

/** Ajustes da rota. Tudo tem padrão; a prova troca o acesso e o segredo. */
export interface OpcoesDoEu {
  /** Acesso pela credencial que atende requisição. Padrão: o do ambiente. */
  readonly acesso?: AcessoAoBanco;
  /** Segredo que assina o token. Padrão: `JWT_SECRET` do ambiente. */
  readonly segredo?: () => string | undefined;
}

/** A pessoa do Bearer, ou `null` sem token, com token vencido ou adulterado. */
function pessoaDoToken(
  requisicao: Request,
  segredo: string | undefined,
): { readonly identidadeId: string; readonly papel: PapelDaSessao } | null {
  const token = tokenDoCabecalhoDeAutorizacao(requisicao.headers.authorization);
  if (token === undefined || segredo === undefined || segredo === "") {
    return null;
  }
  try {
    const alegacoes = verificarTokenDeAcesso(token, segredo);
    return { identidadeId: alegacoes.identidadeId, papel: alegacoes.papel };
  } catch {
    return null;
  }
}

/** Linha de `app.lojas_da_sessao()`. */
interface LinhaDaLoja {
  readonly store_slug: string;
  readonly store_name: string;
  readonly member_role: string;
  readonly store_status: string;
}

/**
 * Lê a identidade e as lojas dentro da transação em curso. O papel do
 * contexto é o da sessão: só dono tem loja; cliente e administração rodam
 * como cliente e recebem a lista vazia.
 */
async function lerEu(papel: PapelDaSessao): Promise<EuNoContrato | null> {
  const tx = transacaoAtual();
  const identidades = await tx.$queryRaw<
    { id: string; email_norm: string; display_name: string | null }[]
  >`SELECT id::text AS id, email_norm, display_name
      FROM app.identities
     WHERE id = app.current_user_id() AND anonymized_at IS NULL`;
  const identidade = identidades[0];
  if (identidade === undefined) return null;

  const lojas =
    papel === "OWNER"
      ? await tx.$queryRaw<LinhaDaLoja[]>`
          SELECT store_slug, store_name, member_role, store_status
            FROM app.lojas_da_sessao()`
      : [];

  // O esquema do contrato confere a forma: campo a mais ou situação fora da
  // lista vira erro aqui, e não resposta diferente do que o contrato promete.
  return esquemaDoEu.parse({
    identidade: {
      id: identidade.id,
      email: identidade.email_norm,
      nome: identidade.display_name,
      papel,
    },
    lojas: lojas.map((linha) => ({
      apelido: linha.store_slug,
      nome: linha.store_name,
      papel: linha.member_role,
      situacao: linha.store_status,
    })),
  });
}

/** Monta `GET /` do roteador, para ser usado em `CAMINHO_DO_EU`. */
export function criarRotaDoEu(opcoes: OpcoesDoEu = {}): Router {
  const rotas = Router();
  // Preguiçoso: montar a aplicação não pode exigir banco configurado.
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const segredo = opcoes.segredo ?? (() => process.env.JWT_SECRET?.trim());

  rotas.get("/", async (requisicao, resposta, proximo) => {
    try {
      // A resposta diz de quem é a sessão: guardada em cache, serviria a
      // pessoa errada depois de uma troca de conta no mesmo navegador.
      resposta.set("cache-control", "no-store");
      const pessoa = pessoaDoToken(requisicao, segredo());
      if (pessoa === null) {
        resposta.status(401).json({ erro: "nao_autenticado" });
        return;
      }
      const eu = await executarComoRequisicao(
        {
          usuarioId: pessoa.identidadeId,
          papel: pessoa.papel === "OWNER" ? "OWNER" : "CUSTOMER",
        },
        () => acesso().emTransacao(() => lerEu(pessoa.papel)),
      );
      // Identidade anonimizada ou inexistente: o token não fala mais de
      // ninguém, e a resposta é a mesma de token inválido.
      if (eu === null) {
        resposta.status(401).json({ erro: "nao_autenticado" });
        return;
      }
      resposta.json(eu);
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}

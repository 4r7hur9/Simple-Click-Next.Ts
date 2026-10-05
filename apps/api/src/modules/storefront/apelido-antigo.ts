/**
 * O apelido antigo de uma loja leva ao atual (AC-208).
 *
 * Quando a administração troca o apelido, o antigo fica guardado como
 * endereço da loja (`store_domains`, `LEGACY_SLUG`). Esta rota responde, para
 * um apelido que NÃO é o atual de loja nenhuma, qual é o apelido atual da loja
 * que o usava — e o site redireciona quem chegou pelo link antigo, para que o
 * link já compartilhado com os clientes não quebre.
 *
 * A pergunta atravessa lojas antes de existir contexto de loja, então quem
 * responde é a função dedicada do banco (`app.resolve_legacy_slug`, migração
 * 0032), com lista fechada: devolve só o apelido atual, e só de loja NO AR.
 * Loja suspensa ou excluída não redireciona — dizer para onde ela foi
 * contaria que ela existe, que é o que a vitrine não conta (AC-402).
 */

import { Router } from "express";
import { esquemaDoApelido } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, transacaoAtual, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { validar } from "../../core/validar.ts";

/** O apelido atual da loja que usava o informado, ou `null`. */
export async function apelidoAtualDoAntigo(
  apelido: string,
): Promise<string | null> {
  const linhas = await transacaoAtual().$queryRaw<{ slug: string }[]>`
    SELECT slug FROM app.resolve_legacy_slug(${apelido})`;
  return linhas[0]?.slug ?? null;
}

export interface OpcoesDoApelidoAntigo {
  readonly acesso?: AcessoAoBanco;
}

/** `GET /v1/vitrine/:apelido/endereco-atual` */
export function criarRotaDoApelidoAntigo(
  opcoes: OpcoesDoApelidoAntigo = {},
): Router {
  const rotas = Router();
  const borda = validar({ params: esquemaDoApelido });

  rotas.get("/:apelido/endereco-atual", borda, async (req, res, proximo) => {
    try {
      const { params } = borda.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const atual = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
        acesso.emTransacao(() => apelidoAtualDoAntigo(params.apelido)),
      );
      if (atual === null) {
        // A mesma resposta de loja inexistente: quem pergunta por um apelido
        // qualquer não aprende nada além de "não é antigo de loja no ar".
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }
      res.json({ apelido: atual });
    } catch (erro) {
      proximo(erro);
    }
  });

  return rotas;
}

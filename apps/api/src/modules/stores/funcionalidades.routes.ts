/**
 * `GET /v1/lojas/:apelido/funcionalidades` — o que vale para a loja do dono
 * (T-207 — AC-212, AC-213).
 *
 * O painel pergunta isto para esconder do menu a área desligada pela
 * administração. Esconder é conforto: quem barra de fato é o portão das rotas
 * (`exigirFuncionalidade`, `core/funcionalidades.ts`).
 *
 * As travas são as de toda rota do dono: sessão de DONO (401 sem ela), loja
 * resolvida sem contexto e transação com loja, identidade e papel, em que o
 * vínculo é conferido antes de qualquer consulta. A leitura das exceções passa
 * pela política de equipe da tabela (migração 0040): só a própria loja.
 */
import { Router, type Request } from "express";
import { esquemaDoApelido } from "@simpleclick/contracts";
import { funcionalidadesDaLoja } from "@simpleclick/core";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, transacaoAtual, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";

export interface OpcoesDasFuncionalidadesDaLoja {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (
    requisicao: Request,
  ) => { readonly identidadeId: string; readonly papel: "OWNER" } | null;
  readonly resolverLoja: (chegada: {
    readonly apelido: string;
  }) => Promise<
    | { readonly encontrada: true; readonly id: string }
    | { readonly encontrada: false }
  >;
}

/** As exceções da loja do contexto, pela política de equipe. */
async function excecoesDaLoja() {
  const linhas = await transacaoAtual().$queryRaw<
    { feature_key: string; is_enabled: boolean; limit_value: bigint | null }[]
  >`
    SELECT feature_key, is_enabled, limit_value
      FROM app.store_feature_overrides
     WHERE store_id = app.current_store_id()`;
  return linhas.map((linha) => ({
    chave: linha.feature_key,
    ligada: linha.is_enabled,
    limite: linha.limit_value === null ? null : Number(linha.limit_value),
  }));
}

export function criarRotaDasFuncionalidadesDaLoja(
  opcoes: OpcoesDasFuncionalidadesDaLoja,
): Router {
  const rotas = Router();
  const borda = validar({ params: esquemaDoApelido });

  rotas.get(
    "/:apelido/funcionalidades",
    (requisicao, resposta, proximo) => {
      // A sessão vem antes da validação: sem ela, a resposta é a mesma para
      // qualquer apelido.
      const usuario = opcoes.autenticar(requisicao);
      if (usuario === null) {
        resposta.status(401).json({ erro: "nao_autenticado" });
        return;
      }
      resposta.locals.dono = usuario;
      proximo();
    },
    borda,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = borda.dados(requisicao);
        const usuario = resposta.locals.dono as {
          readonly identidadeId: string;
          readonly papel: "OWNER";
        };
        const acesso = opcoes.acesso ?? banco();
        resposta.setHeader("cache-control", "no-store");

        const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
          acesso.emTransacao(() =>
            opcoes.resolverLoja({ apelido: params.apelido }),
          ),
        );
        if (!loja.encontrada) {
          resposta.status(404).json({ erro: "nao_encontrado" });
          return;
        }

        const excecoes = await executarComoRequisicao(
          {
            lojaId: loja.id,
            usuarioId: usuario.identidadeId,
            papel: usuario.papel,
          },
          () => acesso.emTransacao(() => excecoesDaLoja()),
        );
        resposta.json({
          funcionalidades: funcionalidadesDaLoja(excecoes).map((item) => ({
            chave: item.chave,
            ligada: item.ligada,
          })),
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

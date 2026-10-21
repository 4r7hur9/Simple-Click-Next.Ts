/**
 * `GET /v1/lojas/:apelido/situacao` — o aviso de suspensão do painel (AC-209).
 *
 * O painel do dono pergunta isto ao abrir. Para a loja no ar, a resposta é
 * curta; para a SUSPENSA, ela diz desde quando e o motivo que a
 * administração deu. É a única rota do dono que alcança a loja suspensa: as
 * outras resolvem a loja pela vitrine, que só enxerga loja no ar — e assim o
 * acesso da loja suspensa fica, de fato, suspenso.
 *
 * As travas são as de toda rota do dono: sessão de DONO (401 sem ela), loja
 * resolvida sem contexto e transação com loja, identidade e papel, em que o
 * vínculo é conferido antes de qualquer consulta (`core/db.ts`, regra 7). Quem
 * não é da loja recebe 404, como para loja que não existe.
 *
 * A resolução que aceita a loja suspensa chega por parâmetro
 * (`identificarLojaNaoExcluida`, do módulo da vitrine): a composição é de
 * `app.ts`, porque módulo não importa módulo.
 */
import { Router, type Request, type RequestHandler } from "express";
import { esquemaDoApelido } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { situacaoParaODono } from "./situacao.usecase.ts";

export interface OpcoesDaSituacaoDaLoja {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (
    requisicao: Request,
  ) => { readonly identidadeId: string; readonly papel: "OWNER" | "STAFF" } | null;
  /** Resolve a loja pelo apelido, inclusive a SUSPENSA; nunca a excluída. */
  readonly resolverLoja: (chegada: {
    readonly apelido: string;
  }) => Promise<
    | { readonly encontrada: true; readonly id: string }
    | { readonly encontrada: false }
  >;
}

export function criarRotaDaSituacaoDaLoja(
  opcoes: OpcoesDaSituacaoDaLoja,
): Router {
  const rotas = Router();
  const borda = validar({ params: esquemaDoApelido });

  // A sessão vem antes da validação do endereço: sem sessão, a resposta é a
  // mesma para qualquer apelido.
  const exigirDono: RequestHandler = (requisicao, resposta, proximo) => {
    const usuario = opcoes.autenticar(requisicao);
    if (usuario === null) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return;
    }
    resposta.locals.dono = usuario;
    proximo();
  };

  rotas.get(
    "/:apelido/situacao",
    exigirDono,
    borda,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = borda.dados(requisicao);
        const usuario = resposta.locals.dono as {
          readonly identidadeId: string;
          readonly papel: "OWNER" | "STAFF";
        };
        const acesso = opcoes.acesso ?? banco();
        resposta.setHeader("cache-control", "no-store");

        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () =>
            acesso.emTransacao(() =>
              opcoes.resolverLoja({ apelido: params.apelido }),
            ),
        );
        if (!identificacao.encontrada) {
          resposta.status(404).json({ erro: "nao_encontrado" });
          return;
        }

        const situacao = await executarComoRequisicao(
          {
            lojaId: identificacao.id,
            usuarioId: usuario.identidadeId,
            papel: usuario.papel,
          },
          () => acesso.emTransacao(() => situacaoParaODono()),
        );
        if (situacao === null) {
          resposta.status(404).json({ erro: "nao_encontrado" });
          return;
        }
        resposta.json(situacao);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

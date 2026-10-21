/**
 * Rotas de curtidas e comentários (card #47). O contrato completo está em
 * `packages/contracts/src/social.ts`.
 *
 *   Público (montado em /v1; a sessão vem do Bearer ou do cookie do site):
 *     POST|DELETE /feed/produtos/:produtoId/curtida      conta
 *     POST|DELETE /feed/lojas/:apelido/curtida           conta
 *     GET         /feed/produtos/:produtoId/comentarios  público
 *     POST        /feed/produtos/:produtoId/comentarios  conta
 *     GET         /feed/lojas/:apelido/comentarios       público
 *     POST        /feed/lojas/:apelido/comentarios       conta
 *     POST        /feed/comentarios/:comentarioId/denuncia  conta
 *     DELETE      /conta/comentarios/:comentarioId       conta (o autor)
 *
 *   Painel (montado em /v1/lojas; o portão da equipe exige
 *   `moderar_comentarios`, e `configuracoes` para a configuração):
 *     GET    /:apelido/comentarios[?situacao&alvo&produto&denunciados&pagina&porPagina]
 *     GET    /:apelido/comentarios/contagem
 *     GET    /:apelido/comentarios/bloqueios
 *     DELETE /:apelido/comentarios/bloqueios/:bloqueioId
 *     GET|PUT /:apelido/comentarios/configuracao
 *     POST   /:apelido/comentarios/:comentarioId/aprovar
 *     POST   /:apelido/comentarios/:comentarioId/recusar
 *     POST   /:apelido/comentarios/:comentarioId/bloquear-autor
 *     DELETE /:apelido/comentarios/:comentarioId
 */

import {
  esquemaDaConfiguracaoDosComentarios,
  esquemaDaConsultaDaModeracao,
  esquemaDaConsultaDeComentarios,
  esquemaDaDenuncia,
  esquemaDaLojaSocial,
  esquemaDoBloqueioNaLoja,
  esquemaDoComentarioNaLoja,
  esquemaDoComentarioSocial,
  esquemaDoMotivoDaModeracao,
  esquemaDoNovoComentario,
  esquemaDoProdutoSocial,
  MENSAGEM_DE_COMENTARIO_BLOQUEADO,
  MENSAGEM_DE_LIMITE_DE_COMENTARIOS,
} from "@simpleclick/contracts";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  alvoDaLoja,
  alvoDoProduto,
  apagarComentarioDaLoja,
  apagarMeuComentario,
  aprovaAutomaticamente,
  bloquearAutor,
  bloqueiosDaLoja,
  comentar,
  comentariosDaLoja,
  comentariosDoAlvo,
  contagemDaLoja,
  denunciar,
  desbloquear,
  gravarAprovacaoAutomatica,
  marcarCurtida,
  moderar,
  type AlvoSocial,
} from "./social.usecase.ts";

function erro(
  resposta: Response,
  status: number,
  codigo: string,
  mensagem?: string,
): void {
  resposta
    .status(status)
    .json(
      mensagem === undefined ? { erro: codigo } : { erro: codigo, mensagem },
    );
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export interface OpcoesDoSocial {
  readonly acesso?: AcessoAoBanco;
  /** A conta da sessão, ou `null`. */
  readonly autenticar: (
    requisicao: Request,
  ) => { readonly identidadeId: string } | null;
}

export function criarRotasSociais(opcoes: OpcoesDoSocial): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  /** Roda como a pessoa da sessão (ou como o público, sem sessão). */
  function comoQuemPediu<T>(
    requisicao: Request,
    trabalho: () => Promise<T>,
  ): Promise<T> {
    const conta = opcoes.autenticar(requisicao);
    return executarComoRequisicao(
      conta === null
        ? { papel: "PUBLIC" }
        : { usuarioId: conta.identidadeId, papel: "CUSTOMER" },
      () => acesso().emTransacao(trabalho),
    );
  }

  const exigirConta = (
    requisicao: Request,
    resposta: Response,
    proximo: NextFunction,
  ) => {
    if (opcoes.autenticar(requisicao) === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    proximo();
  };

  const doProduto = validar({ params: esquemaDoProdutoSocial });
  const daLoja = validar({ params: esquemaDaLojaSocial });

  // Parâmetros e corpo na MESMA borda: uma borda sem corpo apaga o corpo
  // (`validar`), e a seguinte o veria vazio.
  const comentarioNoProduto = validar({
    params: esquemaDoProdutoSocial,
    body: esquemaDoNovoComentario,
  });
  const comentarioNaLoja = validar({
    params: esquemaDaLojaSocial,
    body: esquemaDoNovoComentario,
  });

  /** Os dois alvos: o produto pelo id, a loja pelo apelido. */
  const ALVOS = [
    {
      caminho: "/feed/produtos/:produtoId",
      borda: doProduto,
      bordaDoComentario: comentarioNoProduto,
      achar: (produtoId: string) => alvoDoProduto(produtoId),
      chave: (requisicao: Request) =>
        doProduto.dados(requisicao).params.produtoId,
      chaveDoComentario: (requisicao: Request) =>
        comentarioNoProduto.dados(requisicao).params.produtoId,
    },
    {
      caminho: "/feed/lojas/:apelido",
      borda: daLoja,
      bordaDoComentario: comentarioNaLoja,
      achar: (apelido: string) => alvoDaLoja(apelido),
      chave: (requisicao: Request) => daLoja.dados(requisicao).params.apelido,
      chaveDoComentario: (requisicao: Request) =>
        comentarioNaLoja.dados(requisicao).params.apelido,
    },
  ] as const;

  for (const alvo of ALVOS) {
    for (const [metodo, curtir] of [
      ["post", true],
      ["delete", false],
    ] as const) {
      rotas[metodo](
        `${alvo.caminho}/curtida`,
        exigirConta,
        alvo.borda,
        async (requisicao, resposta, proximo) => {
          try {
            const chave = alvo.chave(requisicao);
            const resultado = await comoQuemPediu(requisicao, async () => {
              const achado = await alvo.achar(chave);
              return achado === null ? null : marcarCurtida(achado, curtir);
            });
            resposta.set("cache-control", "no-store");
            if (resultado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(resultado);
          } catch (causa) {
            proximo(causa);
          }
        },
      );
    }

    const consulta = validar({ query: esquemaDaConsultaDeComentarios });
    rotas.get(
      `${alvo.caminho}/comentarios`,
      alvo.borda,
      consulta,
      async (requisicao, resposta, proximo) => {
        try {
          const { query } = consulta.dados(requisicao);
          const comSessao = opcoes.autenticar(requisicao) !== null;
          const chave = alvo.chave(requisicao);
          const lista = await comoQuemPediu(requisicao, async () => {
            const achado = await alvo.achar(chave);
            return achado === null
              ? null
              : comentariosDoAlvo(achado, query, comSessao);
          });
          if (lista === null) {
            erro(resposta, 404, "nao_encontrado");
            return;
          }
          // Com sessão a resposta traz os pendentes da PESSOA.
          resposta.set("cache-control", "private, no-store");
          resposta.json(lista);
        } catch (causa) {
          proximo(causa);
        }
      },
    );

    rotas.post(
      `${alvo.caminho}/comentarios`,
      exigirConta,
      alvo.bordaDoComentario,
      async (requisicao, resposta, proximo) => {
        try {
          const { body } = alvo.bordaDoComentario.dados(requisicao);
          const chave = alvo.chaveDoComentario(requisicao);
          const resultado = await comoQuemPediu(requisicao, async () => {
            const achado: AlvoSocial | null = await alvo.achar(chave);
            return achado === null
              ? { pode: "NAO_ENCONTRADO" as const, comentario: null }
              : comentar(achado, body.texto);
          });
          resposta.set("cache-control", "no-store");
          if (resultado.pode === "BLOQUEADO") {
            erro(
              resposta,
              403,
              "comentario_bloqueado",
              MENSAGEM_DE_COMENTARIO_BLOQUEADO,
            );
            return;
          }
          if (resultado.pode === "LIMITE") {
            resposta.set("retry-after", "600");
            erro(
              resposta,
              429,
              "limite_de_comentarios",
              MENSAGEM_DE_LIMITE_DE_COMENTARIOS,
            );
            return;
          }
          if (resultado.comentario === null) {
            erro(resposta, 404, "nao_encontrado");
            return;
          }
          resposta.status(201).json(resultado.comentario);
        } catch (causa) {
          proximo(causa);
        }
      },
    );
  }

  const doComentario = validar({ params: esquemaDoComentarioSocial });
  // Corpo opcional: denunciar sem motivo pode vir sem corpo nenhum.
  const denuncia = validar({
    params: esquemaDoComentarioSocial,
    body: esquemaDaDenuncia.optional(),
  });
  rotas.post(
    "/feed/comentarios/:comentarioId/denuncia",
    exigirConta,
    denuncia,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = denuncia.dados(requisicao);
        const ok = await comoQuemPediu(requisicao, () =>
          denunciar(params.comentarioId, body?.motivo),
        );
        resposta.set("cache-control", "no-store");
        if (!ok) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.json({ denunciado: true });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/conta/comentarios/:comentarioId",
    exigirConta,
    doComentario,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doComentario.dados(requisicao);
        const apagado = await comoQuemPediu(requisicao, () =>
          apagarMeuComentario(params.comentarioId),
        );
        if (!apagado) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.status(204).end();
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

/** Quem está no painel, com o papel do vínculo (`equipeDaRequisicao`). */
interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

/** A loja do painel pelo apelido (`identificarLojaDoPainel`). */
type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

export interface OpcoesDaModeracao {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (chegada: {
    readonly apelido: string;
  }) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDaModeracao(opcoes: OpcoesDaModeracao): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  const autenticado = (
    requisicao: Request,
    resposta: Response,
    proximo: NextFunction,
  ) => {
    const usuario = opcoes.autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  };

  /**
   * Roda o trabalho com a loja no contexto e o papel do vínculo. `undefined`
   * quando a loja não existe (já respondeu 404).
   */
  async function naLoja<T>(
    requisicao: Request,
    resposta: Response,
    trabalho: (papel: string) => Promise<T>,
  ): Promise<{ valor: T } | undefined> {
    const apelido = String(requisicao.params["apelido"]);
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return undefined;
    }
    const usuario = resposta.locals.usuario as UsuarioAutenticado;
    const valor = await executarComoRequisicao(
      {
        lojaId: identificacao.id,
        usuarioId: usuario.identidadeId,
        papel: usuario.papel,
      },
      () => acesso().emTransacao(() => trabalho(usuario.papel)),
    );
    return { valor };
  }

  /** Responde o valor; `null` vira 404 e `undefined` (sem loja) já respondeu. */
  function responder(
    resposta: Response,
    lido: { valor: unknown } | undefined,
    status = 200,
  ): void {
    if (lido === undefined) return;
    resposta.set("cache-control", "private, no-store");
    if (lido.valor === null || lido.valor === false) {
      erro(resposta, 404, "nao_encontrado");
      return;
    }
    if (status === 204) {
      resposta.status(204).end();
      return;
    }
    resposta.status(status).json(lido.valor);
  }

  const consulta = validar({ query: esquemaDaConsultaDaModeracao });
  rotas.get(
    "/:apelido/comentarios",
    autenticado,
    consulta,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = consulta.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, async () => {
          const pagina = await comentariosDaLoja(query);
          return {
            comentarios: pagina.itens,
            contagem: await contagemDaLoja(),
            aprovarAutomaticamente: await aprovaAutomaticamente(),
            pagina: query.pagina,
            porPagina: query.porPagina,
            total: pagina.total,
          };
        });
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/:apelido/comentarios/contagem",
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        responder(
          resposta,
          await naLoja(requisicao, resposta, () => contagemDaLoja()),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/:apelido/comentarios/bloqueios",
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        const lido = await naLoja(requisicao, resposta, async () => ({
          bloqueios: await bloqueiosDaLoja(),
        }));
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const doBloqueio = validar({ params: esquemaDoBloqueioNaLoja });
  rotas.delete(
    "/:apelido/comentarios/bloqueios/:bloqueioId",
    autenticado,
    doBloqueio,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doBloqueio.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, (papel) =>
          desbloquear(params.bloqueioId, papel),
        );
        responder(resposta, lido, 204);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/:apelido/comentarios/configuracao",
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        const lido = await naLoja(requisicao, resposta, async () => ({
          aprovarAutomaticamente: await aprovaAutomaticamente(),
        }));
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const configuracao = validar({ body: esquemaDaConfiguracaoDosComentarios });
  rotas.put(
    "/:apelido/comentarios/configuracao",
    autenticado,
    configuracao,
    async (requisicao, resposta, proximo) => {
      try {
        const { body } = configuracao.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, async (papel) => ({
          aprovarAutomaticamente: await gravarAprovacaoAutomatica(
            body.aprovarAutomaticamente,
            papel,
          ),
        }));
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const doComentario = validar({ params: esquemaDoComentarioNaLoja });
  const comMotivo = validar({
    params: esquemaDoComentarioNaLoja,
    // Corpo opcional: recusar ou bloquear sem motivo pode vir sem corpo.
    body: esquemaDoMotivoDaModeracao.optional(),
  });

  rotas.post(
    "/:apelido/comentarios/:comentarioId/aprovar",
    autenticado,
    doComentario,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doComentario.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, (papel) =>
          moderar(params.comentarioId, "APROVADO", null, papel),
        );
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/comentarios/:comentarioId/recusar",
    autenticado,
    comMotivo,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = comMotivo.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, (papel) =>
          moderar(params.comentarioId, "RECUSADO", body?.motivo || null, papel),
        );
        responder(resposta, lido);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/comentarios/:comentarioId/bloquear-autor",
    autenticado,
    comMotivo,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = comMotivo.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, (papel) =>
          bloquearAutor(params.comentarioId, body?.motivo || null, papel),
        );
        responder(resposta, lido, 201);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/comentarios/:comentarioId",
    autenticado,
    doComentario,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doComentario.dados(requisicao);
        const lido = await naLoja(requisicao, resposta, (papel) =>
          apagarComentarioDaLoja(params.comentarioId, papel),
        );
        responder(resposta, lido, 204);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

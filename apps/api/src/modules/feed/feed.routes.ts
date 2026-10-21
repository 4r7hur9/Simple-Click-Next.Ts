/**
 * Rotas do feed (card #25), montadas em `/v1`:
 *
 *   GET    /v1/tipos-de-negocio            público
 *   GET    /v1/feed/produtos               público
 *   GET    /v1/feed/lojas                  público (com sessão: favorita e última visita)
 *   GET    /v1/conta/favoritos             conta
 *   POST   /v1/conta/favoritos/:apelido    conta
 *   DELETE /v1/conta/favoritos/:apelido    conta
 *   GET    /v1/conta/recentes              conta
 *   POST   /v1/conta/recentes/:apelido     conta (registra a visita)
 *
 * Card #45 (favoritos de produto e recentes com janela):
 *
 *   GET    /v1/feed/favoritos                         conta ({lojas, produtos})
 *   POST   /v1/feed/favoritos/produtos/:produtoId     conta
 *   DELETE /v1/feed/favoritos/produtos/:produtoId     conta
 *   POST   /v1/conta/favoritos/produtos/:produtoId    conta (mesmo que acima)
 *   DELETE /v1/conta/favoritos/produtos/:produtoId    conta (mesmo que acima)
 *   GET    /v1/feed/recentes?dias=                    conta (janela, até 20)
 *
 * A sessão vem do Bearer ou do cookie `sc_access` (o site), lida pela borda
 * (`app.ts`): qualquer papel serve — a conta é uma só.
 */

import {
  esquemaDaConsultaDaListaDaConta,
  esquemaDaConsultaDosRecentes,
  JANELA_DOS_RECENTES_EM_DIAS,
  esquemaDaConsultaDeLojasDoFeed,
  esquemaDaConsultaDeProdutosDoFeed,
} from "@simpleclick/contracts";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  lojasDoFeed,
  lojasRecentes,
  marcarFavorita,
  marcarProdutoFavorito,
  produtosDoFeed,
  produtosFavoritos,
  registrarVisita,
  tiposDeNegocio,
  type EscopoDasLojas,
} from "./feed.usecase.ts";

export interface OpcoesDoFeed {
  readonly acesso?: AcessoAoBanco;
  /** A conta da sessão, ou `null`. */
  readonly autenticar: (
    requisicao: Request,
  ) => { readonly identidadeId: string } | null;
}

const esquemaDoApelido = z.object({
  apelido: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,63}$/, "Loja inválida."),
});

const esquemaDoProduto = z.object({
  produtoId: z.uuid("Produto inválido."),
});

export function criarRotasDoFeed(opcoes: OpcoesDoFeed): Router {
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

  /** Exige a conta; sem ela, 401. */
  function exigirConta(requisicao: Request, resposta: Response): boolean {
    if (opcoes.autenticar(requisicao) !== null) return true;
    resposta.status(401).json({ erro: "nao_autenticado" });
    return false;
  }

  rotas.get("/tipos-de-negocio", async (requisicao, resposta, proximo) => {
    try {
      const tipos = await comoQuemPediu(requisicao, () => tiposDeNegocio());
      resposta.set("cache-control", "public, max-age=300");
      resposta.json({ tipos });
    } catch (causa) {
      proximo(causa);
    }
  });

  const consultaDeProdutos = validar({
    query: esquemaDaConsultaDeProdutosDoFeed,
  });
  rotas.get(
    "/feed/produtos",
    consultaDeProdutos,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = consultaDeProdutos.dados(requisicao);
        const pagina = await comoQuemPediu(requisicao, () =>
          produtosDoFeed(query),
        );
        // Com sessão a resposta diz o que a PESSOA favoritou.
        resposta.set("cache-control", "private, no-store");
        resposta.json({
          produtos: pagina.itens,
          pagina: query.pagina,
          porPagina: query.porPagina,
          total: pagina.total,
          totalComAtacado: pagina.totalComAtacado,
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const consultaDeLojas = validar({ query: esquemaDaConsultaDeLojasDoFeed });
  rotas.get(
    "/feed/lojas",
    consultaDeLojas,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = consultaDeLojas.dados(requisicao);
        const pagina = await comoQuemPediu(requisicao, () =>
          lojasDoFeed(query, "TODAS"),
        );
        // Com sessão a resposta diz o que a PESSOA favoritou.
        resposta.set("cache-control", "private, no-store");
        resposta.json({
          lojas: pagina.itens,
          pagina: query.pagina,
          porPagina: query.porPagina,
          total: pagina.total,
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const consultaDaConta = validar({ query: esquemaDaConsultaDaListaDaConta });

  function listaDaConta(caminho: string, escopo: EscopoDasLojas): void {
    rotas.get(
      caminho,
      (requisicao, resposta, proximo) => {
        if (exigirConta(requisicao, resposta)) proximo();
      },
      consultaDaConta,
      async (requisicao, resposta, proximo) => {
        try {
          const { query } = consultaDaConta.dados(requisicao);
          const pagina = await comoQuemPediu(requisicao, () =>
            lojasDoFeed({ ...query, ordem: "relevancia" }, escopo),
          );
          resposta.set("cache-control", "private, no-store");
          resposta.json({
            lojas: pagina.itens,
            pagina: query.pagina,
            porPagina: query.porPagina,
            total: pagina.total,
          });
        } catch (causa) {
          proximo(causa);
        }
      },
    );
  }

  listaDaConta("/conta/favoritos", "FAVORITAS");

  // Os recentes da conta: a mesma janela padrão do `/feed/recentes`.
  rotas.get(
    "/conta/recentes",
    (requisicao, resposta, proximo) => {
      if (exigirConta(requisicao, resposta)) proximo();
    },
    consultaDaConta,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = consultaDaConta.dados(requisicao);
        const { lojas } = await comoQuemPediu(requisicao, () =>
          lojasRecentes({
            dias: JANELA_DOS_RECENTES_EM_DIAS,
            lat: query.lat,
            lng: query.lng,
          }),
        );
        const inicio = (query.pagina - 1) * query.porPagina;
        resposta.set("cache-control", "private, no-store");
        resposta.json({
          lojas: lojas.slice(inicio, inicio + query.porPagina),
          pagina: query.pagina,
          porPagina: query.porPagina,
          total: lojas.length,
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/feed/favoritos",
    (requisicao, resposta, proximo) => {
      if (exigirConta(requisicao, resposta)) proximo();
    },
    async (requisicao, resposta, proximo) => {
      try {
        const favoritos = await comoQuemPediu(requisicao, async () => ({
          lojas: (
            await lojasDoFeed(
              { ordem: "relevancia", pagina: 1, porPagina: 50 },
              "FAVORITAS",
            )
          ).itens,
          produtos: await produtosFavoritos(),
        }));
        resposta.set("cache-control", "private, no-store");
        resposta.json(favoritos);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const consultaDosRecentes = validar({ query: esquemaDaConsultaDosRecentes });
  rotas.get(
    "/feed/recentes",
    (requisicao, resposta, proximo) => {
      if (exigirConta(requisicao, resposta)) proximo();
    },
    consultaDosRecentes,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = consultaDosRecentes.dados(requisicao);
        const { lojas, desde } = await comoQuemPediu(requisicao, () =>
          lojasRecentes(query),
        );
        resposta.set("cache-control", "private, no-store");
        resposta.json({ lojas, dias: query.dias, desde: desde.toISOString() });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const doApelido = validar({ params: esquemaDoApelido });

  function marcar(
    metodo: "post" | "delete",
    caminho: string,
    trabalho: (apelido: string) => Promise<unknown>,
  ): void {
    rotas[metodo](
      caminho,
      (requisicao, resposta, proximo) => {
        if (exigirConta(requisicao, resposta)) proximo();
      },
      doApelido,
      async (requisicao, resposta, proximo) => {
        try {
          const { params } = doApelido.dados(requisicao);
          const resultado = await comoQuemPediu(requisicao, () =>
            trabalho(params.apelido),
          );
          resposta.set("cache-control", "no-store");
          if (resultado === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(resultado);
        } catch (causa) {
          proximo(causa);
        }
      },
    );
  }

  marcar("post", "/conta/favoritos/:apelido", (apelido) =>
    marcarFavorita(apelido, true),
  );
  marcar("delete", "/conta/favoritos/:apelido", (apelido) =>
    marcarFavorita(apelido, false),
  );
  marcar("post", "/conta/recentes/:apelido", (apelido) =>
    registrarVisita(apelido),
  );

  const doProduto = validar({ params: esquemaDoProduto });
  for (const prefixo of [
    "/feed/favoritos/produtos",
    "/conta/favoritos/produtos",
  ]) {
    for (const metodo of ["post", "delete"] as const) {
      rotas[metodo](
        `${prefixo}/:produtoId`,
        (requisicao, resposta, proximo) => {
          if (exigirConta(requisicao, resposta)) proximo();
        },
        doProduto,
        async (requisicao, resposta, proximo) => {
          try {
            const { params } = doProduto.dados(requisicao);
            const resultado = await comoQuemPediu(requisicao, () =>
              marcarProdutoFavorito(params.produtoId, metodo === "post"),
            );
            resposta.set("cache-control", "no-store");
            if (resultado === null) {
              resposta.status(404).json({ erro: "nao_encontrado" });
              return;
            }
            resposta.json(resultado);
          } catch (causa) {
            proximo(causa);
          }
        },
      );
    }
  }

  return rotas;
}

"use client";

/**
 * Os posts da loja na vitrine (o perfil, card #49): os produtos do catálogo
 * no MESMO post do /explorar (foto 4:5, curtir, comentar, favoritar, Pedir).
 * A lista já chega inteira do servidor; aqui ela aparece aos poucos, 6 de
 * cada vez, conforme a pessoa rola.
 */
import { useCallback } from "react";
import type { ProdutoDoFeed } from "@simpleclick/contracts";

import { FeedDePosts } from "./FeedDePosts.tsx";
import type { AcoesDoFeed } from "./social.ts";
import "./feed.css";

const DE_CADA_VEZ = 6;
const SEM_FILTROS: Readonly<Record<string, string>> = {};

export function PostsDaLoja({
  nomeDaLoja,
  produtos,
  logado,
  voltarPara,
  favorita,
  acoes,
}: {
  readonly nomeDaLoja: string;
  readonly produtos: readonly ProdutoDoFeed[];
  readonly logado: boolean;
  readonly voltarPara: string;
  /** A pessoa já favoritou esta loja. */
  readonly favorita: boolean;
  readonly acoes: AcoesDoFeed;
}) {
  const pedir = useCallback(
    async (pagina: number) => ({
      ok: true as const,
      dados: {
        itens: produtos.slice((pagina - 1) * DE_CADA_VEZ, pagina * DE_CADA_VEZ),
        total: produtos.length,
      },
    }),
    [produtos],
  );

  if (produtos.length === 0) return null;

  const apelido = produtos[0]?.loja.apelido;
  return (
    <section
      className="sc-feed sc-feed--perfil"
      data-aba="produtos"
      aria-labelledby="sc-posts-da-loja-titulo"
    >
      <h2 id="sc-posts-da-loja-titulo" className="sc-feed__perfil-titulo">
        Posts <span>de {nomeDaLoja}</span>
      </h2>
      <FeedDePosts
        inicial={produtos.slice(0, DE_CADA_VEZ)}
        total={produtos.length}
        parametros={SEM_FILTROS}
        logado={logado}
        voltarPara={voltarPara}
        seguidas={favorita && apelido ? [apelido] : SEM_LISTA}
        acoes={acoes}
        pedir={pedir}
      />
    </section>
  );
}

const SEM_LISTA: readonly string[] = [];

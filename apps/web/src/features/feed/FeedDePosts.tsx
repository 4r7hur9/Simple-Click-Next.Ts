"use client";

/**
 * A coluna de posts (card #49): um post por vez, rolagem vertical e a próxima
 * página chegando sozinha quando a pessoa se aproxima do fim (rolagem
 * infinita). Se a rede falhar, aparece "Tentar de novo"; no fim, um aviso de
 * que acabou. Guarda as lojas favoritas para todos os posts da mesma loja
 * mudarem juntos, e uma única gaveta de comentários.
 *
 * Serve o /explorar (próxima página vem do servidor, `acoes.maisPosts`) e a
 * vitrine da loja (a lista já veio inteira; `pedir` só revela aos poucos).
 */
import { useCallback, useEffect, useState, type RefObject } from "react";
import type { ProdutoDoFeed } from "@simpleclick/contracts";

import { comDestino } from "../../lib/destino-seguro.ts";
import { GavetaDeComentarios } from "./GavetaDeComentarios.tsx";
import { Post, PostCarregando } from "./Post.tsx";
import type { AcoesDoFeed, PaginaDeItens, ResultadoDaAcao } from "./social.ts";
import { useMaisItens, type CargaDoFeed } from "./useMaisItens.ts";

const idDoProduto = (p: ProdutoDoFeed) => p.id;

/** As lojas favoritas da pessoa, compartilhadas pelos posts da tela. */
export function useLojasFavoritas(iniciais: readonly string[]) {
  const [favoritas, setFavoritas] = useState<ReadonlySet<string>>(() => new Set(iniciais));
  useEffect(() => setFavoritas(new Set(iniciais)), [iniciais]);
  const mudar = useCallback((apelido: string, sim: boolean) => {
    setFavoritas((atual) => {
      const nova = new Set(atual);
      if (sim) nova.add(apelido);
      else nova.delete(apelido);
      return nova;
    });
  }, []);
  return [favoritas, mudar] as const;
}

export function FeedDePosts({
  inicial,
  total: totalInicial,
  parametros,
  logado,
  voltarPara,
  seguidas,
  acoes,
  pedir: pedirFora,
  sessaoVencida: venceuNaPagina = false,
}: {
  readonly inicial: readonly ProdutoDoFeed[];
  readonly total: number;
  /** Os filtros do endereço, para a próxima página vir igual. */
  readonly parametros: Readonly<Record<string, string>>;
  readonly logado: boolean;
  readonly voltarPara: string;
  /** Apelidos das lojas que a pessoa favoritou. */
  readonly seguidas: readonly string[];
  readonly acoes: AcoesDoFeed;
  /** Troca de onde vem a próxima página (a vitrine revela a lista local). */
  readonly pedir?: (pagina: number) => Promise<ResultadoDaAcao<PaginaDeItens>>;
  /** A sessão venceu antes de a página carregar (as estrelas vieram vazias). */
  readonly sessaoVencida?: boolean;
}) {
  const pedir = useCallback(
    (pagina: number) => (pedirFora ? pedirFora(pagina) : acoes.maisPosts(parametros, pagina)),
    [pedirFora, acoes, parametros],
  );
  const { itens, total, carga, sentinela, carregarMais, sessaoVencida } = useMaisItens({
    inicial,
    total: totalInicial,
    chave: idDoProduto,
    pedir,
  });
  const [favoritas, mudarFavorita] = useLojasFavoritas(seguidas);
  const [comentando, setComentando] = useState<ProdutoDoFeed | null>(null);

  return (
    <>
      {venceuNaPagina || sessaoVencida ? (
        <p className="sc-posts__aviso" role="status">
          Sua sessão venceu, por isso os favoritos não aparecem.{" "}
          <a className="sc-feed__chamada" href={comDestino("/entrar", voltarPara)}>
            Entrar de novo
          </a>
        </p>
      ) : null}
      <div className="sc-posts">
        {itens.map((produto, i) => (
          <Post
            key={produto.id}
            produto={produto}
            logado={logado}
            voltarPara={voltarPara}
            acoes={acoes}
            seguindo={favoritas.has(produto.loja.apelido)}
            aoMudarSeguir={mudarFavorita}
            aoAbrirComentarios={setComentando}
            prioridade={i === 0}
          />
        ))}
      </div>

      <FimDaLista
        sentinela={sentinela}
        carga={carga}
        quantos={itens.length}
        total={total}
        nomes={{ um: "post", varios: "posts" }}
        carregarMais={carregarMais}
      />

      <GavetaDeComentarios
        produto={comentando}
        logado={logado}
        voltarPara={voltarPara}
        acoes={acoes}
        aoFechar={() => setComentando(null)}
      />
    </>
  );
}

/** O pé da lista: carregando, falhou (tentar de novo), acabou ou "Carregar mais". */
export function FimDaLista({
  sentinela,
  carga,
  quantos,
  total,
  nomes: { um, varios, feminino = false },
  carregarMais,
}: {
  readonly sentinela: RefObject<HTMLDivElement | null>;
  readonly carga: CargaDoFeed;
  readonly quantos: number;
  readonly total: number;
  readonly nomes: { readonly um: string; readonly varios: string; readonly feminino?: boolean };
  readonly carregarMais: () => Promise<void>;
}) {
  return (
    <div ref={sentinela} className="sc-posts__fim" aria-live="polite">
      {carga === "carregando" ? (
        <>
          <span className="sc-feed__oculto">Carregando mais {varios}…</span>
          <PostCarregando />
        </>
      ) : carga === "erro" ? (
        <p className="sc-posts__aviso">
          Não deu para carregar mais {varios}.{" "}
          <button type="button" className="sc-feed__chamada" onClick={() => void carregarMais()}>
            Tentar de novo
          </button>
        </p>
      ) : carga === "fim" && quantos > 1 ? (
        <p className="sc-posts__aviso">
          Você viu{" "}
          {total === 1
            ? `${feminino ? "a única" : "o único"} ${um}`
            : `${feminino ? "todas as" : "todos os"} ${Math.max(total, quantos)} ${varios}`}{" "}
          por aqui.
        </p>
      ) : carga === "parado" ? (
        <button type="button" className="sc-posts__mais" onClick={() => void carregarMais()}>
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}

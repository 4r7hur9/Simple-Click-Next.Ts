"use client";

/**
 * A aba Lojas do /explorar (card #49) no mesmo jeito da aba Produtos: uma
 * loja por vez, como post, com rolagem infinita. Favoritas e "Vistas há
 * pouco" já chegam inteiras do servidor (não pedem mais páginas).
 */
import { useCallback, useEffect, useMemo } from "react";
import type { LojaDoFeed } from "@simpleclick/contracts";

import { FimDaLista, useLojasFavoritas } from "./FeedDePosts.tsx";
import { PostDeLoja } from "./PostDeLoja.tsx";
import type { AcoesDoFeed } from "./social.ts";
import { useMaisItens } from "./useMaisItens.ts";

const apelidoDaLoja = (l: LojaDoFeed) => l.apelido;

export function FeedDeLojas({
  inicial,
  total: totalInicial,
  parametros,
  paginada,
  logado,
  voltarPara,
  acoes,
}: {
  readonly inicial: readonly LojaDoFeed[];
  readonly total: number;
  readonly parametros: Readonly<Record<string, string>>;
  /** Lista "todas": pede mais páginas. Favoritas/recentes já vêm inteiras. */
  readonly paginada: boolean;
  readonly logado: boolean;
  readonly voltarPara: string;
  readonly acoes: AcoesDoFeed;
}) {
  const maisLojas = acoes.maisLojas;
  const pedir = useCallback(
    (pagina: number) =>
      maisLojas
        ? maisLojas(parametros, pagina)
        : Promise.resolve({ ok: false as const, motivo: "indisponivel" as const }),
    [maisLojas, parametros],
  );
  const { itens, total, carga, sentinela, carregarMais } = useMaisItens({
    inicial,
    total: totalInicial,
    chave: apelidoDaLoja,
    pedir: paginada && maisLojas ? pedir : undefined,
  });
  // A API já marca `favorita` em cada loja (com sessão).
  const iniciais = useMemo(
    () => inicial.filter((l) => l.favorita).map((l) => l.apelido),
    [inicial],
  );
  const [favoritas, mudarFavorita] = useLojasFavoritas(iniciais);
  // As lojas das páginas seguintes trazem a marca delas.
  useEffect(() => {
    for (const loja of itens) {
      if (loja.favorita && !favoritas.has(loja.apelido)) mudarFavorita(loja.apelido, true);
    }
    // Só quando chegam lojas novas; desmarcar depois é escolha da pessoa.
  }, [itens]);

  return (
    <>
      <div className="sc-posts">
        {itens.map((loja, i) => (
          <PostDeLoja
            key={loja.apelido}
            loja={loja}
            logado={logado}
            voltarPara={voltarPara}
            acoes={acoes}
            favorita={favoritas.has(loja.apelido)}
            aoMudarFavorita={mudarFavorita}
            prioridade={i === 0}
          />
        ))}
      </div>
      <FimDaLista
        sentinela={sentinela}
        carga={carga}
        quantos={itens.length}
        total={total}
        nomes={{ um: "loja", varios: "lojas", feminino: true }}
        carregarMais={carregarMais}
      />
    </>
  );
}

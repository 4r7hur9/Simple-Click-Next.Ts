"use client";

/**
 * Rolagem infinita do feed (card #49), igual para posts e lojas: guarda a
 * lista, pede a próxima página quando a sentinela chega perto da tela, junta
 * sem repetir e diz se está carregando, se falhou ou se acabou.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultadoDaAcao } from "./social.ts";

export type CargaDoFeed = "parado" | "carregando" | "erro" | "fim";

export function useMaisItens<T>({
  inicial,
  total: totalInicial,
  chave,
  pedir,
}: {
  readonly inicial: readonly T[];
  readonly total: number;
  /** O que torna um item único (para não repetir entre páginas). */
  readonly chave: (item: T) => string;
  /** Pede a página `pagina` (2, 3…); sem ela, a lista é só a inicial. */
  readonly pedir?:
    | ((pagina: number) => Promise<ResultadoDaAcao<{ readonly itens: readonly unknown[]; readonly total: number }>>)
    | undefined;
}) {
  const [itens, setItens] = useState<readonly T[]>(inicial);
  const [total, setTotal] = useState(totalInicial);
  const [pagina, setPagina] = useState(1);
  const fimDe = (lista: readonly T[], t: number): CargaDoFeed =>
    pedir === undefined || lista.length >= t ? "fim" : "parado";
  const [carga, setCarga] = useState<CargaDoFeed>(fimDe(inicial, totalInicial));
  const sentinela = useRef<HTMLDivElement>(null);
  const ocupado = useRef(false);

  // Filtro novo (a página do servidor mandou outra lista): recomeça.
  useEffect(() => {
    setItens(inicial);
    setTotal(totalInicial);
    setPagina(1);
    setCarga(fimDe(inicial, totalInicial));
    // `fimDe` só depende de `pedir`, que não muda entre renderizações.
  }, [inicial, totalInicial]);

  const carregarMais = useCallback(async () => {
    if (ocupado.current || pedir === undefined) return;
    ocupado.current = true;
    setCarga("carregando");
    const proxima = pagina + 1;
    const r = await pedir(proxima);
    ocupado.current = false;
    if (!r.ok) {
      setCarga("erro");
      return;
    }
    const novos = r.dados.itens as readonly T[];
    const vistos = new Set(itens.map(chave));
    const lista = [...itens, ...novos.filter((item) => !vistos.has(chave(item)))];
    setItens(lista);
    setTotal(r.dados.total);
    setPagina(proxima);
    setCarga(novos.length === 0 || lista.length >= r.dados.total ? "fim" : "parado");
  }, [pedir, pagina, itens, chave]);

  useEffect(() => {
    const el = sentinela.current;
    if (el === null || carga !== "parado" || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) void carregarMais();
      },
      { rootMargin: "1200px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [carga, carregarMais]);

  return { itens, total, carga, sentinela, carregarMais };
}

"use client";

/**
 * Os cartões de uma coluna do quadro, com rolagem própria e carregamento
 * infinito (card #65).
 *
 * A coluna mostra uns três cartões de altura e rola por dentro; a página não
 * cresce com um dia cheio. O dia inteiro já vem numa leitura só, então
 * "carregar mais" aqui é desenhar mais: a coluna começa com um lote e, quando
 * o fim da lista aparece na rolagem dela, desenha o lote seguinte. Um botão
 * faz o mesmo para quem navega pelo teclado ou sem IntersectionObserver.
 *
 * No celular a coluna não tem rolagem própria (uma coluna por vez, na
 * página): o fim da lista é medido contra a janela.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Cartões desenhados por vez. */
export const LOTE_DA_COLUNA = 8;

export interface ListaDaColunaProps<T> {
  readonly itens: readonly T[];
  readonly desenhar: (item: T) => ReactNode;
  readonly rotulo: string;
  readonly lote?: number | undefined;
}

export function ListaDaColuna<T>({
  itens,
  desenhar,
  rotulo,
  lote = LOTE_DA_COLUNA,
}: ListaDaColunaProps<T>) {
  const [limite, setLimite] = useState(lote);
  const lista = useRef<HTMLDivElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const faltam = itens.length - limite;

  useEffect(() => {
    const alvo = fim.current;
    const raiz = lista.current;
    if (faltam <= 0 || alvo === null || raiz === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const rolaPorDentro = getComputedStyle(raiz).overflowY !== "visible";
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting))
          setLimite((atual) => atual + lote);
      },
      { root: rolaPorDentro ? raiz : null, rootMargin: "0px 0px 240px 0px" },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [faltam, lote]);

  return (
    <div
      ref={lista}
      className="sc-kanban__lista"
      role="region"
      aria-label={`Pedidos em ${rotulo}`}
      // Rolagem que dá para alcançar pelo teclado mesmo sem cartão focável.
      tabIndex={0}
    >
      {itens.slice(0, limite).map(desenhar)}
      {faltam > 0 ? (
        <div ref={fim} className="sc-kanban__mais">
          <button
            type="button"
            className="sc-botao sc-botao--secundaria"
            onClick={() => setLimite((atual) => atual + lote)}
          >
            {faltam <= lote
              ? `Mostrar os outros ${faltam}`
              : `Mostrar mais ${lote} de ${faltam}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

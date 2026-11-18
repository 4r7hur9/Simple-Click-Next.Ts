/**
 * Os filtros ligados, como chips que se removem (card #108, AC-10815).
 *
 * Cada chip é um LINK para o mesmo catálogo sem aquele filtro — funciona sem
 * JavaScript e o "voltar" do navegador refaz o filtro. O nome acessível diz o
 * que o toque faz ("Remover filtro Tamanho: M"), porque o "x" sozinho não diz.
 *
 * Mora no topo da lista, e não na barra: é a resposta a "por que estou vendo só
 * isto?", e o número de itens encontrados vai junto.
 */
import { IconeFechar } from "@simpleclick/ui";

import type { FiltroAtivoNaTela } from "../../lib/catalogo.ts";

export interface FiltrosAtivosProps {
  readonly ativos: readonly FiltroAtivoNaTela[];
  /** Quantos itens a lista tem com esses filtros. */
  readonly total: number;
}

export function FiltrosAtivos({ ativos, total }: FiltrosAtivosProps) {
  // Sem filtro ligado não há o que mostrar: o bloco inteiro some.
  if (ativos.length === 0) return null;

  return (
    <section className="sc-catalogo__ativos" aria-label="Filtros ligados">
      <ul className="sc-chips sc-catalogo__ativos-lista">
        {ativos.map((ativo) => (
          <li key={ativo.link}>
            <a
              className="sc-chip sc-chip--ativo"
              href={ativo.link}
              aria-label={`Remover filtro ${ativo.rotulo}`}
            >
              <span className="sc-chip__rotulo">{ativo.rotulo}</span>
              <IconeFechar aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="sc-catalogo__encontrados">
        {total} {total === 1 ? "item encontrado" : "itens encontrados"}
      </p>
    </section>
  );
}

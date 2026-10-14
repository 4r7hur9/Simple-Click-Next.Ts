"use client";

/**
 * Os produtos mais vendidos do período (T-805; AC-807).
 *
 * A LISTA CHEGA PRONTA DA API: ela já junta os líderes em quantidade e os
 * líderes em valor, ordenada por quantidade (`unirRankings`). A tela só
 * reordena o que recebeu quando o dono pede "por valor" — nenhum produto
 * entra ou sai da lista por causa da troca, e nenhuma soma é feita aqui.
 *
 * Cada linha escreve a quantidade E o valor, sempre os dois. A barra ao lado
 * é decorativa (`aria-hidden`): repete a medida em vigor para o olho
 * comparar, e o leitor de tela já recebe os números escritos.
 */
import { useId, useState } from "react";

import {
  escreverDinheiro,
  type MetricasNoContrato,
} from "../../lib/metricas.ts";
import { AlternarMedida, type MedidaDoPainel } from "./AlternarMedida.tsx";

type ProdutoMaisVendido = MetricasNoContrato["maisVendidos"][number];

export interface RankingProdutosProps {
  readonly produtos: readonly ProdutoMaisVendido[];
  /** Começa ordenado por quantidade, como o critério pede. */
  readonly medidaInicial?: MedidaDoPainel | undefined;
}

/** "1 unidade", "12 unidades". */
function escreverUnidades(quantidade: number): string {
  return quantidade === 1 ? "1 unidade" : `${quantidade} unidades`;
}

/**
 * A lista na ordem pedida. Por quantidade vale a ordem da API (que já
 * desempata pelo valor); por valor, o maior valor primeiro, desempatando
 * pela quantidade. A cópia evita mexer na resposta guardada pelo painel.
 */
export function ordenarProdutos(
  produtos: readonly ProdutoMaisVendido[],
  medida: MedidaDoPainel,
): ProdutoMaisVendido[] {
  if (medida === "quantidade") return [...produtos];
  return [...produtos].sort(
    (um, outro) =>
      outro.totalCentavos - um.totalCentavos ||
      outro.quantidade - um.quantidade,
  );
}

export function RankingProdutos({
  produtos,
  medidaInicial = "quantidade",
}: RankingProdutosProps) {
  const idDoTitulo = useId();
  const [medida, setMedida] = useState<MedidaDoPainel>(medidaInicial);
  const ordenados = ordenarProdutos(produtos, medida);
  const maior = Math.max(
    1,
    ...ordenados.map((produto) =>
      medida === "valor" ? produto.totalCentavos : produto.quantidade,
    ),
  );

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-ranking-produtos
      data-ordem={medida}
      className="sc-cartao min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={idDoTitulo} className="sc-cartao__titulo">
          Mais vendidos
        </h2>
        {produtos.length > 1 ? (
          <AlternarMedida
            rotulo="Ordenar por"
            medida={medida}
            aoTrocar={setMedida}
          />
        ) : null}
      </div>

      {produtos.length === 0 ? (
        <p data-ranking-vazio className="text-sm text-tinta-suave">
          Nenhum produto vendido neste período ainda. Quando um pedido for
          aceito, os produtos dele aparecem aqui.
        </p>
      ) : (
        <ol className="space-y-4">
          {ordenados.map((produto, posicao) => {
            const medido =
              medida === "valor" ? produto.totalCentavos : produto.quantidade;
            return (
              <li
                key={produto.produtoId ?? `apagado-${produto.nome}`}
                data-produto={produto.nome}
                className="min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3 font-medium [overflow-wrap:anywhere]">
                    <span
                      className={[
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--raio-completo)] text-xs font-semibold tabular-nums",
                        posicao === 0
                          ? "bg-primaria text-em-primaria"
                          : "bg-superficie text-tinta-suave",
                      ].join(" ")}
                    >
                      {posicao + 1}
                      <span className="sc-so-leitor">º</span>
                    </span>
                    <span className="min-w-0">{produto.nome}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    <span data-quantidade>
                      {escreverUnidades(produto.quantidade)}
                    </span>
                    {" · "}
                    <span data-valor>
                      {escreverDinheiro(produto.totalCentavos)}
                    </span>
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-2.5 w-full overflow-hidden rounded-[var(--raio-completo)] bg-superficie"
                >
                  <span
                    data-barra
                    className="block h-full rounded-[var(--raio-completo)] bg-[var(--cor-serie-dois)]"
                    style={{ width: `${(medido / maior) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

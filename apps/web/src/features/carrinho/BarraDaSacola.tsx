"use client";

/**
 * A barra fixa da sacola, no celular e no tablet (card #110, AC-11004).
 *
 * Mostra quantos itens há, o subtotal da última conferência do servidor e o
 * botão "Ver sacola", que abre a sacola como diálogo modal. Só existe com
 * itens: quem monta não a desenha com a sacola vazia.
 *
 * NÃO TEM ANIMAÇÃO e não sobe com o toque: o fluxo do pedido não se mexe. A
 * posição, a área segura do aparelho e o espaço reservado no fim da página
 * ficam no CSS (`fechamento.css`, `.sc-sacola-barra`).
 *
 * `data-sacola` é o gancho que o passo "Monte o pedido" do tutorial procura
 * (`[data-sacola]`), na barra e na coluna. Não é a classe `.sc-sacola`: essa é
 * do botão redondo antigo, e o CSS dela empurraria esta barra para o canto.
 */
import type { Ref } from "react";
import { IconeAvancar, IconePedido } from "@simpleclick/ui";

export interface BarraDaSacolaProps {
  readonly contagem: number;
  /** O total já escrito ("R$ 32,00"), ou nulo enquanto a API não respondeu. */
  readonly total: string | null;
  readonly aoAbrir: () => void;
  /** O botão "Ver sacola": quem monta leva o foco até ele quando a coluna some. */
  readonly botaoRef?: Ref<HTMLButtonElement> | undefined;
}

export function BarraDaSacola({
  contagem,
  total,
  aoAbrir,
  botaoRef,
}: BarraDaSacolaProps) {
  const itens = `${contagem} ${contagem === 1 ? "item" : "itens"}`;

  return (
    <section
      className="sc-sacola-barra"
      data-sacola="barra"
      aria-label="Sua sacola"
    >
      <p className="sc-sacola-barra__resumo">
        <IconePedido aria-hidden="true" />
        <span className="sc-sacola-barra__itens">{itens}</span>
        {total ? <span className="sc-sacola-barra__total">{total}</span> : null}
      </p>
      <button
        ref={botaoRef}
        type="button"
        className="sc-sacola-barra__abrir"
        aria-haspopup="dialog"
        // O nome começa pelo texto visível, e diz o resto a quem não enxerga.
        aria-label={`Ver sacola: ${itens}${total ? `, total ${total}` : ""}`}
        onClick={aoAbrir}
      >
        Ver sacola
        <IconeAvancar aria-hidden="true" />
      </button>
    </section>
  );
}

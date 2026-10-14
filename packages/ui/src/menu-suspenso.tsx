"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { VarianteDeBotao } from "./botao";
import { IconeSeta } from "./icones";

/**
 * Menu suspenso: um botão que abre uma lista curta de ações.
 *
 * O painel é `popover` nativo, aberto por `popovertarget`. O navegador cuida
 * do que costuma sair errado à mão: fecha com Esc e com clique fora, desenha
 * por cima de tudo sem guerra de `z-index`, e põe o painel logo depois do
 * botão na ordem do Tab. O componente só posiciona o painel embaixo do botão
 * e mantém `aria-expanded` em dia.
 *
 * NÃO é `role="menu"`: esse papel promete navegação por setas e foco preso, e
 * prometer sem entregar é pior que não prometer. É uma lista de botões e links,
 * que o Tab percorre como qualquer outra.
 */

export type ItemDoMenu = {
  id: string;
  rotulo: string;
  icone?: ReactNode | undefined;
  /** Com `href`, o item é link; sem ele, é botão que chama `aoEscolher`. */
  href?: string | undefined;
  aoEscolher?: (() => void) | undefined;
  /** Ação destrutiva, pintada na cor de erro. */
  perigo?: boolean | undefined;
  desabilitado?: boolean | undefined;
};

export type MenuSuspensoProps = {
  /** Identificador base: o painel ganha `${id}-painel`. */
  id: string;
  /** Texto do botão; com `soIcone`, vira o nome dele para o leitor de tela. */
  rotulo: string;
  itens: readonly ItemDoMenu[];
  /** Título curto no topo do painel. */
  titulo?: string | undefined;
  icone?: ReactNode | undefined;
  soIcone?: boolean | undefined;
  variante?: VarianteDeBotao | undefined;
  /** Borda do botão em que o painel se alinha. */
  alinhamento?: "inicio" | "fim" | undefined;
  className?: string | undefined;
};

/** Distância mínima entre o painel e a borda da tela, em pixels. */
const MARGEM_DA_TELA = 8;
/** Espaço entre o botão e o painel, em pixels. */
const VAO = 4;

/** Botão com painel `popover` nativo, posicionado junto dele. */
export function MenuSuspenso({
  id,
  rotulo,
  itens,
  titulo,
  icone,
  soIcone = false,
  variante = "secundaria",
  alinhamento = "inicio",
  className,
}: MenuSuspensoProps) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const idPainel = `${id}-painel`;

  function posicionar() {
    const botao = gatilho.current;
    const caixa = painel.current;
    if (botao === null || caixa === null) return;

    const ancora = botao.getBoundingClientRect();
    // Antes de abrir o painel ainda não tem tamanho: a primeira conta usa
    // zero, e a de depois de aberto acerta a largura de verdade.
    const largura = caixa.offsetWidth;
    const altura = caixa.offsetHeight;

    const desejada =
      alinhamento === "fim" ? ancora.right - largura : ancora.left;
    const esquerda = Math.max(
      MARGEM_DA_TELA,
      Math.min(desejada, window.innerWidth - largura - MARGEM_DA_TELA),
    );

    // Sem espaço embaixo, abre para cima — desde que caiba lá.
    let topo = ancora.bottom + VAO;
    const acima = ancora.top - altura - VAO;
    if (
      topo + altura > window.innerHeight - MARGEM_DA_TELA &&
      acima >= MARGEM_DA_TELA
    ) {
      topo = acima;
    }

    caixa.style.left = `${esquerda}px`;
    caixa.style.top = `${topo}px`;
  }

  // Enquanto aberto, o painel acompanha o botão na rolagem e no giro da tela.
  useEffect(() => {
    if (!aberto) return;

    posicionar();
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  });

  function fechar() {
    if (painel.current?.matches(":popover-open")) painel.current.hidePopover();
  }

  return (
    <div className={["sc-menu", className].filter(Boolean).join(" ")}>
      <button
        ref={gatilho}
        type="button"
        id={id}
        className={[
          "sc-botao",
          `sc-botao--${variante}`,
          soIcone && "sc-botao--so-icone",
        ]
          .filter(Boolean)
          .join(" ")}
        popoverTarget={idPainel}
        aria-expanded={aberto}
        aria-controls={idPainel}
      >
        {icone}
        <span className={soIcone ? "sc-so-leitor" : undefined}>{rotulo}</span>
        {!soIcone && <IconeSeta className="sc-menu__seta" />}
      </button>

      <div
        ref={painel}
        id={idPainel}
        popover="auto"
        className="sc-menu__painel"
        aria-labelledby={id}
        onBeforeToggle={(evento) => {
          if ((evento.nativeEvent as ToggleEvent).newState === "open") {
            posicionar();
          }
        }}
        onToggle={(evento) => {
          setAberto((evento.nativeEvent as ToggleEvent).newState === "open");
        }}
      >
        {titulo !== undefined && <p className="sc-menu__titulo">{titulo}</p>}
        <ul className="sc-menu__lista">
          {itens.map((item) => {
            const classe = [
              "sc-menu__item",
              item.perigo === true && "sc-menu__item--perigo",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li key={item.id}>
                {item.href !== undefined && item.desabilitado !== true ? (
                  <a className={classe} href={item.href} onClick={fechar}>
                    {item.icone}
                    {item.rotulo}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={classe}
                    disabled={item.desabilitado}
                    onClick={() => {
                      item.aoEscolher?.();
                      fechar();
                    }}
                  >
                    {item.icone}
                    {item.rotulo}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

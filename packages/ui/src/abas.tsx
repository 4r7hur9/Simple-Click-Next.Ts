"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Abas que trocam painéis na mesma página (card #104), com o padrão WAI-ARIA:
 * `tablist`, `tab` e `tabpanel`, setas esquerda e direita, Home e End. Só a
 * aba ativa entra na ordem do Tab (`tabindex` 0); as outras ficam em -1 e se
 * alcançam pelas setas. A aba muda ao receber o foco.
 *
 * Categorias da vitrine são NAVEGAÇÃO (chips com link), não abas: aba serve
 * para alternar painéis sem sair da página, como Publicações e Sobre.
 *
 * Controlada (`ativa` + `aoTrocar`) ou livre (`ativaInicial`).
 */

export type AbaDeAbas = {
  id: string;
  rotulo: string;
  /** O conteúdo do painel desta aba. */
  painel: ReactNode;
};

export type AbasProps = {
  /** Base dos ids que ligam cada aba ao seu painel. */
  id: string;
  /** Nome do conjunto de abas para o leitor de tela. */
  rotulo: string;
  abas: readonly AbaDeAbas[];
  ativa?: string | undefined;
  ativaInicial?: string | undefined;
  aoTrocar?: ((id: string) => void) | undefined;
  className?: string | undefined;
};

export function Abas({
  id,
  rotulo,
  abas,
  ativa,
  ativaInicial,
  aoTrocar,
  className,
}: AbasProps) {
  const [interna, setInterna] = useState(ativaInicial ?? abas[0]?.id);
  const pedida = ativa ?? interna;
  const atual = abas.some((aba) => aba.id === pedida) ? pedida : abas[0]?.id;
  const botoes = useRef(new Map<string, HTMLButtonElement>());

  function trocar(proxima: string, moverFoco: boolean): void {
    if (ativa === undefined) setInterna(proxima);
    aoTrocar?.(proxima);
    if (moverFoco) botoes.current.get(proxima)?.focus();
  }

  function aoApertarTecla(evento: KeyboardEvent<HTMLDivElement>): void {
    const total = abas.length;
    const indice = abas.findIndex((aba) => aba.id === atual);
    let destino: number;
    switch (evento.key) {
      case "ArrowRight":
        destino = (indice + 1) % total;
        break;
      case "ArrowLeft":
        destino = (indice - 1 + total) % total;
        break;
      case "Home":
        destino = 0;
        break;
      case "End":
        destino = total - 1;
        break;
      default:
        return;
    }
    evento.preventDefault();
    const proxima = abas[destino];
    if (proxima !== undefined) trocar(proxima.id, true);
  }

  const idDaAba = (aba: AbaDeAbas): string => `${id}-aba-${aba.id}`;
  const idDoPainel = (aba: AbaDeAbas): string => `${id}-painel-${aba.id}`;

  return (
    <div className={["sc-abas", className].filter(Boolean).join(" ")}>
      <div
        className="sc-abas__lista"
        role="tablist"
        aria-label={rotulo}
        onKeyDown={aoApertarTecla}
      >
        {abas.map((aba) => {
          const selecionada = aba.id === atual;
          return (
            <button
              key={aba.id}
              ref={(elemento) => {
                if (elemento) botoes.current.set(aba.id, elemento);
                else botoes.current.delete(aba.id);
              }}
              type="button"
              role="tab"
              id={idDaAba(aba)}
              className="sc-abas__aba"
              aria-selected={selecionada}
              aria-controls={idDoPainel(aba)}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => trocar(aba.id, false)}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={idDoPainel(aba)}
          className="sc-abas__painel"
          aria-labelledby={idDaAba(aba)}
          hidden={aba.id !== atual}
          // O painel recebe foco quando não tem nada focável dentro (padrão
          // WAI-ARIA): `0` entra na ordem natural, nunca um valor positivo.
          tabIndex={0}
        >
          {aba.painel}
        </div>
      ))}
    </div>
  );
}

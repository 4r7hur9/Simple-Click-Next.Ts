"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { NivelDeTitulo } from "./cartao";
import { IconeFechar } from "./icones";

/**
 * Gaveta: janela que sobe de baixo (celular) ou entra pela direita
 * (computador), de verdade modal (card #104).
 *
 * Abre com `showModal()`, e o navegador cuida do que costuma ser feito errado
 * à mão: o foco fica preso lá dentro, o resto da página não responde, e a
 * camada superior vem de graça. O que o navegador NÃO faz, esta peça faz:
 *
 * - Esc e o botão de fechar chamam `aoFechar`. A peça é controlada por
 *   `aberta`: quem decide se ela existe é a tela. O `cancel` do Esc é
 *   cancelado e vira um pedido de fechamento, para o estado de quem chama não
 *   ficar fora de sincronia. Se o navegador fechar o `<dialog>` por conta
 *   própria (segundo Esc em alguns navegadores), `onClose` avisa do mesmo jeito.
 * - Ao fechar, o foco volta ao botão que abriu a gaveta.
 * - O nome acessível vem do título (`aria-labelledby`).
 * - A borda de baixo respeita a área segura do aparelho.
 *
 * A classe é `sc-gaveta-modal`, e não `sc-gaveta`: `filtros.css` (painel) já
 * tem uma `.sc-gaveta` própria, que some a partir de 48rem.
 */

export type LadoDaGaveta = "baixo" | "direita";

export type GavetaProps = {
  /** Base dos ids que ligam o título à janela. */
  id: string;
  aberta: boolean;
  titulo: string;
  /** Nível do título na hierarquia da página. Uma janela modal é `h2`. */
  nivelDoTitulo?: NivelDeTitulo | undefined;
  lado?: LadoDaGaveta | undefined;
  /** Pedido de fechamento: Esc, botão de fechar ou clique no fundo. */
  aoFechar: () => void;
  rotuloDoFechar?: string | undefined;
  /** Botões de decisão, fixos no fim da gaveta. */
  rodape?: ReactNode | undefined;
  /**
   * Mostra a gaveta aberta e parada na página, sem `showModal()`. Só para o
   * catálogo `/ui`, onde ela precisa ficar à vista ao lado das outras peças.
   */
  embutida?: boolean | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
};

export function Gaveta({
  id,
  aberta,
  titulo,
  nivelDoTitulo = 2,
  lado = "baixo",
  aoFechar,
  rotuloDoFechar = "Fechar",
  rodape,
  embutida = false,
  children,
  className,
}: GavetaProps) {
  const janela = useRef<HTMLDialogElement>(null);
  const gatilho = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialogo = janela.current;
    if (!dialogo || embutida) return;

    if (aberta && !dialogo.open) {
      // O foco volta a quem estava com ele ANTES de a janela abrir.
      gatilho.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (typeof dialogo.showModal === "function") dialogo.showModal();
      else dialogo.setAttribute("open", "");
    } else if (!aberta && dialogo.open) {
      if (typeof dialogo.close === "function") dialogo.close();
      else dialogo.removeAttribute("open");
      if (gatilho.current?.isConnected) gatilho.current.focus();
      gatilho.current = null;
    }
  }, [aberta, embutida]);

  // Sai da página com a janela aberta: fecha, para não deixar a camada modal.
  useEffect(() => {
    const dialogo = janela.current;
    return () => {
      if (dialogo?.open && typeof dialogo.close === "function") dialogo.close();
    };
  }, []);

  const idDoTitulo = `${id}-titulo`;
  const Titulo = `h${nivelDoTitulo}` as const;
  const mostrar = aberta || embutida;

  return (
    <dialog
      ref={janela}
      id={id}
      className={[
        "sc-gaveta-modal",
        `sc-gaveta-modal--${lado}`,
        embutida && "sc-gaveta-modal--embutida",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={idDoTitulo}
      // Embutida: aberta só pelo atributo (como o `Dialogo`), sem modal.
      open={embutida && aberta ? true : undefined}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onClose={() => {
        // O navegador fechou sozinho e `aberta` ainda diz que está aberta.
        if (aberta && !embutida) aoFechar();
      }}
      onClick={(evento) => {
        // Clique no fundo escurecido chega ao `<dialog>` como alvo.
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      {mostrar && (
        <div className="sc-gaveta-modal__painel">
          <div className="sc-gaveta-modal__cabeca">
            <Titulo className="sc-gaveta-modal__titulo" id={idDoTitulo}>
              {titulo}
            </Titulo>
            <button
              type="button"
              className="sc-gaveta-modal__fechar"
              onClick={aoFechar}
            >
              <IconeFechar />
              <span className="sc-so-leitor">{rotuloDoFechar}</span>
            </button>
          </div>
          <div className="sc-gaveta-modal__corpo">{children}</div>
          {rodape !== undefined && (
            <div className="sc-gaveta-modal__rodape">{rodape}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

"use client";

/**
 * Uma janela de confirmação modal de verdade (card #29): o elemento nativo
 * `dialog` aberto com `showModal()`, que o navegador põe acima de tudo, com
 * fundo escurecido, foco preso e Esc para fechar.
 *
 * O `Dialogo` do `@simpleclick/ui` abre com o atributo `open`, que não é
 * modal e, dentro de uma tabela ou de um menu, fica atrás da barra lateral.
 * Esta janela usa o mesmo desenho (`sc-dialogo`), só muda a forma de abrir.
 */

import { IconeFechar } from "@simpleclick/ui";
import { useEffect, useRef, type ReactNode } from "react";

export function JanelaDeConfirmacao({
  id,
  titulo,
  aoFechar,
  rodape,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly aoFechar: () => void;
  readonly rodape: ReactNode;
  readonly children: ReactNode;
}) {
  const janela = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = janela.current;
    if (elemento === null || elemento.open) return;
    elemento.showModal();
    return () => {
      if (elemento.open) elemento.close();
    };
  }, []);

  return (
    <dialog
      ref={janela}
      id={id}
      className="sc-dialogo m-auto"
      aria-labelledby={`${id}-titulo`}
      aria-modal="true"
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
    >
      <div className="sc-dialogo__corpo">
        <div className="sc-dialogo__cabecalho">
          <h2 className="sc-dialogo__titulo" id={`${id}-titulo`}>
            {titulo}
          </h2>
          <button
            type="button"
            className="sc-dialogo__fechar"
            onClick={aoFechar}
          >
            <IconeFechar />
            <span className="sc-so-leitor">Fechar</span>
          </button>
        </div>
        {children}
        <div className="sc-dialogo__rodape">{rodape}</div>
      </div>
    </dialog>
  );
}

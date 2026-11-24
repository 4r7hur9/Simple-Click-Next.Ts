"use client";

/**
 * O menu da landing no celular: um botão que abre a lista de âncoras que, no
 * computador, ficam soltas no topo. É só navegação: não mexe na narrativa
 * (GSAP) e, sem script, a página continua inteira e rolável pelo teclado e
 * pelo gesto. Fecha com Esc, ao tocar fora e ao escolher uma seção.
 */
import { IconeFechar, IconeMenu } from "@simpleclick/ui";
import { useEffect, useId, useRef, useState } from "react";

export interface ItemDoMenu {
  readonly href: string;
  readonly rotulo: string;
}

export function MenuCompacto({ itens }: { readonly itens: readonly ItemDoMenu[] }) {
  const [aberto, setAberto] = useState(false);
  const idDaLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    }
    function aoTocar(evento: PointerEvent) {
      const alvo = evento.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocar);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="sc-lp-menu">
      <button
        ref={botao}
        type="button"
        className="sc-lp-menu__botao"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        onClick={() => setAberto((antes) => !antes)}
      >
        {aberto ? (
          <IconeFechar aria-hidden="true" />
        ) : (
          <IconeMenu aria-hidden="true" />
        )}
      </button>
      <nav
        id={idDaLista}
        className="sc-lp-menu__lista"
        aria-label="Seções da página"
        hidden={!aberto}
      >
        {itens.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setAberto(false)}>
            {item.rotulo}
          </a>
        ))}
      </nav>
    </div>
  );
}

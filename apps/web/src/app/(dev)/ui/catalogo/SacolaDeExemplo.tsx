"use client";

import { useRef, useState } from "react";

import { SacolaFlutuante } from "../../../../features/carrinho/SacolaFlutuante.tsx";

/**
 * A sacola flutuante com dados de exemplo, sem API: dá para arrastar, mover
 * pelas setas e ver o toque curto abrir (aqui, uma janela de aviso simples).
 */
export function SacolaDeExemplo() {
  const [contagem, setContagem] = useState(3);
  const [aberturas, setAberturas] = useState(0);
  const janela = useRef<HTMLDialogElement>(null);

  return (
    <>
      <p>
        <button
          type="button"
          className="sc-vitrine__aba"
          onClick={() => setContagem((antes) => antes + 1)}
        >
          Pôr mais um item
        </button>{" "}
        <span data-testid="aberturas">Aberturas: {aberturas}</span>
      </p>
      <SacolaFlutuante
        contagem={contagem}
        total={`R$ ${(contagem * 9.5).toFixed(2).replace(".", ",")}`}
        pulso={contagem}
        aoAbrir={() => {
          setAberturas((antes) => antes + 1);
          janela.current?.showModal();
        }}
      />
      <dialog ref={janela} aria-label="Carrinho de exemplo">
        <p>Aqui abriria a gaveta do carrinho.</p>
        <button type="button" onClick={() => janela.current?.close()}>
          Fechar
        </button>
      </dialog>
    </>
  );
}

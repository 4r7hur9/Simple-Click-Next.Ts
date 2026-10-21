"use client";

/**
 * A janela do painel de pedidos, no molde do carrinho: o `dialog` nativo
 * aberto com `showModal()` (foco preso, Esc fecha, fundo escurecido), faixa
 * verde no alto com o título e o X, e o corpo que rola por dentro.
 *
 * O corpo só existe enquanto a janela está aberta: o detalhe do pedido
 * carrega ao abrir, e não antes.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconeFechar } from "@simpleclick/ui";

export interface JanelaModalProps {
  readonly aberta: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  /** Botões ao lado do X (imprimir, por exemplo). */
  readonly acoes?: ReactNode;
  readonly children: ReactNode;
  readonly tamanho?: "padrao" | "estreita" | undefined;
}

export function JanelaModal({
  aberta,
  aoFechar,
  titulo,
  acoes,
  children,
  tamanho = "padrao",
}: JanelaModalProps) {
  const janela = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const elemento = janela.current;
    if (elemento === null) return;
    if (aberta && !elemento.open) {
      if (typeof elemento.showModal === "function") elemento.showModal();
      else elemento.setAttribute("open", "");
    } else if (!aberta && elemento.open) {
      if (typeof elemento.close === "function") elemento.close();
      else elemento.removeAttribute("open");
    }
  }, [aberta]);

  useEffect(() => {
    const elemento = janela.current;
    if (elemento === null) return;
    // Esc ou o fecho nativo: o estado de quem abriu acompanha.
    const aoFecharNativo = () => fechar.current();
    // Clique no fundo (o próprio `dialog`, fora da moldura) fecha.
    const aoClicar = (evento: MouseEvent) => {
      if (evento.target === elemento) fechar.current();
    };
    elemento.addEventListener("close", aoFecharNativo);
    elemento.addEventListener("click", aoClicar);
    return () => {
      elemento.removeEventListener("close", aoFecharNativo);
      elemento.removeEventListener("click", aoClicar);
    };
  }, []);

  return (
    <dialog
      ref={janela}
      className="sc-janela-pedido"
      style={
        tamanho === "estreita"
          ? { inlineSize: "min(28rem, calc(100% - 1.5rem))" }
          : undefined
      }
      aria-labelledby={idDoTitulo}
    >
      <div className="sc-janela-pedido__topo">
        <h2 className="sc-janela-pedido__titulo" id={idDoTitulo}>
          {titulo}
        </h2>
        <div className="sc-janela-pedido__acoes">
          {acoes}
          <button
            type="button"
            className="sc-janela-pedido__fechar"
            onClick={aoFechar}
          >
            <IconeFechar />
            <span className="sc-so-leitor">Fechar</span>
          </button>
        </div>
      </div>
      <div className="sc-janela-pedido__corpo">{aberta ? children : null}</div>
    </dialog>
  );
}

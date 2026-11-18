"use client";

/**
 * A sacola lateral do computador (card #110, AC-11001 a AC-11003, AC-11028).
 *
 * É uma REGIÃO, e não um diálogo: fica ao lado dos produtos sem escurecer a
 * página, o foco entra e sai dela livremente, e Esc não faz nada. Nada de
 * `role="dialog"`, `aria-modal` nem `inert` no resto da página.
 *
 * COMO ELA VEM DEPOIS DOS PRODUTOS NO HTML, o primeiro Tab da página oferece
 * "Ir para a sacola", que leva o foco ao título da coluna: sem isso, quem
 * navega por teclado passaria por todos os produtos antes de chegar nela. O
 * atalho é um nó posto no começo do `body` (um portal acrescentaria ao fim) e
 * sai junto com a coluna.
 *
 * NÃO MOSTRA DADO PESSOAL: nem telefone, nem endereço, nem chave PIX. Quem traz
 * isso é o preparo do fechamento, que só começa quando a pessoa toca em
 * "Fechar pedido" (AC-11002).
 *
 * Vazia, não desenha nada: a região do catálogo fica sem filhos e os produtos
 * ocupam o espaço dela (AC-11003).
 */
import { useEffect, useRef, type Ref } from "react";
import { Aviso, Botao, IconeAvancar, IconePedido } from "@simpleclick/ui";

import { LinhaCarrinho } from "./LinhaCarrinho.tsx";
import type { UsoDoCarrinho } from "./useCarrinho.ts";

/** O id do título da coluna: nome da região e alvo do atalho. */
export const ID_DO_TITULO_DA_COLUNA = "titulo-da-sacola-lateral";

export interface ColunaDaSacolaProps {
  readonly carrinho: UsoDoCarrinho;
  /** "Fechar pedido": segue para o fechamento. */
  readonly aoFechar: () => void;
  /** O título: quem monta leva o foco até ele (pedido do topo, troca de largura). */
  readonly tituloRef?: Ref<HTMLHeadingElement> | undefined;
}

/** Põe o atalho "Ir para a sacola" no começo do `body`, enquanto a coluna existe. */
function useAtalhoParaASacola(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const atalho = document.createElement("a");
    atalho.href = `#${ID_DO_TITULO_DA_COLUNA}`;
    atalho.className = "sc-sacola-atalho";
    atalho.textContent = "Ir para a sacola";
    atalho.addEventListener("click", (evento) => {
      evento.preventDefault();
      document.getElementById(ID_DO_TITULO_DA_COLUNA)?.focus();
    });
    document.body.prepend(atalho);
    return () => atalho.remove();
  }, [ativo]);
}

export function ColunaDaSacola({
  carrinho,
  aoFechar,
  tituloRef,
}: ColunaDaSacolaProps) {
  const { carrinho: dados, falhaAoMudar, tentarDeNovo, recarregar } = carrinho;
  const situacao =
    falhaAoMudar != null && (dados?.itens.length ?? 0) > 0
      ? "pronto"
      : carrinho.situacao;
  const vazia = situacao === "vazio";
  const quantos = dados?.totalDeItens ?? 0;
  const proprioTitulo = useRef<HTMLHeadingElement>(null);

  useAtalhoParaASacola(!vazia);

  if (vazia) return null;

  return (
    <aside
      className="sc-sacola-coluna"
      data-sacola="coluna"
      aria-labelledby={ID_DO_TITULO_DA_COLUNA}
    >
      <header className="sc-sacola-coluna__topo">
        <h2
          ref={tituloRef ?? proprioTitulo}
          className="sc-sacola-coluna__titulo"
          id={ID_DO_TITULO_DA_COLUNA}
          tabIndex={-1}
        >
          <IconePedido aria-hidden="true" />
          Sua sacola
        </h2>
        {quantos > 0 ? (
          <span className="sc-sacola-coluna__contagem">
            {quantos} {quantos === 1 ? "item" : "itens"}
          </span>
        ) : null}
      </header>

      {situacao === "carregando" ? (
        <p className="sc-sacola-coluna__estado" role="status">
          Carregando sua sacola…
        </p>
      ) : situacao === "erro" ? (
        <div className="sc-sacola-coluna__estado">
          <Aviso
            tom="erro"
            titulo="Não deu para abrir a sacola"
            acao={
              <Botao variante="secundaria" onClick={() => void recarregar()}>
                Tentar de novo
              </Botao>
            }
          >
            {carrinho.erro}
          </Aviso>
        </div>
      ) : (
        <>
          <ul className="sc-sacola-coluna__itens">
            {dados?.itens.map((item) => (
              <LinhaCarrinho
                key={item.id}
                item={item}
                aoMudarQuantidade={(itemId, quantidade) =>
                  void carrinho.mudarQuantidade(itemId, quantidade)
                }
                falha={
                  falhaAoMudar?.itemId === item.id && tentarDeNovo
                    ? { aoTentarDeNovo: () => void tentarDeNovo() }
                    : undefined
                }
              />
            ))}
          </ul>
          <footer className="sc-sacola-coluna__rodape">
            <dl className="sc-carrinho-janela__resumo">
              <div>
                <dt>Subtotal</dt>
                <dd>{dados?.total}</dd>
              </div>
              <div className="sc-carrinho-janela__resumo-entrega">
                <dt>Entrega</dt>
                {/* A taxa depende do endereço, que só existe no fechamento. */}
                <dd>calculada no fechamento</dd>
              </div>
            </dl>
            <button
              type="button"
              className="sc-carrinho-janela__acao sc-carrinho-janela__acao--larga"
              onClick={aoFechar}
            >
              Fechar pedido
              <IconeAvancar aria-hidden="true" />
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}

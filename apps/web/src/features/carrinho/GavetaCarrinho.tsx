"use client";

/**
 * A gaveta do carrinho (AC-500, AC-501, AC-502).
 *
 * Cobre os quatro estados que P-011 exige, e o vazio é o que mais importa aqui:
 * carrinho sem itens não é um erro nem uma tela em branco — é o momento em que
 * a loja tem de convidar a pessoa a voltar à vitrine (AC-501). Uma gaveta vazia
 * e muda é uma venda que termina ali.
 *
 * O estado de erro NÃO diz "seu carrinho está vazio". Um carrinho que não
 * carregou não é um carrinho vazio, e mandar a pessoa "voltar à vitrine" faria
 * ela achar que perdeu o que montou.
 */
import { Aviso, Botao, Cartao } from "@simpleclick/ui";

import { LinhaCarrinho } from "./LinhaCarrinho.tsx";
import type { UsoDoCarrinho } from "./useCarrinho.ts";

export interface GavetaCarrinhoProps {
  readonly carrinho: UsoDoCarrinho;
  /** Para onde volta quem ainda não escolheu nada. */
  readonly linkDaVitrine: string;
  readonly aoFechar?: (() => void) | undefined;
}

export function GavetaCarrinho({
  carrinho,
  linkDaVitrine,
  aoFechar,
}: GavetaCarrinhoProps) {
  const {
    situacao,
    carrinho: dados,
    erro,
    mudarQuantidade,
    recarregar,
  } = carrinho;

  if (situacao === "carregando") {
    return (
      <Cartao
        titulo="Seu carrinho"
        nivelDoTitulo={2}
        estado="carregando"
        rotuloDeEspera="Carregando seu carrinho"
        esperaComEsqueleto
      >
        <span />
      </Cartao>
    );
  }

  if (situacao === "erro") {
    return (
      <Cartao titulo="Seu carrinho" nivelDoTitulo={2}>
        <Aviso
          tom="erro"
          titulo="Não deu para abrir o carrinho"
          acao={
            <Botao variante="secundaria" onClick={() => void recarregar()}>
              Tentar de novo
            </Botao>
          }
        >
          {erro}
        </Aviso>
      </Cartao>
    );
  }

  if (situacao === "vazio") {
    return (
      <Cartao titulo="Seu carrinho" nivelDoTitulo={2}>
        <p className="sc-carrinho__vazio">
          Seu carrinho está vazio. Escolha um produto para começar.
        </p>
        <p>
          <a href={linkDaVitrine}>Ver o cardápio</a>
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao
      titulo={`Seu carrinho (${dados?.totalDeItens ?? 0})`}
      nivelDoTitulo={2}
    >
      <ul className="sc-carrinho__itens">
        {dados?.itens.map((item) => (
          <LinhaCarrinho
            key={item.id}
            item={item}
            aoMudarQuantidade={(itemId, quantidade) =>
              void mudarQuantidade(itemId, quantidade)
            }
          />
        ))}
      </ul>

      <dl className="sc-carrinho__total">
        <dt>Total</dt>
        <dd>{dados?.total}</dd>
      </dl>

      {aoFechar ? <Botao onClick={aoFechar}>Fechar pedido</Botao> : null}
    </Cartao>
  );
}

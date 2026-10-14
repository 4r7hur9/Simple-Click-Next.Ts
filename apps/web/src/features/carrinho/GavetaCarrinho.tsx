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
 *
 * É uma JANELA (raio grande, `sc-carrinho`), e não uma lista solta: o carrinho
 * é o lugar onde a pessoa confere antes de fechar, e o desenho diz isso. Nada
 * nela anima — entre o carrinho e o WhatsApp, movimento é atrito.
 */
import { Aviso, Botao, Cartao, IconePedido } from "@simpleclick/ui";

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
        className="sc-carrinho"
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
      <Cartao className="sc-carrinho" titulo="Seu carrinho" nivelDoTitulo={2}>
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
      <Cartao
        className="sc-carrinho"
        titulo="Seu carrinho"
        nivelDoTitulo={2}
        icone={<IconePedido />}
      >
        <p className="sc-carrinho__vazio">
          Seu carrinho está vazio. Escolha um produto para começar.
        </p>
        <p>
          <a
            className="sc-botao sc-botao--secundaria sc-botao--pilula"
            href={linkDaVitrine}
          >
            Ver o cardápio
          </a>
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao
      className="sc-carrinho"
      titulo={`Seu carrinho (${dados?.totalDeItens ?? 0})`}
      nivelDoTitulo={2}
      icone={<IconePedido />}
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

      {aoFechar ? (
        <Botao tamanho="grande" forma="pilula" onClick={aoFechar}>
          Fechar pedido
        </Botao>
      ) : null}
    </Cartao>
  );
}

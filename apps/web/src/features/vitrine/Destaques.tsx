/**
 * Os destaques da loja, em área própria no topo da vitrine (AC-406).
 *
 * NAVEGÁVEL COM O DEDO, SEM UMA LINHA DE SCRIPT. É uma tira que rola na
 * horizontal com `scroll-snap` do CSS — o dedo arrasta, o cartão encaixa, e o
 * teclado percorre porque cada cartão é um link. A alternativa comum é um
 * carrossel em JavaScript com setas e temporizador: pesa, exige script para
 * mostrar produto (o que o AC-415 proíbe na vitrine), e some inteiro para quem
 * bloqueia script. Aqui, sem script, a tira continua sendo uma lista rolável.
 *
 * NÃO HÁ AVANÇO AUTOMÁTICO, de propósito. Conteúdo que se move sozinho é uma
 * violação de acessibilidade conhecida quando não há como pausar, e a vitrine é
 * verificada por máquina no portão (P-012). Além disso, o destaque que troca
 * sozinho tira da mão da pessoa o produto que ela estava olhando.
 */
import type { ProdutoNaTela } from "../../lib/catalogo.ts";

import { CartaoDeProduto } from "./GradeDeProdutos.tsx";

export interface DestaquesProps {
  readonly destaques: readonly ProdutoNaTela[];
}

export function Destaques({ destaques }: DestaquesProps) {
  // Loja sem destaque não ganha uma faixa vazia com título: ela simplesmente
  // começa pelo cardápio. Seção com cabeçalho e nada dentro lê como falha.
  if (destaques.length === 0) return null;

  return (
    <section className="sc-vitrine__destaques" aria-labelledby="destaques">
      <h2 className="sc-vitrine__secao-nome" id="destaques">
        <span className="sc-marcador">Destaques</span>
      </h2>

      {/*
        `tabindex` na tira: um contêiner que rola precisa ser alcançável pelo
        teclado, senão quem não usa apontador não chega ao que está fora da
        vista. É a regra que o axe cobra como `scrollable-region-focusable`.

        E o papel de LISTA fica: quem ouve a página recebe "lista com 6 itens"
        antes de percorrer. Trocar por `role="group"` daria o rótulo e tiraria a
        contagem — que é justamente o que diz se vale a pena ouvir tudo.
      */}
      <ul
        className="sc-vitrine__tira"
        tabIndex={0}
        aria-label="Produtos em destaque"
      >
        {destaques.map((produto, indice) => (
          <li className="sc-vitrine__tira-item" key={produto.id}>
            <CartaoDeProduto produto={produto} prioridade={indice === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O serviço do carrinho que a gaveta e o carrinho flutuante usam no navegador.
 *
 * OS NOMES E OS VALORES VÊM DA CONFERÊNCIA, e não do carrinho cru. A rota do
 * carrinho devolve só identificadores e quantidades — é o que a API precisa
 * guardar. Quem mostra "Marmita executiva · R$ 40,00" precisa do preço de
 * AGORA, e esse número só a conferência contra o catálogo vivo sabe (P-006).
 *
 * Mudar a quantidade é um PATCH seguido de uma conferência nova: a API devolve
 * o carrinho cru, e a tela precisa dos valores escritos.
 */
import {
  conferirCarrinho,
  mudarQuantidadeNoCarrinho,
  type ConferenciaNaTela,
} from "../../lib/carrinho-do-navegador.ts";
import { escreverDinheiro } from "../../lib/produto.ts";

import type { CarrinhoNaTela, ServicoDoCarrinho } from "./useCarrinho.ts";

/** Traduz a conferência para o que a gaveta desenha. */
export function carrinhoDaConferencia(
  conferencia: ConferenciaNaTela,
): CarrinhoNaTela {
  const itens = conferencia.itens.map((item) => ({
    id: item.itemId,
    nome: item.nome,
    quantidade: item.quantidade,
    precoUnitario: escreverDinheiro(item.precoUnitarioCentavos),
    totalDaLinha: escreverDinheiro(item.totalDaLinhaCentavos),
  }));

  return {
    itens,
    totalDeItens: itens.reduce((soma, item) => soma + item.quantidade, 0),
    total: escreverDinheiro(conferencia.subtotalCentavos),
  };
}

/**
 * O serviço de uma loja. `buscar` é trocável para a prova responder sem rede.
 */
export function servicoDoCarrinhoNoNavegador(
  apelidoDaLoja: string,
  buscar: typeof fetch = fetch,
): ServicoDoCarrinho {
  async function ver(): Promise<CarrinhoNaTela> {
    const resultado = await conferirCarrinho(apelidoDaLoja, null, buscar);
    if (resultado.estado !== "conferido") {
      throw new Error(resultado.motivo);
    }
    return carrinhoDaConferencia(resultado.conferencia);
  }

  return {
    ver,
    async mudarQuantidade(itemId, quantidade) {
      const resultado = await mudarQuantidadeNoCarrinho(
        apelidoDaLoja,
        itemId,
        quantidade,
        buscar,
      );
      if (resultado.estado !== "visto") {
        throw new Error(resultado.motivo);
      }
      return ver();
    },
  };
}

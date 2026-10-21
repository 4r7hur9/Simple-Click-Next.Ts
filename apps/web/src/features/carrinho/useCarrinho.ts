"use client";

/**
 * Estado do carrinho na tela (AC-500, AC-501, AC-502).
 *
 * O CARRINHO NÃO MORA AQUI. Ele mora no banco, e este gancho é só a cópia de
 * trabalho da tela mais os quatro estados que toda tela que carrega dados deve
 * ter (P-011). Guardar o carrinho no navegador pareceria mais simples e traria
 * duas mentiras: o total mudaria conforme o preço que o navegador tivesse
 * guardado, e o dono nunca saberia quantas pessoas montaram carrinho e não
 * fecharam.
 *
 * O serviço chega por parâmetro em vez de ser importado. Não é para o teste:
 * é a fronteira — esta camada não pode falar com o servidor direto, e receber
 * quem fala mantém o gancho sem saber se por trás há rede, memória ou fila.
 */
import { useCallback, useEffect, useState } from "react";

/** Uma escolha guardada no item. */
export interface OpcaoNaTela {
  readonly grupoNome: string;
  readonly opcaoNome: string;
  /** O acréscimo já escrito ("+ R$ 3,00"); ausente quando não muda o preço. */
  readonly acrescimo?: string | null;
  /** Quantas vezes, quando o grupo deixa repetir. */
  readonly quantidade?: number;
}

/** Um item como a gaveta o mostra, já com os valores do servidor. */
export interface ItemNaTela {
  readonly id: string;
  readonly nome: string;
  readonly variacao?: string | null;
  readonly quantidade: number;
  readonly precoUnitario: string;
  readonly totalDaLinha: string;
  readonly observacao?: string | null;
  readonly opcoes?: readonly OpcaoNaTela[];
  /** A descrição curta do produto, do catálogo; ausente quando não há. */
  readonly descricao?: string | null;
  /**
   * O preço de varejo por unidade, já escrito, quando o cobrado saiu menor
   * (faixa de atacado ou promoção): vai riscado ao lado (card #57).
   */
  readonly precoDeVarejo?: string | null;
  /** O aviso do atacado: "Faltam 4 peças para o próximo desconto". */
  readonly avisoDoAtacado?: string | null;
  /** A faixa que já valeu: "Atacado: 5% de desconto a partir de 10 peças". */
  readonly faixaDoAtacado?: string | null;
}

/** O carrinho inteiro, já formatado pelo servidor. */
export interface CarrinhoNaTela {
  readonly itens: readonly ItemNaTela[];
  readonly totalDeItens: number;
  readonly total: string;
}

/** Quem fala com o servidor. A tela não conhece o caminho. */
export interface ServicoDoCarrinho {
  ver(): Promise<CarrinhoNaTela>;
  mudarQuantidade(itemId: string, quantidade: number): Promise<CarrinhoNaTela>;
}

/** Os quatro estados de tela, como P-011 exige. */
export type SituacaoDoCarrinho = "carregando" | "pronto" | "vazio" | "erro";

export interface UsoDoCarrinho {
  readonly situacao: SituacaoDoCarrinho;
  readonly carrinho: CarrinhoNaTela | null;
  readonly erro: string | null;
  mudarQuantidade(itemId: string, quantidade: number): Promise<void>;
  recarregar(): Promise<void>;
}

const CARRINHO_VAZIO: CarrinhoNaTela = {
  itens: [],
  totalDeItens: 0,
  total: "R$ 0,00",
};

function situacaoDe(carrinho: CarrinhoNaTela | null): SituacaoDoCarrinho {
  if (carrinho === null) return "carregando";
  return carrinho.itens.length === 0 ? "vazio" : "pronto";
}

export function useCarrinho(servico: ServicoDoCarrinho): UsoDoCarrinho {
  const [carrinho, setCarrinho] = useState<CarrinhoNaTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setErro(null);
      setCarrinho(await servico.ver());
    } catch {
      // A mensagem é a mesma para qualquer falha de propósito: o detalhe
      // técnico não ajuda quem está comprando, e o caminho de saída é um só.
      setErro("Não conseguimos carregar seu carrinho. Tente de novo.");
    }
  }, [servico]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const mudarQuantidade = useCallback(
    async (itemId: string, quantidade: number) => {
      try {
        setErro(null);
        setCarrinho(await servico.mudarQuantidade(itemId, quantidade));
      } catch {
        setErro("Não conseguimos atualizar seu carrinho. Tente de novo.");
      }
    },
    [servico],
  );

  return {
    // Erro tem precedência sobre vazio: um carrinho que não carregou não é um
    // carrinho vazio, e convidar a pessoa a "voltar à vitrine" quando o que
    // houve foi falha faria ela perder o que já tinha montado.
    situacao: erro !== null ? "erro" : situacaoDe(carrinho),
    carrinho: carrinho ?? (erro !== null ? CARRINHO_VAZIO : null),
    erro,
    mudarQuantidade,
    recarregar,
  };
}

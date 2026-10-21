/**
 * O vocabulário do menu lateral: o que é um item, o que é uma seção e quando
 * um item é "a página atual". Sem React de tela aqui — só dados e a regra do
 * item ativo, para o painel e a administração usarem do mesmo jeito.
 */
import type { Icone } from "@simpleclick/ui";
import type { ReactNode } from "react";

export interface ItemDoMenu {
  readonly rotulo: string;
  readonly href: string;
  readonly icone: Icone;
  /** Ativo só no endereço exato (a página inicial, que é prefixo de todas). */
  readonly exato?: boolean;
  /**
   * Endereços que começam com estes prefixos NÃO contam como este item.
   * "Pedidos" não fica verde em "Novo pedido", que tem item próprio.
   */
  readonly excluir?: readonly string[];
  /** Abre numa aba nova (a vitrine da loja, que não é parte do painel). */
  readonly novaAba?: boolean;
  /** Quantos itens pedem atenção (pedidos novos). Zero ou ausente: sem selo. */
  readonly contador?: number;
}

/**
 * Um bloco do menu com título. TODOS os itens ficam visíveis o tempo todo:
 * a seção organiza, não esconde.
 */
export interface SecaoDoMenu {
  /** Rótulo pequeno em caixa alta. Sem título, a seção é só uma lista. */
  readonly titulo?: string;
  readonly itens: readonly ItemDoMenu[];
  /** Algo antes dos itens (por exemplo, quem está logado). */
  readonly antes?: ReactNode;
  /** Algo depois dos itens (por exemplo, o botão Sair). */
  readonly depois?: ReactNode;
}

export function bateCom(
  caminho: string | null,
  href: string,
  exato = false,
): boolean {
  if (caminho === null) return false;
  if (exato) return caminho === href;
  return caminho === href || caminho.startsWith(`${href}/`);
}

/** O item é a página atual? */
export function itemEstaAtivo(
  caminho: string | null,
  item: ItemDoMenu,
): boolean {
  if (caminho === null) return false;
  if (item.novaAba === true) return false;
  const excluido = (item.excluir ?? []).some((prefixo) =>
    bateCom(caminho, prefixo),
  );
  return !excluido && bateCom(caminho, item.href, item.exato);
}

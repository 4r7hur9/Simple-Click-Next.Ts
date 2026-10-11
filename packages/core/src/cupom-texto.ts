/**
 * Gerador do texto do pedido para o WhatsApp (AC-519, AC-521, AC-522).
 *
 * Função PURA: recebe o pedido já montado e devolve o texto. Não conhece
 * banco, HTTP nem framework — é o que a tabela de fronteiras de
 * `.spec/design/arquitetura.md` exige de `packages/core`, e é o que permite
 * provar o texto por comparação, sem serviço nenhum no ar.
 *
 * A direção da mensagem está decidida em `.spec/design/decisoes.md`
 * (17/08/2026): quem envia é o CLIENTE, para o número da loja. Por isso o
 * texto fala na voz de quem pediu ("Acompanhe seu pedido") e traz os dados de
 * contato do cliente — o dono precisa deles para responder.
 *
 * Quem monta o endereço `https://wa.me/...?text=...` é `apps/web` (T-508).
 * Aqui mora só o CONTEÚDO, mais a medida do tamanho que aquele endereço vai
 * ter (`medirComprimentoNoLink`), para que as duas pontas usem a mesma régua.
 *
 * Porta de entrada: os tipos do pedido moram em `pedido-descrito.ts`, a
 * formatação em `cupom-texto-formato.ts` e os blocos em
 * `cupom-texto-blocos.ts`; daqui eles são reexportados para os imports
 * antigos continuarem.
 */

import {
  ErroDeTextoDoPedido,
  LIMITE_PADRAO_DO_LINK,
  medirComprimentoNoLink,
} from "./cupom-texto-formato.ts";
import { montarTexto } from "./cupom-texto-blocos.ts";
import type {
  ClienteDoPedido,
  FormaDeEntrega,
  ItemDoPedido,
  PagamentoDoPedido,
  TaxaDeEntrega,
} from "./pedido-descrito.ts";

export {
  ErroDeTextoDoPedido,
  LIMITE_PADRAO_DO_LINK,
  medirComprimentoNoLink,
} from "./cupom-texto-formato.ts";
export type {
  AcaoDaOpcao,
  ClienteDoPedido,
  EnderecoDeEntrega,
  FormaDeEntrega,
  FormaDePagamento,
  ItemDoPedido,
  ModoDaTaxaDeEntrega,
  OpcaoDoItem,
  PagamentoDoPedido,
  TaxaDeEntrega,
} from "./pedido-descrito.ts";

/**
 * O pedido, do jeito que o gerador precisa dele.
 *
 * Repare no que NÃO está aqui: identificador de cliente, de loja ou de
 * qualquer linha do banco. O gerador não distingue pedido de convidado de
 * pedido de cliente cadastrado porque, para o texto, não há diferença — o que
 * o dono precisa ler é nome, telefone e o que foi pedido (AC-518).
 */
export interface PedidoParaTexto {
  readonly codigo: string;
  readonly cliente: ClienteDoPedido;
  readonly itens: readonly ItemDoPedido[];
  readonly observacao?: string | null;
  readonly entrega: FormaDeEntrega;
  readonly taxaDeEntrega: TaxaDeEntrega;
  readonly pagamento: PagamentoDoPedido;
  readonly subtotalEmCentavos: number;
  readonly descontoEmCentavos?: number;
  readonly descontoDeRetiradaEmCentavos?: number;
  readonly totalEmCentavos: number;
  readonly linkDeAcompanhamento: string;
}

/** O texto gerado, mais o que foi preciso fazer para ele caber no link. */
export interface TextoDoPedido {
  /** O texto pronto para ir no endereço que abre a conversa. */
  readonly texto: string;
  /** Tamanho que este texto ocupa depois de codificado no endereço. */
  readonly comprimentoNoLink: number;
  /** Verdadeiro quando alguma coisa foi encurtada para caber. */
  readonly encurtado: boolean;
  /** Quantos itens viraram resumo em vez de aparecer linha a linha. */
  readonly itensOmitidos: number;
  /** Verdadeiro quando as opções e observações por item foram suprimidas. */
  readonly detalhesDosItensOmitidos: boolean;
  /** Falso quando nem o essencial coube — nunca corta, apenas avisa. */
  readonly dentroDoLimite: boolean;
}

/** Ajustes do gerador. */
export interface OpcoesDoTexto {
  /** Tamanho máximo, já codificado, do texto dentro do endereço. */
  readonly limiteDoLink?: number;
}

/**
 * Maior quantidade de itens listados que ainda cabe no limite.
 *
 * Busca binária, e não varredura: a montagem é barata, mas um pedido de
 * centenas de linhas montado uma vez por item viraria trabalho quadrático
 * dentro do fechamento do pedido, que é o caminho mais quente do sistema.
 *
 * A busca só é válida porque a faixa examinada vai de 0 até `total - 1`, onde
 * a linha de resumo está SEMPRE presente: aí cada item a mais só faz o texto
 * crescer, e a resposta é monótona. O caso `total` (lista inteira, sem resumo)
 * é decidido antes, fora daqui — incluí-lo quebraria a monotonia, porque
 * listar o último item pode custar menos do que a linha de resumo dele.
 */
function maiorQuantidadeQueCabe(
  pedido: PedidoParaTexto,
  limite: number,
): number {
  let melhor = 0;
  let baixo = 0;
  let alto = pedido.itens.length - 1;
  while (baixo <= alto) {
    const meio = Math.floor((baixo + alto) / 2);
    const texto = montarTexto(pedido, {
      detalharItens: false,
      itensExibidos: meio,
    });
    if (medirComprimentoNoLink(texto) <= limite) {
      melhor = meio;
      baixo = meio + 1;
    } else {
      alto = meio - 1;
    }
  }
  return melhor;
}

/** Empacota o texto com a medida e o que foi preciso encurtar. */
function resultado(
  texto: string,
  limite: number,
  itensOmitidos: number,
  detalhesDosItensOmitidos: boolean,
): TextoDoPedido {
  const comprimentoNoLink = medirComprimentoNoLink(texto);
  return {
    texto,
    comprimentoNoLink,
    encurtado: itensOmitidos > 0 || detalhesDosItensOmitidos,
    itensOmitidos,
    detalhesDosItensOmitidos,
    dentroDoLimite: comprimentoNoLink <= limite,
  };
}

/**
 * Gera o texto do pedido para o WhatsApp.
 *
 * Quando o pedido não cabe no endereço que abre a conversa, o texto é
 * encurtado em degraus, do menos ao mais custoso para quem lê (AC-521):
 *
 * 1. lista inteira, cada item com as suas escolhas e a sua observação;
 * 2. lista inteira, uma linha por item — some o detalhe, não o item;
 * 3. os primeiros itens que couberem, mais uma linha de resumo dizendo
 *    quantos ficaram de fora e quanto somam.
 *
 * Em nenhum degrau existe corte por quantidade de caracteres: a unidade que
 * sai é sempre a linha inteira, e por isso nunca sobra meia palavra nem meio
 * valor. O essencial — número do pedido, contato, entrega, pagamento, total e
 * o link — não entra na negociação e permanece nos três degraus. Se nem assim
 * couber, o texto volta completo com `dentroDoLimite: false`: mutilar o
 * endereço do cliente para ganhar caractere seria trocar um problema visível
 * (mensagem longa) por um invisível (entrega no lugar errado). A tela decide o
 * que fazer com o aviso — há o caminho de copiar o texto (AC-523).
 */
export function gerarTextoDoPedido(
  pedido: PedidoParaTexto,
  opcoes: OpcoesDoTexto = {},
): TextoDoPedido {
  if (pedido.itens.length === 0) {
    throw new ErroDeTextoDoPedido("pedido sem itens não gera texto");
  }
  const limite = opcoes.limiteDoLink ?? LIMITE_PADRAO_DO_LINK;
  const total = pedido.itens.length;

  const completo = montarTexto(pedido, {
    detalharItens: true,
    itensExibidos: total,
  });
  if (medirComprimentoNoLink(completo) <= limite) {
    return resultado(completo, limite, 0, false);
  }

  const semDetalhe = montarTexto(pedido, {
    detalharItens: false,
    itensExibidos: total,
  });
  if (medirComprimentoNoLink(semDetalhe) <= limite) {
    return resultado(semDetalhe, limite, 0, true);
  }

  const exibidos = maiorQuantidadeQueCabe(pedido, limite);
  const encurtado = montarTexto(pedido, {
    detalharItens: false,
    itensExibidos: exibidos,
  });
  return resultado(encurtado, limite, total - exibidos, true);
}

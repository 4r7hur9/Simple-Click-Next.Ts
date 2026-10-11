/**
 * O pedido descrito para quem o lê: itens, escolhas, entrega, taxa, pagamento e
 * contato. O texto do WhatsApp e o cupom impresso usam ESTES tipos, para a
 * mensagem e o papel não divergirem em silêncio.
 */

/**
 * Modo da taxa de entrega — união discriminada, e não `number | null`.
 *
 * Os valores são os mesmos que `orders.delivery_fee_mode` guarda, para que a
 * borda da API não precise traduzir duas vezes e não exista um segundo
 * vocabulário divergindo em silêncio do que está no banco.
 */
export type ModoDaTaxaDeEntrega =
  "VALUE" | "FREE" | "ASK" | "OUTSIDE_AREA" | "NEIGHBORHOOD_NOT_FOUND";

/** Forma de pagamento, como `orders.payment_method` a persiste. */
export type FormaDePagamento = "PIX" | "CASH" | "CARD_ON_DELIVERY" | "OTHER";

/** O que a escolha fez com a opção: acrescentou ou tirou ("sem cebola"). */
export type AcaoDaOpcao = "ADD" | "REMOVE";

/** Escolha registrada em um item, já com os nomes por extenso do momento. */
export interface OpcaoDoItem {
  readonly grupo: string;
  readonly opcao: string;
  readonly acao?: AcaoDaOpcao;
  readonly quantidade?: number;
  readonly acrescimoEmCentavos?: number;
}

/** Item comprado, com os valores já congelados pelo servidor (P-006). */
export interface ItemDoPedido {
  readonly nome: string;
  readonly variacao?: string | null;
  readonly quantidade: number;
  readonly totalDaLinhaEmCentavos: number;
  readonly opcoes?: readonly OpcaoDoItem[];
  readonly observacao?: string | null;
}

/** Endereço de entrega. Só existe quando a forma de entrega é `DELIVERY`. */
export interface EnderecoDeEntrega {
  readonly logradouro: string;
  readonly numero?: string | null;
  readonly complemento?: string | null;
  readonly bairro?: string | null;
  readonly cidade?: string | null;
  readonly uf?: string | null;
  readonly cep?: string | null;
  readonly pontoDeReferencia?: string | null;
  readonly destinatario?: string | null;
}

/**
 * Forma de entrega. Retirada não tem endereço, e o tipo diz isso: sem união
 * discriminada seria possível montar um pedido de retirada carregando
 * endereço, e o texto sairia com um bloco que não devia existir.
 */
export type FormaDeEntrega =
  | { readonly tipo: "PICKUP" }
  | { readonly tipo: "DELIVERY"; readonly endereco: EnderecoDeEntrega };

/** Taxa de entrega com o nome que o dono deu a ela (AC-507). */
export interface TaxaDeEntrega {
  readonly modo: ModoDaTaxaDeEntrega;
  readonly valorEmCentavos: number;
  readonly nome?: string | null;
}

/** Pagamento combinado — a versão 1 nunca cobra de verdade (AC-513). */
export interface PagamentoDoPedido {
  readonly forma: FormaDePagamento;
  readonly chavePix?: string | null;
  readonly tipoDaChavePix?: string | null;
  readonly nomeDoRecebedor?: string | null;
  readonly trocoParaEmCentavos?: number | null;
}

/** Contato do pedido. Convidado (AC-518) chega aqui igual a cliente com conta. */
export interface ClienteDoPedido {
  readonly nome: string;
  readonly telefone: string;
}

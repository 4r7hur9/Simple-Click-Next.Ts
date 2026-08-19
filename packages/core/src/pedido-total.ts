/**
 * Conferência do carrinho contra o catálogo, antes de fechar (AC-503, AC-504).
 *
 * O QUE ESTA PEÇA DECIDE. Entre o momento em que a pessoa montou o carrinho e o
 * momento em que ela fecha, o mundo muda: o dono corrige um preço, esgota um
 * produto, tira um item do catálogo. Nada disso é erro — é a loja funcionando.
 * O erro seria cobrar um valor diferente do que foi mostrado, ou entregar um
 * produto que não existe mais.
 *
 * O PREÇO SAI DAQUI, e nunca do que o cliente enviou (P-006). O valor que veio
 * da tela entra só como referência para dizer o que mudou; ele jamais compõe o
 * total. Ler preço do que o navegador manda foi o erro da primeira versão deste
 * produto, e é o que permite a alguém fechar um pedido de mil reais por um.
 *
 * Função PURA: quem leu o catálogo do banco passa o resultado pronto.
 */

/** Um item como o carrinho o guarda, com o preço que a tela mostrou. */
export interface ItemParaConferir {
  readonly itemId: string;
  readonly produtoId: string;
  readonly quantidade: number;
  /** O que a tela mostrou da última vez. Só serve para dizer o que mudou. */
  readonly precoVistoEmCentavos?: number | null;
}

/** O produto como o catálogo o descreve AGORA. */
export interface ProdutoAgora {
  readonly produtoId: string;
  readonly nome: string;
  readonly precoEmCentavos: number;
  readonly disponivel: boolean;
}

export type TipoDeMudanca =
  "PRECO_SUBIU" | "PRECO_CAIU" | "INDISPONIVEL" | "SAIU_DO_CATALOGO";

/** Uma mudança que a pessoa precisa ver antes de confirmar. */
export interface MudancaNoCarrinho {
  readonly itemId: string;
  readonly nome: string;
  readonly tipo: TipoDeMudanca;
  readonly deEmCentavos?: number;
  readonly paraEmCentavos?: number;
  /** Frase pronta para a tela, no lugar de um código que ninguém entende. */
  readonly explicacao: string;
}

/** Um item que segue para o pedido, já com o preço do servidor. */
export interface ItemPrecificado {
  readonly itemId: string;
  readonly produtoId: string;
  readonly nome: string;
  readonly quantidade: number;
  readonly precoUnitarioEmCentavos: number;
  readonly totalDaLinhaEmCentavos: number;
}

/** O veredito da conferência. */
export interface Conferencia {
  readonly mudancas: readonly MudancaNoCarrinho[];
  /** Verdadeiro quando alguma coisa mudou e a pessoa precisa confirmar. */
  readonly precisaConfirmar: boolean;
  readonly itensQueSeguem: readonly ItemPrecificado[];
  /** Soma das linhas que seguem, calculada AQUI e só aqui. */
  readonly subtotalEmCentavos: number;
  /**
   * O total que o cliente enviou, quando enviou. Guardado só para registrar a
   * divergência — nunca entra na conta (AC-504).
   */
  readonly totalQueOClienteEnviouEmCentavos?: number | null;
  /** Verdadeiro quando o que o cliente enviou não bate com o do servidor. */
  readonly houveDivergencia: boolean;
}

function emReais(centavos: number): string {
  const inteiro = Math.trunc(Math.abs(centavos) / 100);
  const resto = String(Math.abs(centavos) % 100).padStart(2, "0");
  const comPonto = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${centavos < 0 ? "-" : ""}R$ ${comPonto},${resto}`;
}

/** Descreve a mudança de preço com os dois valores, e não só "mudou". */
function mudancaDePreco(
  item: ItemParaConferir,
  produto: ProdutoAgora,
): MudancaNoCarrinho | null {
  const visto = item.precoVistoEmCentavos;
  if (visto === null || visto === undefined) return null;
  if (visto === produto.precoEmCentavos) return null;

  const subiu = produto.precoEmCentavos > visto;
  return {
    itemId: item.itemId,
    nome: produto.nome,
    tipo: subiu ? "PRECO_SUBIU" : "PRECO_CAIU",
    deEmCentavos: visto,
    paraEmCentavos: produto.precoEmCentavos,
    explicacao: `${produto.nome} ${subiu ? "subiu" : "baixou"} de ${emReais(visto)} para ${emReais(produto.precoEmCentavos)}.`,
  };
}

/**
 * Confere o carrinho contra o catálogo e devolve o que mudou.
 *
 * Item indisponível ou que saiu do catálogo NÃO segue para o pedido: seguir
 * faria a cozinha receber um pedido que ela não tem como preparar, e o cliente
 * descobrir isso pelo telefone.
 *
 * Preço que CAIU também é mudança e também pede confirmação. Parece exagero —
 * é boa notícia. Mas o total que a pessoa vai pagar deixou de ser o que ela
 * viu, e a tela que muda o número sem avisar ensina o cliente a desconfiar do
 * número.
 */
export function conferirCarrinho(
  itens: readonly ItemParaConferir[],
  catalogo: readonly ProdutoAgora[],
  totalQueOClienteEnviouEmCentavos?: number | null,
): Conferencia {
  const porProduto = new Map(catalogo.map((p) => [p.produtoId, p]));
  const mudancas: MudancaNoCarrinho[] = [];
  const itensQueSeguem: ItemPrecificado[] = [];

  for (const item of itens) {
    const produto = porProduto.get(item.produtoId);

    if (produto === undefined) {
      // O nome fica genérico porque não há de onde tirá-lo: o produto sumiu do
      // que esta requisição enxerga, e o carrinho guarda referência viva, não
      // cópia. Quem SABE o nome é a tela, que já está mostrando o carrinho — e
      // é ela quem substitui o genérico pelo nome, casando por `itemId`.
      mudancas.push({
        itemId: item.itemId,
        nome: "Um item do seu carrinho",
        tipo: "SAIU_DO_CATALOGO",
        explicacao:
          "Um item do seu carrinho não está mais no cardápio e foi retirado.",
      });
      continue;
    }

    if (!produto.disponivel) {
      mudancas.push({
        itemId: item.itemId,
        nome: produto.nome,
        tipo: "INDISPONIVEL",
        explicacao: `${produto.nome} acabou por enquanto e foi retirado do seu carrinho.`,
      });
      continue;
    }

    const doPreco = mudancaDePreco(item, produto);
    if (doPreco !== null) mudancas.push(doPreco);

    itensQueSeguem.push({
      itemId: item.itemId,
      produtoId: produto.produtoId,
      nome: produto.nome,
      quantidade: item.quantidade,
      // O preço é o do CATÁLOGO. O que veio da tela não entra na conta.
      precoUnitarioEmCentavos: produto.precoEmCentavos,
      totalDaLinhaEmCentavos: produto.precoEmCentavos * item.quantidade,
    });
  }

  const subtotalEmCentavos = itensQueSeguem.reduce(
    (soma, item) => soma + item.totalDaLinhaEmCentavos,
    0,
  );

  const enviado = totalQueOClienteEnviouEmCentavos;
  return {
    mudancas,
    precisaConfirmar: mudancas.length > 0,
    itensQueSeguem,
    subtotalEmCentavos,
    totalQueOClienteEnviouEmCentavos: enviado ?? null,
    houveDivergencia:
      enviado !== null &&
      enviado !== undefined &&
      enviado !== subtotalEmCentavos,
  };
}

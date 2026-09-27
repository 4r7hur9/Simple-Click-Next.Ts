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
import { multiplicarCentavos, somarCentavos } from "./dinheiro.ts";

/** Um item como o carrinho o guarda, com o preço que a tela mostrou. */
export interface ItemParaConferir {
  readonly itemId: string;
  readonly produtoId: string;
  readonly quantidade: number;
  /** O que a tela mostrou da última vez. Só serve para dizer o que mudou. */
  readonly precoVistoEmCentavos?: number | null;
  /**
   * A soma dos acréscimos das opções escolhidas, POR UNIDADE, lida do catálogo
   * AGORA — e não copiada do carrinho.
   *
   * Sem isto o bacon de R$ 3,00 sairia de graça: o carrinho guarda a escolha, o
   * preço dela mora em `option_items`, e conferir só o preço do produto cobra
   * menos do que a pessoa viu. Entrou quando o carrinho passou a receber itens
   * com opção de verdade (T-511); antes, nenhum caminho chegava aqui com uma.
   */
  readonly acrescimosEmCentavos?: number;
  /**
   * O preço base DESTE item, quando ele não é o do produto.
   *
   * Existe por causa da VARIANTE: pizza P e G são o mesmo produto com preços
   * diferentes, e o preço mora na variante. Duas linhas do carrinho podem ser
   * o mesmo produto com preços legítimos diferentes — o que uma tabela por
   * produto não consegue expressar.
   *
   * `undefined` significa "use o do produto". `null` significa "o servidor
   * procurou e não achou preço" — a variante escolhida sumiu do cardápio —, e
   * o item é retirado com explicação em vez de seguir de graça.
   */
  readonly precoBaseEmCentavos?: number | null;
  /**
   * Qual preço da VARIANTE foi usado e por quê, quando o preço é o dela.
   *
   * Acompanha `precoBaseEmCentavos` pelo mesmo motivo: o preço mora na
   * variante, e a explicação de um atacado da variante G mora nela também.
   */
  readonly precoAplicado?: ExplicacaoDoPreco | null;
}

/**
 * Qual preço foi usado e por quê (AC-310).
 *
 * Existe porque o carrinho que cobra menos do que a vitrine anunciava precisa
 * se explicar: "Atacado: preço a partir de 6 unidades" transforma o que
 * pareceria erro em vantagem que a pessoa entende.
 */
export interface ExplicacaoDoPreco {
  /** O nome do preço, como o dono o chamou. */
  readonly rotulo: string;
  /** A frase pronta para a tela. */
  readonly motivo: string;
}

/** O produto como o catálogo o descreve AGORA. */
export interface ProdutoAgora {
  readonly produtoId: string;
  readonly nome: string;
  /**
   * NULO quando não dá para saber o preço: produto sem preço publicado, ou
   * produto com variantes cuja variante escolhida sumiu.
   *
   * Nulo NÃO é zero, e a diferença é dinheiro. Tratar preço desconhecido como
   * zero deixa o item seguir de graça — e o pedido sai, e a cozinha prepara.
   * Nulo faz o item ser retirado com explicação, que é o comportamento certo
   * quando o sistema não sabe quanto cobrar.
   */
  readonly precoEmCentavos: number | null;
  readonly disponivel: boolean;
  /** Qual preço do produto foi usado e por quê, quando não é o normal. */
  readonly precoAplicado?: ExplicacaoDoPreco | null;
}

export type TipoDeMudanca =
  | "PRECO_SUBIU"
  | "PRECO_CAIU"
  | "INDISPONIVEL"
  | "SAIU_DO_CATALOGO"
  | "SEM_PRECO";

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
  /** Preço de uma unidade, JÁ com os acréscimos das opções. */
  readonly precoUnitarioEmCentavos: number;
  /**
   * Quanto do unitário veio das OPÇÕES.
   *
   * Sai separado porque o PEDIDO guarda os dois: o preço do produto e o que as
   * escolhas somaram. É o que permite o cupom impresso mostrar "X-Salada
   * R$ 20,00 / + Bacon R$ 3,00" em vez de um total sem explicação — e é o que
   * o dono confere quando o cliente reclama do valor.
   */
  readonly acrescimosEmCentavos: number;
  readonly totalDaLinhaEmCentavos: number;
  /** Qual preço foi usado e por quê; nulo quando é o preço normal (AC-310). */
  readonly precoAplicado: ExplicacaoDoPreco | null;
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
  unitarioAgora: number,
): MudancaNoCarrinho | null {
  const visto = item.precoVistoEmCentavos;
  if (visto === null || visto === undefined) return null;
  // A comparação é com o unitário COM os acréscimos, porque é isso que a tela
  // mostrou. Comparar só o preço do produto acusaria mudança onde não houve
  // (ou calaria a mudança do preço de um adicional).
  if (visto === unitarioAgora) return null;

  const subiu = unitarioAgora > visto;
  return {
    itemId: item.itemId,
    nome: produto.nome,
    tipo: subiu ? "PRECO_SUBIU" : "PRECO_CAIU",
    deEmCentavos: visto,
    paraEmCentavos: unitarioAgora,
    explicacao: `${produto.nome} ${subiu ? "subiu" : "baixou"} de ${emReais(visto)} para ${emReais(unitarioAgora)}.`,
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

    const base =
      item.precoBaseEmCentavos === undefined
        ? produto.precoEmCentavos
        : item.precoBaseEmCentavos;

    if (base === null) {
      // Preço desconhecido NÃO segue por zero. Quem esqueceu de precificar não
      // vende por engano, e a variante que sumiu não sai de graça.
      mudancas.push({
        itemId: item.itemId,
        nome: produto.nome,
        tipo: "SEM_PRECO",
        explicacao: `${produto.nome} está sem preço no cardápio e foi retirado do seu carrinho.`,
      });
      continue;
    }

    // O preço é o do CATÁLOGO, e o acréscimo também: os dois são lidos agora.
    // O que veio da tela não entra na conta (P-006).
    const unitario = base + (item.acrescimosEmCentavos ?? 0);

    const doPreco = mudancaDePreco(item, produto, unitario);
    if (doPreco !== null) mudancas.push(doPreco);

    // A explicação acompanha o PREÇO: se ele veio da variante, a explicação é
    // a da variante; se veio do produto, é a do produto.
    const explicacao =
      item.precoBaseEmCentavos === undefined
        ? (produto.precoAplicado ?? null)
        : (item.precoAplicado ?? null);

    itensQueSeguem.push({
      itemId: item.itemId,
      produtoId: produto.produtoId,
      nome: produto.nome,
      quantidade: item.quantidade,
      precoUnitarioEmCentavos: unitario,
      acrescimosEmCentavos: item.acrescimosEmCentavos ?? 0,
      // Inteiro vezes inteiro, conferido (AC-311): valor quebrado chegando
      // aqui é defeito de quem leu o catálogo, e estoura em vez de arredondar.
      totalDaLinhaEmCentavos: multiplicarCentavos(unitario, item.quantidade),
      precoAplicado: explicacao,
    });
  }

  const subtotalEmCentavos = somarCentavos(
    itensQueSeguem.map((item) => item.totalDaLinhaEmCentavos),
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

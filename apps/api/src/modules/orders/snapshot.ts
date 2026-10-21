/**
 * Cópia congelada do item comprado (AC-515, P-010).
 *
 * O QUE ESTÁ EM JOGO. O pedido é o registro do que foi combinado, e o catálogo
 * é o que a loja vende HOJE. Se o pedido apontasse para o produto e lesse o
 * nome e o preço de lá, todo pedido antigo mudaria junto com o catálogo: o dono
 * corrige o preço da marmita na terça e o pedido de segunda passa a valer outro
 * valor. Ninguém percebe na hora — percebe no fechamento do mês, quando a soma
 * dos pedidos não bate com o que foi recebido, e já não há como saber qual
 * pedido mudou nem quando.
 *
 * Por isso tudo aqui vira TEXTO E NÚMERO copiados. A referência ao produto
 * continua existindo, e serve para o relatório do dono ("quanto vendi de
 * marmita"); ela nunca é o caminho para saber quanto o pedido custou.
 *
 * Função PURA: os preços chegam prontos de quem leu o catálogo do lado do
 * servidor. O valor que o cliente enviou é descartado antes de chegar aqui
 * (P-006) — nunca se confia no que a tela mandou de volta.
 */
import type {
  FaixaDeAtacadoCongelada,
  ItemParaCriar,
  OpcaoParaCriar,
} from "./criar-pedido.usecase.ts";

/** O produto como o catálogo o descreve AGORA, lido pelo servidor. */
export interface ProdutoNoCatalogo {
  readonly id: string;
  readonly nome: string;
  readonly precoEmCentavos: number;
  readonly sku?: string | null;
  readonly custoEmCentavos?: number | null;
  /** Qual dos preços do produto valeu: base, promoção, atacado. */
  readonly tipoDePreco?: string | null;
  /**
   * O preço de varejo por unidade quando o cobrado (`precoEmCentavos`) saiu
   * menor — a faixa de atacado ou a promoção. Vira o "de" riscado do pedido.
   */
  readonly precoDeVarejoEmCentavos?: number | null;
  /** A faixa de atacado que valeu para a quantidade (card #57). */
  readonly faixaDeAtacado?: FaixaDeAtacadoCongelada | null;
}

/** A variação escolhida, se o produto tiver. */
export interface VariacaoNoCatalogo {
  readonly id: string;
  readonly nome: string;
  /** Quanto esta variação soma ao preço do produto. */
  readonly acrescimoEmCentavos?: number;
}

/** Uma escolha dentro de um grupo de opções ("sem cebola", "borda extra"). */
export interface OpcaoNoCatalogo {
  /**
   * A referência ao grupo e à opção do catálogo é OPCIONAL, e o nome não é.
   * É a mesma ideia do item: o que vale é a cópia. Uma opção combinada no
   * balcão ("sem sal") pode não existir no catálogo, e nem por isso deixa de
   * precisar aparecer na comanda que vai para a cozinha.
   */
  readonly grupoId?: string | null;
  readonly grupoNome: string;
  readonly opcaoId?: string | null;
  readonly opcaoNome: string;
  readonly quantidade?: number;
  readonly acrescimoEmCentavos?: number;
}

/** O que o cliente colocou no carrinho, já casado com o catálogo. */
export interface EscolhaDoCliente {
  readonly produto: ProdutoNoCatalogo;
  readonly variacao?: VariacaoNoCatalogo | null;
  readonly opcoes?: readonly OpcaoNoCatalogo[];
  readonly quantidade: number;
  readonly observacao?: string | null;
}

/** Erro de uso: a escolha recebida não descreve um item comprável. */
export class ErroDeItemInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeItemInvalido";
  }
}

/** O conjunto congelado, com a soma que o pedido vai guardar. */
export interface ItensCongelados {
  readonly itens: readonly ItemParaCriar[];
  readonly subtotalEmCentavos: number;
}

function exigirQuantidade(escolha: EscolhaDoCliente): number {
  const { quantidade } = escolha;
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new ErroDeItemInvalido(
      `quantidade de "${escolha.produto.nome}" precisa ser inteiro positivo, recebeu ${quantidade}`,
    );
  }
  return quantidade;
}

function exigirCentavos(valor: number, oQue: string): number {
  if (!Number.isInteger(valor)) {
    throw new ErroDeItemInvalido(
      `${oQue} precisa ser inteiro em centavos, recebeu ${valor}`,
    );
  }
  return valor;
}

/**
 * Congela as opções escolhidas.
 *
 * O nome do grupo e o da opção viram texto aqui. O identificador segue junto,
 * mas só para relatório: renomear "Cobertura" para "Adicionais" no catálogo não
 * pode reescrever a comanda que já foi para a cozinha.
 */
function congelarOpcoes(opcoes: readonly OpcaoNoCatalogo[]): {
  congeladas: OpcaoParaCriar[];
  acrescimoEmCentavos: number;
} {
  const congeladas: OpcaoParaCriar[] = [];
  let acrescimo = 0;

  for (const opcao of opcoes) {
    const quantidade = opcao.quantidade ?? 1;
    const porUnidade = exigirCentavos(
      opcao.acrescimoEmCentavos ?? 0,
      `acréscimo da opção "${opcao.opcaoNome}"`,
    );
    acrescimo += porUnidade * quantidade;

    congeladas.push({
      grupoId: opcao.grupoId ?? null,
      opcaoId: opcao.opcaoId ?? null,
      // `String(...)` não é paranoia: garante que o que entra na comanda é o
      // texto de agora, e não uma referência que alguém possa alterar depois.
      nomeDoGrupo: String(opcao.grupoNome),
      nomeDaOpcao: String(opcao.opcaoNome),
      quantidade,
      acrescimoEmCentavos: porUnidade,
    });
  }

  return { congeladas, acrescimoEmCentavos: acrescimo };
}

/**
 * Congela um item: nome, variação, preço e opções viram cópia.
 *
 * A ORDEM DO CÁLCULO é preço do produto, mais a variação, mais as opções, e só
 * então multiplicado pela quantidade. Multiplicar antes de somar as opções daria
 * outro número em qualquer pedido com mais de uma unidade — e daria o número
 * errado sem que nada quebrasse.
 */
export function congelarItem(escolha: EscolhaDoCliente): ItemParaCriar {
  const quantidade = exigirQuantidade(escolha);
  const { produto, variacao } = escolha;

  const precoDoProduto = exigirCentavos(
    produto.precoEmCentavos,
    `preço de "${produto.nome}"`,
  );
  const acrescimoDaVariacao = exigirCentavos(
    variacao?.acrescimoEmCentavos ?? 0,
    `acréscimo da variação de "${produto.nome}"`,
  );
  const { congeladas, acrescimoEmCentavos } = congelarOpcoes(
    escolha.opcoes ?? [],
  );

  const unitario = precoDoProduto + acrescimoDaVariacao;

  // O PREÇO QUE VALEU TAMBÉM É CÓPIA (card #57): a faixa de atacado e o varejo
  // da época. O dono muda a faixa amanhã e o pedido continua explicando por
  // que dez peças saíram mais baratas.
  const faixa = produto.faixaDeAtacado ?? null;
  const varejo =
    produto.precoDeVarejoEmCentavos === undefined ||
    produto.precoDeVarejoEmCentavos === null
      ? null
      : exigirCentavos(
          produto.precoDeVarejoEmCentavos,
          `preço de varejo de "${produto.nome}"`,
        ) + acrescimoDaVariacao;
  if (faixa !== null && faixa.quantidadeMinima > quantidade) {
    throw new ErroDeItemInvalido(
      `a faixa de "${produto.nome}" vale a partir de ${faixa.quantidadeMinima} unidades, e o item tem ${quantidade}`,
    );
  }

  return {
    produtoId: produto.id,
    variacaoId: variacao?.id ?? null,
    nomeDoProduto: String(produto.nome),
    nomeDaVariacao: variacao ? String(variacao.nome) : null,
    sku: produto.sku ?? null,
    quantidade,
    precoUnitarioEmCentavos: unitario,
    opcoesEmCentavos: acrescimoEmCentavos,
    totalDaLinhaEmCentavos: (unitario + acrescimoEmCentavos) * quantidade,
    observacao: escolha.observacao ?? null,
    opcoes: congeladas,
    tipoDePreco: produto.tipoDePreco ?? (faixa === null ? null : "WHOLESALE"),
    precoDeVarejoEmCentavos:
      varejo !== null && varejo > unitario ? varejo : null,
    faixaDeAtacado:
      faixa === null
        ? null
        : {
            quantidadeMinima: faixa.quantidadeMinima,
            tipoDeDesconto: faixa.tipoDeDesconto,
            desconto: faixa.desconto,
            // Cópia do texto de agora, como o nome do produto.
            rotulo: faixa.rotulo === null ? null : String(faixa.rotulo),
          },
  };
}

/**
 * Congela o carrinho inteiro e devolve a soma.
 *
 * A soma sai daqui, e não de quem chamou: o subtotal do pedido tem de ser a
 * soma exata das linhas que foram guardadas. Calculado em outro lugar, ele pode
 * divergir das linhas — e o cliente vê um total que não corresponde ao que está
 * escrito acima dele.
 */
export function congelarItens(
  escolhas: readonly EscolhaDoCliente[],
): ItensCongelados {
  const itens = escolhas.map(congelarItem);
  const subtotalEmCentavos = itens.reduce(
    (soma, item) => soma + item.totalDaLinhaEmCentavos,
    0,
  );
  return { itens, subtotalEmCentavos };
}

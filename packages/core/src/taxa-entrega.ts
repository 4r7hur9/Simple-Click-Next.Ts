/**
 * Cálculo dos valores do pedido — itens, taxa de entrega e total
 * (AC-507, AC-906, AC-907, AC-908).
 *
 * A ORDEM DO CÁLCULO É PARTE DA REGRA, não detalhe de implementação. Ela é
 * sempre: soma dos itens, depois a taxa, depois o total. Inverter — aplicar a
 * entrega grátis sobre um subtotal que já inclui a taxa, por exemplo — muda o
 * resultado em dinheiro de verdade, e do jeito que ninguém percebe: o pedido
 * fecha, o cliente paga, e a conta só não bate no fim do mês. Por isso a ordem
 * tem teste próprio, e não só o total.
 *
 * Dinheiro é INTEIRO EM CENTAVOS (P-005). Nenhum ponto flutuante entra aqui:
 * `0.1 + 0.2` não dá `0.3`, e uma taxa de entrega calculada assim erra centavo
 * por pedido até alguém conferir o extrato.
 *
 * Função PURA, como a tabela de fronteiras de `.spec/design/arquitetura.md`
 * exige de `packages/core`.
 *
 * O tipo `TaxaDeEntrega` vem de `pedido-descrito.ts` de propósito: é o
 * MESMO vocabulário que o texto do WhatsApp imprime e que `orders` guarda. Duas
 * definições paralelas divergiriam em silêncio, e o resumo na tela passaria a
 * dizer uma coisa enquanto a mensagem enviada diz outra.
 */
import type { FormaDeEntrega, TaxaDeEntrega } from "./pedido-descrito.ts";

/** O que a loja configurou sobre entrega (AC-906, AC-907, AC-908). */
export interface ConfiguracaoDeEntrega {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  /** Taxa única da loja. Zero é taxa zero; ausente é entrega a combinar. */
  readonly taxaEmCentavos?: number | null;
  /** O nome que o dono deu à linha: "Taxa de entrega", "Frete", "Motoboy". */
  readonly nomeDaTaxa?: string | null;
  /** Acima deste subtotal a entrega sai de graça. Ausente: nunca sai. */
  readonly gratisAcimaDeEmCentavos?: number | null;
  readonly minimoParaEntregaEmCentavos?: number | null;
  readonly minimoParaRetiradaEmCentavos?: number | null;
}

/** Por que o fechamento está impedido, e o que falta para destravar. */
export interface ImpedimentoDoFechamento {
  readonly causa:
    "ABAIXO_DO_MINIMO" | "ENTREGA_NAO_OFERECIDA" | "RETIRADA_NAO_OFERECIDA";
  /** Quanto falta em centavos para atingir o mínimo (AC-908). */
  readonly faltamEmCentavos?: number;
  readonly explicacao: string;
}

/** As linhas do resumo, na ordem em que aparecem na tela (AC-507). */
export interface ResumoDeValores {
  readonly subtotalEmCentavos: number;
  readonly taxaDeEntrega: TaxaDeEntrega;
  /** Verdadeiro quando a taxa existia e foi zerada pela regra (AC-907). */
  readonly entregaGratis: boolean;
  readonly totalEmCentavos: number;
  /** Nulo quando o pedido pode ser fechado. */
  readonly impedimento: ImpedimentoDoFechamento | null;
}

const NOME_PADRAO_DA_TAXA = "Taxa de entrega";

/** Escreve centavos como dinheiro, para a explicação que o cliente lê. */
export function emReais(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  const inteiro = Math.trunc(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, "0");
  const comPonto = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}R$ ${comPonto},${resto}`;
}

/**
 * Decide a taxa da RETIRADA: nenhuma, sempre, sem exceção.
 *
 * Existe como caminho próprio porque o erro clássico é somar a taxa e depois
 * "zerar na tela": o pedido guardado fica com a taxa dentro, e o relatório do
 * dono passa a contar receita de entrega que nunca houve (AC-506).
 */
function taxaDaRetirada(): TaxaDeEntrega {
  return { modo: "FREE", valorEmCentavos: 0, nome: null };
}

function taxaDaEntrega(
  configuracao: ConfiguracaoDeEntrega,
  subtotalEmCentavos: number,
): { taxa: TaxaDeEntrega; gratis: boolean } {
  const nome = configuracao.nomeDaTaxa ?? NOME_PADRAO_DA_TAXA;
  const valor = configuracao.taxaEmCentavos;

  // Taxa não cadastrada não é taxa zero: é "a combinar". Tratar as duas como a
  // mesma coisa faria a loja entregar de graça sem ter decidido isso.
  if (valor === null || valor === undefined) {
    return { taxa: { modo: "ASK", valorEmCentavos: 0, nome }, gratis: false };
  }

  const limite = configuracao.gratisAcimaDeEmCentavos;
  const alcancouOLimite =
    limite !== null && limite !== undefined && subtotalEmCentavos >= limite;

  if (alcancouOLimite && valor > 0) {
    return { taxa: { modo: "FREE", valorEmCentavos: 0, nome }, gratis: true };
  }

  return {
    taxa: { modo: "VALUE", valorEmCentavos: valor, nome },
    gratis: false,
  };
}

/**
 * Confere o valor mínimo do pedido (AC-908).
 *
 * O mínimo é POR FORMA: quem define mínimo de entrega não define mínimo de
 * retirada junto. Aplicar o mesmo número aos dois bloquearia a retirada que o
 * dono nunca quis bloquear — e ele descobriria pelo cliente que desistiu.
 *
 * O mínimo vale sobre o subtotal dos ITENS, não sobre o total: senão a própria
 * taxa de entrega ajudaria a atingir o mínimo, o que esvazia a regra.
 */
function conferirMinimo(
  configuracao: ConfiguracaoDeEntrega,
  forma: FormaDeEntrega["tipo"],
  subtotalEmCentavos: number,
): ImpedimentoDoFechamento | null {
  const minimo =
    forma === "DELIVERY"
      ? configuracao.minimoParaEntregaEmCentavos
      : configuracao.minimoParaRetiradaEmCentavos;

  if (minimo === null || minimo === undefined) return null;
  if (subtotalEmCentavos >= minimo) return null;

  const faltam = minimo - subtotalEmCentavos;
  const onde = forma === "DELIVERY" ? "entrega" : "retirada";
  return {
    causa: "ABAIXO_DO_MINIMO",
    faltamEmCentavos: faltam,
    explicacao: `O pedido mínimo para ${onde} é ${emReais(minimo)}. Faltam ${emReais(faltam)} para você fechar.`,
  };
}

function conferirDisponibilidade(
  configuracao: ConfiguracaoDeEntrega,
  forma: FormaDeEntrega["tipo"],
): ImpedimentoDoFechamento | null {
  if (forma === "DELIVERY" && !configuracao.aceitaEntrega) {
    return {
      causa: "ENTREGA_NAO_OFERECIDA",
      explicacao:
        "Esta loja não faz entrega; o pedido é para retirada no local.",
    };
  }
  if (forma === "PICKUP" && !configuracao.aceitaRetirada) {
    return {
      causa: "RETIRADA_NAO_OFERECIDA",
      explicacao:
        "Esta loja não faz retirada no local; o pedido é para entrega.",
    };
  }
  return null;
}

/**
 * Monta o resumo de valores do pedido.
 *
 * A ordem é fixa e está sob teste: itens, taxa, total.
 */
export function calcularValores(
  configuracao: ConfiguracaoDeEntrega,
  forma: FormaDeEntrega["tipo"],
  subtotalEmCentavos: number,
): ResumoDeValores {
  // 1. Os itens. Chega pronto de quem somou o carrinho com os preços do
  //    servidor — o valor que o cliente mandou é descartado (P-006).
  const subtotal = subtotalEmCentavos;

  // 2. A taxa, decidida sobre o subtotal dos itens e só sobre ele.
  const indisponivel = conferirDisponibilidade(configuracao, forma);
  const { taxa, gratis } =
    forma === "PICKUP" || indisponivel !== null
      ? { taxa: taxaDaRetirada(), gratis: false }
      : taxaDaEntrega(configuracao, subtotal);

  // 3. O total, que é a soma dos dois anteriores e de mais nada.
  const total = subtotal + taxa.valorEmCentavos;

  return {
    subtotalEmCentavos: subtotal,
    taxaDeEntrega: taxa,
    entregaGratis: gratis,
    totalEmCentavos: total,
    impedimento: indisponivel ?? conferirMinimo(configuracao, forma, subtotal),
  };
}

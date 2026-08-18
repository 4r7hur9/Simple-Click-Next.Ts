/**
 * Regras de pagamento do pedido (AC-510, AC-511, AC-512, AC-513).
 *
 * A VERSÃO 1 NÃO COBRA. Não existe integração com meio de pagamento, não se
 * pede número de cartão, e nada é debitado automaticamente. O pagamento é
 * combinado entre cliente e loja FORA do sistema — o que o sistema faz é
 * registrar o que foi combinado (AC-513). Essa decisão está em
 * `.spec/design/decisoes.md` e é o motivo de este módulo lidar só com texto e
 * centavos: chave PIX, nome do recebedor e troco.
 *
 * O que este módulo produz é um RETRATO. Uma vez guardado no pedido, ele não
 * acompanha mudanças da loja: se o dono trocar a chave PIX amanhã, o pedido de
 * hoje continua mostrando a chave que valia hoje (AC-511, P-006). Sem isso, um
 * cliente que abrisse o pedido antigo veria uma chave para a qual nunca pagou —
 * e o dono não teria como conferir o recebimento.
 */
import type { FormaDePagamento, PagamentoDoPedido } from "@simpleclick/core";

/** Tipo da chave PIX, como o dono a cadastrou. */
export type TipoDeChavePix =
  "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

/** O que a loja aceita, do jeito que o dono configurou (AC-512). */
export interface ConfiguracaoDePagamento {
  readonly aceitaPix: boolean;
  readonly aceitaDinheiro: boolean;
  readonly aceitaCartaoNaEntrega: boolean;
  readonly chavePix?: string | null;
  readonly tipoDaChavePix?: TipoDeChavePix | null;
  readonly nomeDoRecebedor?: string | null;
}

/** A escolha que o cliente fez na tela. */
export interface EscolhaDePagamento {
  readonly forma: FormaDePagamento;
  /** Para quanto o cliente precisa de troco, quando paga em dinheiro. */
  readonly trocoParaEmCentavos?: number | null;
}

/** Forma oferecida na tela, com o nome que o cliente lê. */
export interface FormaOferecida {
  readonly forma: FormaDePagamento;
  readonly rotulo: string;
  /** Verdadeiro quando escolher esta forma revela a caixa da chave PIX. */
  readonly mostraChavePix: boolean;
  /** Verdadeiro quando escolher esta forma pergunta o troco. */
  readonly perguntaTroco: boolean;
}

/** Recusa da escolha, com a frase que a tela mostra. */
export interface RecusaDePagamento {
  readonly causa:
    "FORMA_NAO_ACEITA" | "PIX_SEM_CHAVE" | "TROCO_MENOR_QUE_O_TOTAL";
  readonly explicacao: string;
}

export type ResultadoDoPagamento =
  | { readonly ok: true; readonly pagamento: PagamentoDoPedido }
  | { readonly ok: false; readonly recusa: RecusaDePagamento };

const ROTULOS: Record<FormaDePagamento, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  OTHER: "Combinar com a loja",
};

/**
 * As formas que a loja oferece, na ordem em que aparecem na tela (AC-512).
 *
 * PIX sem chave cadastrada NÃO entra na lista. Oferecer a opção e depois não ter
 * o que mostrar é pior do que não oferecer: o cliente escolhe, chega numa caixa
 * vazia e desiste sem ter como pagar.
 */
export function formasOferecidas(
  configuracao: ConfiguracaoDePagamento,
): readonly FormaOferecida[] {
  const oferecidas: FormaOferecida[] = [];

  if (configuracao.aceitaPix && temChavePix(configuracao)) {
    oferecidas.push({
      forma: "PIX",
      rotulo: ROTULOS.PIX,
      mostraChavePix: true,
      perguntaTroco: false,
    });
  }
  if (configuracao.aceitaDinheiro) {
    oferecidas.push({
      forma: "CASH",
      rotulo: ROTULOS.CASH,
      mostraChavePix: false,
      perguntaTroco: true,
    });
  }
  if (configuracao.aceitaCartaoNaEntrega) {
    oferecidas.push({
      forma: "CARD_ON_DELIVERY",
      rotulo: ROTULOS.CARD_ON_DELIVERY,
      mostraChavePix: false,
      perguntaTroco: false,
    });
  }

  return oferecidas;
}

function temChavePix(configuracao: ConfiguracaoDePagamento): boolean {
  const chave = configuracao.chavePix;
  return typeof chave === "string" && chave.trim() !== "";
}

function recusar(
  causa: RecusaDePagamento["causa"],
  explicacao: string,
): ResultadoDoPagamento {
  return { ok: false, recusa: { causa, explicacao } };
}

/**
 * Congela o pagamento no pedido (AC-511).
 *
 * O total entra como argumento porque o troco só faz sentido comparado a ele:
 * "troco para R$ 20,00" num pedido de R$ 35,00 não é troco, é engano — e
 * descobrir isso na porta, com o entregador, é o pior lugar possível.
 */
export function montarPagamento(
  escolha: EscolhaDePagamento,
  configuracao: ConfiguracaoDePagamento,
  totalEmCentavos: number,
): ResultadoDoPagamento {
  const oferecida = formasOferecidas(configuracao).find(
    (item) => item.forma === escolha.forma,
  );

  if (oferecida === undefined) {
    // A escolha vem do cliente, e cliente não é fonte de verdade (P-006): a
    // tela pode estar velha, ou alguém pode ter mandado a escolha na mão.
    return recusar(
      "FORMA_NAO_ACEITA",
      escolha.forma === "PIX" && configuracao.aceitaPix
        ? "Esta loja ainda não cadastrou a chave PIX. Escolha outra forma de pagamento."
        : "Esta loja não aceita essa forma de pagamento.",
    );
  }

  if (escolha.forma === "PIX" && !temChavePix(configuracao)) {
    return recusar(
      "PIX_SEM_CHAVE",
      "Esta loja ainda não cadastrou a chave PIX. Escolha outra forma de pagamento.",
    );
  }

  const troco = escolha.trocoParaEmCentavos;
  if (
    escolha.forma === "CASH" &&
    troco !== null &&
    troco !== undefined &&
    troco < totalEmCentavos
  ) {
    return recusar(
      "TROCO_MENOR_QUE_O_TOTAL",
      "O valor informado para troco é menor que o total do pedido.",
    );
  }

  // O retrato: a chave e o nome do recebedor são COPIADOS para dentro do
  // pedido. Guardar só uma referência à loja faria o pedido antigo mudar
  // sozinho quando o dono trocasse a chave.
  return {
    ok: true,
    pagamento: {
      forma: escolha.forma,
      chavePix:
        escolha.forma === "PIX" ? (configuracao.chavePix ?? null) : null,
      tipoDaChavePix:
        escolha.forma === "PIX" ? (configuracao.tipoDaChavePix ?? null) : null,
      nomeDoRecebedor:
        escolha.forma === "PIX" ? (configuracao.nomeDoRecebedor ?? null) : null,
      trocoParaEmCentavos: escolha.forma === "CASH" ? (troco ?? null) : null,
    },
  };
}

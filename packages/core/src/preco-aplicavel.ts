/**
 * O preço que se COBRA por um item, sabendo quantas unidades vão (AC-309,
 * AC-310, AC-311).
 *
 * A DIFERENÇA PARA `precoQueVale`. Aquela regra responde "quanto custa uma
 * unidade" — é o número da vitrine, e preço de atacado não entra nele: "a
 * partir de 6 unidades" não é o que alguém paga levando uma. Esta responde
 * "quanto custa ESTE item, com ESTA quantidade" — é o número do carrinho, e aí
 * o atacado entra, sozinho, quando a quantidade chega lá.
 *
 * AS DUAS NÃO DIVERGEM, por construção: esta parte do resultado daquela e só
 * troca o preço quando um preço por quantidade vale E sai mais barato. Com uma
 * unidade, o preço cobrado é exatamente o anunciado na vitrine.
 *
 * E ELA DIZ O PORQUÊ. O AC-310 pede que a tela mostre qual preço foi usado e
 * por quê; o carrinho que cobra R$ 90 por seis coisas que a vitrine anunciava a
 * R$ 20 precisa se explicar, senão parece erro. Por isso o resultado carrega o
 * nome que o dono deu ao preço e uma frase pronta.
 *
 * Tudo em centavos inteiros (P-005): o total do item sai de
 * `multiplicarCentavos`, que recusa conta com valor quebrado.
 */
import { multiplicarCentavos } from "./dinheiro.ts";
import {
  precoQueVale,
  precoValeAgora,
  type PrecoCadastrado,
} from "./preco-vigente.ts";

/** Como cada tipo de preço é chamado quando o dono não lhe deu nome. */
const NOME_PADRAO: Readonly<Record<string, string>> = {
  BASE: "Preço",
  PROMO: "Promoção",
  WHOLESALE: "Atacado",
};

/** O preço escolhido para um item, e a explicação da escolha. */
export interface PrecoAplicado {
  /** O que se cobra por unidade. */
  readonly unitarioEmCentavos: number;
  /** O preço "de", riscado ao lado, quando o cobrado é menor que o normal. */
  readonly anteriorEmCentavos: number | null;
  /** `BASE`, `PROMO` ou `WHOLESALE`. */
  readonly tipo: string;
  /** O nome do preço, como o dono o chamou — ou o nome padrão do tipo. */
  readonly rotulo: string;
  /**
   * Por que este preço foi usado, em uma frase para a tela.
   *
   * Nulo quando é o preço normal: não há o que explicar em "custa o que
   * custa", e uma explicação em toda linha ensinaria a pessoa a não lê-la.
   */
  readonly motivo: string | null;
  /** Unitário × quantidade. */
  readonly totalEmCentavos: number;
}

function nomeDe(preco: PrecoCadastrado): string {
  const dado = preco.rotulo?.trim();
  return dado !== undefined && dado !== ""
    ? dado
    : (NOME_PADRAO[preco.tipo] ?? preco.tipo);
}

function plural(quantidade: number): string {
  return quantidade === 1 ? "unidade" : "unidades";
}

/**
 * Escolhe o preço de um item com `quantidade` unidades, no instante `agora`.
 *
 * Devolve `null` quando não há preço nenhum valendo — e nulo não é zero: o
 * item sem preço conhecido não segue de graça, ele é retirado com explicação.
 *
 * Entre dois preços por quantidade valendo ao mesmo tempo (a partir de 6 e a
 * partir de 12, levando 12), vale o MENOR: é a faixa que o dono quis oferecer a
 * quem leva mais, e cobrar a outra seria a pessoa pagando pelo engano de ordem.
 */
export function precoAplicavel(
  precos: readonly PrecoCadastrado[],
  agora: Date,
  quantidade: number,
): PrecoAplicado | null {
  const unidades = Math.max(1, Math.trunc(quantidade));
  const normal = precoQueVale(precos, agora, unidades);

  const porQuantidade = precos
    .filter((p) => p.tipo === "WHOLESALE" && precoValeAgora(p, agora, unidades))
    .sort(
      (a, b) =>
        a.valorEmCentavos - b.valorEmCentavos ||
        b.quantidadeMinima - a.quantidadeMinima,
    )[0];

  if (
    porQuantidade !== undefined &&
    (normal.atualEmCentavos === null ||
      porQuantidade.valorEmCentavos < normal.atualEmCentavos)
  ) {
    const rotulo = nomeDe(porQuantidade);
    return {
      unitarioEmCentavos: porQuantidade.valorEmCentavos,
      anteriorEmCentavos: normal.atualEmCentavos,
      tipo: "WHOLESALE",
      rotulo,
      motivo: `${rotulo}: preço a partir de ${porQuantidade.quantidadeMinima} ${plural(porQuantidade.quantidadeMinima)}, e você está levando ${unidades}.`,
      totalEmCentavos: multiplicarCentavos(
        porQuantidade.valorEmCentavos,
        unidades,
      ),
    };
  }

  if (normal.atualEmCentavos === null) return null;

  // A promoção só é promoção quando há um preço "de" maior para riscar — é a
  // mesma decisão de `precoQueVale`, e repeti-la por fora abriria a chance de
  // a tela chamar de promoção um preço que a vitrine não risca.
  const emPromocao = normal.anteriorEmCentavos !== null;
  const escolhido = precos.find(
    (p) =>
      p.tipo === (emPromocao ? "PROMO" : "BASE") &&
      p.valorEmCentavos === normal.atualEmCentavos &&
      precoValeAgora(p, agora, unidades),
  );
  const rotulo =
    escolhido === undefined
      ? (NOME_PADRAO[emPromocao ? "PROMO" : "BASE"] ?? "Preço")
      : nomeDe(escolhido);

  return {
    unitarioEmCentavos: normal.atualEmCentavos,
    anteriorEmCentavos: normal.anteriorEmCentavos,
    tipo: emPromocao ? "PROMO" : "BASE",
    rotulo,
    motivo: emPromocao ? `${rotulo}: preço promocional valendo agora.` : null,
    totalEmCentavos: multiplicarCentavos(normal.atualEmCentavos, unidades),
  };
}

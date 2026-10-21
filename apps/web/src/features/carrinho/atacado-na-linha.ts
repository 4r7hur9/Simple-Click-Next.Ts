/**
 * O atacado escrito na linha do carrinho (card #57).
 *
 * A CONTA É DA API. A conferência já aplicou a faixa pela quantidade e diz qual
 * valeu, qual é a próxima e quantas peças faltam; aqui só se escreve a frase.
 * Calcular de novo na tela abriria a chance de a frase prometer um desconto
 * que o servidor não dá.
 */
import type { AtacadoNoItemNoContrato } from "@simpleclick/contracts";

import { escreverDinheiro } from "../../lib/produto.ts";

type FaixaDoContrato = NonNullable<AtacadoNoItemNoContrato["faixaAplicada"]>;

/** "5%" ou "R$ 1,00". */
function desconto(faixa: FaixaDoContrato): string {
  return faixa.tipoDeDesconto === "PERCENTUAL"
    ? `${faixa.desconto}%`
    : escreverDinheiro(faixa.desconto);
}

function pecas(quantidade: number): string {
  return quantidade === 1 ? "1 peça" : `${quantidade} peças`;
}

/**
 * "Faltam 4 peças para o próximo desconto (R$ 19,00 cada a partir de 10)".
 *
 * Nulo quando não há próxima faixa — já está no maior desconto, ou o produto
 * só vende no varejo.
 */
export function avisoDoAtacado(
  atacado: AtacadoNoItemNoContrato | null,
): string | null {
  if (atacado === null) return null;
  const { proximaFaixa, faltamParaProxima } = atacado;
  if (proximaFaixa === null || faltamParaProxima === null) return null;
  const verbo = faltamParaProxima === 1 ? "Falta" : "Faltam";
  return `${verbo} ${pecas(faltamParaProxima)} para o próximo desconto (${escreverDinheiro(proximaFaixa.unitarioCentavos)} cada a partir de ${proximaFaixa.quantidadeMinima})`;
}

/**
 * "Caixa fechada: 5% de desconto a partir de 10 peças". Nulo no varejo.
 */
export function faixaQueValeu(
  atacado: AtacadoNoItemNoContrato | null,
): string | null {
  const faixa = atacado?.faixaAplicada ?? null;
  if (faixa === null) return null;
  return `${faixa.rotulo ?? "Atacado"}: ${desconto(faixa)} de desconto a partir de ${pecas(faixa.quantidadeMinima)}`;
}

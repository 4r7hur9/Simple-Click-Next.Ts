// As séries do gráfico do mundo 3D da landing (AC-935): de onde cada linha parte e
// aonde chega, a oscilação que a torna crível, o nome do ramo e a cor lida do tema.
import { PALETA_CLARA } from "@simpleclick/ui";

/** Quantos vértices cada linha tem. Ímpar, para haver um meio. */
export const PARADAS = 13;

/**
 * O verde, caso a folha de estilo ainda não tenha sido aplicada.
 *
 * Vem do valor DECLARADO, e não de uma cópia dele escrita aqui: cópia de cor é
 * a que fica para trás quando a original muda, e o ESLint a recusa (AC-014).
 */
const VERDE_DE_RESERVA = PALETA_CLARA.sucesso;

/** Os nomes dos valores declarados de cada linha, na ordem das séries. */
export const VALORES_DAS_CORES = [
  "--cor-serie-um",
  "--cor-serie-dois",
  "--cor-serie-tres",
] as const;

/**
 * A cor vem da FOLHA DE ESTILO, e não do código: cada cor tem uma versão para
 * o tema claro e outra para o escuro, e o WebGL não lê CSS. Fixar uma delas
 * aqui faria a linha sumir num dos temas.
 */
export function corDoTema(valor: string): string {
  if (typeof window === "undefined") return VERDE_DE_RESERVA;
  const lido = getComputedStyle(document.documentElement)
    .getPropertyValue(valor)
    .trim();
  return lido === "" ? VERDE_DE_RESERVA : lido;
}

/**
 * A altura de cada parada, de 0 a 1: uma reta de tendência com oscilação.
 *
 * Receita real oscila, e uma reta perfeita lê como gráfico de apresentação de
 * vendas. A oscilação é determinística: o mesmo desenho a cada carregamento.
 */
export function alturaDaSerie(
  parada: number,
  inicio: number,
  fim: number,
  fase: number,
): number {
  const andamento = parada / (PARADAS - 1);
  const tendencia = inicio + (fim - inicio) * andamento;
  // Duas ondas de períodos diferentes: uma só produziria um zigue-zague regular,
  // que lê como enfeite. Somadas, o desenho nunca repete dentro da tela.
  const oscilacao =
    Math.sin(parada * 1.9 + fase) * 0.09 + Math.sin(parada * 0.7 + fase) * 0.05;
  return Math.min(Math.max(tendencia + oscilacao, 0.04), 0.96);
}

/**
 * As séries. Todas sobem — o que muda é de onde partem, quanto avançam e a
 * fase da oscilação, que é o que as faz se cruzarem em vez de andarem juntas.
 *
 * A OPACIDADE É IGUAL EM TODAS: cada uma já tem cor própria, e escalonar o peso
 * diria que um ramo importa menos que outro.
 */
export const SERIES = [
  { inicio: 0.08, fim: 0.88, fase: 0, opacidade: 0.92 },
  { inicio: 0.38, fim: 0.62, fase: 2.4, opacidade: 0.92 },
  { inicio: 0.22, fim: 0.76, fase: 4.7, opacidade: 0.92 },
] as const;

/**
 * O ramo que cada linha representa, mostrado na legenda fixa: a bolinha da
 * legenda tem a cor da série, e é ela que casa o nome com o traço.
 *
 * São ramos deliberadamente distantes — comida, roupa e autopeças — para a
 * página responder de saída a pergunta "isto serve para o MEU negócio?".
 */
export const NOMES_DAS_SERIES = [
  "Loja de roupas",
  "Lanchonete",
  "Loja de peças",
] as const;

/**
 * Quantos pedidos a etiqueta anuncia num pico daquela altura.
 *
 * SAI DA PRÓPRIA ALTURA, e não de uma sequência à parte: um número inventado
 * poderia dizer muito no pico mais baixo e contradizer o traço. A etiqueta é a
 * leitura do traço.
 */
export function pedidosNoPico(altura01: number): number {
  return Math.round(altura01 * 64) + 4;
}

// As etiquetas do mundo 3D da landing (AC-935): a legenda fixa das séries e o balão de
// pedidos no pico de cada linha, em HTML por cima do WebGL.
import type * as THREE from "three";

import {
  NOMES_DAS_SERIES,
  VALORES_DAS_CORES,
  pedidosNoPico,
} from "./series.ts";

/**
 * A largura da coluna de texto, em pixel — o `max-inline-size: 40rem` de
 * `.sc-lp__conteudo`.
 *
 * Repetida aqui porque o WebGL não lê CSS, e medir o elemento a cada quadro
 * forçaria o navegador a recalcular o desenho da página a cada quadro. Se
 * aquela regra mudar, esta constante muda junto.
 */
const LARGURA_DO_TEXTO = 640;

/** O espaço que uma etiqueta ocupa, para saber se ela cabe onde vai. */
const LARGURA_DA_ETIQUETA = 130;
const ALTURA_DA_ETIQUETA = 46;

/** Um balão já posto: o elemento e onde ele nasce, para saber quando revelá-lo. */
export interface PicoMarcado {
  elemento: HTMLElement;
  x: number;
  topo: number;
}

/**
 * A LEGENDA, montada uma vez e parada, num canto livre à esquerda.
 *
 * Ela não é refeita quando a tela muda de tamanho: as cores e os nomes não
 * dependem do tamanho.
 */
export function montarLegenda(): HTMLUListElement {
  const legenda = document.createElement("ul");
  legenda.className = "sc-lp__legenda";
  for (const [indice, nome] of NOMES_DAS_SERIES.entries()) {
    const item = document.createElement("li");
    item.className = "sc-lp__legenda-item";
    // A bolinha herda a cor pelo valor declarado, e não por cor escrita aqui:
    // assim ela acompanha o tema junto com a linha que representa, sem uma
    // segunda regra que possa ficar para trás.
    item.style.setProperty(
      "--cor-da-serie",
      `var(${VALORES_DAS_CORES[indice] ?? ""})`,
    );
    item.textContent = nome;
    legenda.append(item);
  }
  return legenda;
}

/**
 * Põe UMA etiqueta na linha, no melhor pico que ela tiver.
 *
 * UMA por linha, e não uma por pico: várias viram uma parede de números, e com
 * uma por linha cada cor fala do seu negócio. PICO É MÁXIMO LOCAL, mais alto
 * que os dois vizinhos; as pontas, que só têm um vizinho, ficam de fora.
 */
export function marcarPico({
  indice,
  alturas,
  pontos,
  alturaDaTela,
  larguraDaTela,
  camada,
  picos,
  semMovimento,
}: {
  readonly indice: number;
  readonly alturas: readonly number[];
  readonly pontos: readonly THREE.Vector2[];
  readonly alturaDaTela: number;
  readonly larguraDaTela: number;
  /** Onde o balão é posto. */
  readonly camada: HTMLElement;
  /** Os balões já postos nesta montagem; o novo entra aqui. */
  readonly picos: PicoMarcado[];
  readonly semMovimento: boolean;
}): void {
  // AS FAIXAS LIVRES são o que sobra da tela fora da coluna de texto. A
  // etiqueta não pode cair atrás do parágrafo: ali ela não se lê, e ainda
  // atrapalha quem está lendo. Fora delas, nenhum pico serve — e ficar sem
  // etiqueta é melhor do que ter uma por cima do texto.
  const bordaEsquerda = Math.max((larguraDaTela - LARGURA_DO_TEXTO) / 2, 0);
  const bordaDireita = bordaEsquerda + LARGURA_DO_TEXTO;

  const cabeNaFaixa = (x: number): boolean =>
    x + LARGURA_DA_ETIQUETA < bordaEsquerda ||
    (x > bordaDireita && x + LARGURA_DA_ETIQUETA < larguraDaTela);

  for (let i = 1; i < alturas.length - 1; i += 1) {
    if (!(alturas[i]! > alturas[i - 1]! && alturas[i]! > alturas[i + 1]!)) {
      continue;
    }

    const ponto = pontos[i]!;
    if (!cabeNaFaixa(ponto.x)) continue;

    // O eixo do mundo cresce para cima e o da página para baixo. Esta linha é
    // toda a conversão que existe entre os dois — o resto é pixel dos dois
    // lados, porque a câmera é ortográfica.
    const topo = alturaDaTela - ponto.y;

    // Nem em cima de outra etiqueta. As linhas se cruzam de propósito, e no
    // cruzamento dois picos de séries diferentes caem quase no mesmo lugar.
    const colide = picos.some(
      (outro) =>
        Math.abs(outro.x - ponto.x) < LARGURA_DA_ETIQUETA &&
        Math.abs(outro.topo - topo) < ALTURA_DA_ETIQUETA,
    );
    if (colide) continue;

    const marcador = document.createElement("div");
    marcador.className = "sc-lp__pico";
    // Marcador e etiqueta na cor da PRÓPRIA linha: é o que liga um ao outro
    // quando há vários na tela, e o que faz a bolinha da legenda valer.
    marcador.style.setProperty(
      "--cor-da-serie",
      `var(${VALORES_DAS_CORES[indice] ?? ""})`,
    );
    marcador.style.left = `${ponto.x}px`;
    marcador.style.top = `${topo}px`;

    // Duas linhas, como a etiqueta de resultado de uma operação: o que está
    // sendo medido em cima, pequeno, e o número embaixo, grande, que é a única
    // coisa que o olho foi ali buscar.
    const balao = document.createElement("div");
    balao.className = "sc-lp__balao";

    const rotuloDoBalao = document.createElement("span");
    rotuloDoBalao.className = "sc-lp__balao-rotulo";
    rotuloDoBalao.textContent = "PEDIDOS NO DIA";

    const valorDoBalao = document.createElement("span");
    valorDoBalao.className = "sc-lp__balao-valor";
    valorDoBalao.textContent = `+${pedidosNoPico(alturas[i]!)}`;

    balao.append(rotuloDoBalao, valorDoBalao);
    marcador.append(balao);

    camada.append(marcador);
    picos.push({ elemento: marcador, x: ponto.x, topo });

    // Quem pediu menos movimento recebe o estado final, e não a ausência
    // dele: a etiqueta aparece na hora, sem esperar a linha crescer até ela.
    if (semMovimento) marcador.dataset["visivel"] = "sim";
    return;
  }
}

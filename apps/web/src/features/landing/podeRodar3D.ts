/**
 * A decisão de carregar o mundo em três dimensões (AC-935).
 *
 * ELA ACONTECE ANTES DO DOWNLOAD, e é isso que o critério cobra. Decidir depois
 * de baixar cento e cinquenta quilobytes num celular em rede móvel já gastou o
 * dado da pessoa — a economia teria virado só uma tela preta a menos.
 *
 * Função pura sobre o ambiente: recebe o que precisa saber e responde. Assim a
 * prova consegue montar cada caso sem depender do aparelho que roda o teste.
 */

/** O que se sabe do aparelho na hora de decidir. */
export interface AparelhoDeQuemChegou {
  readonly temWebGL: boolean;
  readonly larguraEmPixels: number;
  readonly nucleos: number;
  readonly querMovimentoReduzido: boolean;
  /** Conexão declarada pelo navegador, quando ele a informa. */
  readonly conexaoEconomica?: boolean;
}

/** A partir de qual largura o mundo se paga. */
export const LARGURA_MINIMA_PARA_3D = 768;

/** Quantos núcleos o aparelho precisa ter para não engasgar. */
export const NUCLEOS_MINIMOS_PARA_3D = 4;

/**
 * Decide se o mundo deve ser carregado.
 *
 * Cinco recusas, e cada uma tem motivo:
 *
 * - **Sem WebGL** o navegador não tem como desenhar, e tentar produz uma tela
 *   preta no lugar de uma página.
 * - **Movimento reduzido** é um pedido explícito: quem o fez não quer um mundo
 *   girando conforme rola.
 * - **Abaixo de 768px** está o celular, que tem bateria, dado móvel e
 *   processador contados. A landing precisa converter ali sem o mundo.
 * - **Menos de quatro núcleos** é aparelho de entrada, que trava — e a pessoa
 *   desiste da página antes de o mundo aparecer.
 * - **Conexão em modo econômico** é alguém dizendo que está pagando por dado.
 */
export function podeRodar3D(aparelho: AparelhoDeQuemChegou): boolean {
  if (!aparelho.temWebGL) return false;
  if (aparelho.querMovimentoReduzido) return false;
  if (aparelho.conexaoEconomica === true) return false;
  if (aparelho.larguraEmPixels < LARGURA_MINIMA_PARA_3D) return false;
  if (aparelho.nucleos < NUCLEOS_MINIMOS_PARA_3D) return false;
  return true;
}

/** Lê o aparelho de quem chegou, com padrões pessimistas quando não dá para saber. */
export function lerAparelho(): AparelhoDeQuemChegou {
  if (typeof window === "undefined") {
    // No servidor não há aparelho: responder "não sei" como "não" mantém o
    // mundo fora da marcação inicial, que é onde ele nunca deveria estar.
    return {
      temWebGL: false,
      larguraEmPixels: 0,
      nucleos: 0,
      querMovimentoReduzido: true,
    };
  }

  const conexao = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;

  return {
    temWebGL: typeof WebGLRenderingContext !== "undefined",
    larguraEmPixels: window.innerWidth,
    // Quando o navegador não informa, assumir o mínimo é o certo: errar para
    // menos custa um mundo que não apareceu; errar para mais custa uma página
    // travada no aparelho de quem menos podia esperar.
    nucleos: navigator.hardwareConcurrency ?? 1,
    querMovimentoReduzido: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    ...(conexao?.saveData === true ? { conexaoEconomica: true } : {}),
  };
}

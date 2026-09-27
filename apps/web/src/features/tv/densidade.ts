/**
 * Quantos produtos cabem numa tela da televisão (AC-926, AC-927).
 *
 * A PERGUNTA É INVERTIDA DE PROPÓSITO. A vitrine pergunta "quanto espaço cada
 * produto pode ocupar"; a parede pergunta "quantos produtos cabem sem reduzir a
 * letra". O corpo do texto é a variável FIXA — sai do tamanho da televisão e
 * nunca desce do mínimo legível a três metros — e a quantidade é o que sobra.
 * Ir pelo outro caminho é como o cardápio impresso acaba com vinte itens em
 * corpo 12, que ninguém na fila consegue ler.
 *
 * EM PÉ E DEITADA DIVIDEM O ESPAÇO DE JEITOS DIFERENTES. Deitada, o código de
 * leitura ocupa uma faixa à direita e os produtos ficam em duas colunas; em
 * pé, o código ocupa uma faixa embaixo e os produtos ficam numa coluna só,
 * como o cardápio de parede que a lanchonete já conhece.
 *
 * A CONTA INCLUI TUDO O QUE A FOLHA GASTA NA VERTICAL. Respiro da tela,
 * cabeçalho, linhas, faixa do código e rodapé: cada número aqui tem o mesmo
 * número escrito em `exibicao.css`, e a prova da tela confere os dois lados.
 * Se um gasto da folha ficar de fora desta conta, a área de produtos (que é
 * `overflow: hidden`) esconde a última linha em vez de recusá-la — foi assim
 * que a televisão em pé cortou produto uma vez, com respiro e rodapé fora da
 * soma.
 *
 * FUNÇÃO PURA. Recebe medidas, devolve números; a tela mede a janela e chama.
 */

/** As medidas da janela, em pixels de CSS. */
export interface MedidasDaTela {
  readonly largura: number;
  readonly altura: number;
}

/** Como a televisão está instalada. */
export type Orientacao = "deitada" | "em-pe";

/** O que a tela precisa saber para se montar. */
export interface Densidade {
  readonly orientacao: Orientacao;
  readonly colunas: number;
  readonly linhas: number;
  readonly produtosPorTela: number;
  /** O corpo do nome do produto, em pixels. Nunca abaixo do mínimo. */
  readonly corpoEmPx: number;
}

/**
 * O corpo mínimo, em pixels de CSS.
 *
 * A regra de sinalização é cerca de 25 mm de altura de letra para leitura a
 * três metros. Numa televisão de 43 polegadas em Full HD, cada pixel mede
 * meio milímetro: 45 px de corpo dão 22 mm de letra maiúscula — e é esse o
 * valor que a fração abaixo produz numa tela de 1080 px de lado menor.
 * Abaixo de 28 px, nem numa televisão maior a fila lê.
 */
export const CORPO_MINIMO_EM_PX = 28;

/** Fração do lado menor da tela que vira corpo de texto. */
export const FRACAO_DO_CORPO = 0.042;

/** A altura de uma linha de produto (nome, chamada e respiro), em corpos. */
export const ALTURA_DA_LINHA_EM_CORPOS = 2.6;

/** A altura do cabeçalho (nome da loja e da seção), em corpos. */
export const ALTURA_DO_CABECALHO_EM_CORPOS = 2.4;

/** A altura do rodapé (passo do rodízio e hora da atualização), em corpos. */
export const ALTURA_DO_RODAPE_EM_CORPOS = 0.7;

/** O respiro da tela nas bordas de cima e de baixo, SOMADO, em corpos. */
export const RESPIRO_VERTICAL_DA_TELA_EM_CORPOS = 1.2;

/** Em pé: a fração da ALTURA reservada ao código de leitura, embaixo. */
export const FAIXA_DO_CODIGO_EM_PE = 0.3;

/** Deitada: a fração da LARGURA reservada ao código de leitura, à direita. */
export const FAIXA_DO_CODIGO_DEITADA = 0.32;

/** Uma coluna precisa desta largura, em corpos, para nome e preço conviverem. */
export const LARGURA_MINIMA_DA_COLUNA_EM_CORPOS = 14;

/** Mais colunas do que isto vira tabela, e tabela não se lê da fila. */
export const MAXIMO_DE_COLUNAS = 2;

/**
 * O teto por tela. Cabe mais numa parede de 4K, mas quem está na fila decide
 * em quinze segundos, e doze itens já é o que dá para varrer nesse tempo.
 */
export const MAXIMO_POR_TELA = 12;

/**
 * O que a folha gasta na vertical FORA das linhas de produto, em pixels:
 * respiro, cabeçalho, rodapé e, em pé, a faixa do código embaixo.
 */
function alturaForaDasLinhas(
  corpoEmPx: number,
  orientacao: Orientacao,
  altura: number,
): number {
  const fixos =
    corpoEmPx *
    (RESPIRO_VERTICAL_DA_TELA_EM_CORPOS +
      ALTURA_DO_CABECALHO_EM_CORPOS +
      ALTURA_DO_RODAPE_EM_CORPOS);
  const codigo = orientacao === "em-pe" ? altura * FAIXA_DO_CODIGO_EM_PE : 0;
  return fixos + codigo;
}

/** Decide a densidade da exibição para as medidas dadas. */
export function calcularDensidade({
  largura,
  altura,
}: MedidasDaTela): Densidade {
  const orientacao: Orientacao = largura >= altura ? "deitada" : "em-pe";
  const menor = Math.min(largura, altura);
  const corpoEmPx = Math.max(
    CORPO_MINIMO_EM_PX,
    Math.round(menor * FRACAO_DO_CORPO),
  );

  const alturaUtil =
    altura - alturaForaDasLinhas(corpoEmPx, orientacao, altura);
  const alturaDaLinha = corpoEmPx * ALTURA_DA_LINHA_EM_CORPOS;
  const linhas = Math.max(1, Math.floor(alturaUtil / alturaDaLinha));

  const larguraUtil =
    orientacao === "deitada"
      ? largura * (1 - FAIXA_DO_CODIGO_DEITADA)
      : largura;
  const colunasQueCabem = Math.floor(
    larguraUtil / (corpoEmPx * LARGURA_MINIMA_DA_COLUNA_EM_CORPOS),
  );
  const colunas = Math.max(1, Math.min(MAXIMO_DE_COLUNAS, colunasQueCabem));

  return {
    orientacao,
    colunas,
    linhas,
    produtosPorTela: Math.max(1, Math.min(MAXIMO_POR_TELA, linhas * colunas)),
    corpoEmPx,
  };
}

/**
 * A altura que uma tela montada com esta densidade ocupa, em pixels.
 *
 * Existe para a prova conferir que nada é cortado: respiro, cabeçalho, linhas,
 * rodapé e faixa do código somados nunca passam da altura da televisão. É a
 * soma COMPLETA do que a folha gasta — uma parcela esquecida aqui é um produto
 * cortado lá.
 */
export function alturaOcupada(
  densidade: Densidade,
  medidas: MedidasDaTela,
): number {
  const { corpoEmPx, linhas, orientacao } = densidade;
  const produtos = Math.ceil(densidade.produtosPorTela / densidade.colunas);
  const lista =
    Math.min(linhas, produtos) * corpoEmPx * ALTURA_DA_LINHA_EM_CORPOS;
  return lista + alturaForaDasLinhas(corpoEmPx, orientacao, medidas.altura);
}

/**
 * As medidas que a tela assume antes de conseguir medir a janela.
 *
 * É a televisão mais comum: Full HD deitada. O servidor desenha com ela, e o
 * navegador corrige no primeiro instante — sem isso, a primeira pintura nasceria
 * com uma densidade qualquer e pularia ao medir.
 */
export const MEDIDAS_INICIAIS: MedidasDaTela = { largura: 1920, altura: 1080 };

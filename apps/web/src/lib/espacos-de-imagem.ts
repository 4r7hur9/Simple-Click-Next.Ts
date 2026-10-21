/**
 * A tabela de dimensões por espaço de imagem (card #82) — UM arquivo só.
 *
 * Cada lugar do SimpleClick que recebe uma foto tem aqui as medidas do
 * arquivo final, o mínimo recomendado e como a foto é usada. O recortador
 * (`RecortadorDeImagem`) lê esta tabela para desenhar a moldura na proporção
 * exata e gerar o arquivo já no tamanho certo; as telas de envio leem a mesma
 * tabela para escrever "Recomendado: 1600 × 400 px, JPG/PNG/WebP até 3 MB".
 * Mudou o CSS de um espaço? Mude aqui, e só aqui.
 *
 * DE ONDE SAEM AS PROPORÇÕES (conferido no CSS, não chutado):
 * - logo: quadrada. Círculo nos stories e no topo dos posts do Explorar,
 *   quadrado arredondado na vitrine e na página Sobre.
 * - fundo da vitrine (`.sc-loja__painel`, o cartão de apresentação da loja,
 *   que é a PRIMEIRA TELA: `min-block-size: 100svh` dentro de `.sc-loja__tela`,
 *   com no máximo 76 rem de largura). No computador (referência: notebook
 *   1440 × 900) o cartão tem 1168 × 852 px, perto de 4:3 — e a foto cobre o
 *   cartão todo (`object-fit: cover`). No celular (390 × 844) o cartão tem
 *   358 × 804 px: uma folha EM PÉ, cerca de 9:20. Por isso são DUAS fotos,
 *   cada uma com a sua moldura.
 * - topo do cardápio (`.sc-vitrine__capa`): de tablet em diante (768 px) é uma
 *   faixa `aspect-ratio: 4 / 1` (mínimo 13 rem de altura); no celular a faixa
 *   tem `min-block-size: 12rem` e, com 366 px de largura, fica 366 × 192 px:
 *   cerca de 19:10. Também são DUAS fotos.
 * - banners promocionais (`.sc-banners__item`): 16:9 no celular e, de 640 px
 *   em diante, uma faixa de 220 a 300 px de altura (cerca de 3,2:1). Cada
 *   banner tem duas artes, uma para cada tela.
 * - foto de produto: o cartão da vitrine é 1:1 no celular e 4:3 a partir de
 *   540 px; a tira de destaques e o post do Explorar são 4:5; a página do
 *   produto é 1:1. A foto é guardada QUADRADA e cada lugar corta o seu pedaço.
 * - avatar: quadrado, mostrado em círculo.
 * - story: 9:16 (`.sc-story-caixa`).
 */
import {
  REGRAS_DAS_IMAGENS_DA_LOJA,
  type TipoDeImagemDaLoja,
} from "@simpleclick/contracts";

const MEGA = 1024 * 1024;

/**
 * As medidas e a forma de um espaço, como o recortador as lê. É o mesmo
 * formato de `EspacoDoRecorte` do `@simpleclick/ui` (a tela passa a tabela
 * direto para a janela); fica escrito aqui porque a pasta `lib` não importa
 * o pacote de interface.
 */
export interface MiniaturaDoEspaco {
  readonly rotulo: string;
  /** Largura ÷ altura do quadro. */
  readonly proporcao: number;
  /** Largura do quadro na janela de recorte, em pixels. */
  readonly largura: number;
  readonly forma?: "retangulo" | "arredondado" | "redondo";
  readonly veu?: boolean;
  readonly alinhar?: "centro" | "direita";
}

/** Uma das molduras de um espaço que tem uma foto para cada tipo de tela. */
export interface VarianteDoEspaco {
  readonly id: "computador" | "celular";
  readonly rotulo: string;
  /** Em que telas esta foto aparece, em uma frase. */
  readonly dica: string;
  readonly largura: number;
  readonly altura: number;
  readonly minimo?: { readonly largura: number; readonly altura: number };
  /** A largura da tela que a prévia imita, em pixels (a do cartão ou da faixa). */
  readonly larguraDaTela: number;
  readonly miniaturas?: readonly MiniaturaDoEspaco[];
}

export interface EspacoDoRecorte {
  readonly rotulo: string;
  readonly largura: number;
  readonly altura: number;
  readonly minimo?: { readonly largura: number; readonly altura: number };
  readonly forma?: "retangulo" | "arredondado" | "redondo";
  readonly veu?: boolean;
  readonly miniaturas?: readonly MiniaturaDoEspaco[];
  /** Foto separada para o computador e para o celular (abas "Computador | Celular"). */
  readonly variantes?: readonly VarianteDoEspaco[];
}

export type IdDoEspacoDeImagem =
  | "logo"
  | "fundo-da-vitrine"
  | "topo-do-cardapio"
  | "banner-computador"
  | "banner-celular"
  | "produto"
  | "avatar"
  | "story";

export interface EspacoDeImagem extends EspacoDoRecorte {
  readonly id: IdDoEspacoDeImagem;
  /** Onde a foto aparece, em uma frase. */
  readonly uso: string;
  /** Quanto o arquivo FINAL pode pesar (o recortador comprime até caber). */
  readonly limiteDoArquivoEmBytes: number;
  readonly limiteDoArquivo: string;
}

const MIDIA_DA_LOJA = (tipo: TipoDeImagemDaLoja) => ({
  limiteDoArquivoEmBytes: REGRAS_DAS_IMAGENS_DA_LOJA[tipo].tamanhoMaximoBytes,
  limiteDoArquivo: REGRAS_DAS_IMAGENS_DA_LOJA[tipo].tamanhoMaximo,
});

export const ESPACOS_DE_IMAGEM = {
  logo: {
    id: "logo",
    rotulo: "Logo da loja",
    uso: "Foto de perfil da loja: bolinha dos stories, topo dos posts e vitrine.",
    largura: 512,
    altura: 512,
    minimo: { largura: 256, altura: 256 },
    forma: "redondo",
    ...MIDIA_DA_LOJA("logo"),
    miniaturas: [
      { rotulo: "Nos stories", proporcao: 1, largura: 64, forma: "redondo" },
      { rotulo: "Na vitrine", proporcao: 1, largura: 96, forma: "arredondado" },
    ],
  },
  "fundo-da-vitrine": {
    id: "fundo-da-vitrine",
    rotulo: "Foto de fundo da vitrine",
    uso: "Fundo do cartão de apresentação da loja (a primeira tela), atrás do nome, do logo e do selo Aberto.",
    largura: 1600,
    altura: 1200,
    minimo: { largura: 1200, altura: 900 },
    ...MIDIA_DA_LOJA("fundo"),
    variantes: [
      {
        id: "computador",
        rotulo: "Computador",
        dica: "Notebook, desktop e tablet: cartão deitado, perto de 4:3.",
        largura: 1600,
        altura: 1200,
        minimo: { largura: 1200, altura: 900 },
        larguraDaTela: 1168,
        miniaturas: [
          { rotulo: "No computador", proporcao: 4 / 3, largura: 330 },
        ],
      },
      {
        id: "celular",
        rotulo: "Celular",
        dica: "Telas de até 767 px: cartão em pé, perto de 9:20.",
        largura: 720,
        altura: 1600,
        minimo: { largura: 540, altura: 1200 },
        larguraDaTela: 358,
        miniaturas: [{ rotulo: "No celular", proporcao: 9 / 20, largura: 160 }],
      },
    ],
  },
  "topo-do-cardapio": {
    id: "topo-do-cardapio",
    rotulo: "Foto do topo do cardápio",
    uso: "Faixa no alto do cardápio ou catálogo, atrás do nome da loja; sem ela vale a foto de fundo da vitrine.",
    largura: 1600,
    altura: 400,
    minimo: { largura: 1200, altura: 300 },
    ...MIDIA_DA_LOJA("topo"),
    variantes: [
      {
        id: "computador",
        rotulo: "Computador",
        dica: "Tablet em diante (768 px ou mais): faixa larga, 4:1.",
        largura: 1600,
        altura: 400,
        minimo: { largura: 1200, altura: 300 },
        larguraDaTela: 1104,
        miniaturas: [{ rotulo: "No computador", proporcao: 4, largura: 330 }],
      },
      {
        id: "celular",
        rotulo: "Celular",
        dica: "Telas de até 767 px: faixa mais alta, perto de 19:10.",
        largura: 1140,
        altura: 600,
        minimo: { largura: 855, altura: 450 },
        larguraDaTela: 366,
        miniaturas: [{ rotulo: "No celular", proporcao: 1.9, largura: 260 }],
      },
    ],
  },
  "banner-computador": {
    id: "banner-computador",
    rotulo: "Banner promocional (computador)",
    uso: "Faixa de promoções do cardápio em telas largas.",
    largura: 1600,
    altura: 500,
    minimo: { largura: 1200, altura: 375 },
    limiteDoArquivoEmBytes: 3 * MEGA,
    limiteDoArquivo: "3 MB",
    miniaturas: [{ rotulo: "No cardápio", proporcao: 3.2, largura: 260 }],
  },
  "banner-celular": {
    id: "banner-celular",
    rotulo: "Banner promocional (celular)",
    uso: "Faixa de promoções do cardápio no celular (16:9).",
    largura: 960,
    altura: 540,
    minimo: { largura: 640, altura: 360 },
    limiteDoArquivoEmBytes: 3 * MEGA,
    limiteDoArquivo: "3 MB",
    miniaturas: [{ rotulo: "No celular", proporcao: 16 / 9, largura: 180 }],
  },
  produto: {
    id: "produto",
    rotulo: "Foto do produto",
    uso: "Cartão da vitrine, página do produto e posts do Explorar.",
    largura: 1200,
    altura: 1200,
    minimo: { largura: 800, altura: 800 },
    // Quadrada: cada lugar corta o seu pedaço (4:3 no cartão largo, 4:5 no feed).
    limiteDoArquivoEmBytes: 10 * MEGA,
    limiteDoArquivo: "10 MB",
    miniaturas: [
      { rotulo: "Cartão", proporcao: 1, largura: 84, forma: "arredondado" },
      {
        rotulo: "Cartão largo",
        proporcao: 4 / 3,
        largura: 100,
        forma: "arredondado",
      },
      {
        rotulo: "No feed (4:5)",
        proporcao: 4 / 5,
        largura: 68,
        forma: "arredondado",
      },
    ],
  },
  avatar: {
    id: "avatar",
    rotulo: "Foto da conta",
    uso: "Seu avatar na barra do topo e na conta.",
    largura: 256,
    altura: 256,
    minimo: { largura: 128, altura: 128 },
    forma: "redondo",
    limiteDoArquivoEmBytes: 1 * MEGA,
    limiteDoArquivo: "1 MB",
    miniaturas: [
      { rotulo: "No avatar", proporcao: 1, largura: 56, forma: "redondo" },
    ],
  },
  story: {
    id: "story",
    rotulo: "Capa do story",
    uso: "Tela cheia no celular, em pé (9:16).",
    largura: 1080,
    altura: 1920,
    minimo: { largura: 720, altura: 1280 },
    limiteDoArquivoEmBytes: 10 * MEGA,
    limiteDoArquivo: "10 MB",
    miniaturas: [{ rotulo: "No story", proporcao: 9 / 16, largura: 72 }],
  },
} as const satisfies Record<IdDoEspacoDeImagem, EspacoDeImagem>;

export function espacoDeImagem(id: IdDoEspacoDeImagem): EspacoDeImagem {
  return ESPACOS_DE_IMAGEM[id];
}

/** "1600 × 400 px". */
export function medidasDoEspaco(
  espaco: Pick<EspacoDoRecorte, "largura" | "altura">,
): string {
  return `${String(espaco.largura)} × ${String(espaco.altura)} px`;
}

/** A frase que fica ao lado de cada campo de envio. */
export function textoRecomendado(id: IdDoEspacoDeImagem): string {
  const espaco: EspacoDeImagem = ESPACOS_DE_IMAGEM[id];
  if (espaco.variantes !== undefined && espaco.variantes.length > 1) {
    const partes = espaco.variantes.map(
      (variante) =>
        `${medidasDoEspaco(variante)} no ${variante.rotulo.toLowerCase()}`,
    );
    return `Recomendado: ${partes.join(" e ")}, JPG/PNG/WebP até ${espaco.limiteDoArquivo} cada.`;
  }
  return `Recomendado: ${medidasDoEspaco(espaco)}, JPG/PNG/WebP até ${espaco.limiteDoArquivo}.`;
}

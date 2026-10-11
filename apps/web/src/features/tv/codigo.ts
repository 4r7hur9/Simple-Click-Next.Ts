/**
 * O código que a câmera do celular lê na parede (AC-931).
 *
 * É UM GERADOR DE QR CODE ESCRITO AQUI, e não uma biblioteca — decisão tomada
 * com o P-014 na mão. As bibliotecas disponíveis trazem, junto do gerador,
 * escrita de PNG, linha de comando e dependências para tudo isso; o que a
 * televisão precisa é uma matriz de quadrados para desenhar em SVG, e isso é
 * o que está abaixo, com a prova de que a matriz é decodificável ao lado
 * (`codigo.test.ts` lê o código de volta com um leitor independente).
 *
 * O QUE ELE GERA: código no modo de bytes, nível de correção M (recupera até
 * 15% de dano — o padrão para endereço em tela), versões 1 a 10. Um endereço
 * de vitrine tem cerca de sessenta caracteres e cabe na versão 4; a versão 10
 * aguenta 213 bytes, que é mais do que qualquer endereço razoável. Acima disso
 * o gerador recusa, em vez de produzir um código que a câmera não lê a três
 * metros.
 *
 * A REFERÊNCIA é a ISO/IEC 18004. Os nomes aqui são os do documento, em
 * português: padrão localizador, padrão de alinhamento, padrão de tempo,
 * informação de formato, máscara.
 *
 * Porta de entrada: monta o código com as peças de `codigo/` (geometria,
 * correção, fluxo de bits, máscara e quadro) e reexporta `capacidadeEmBytes`,
 * `VERSAO_MAXIMA` e `bitsDeFormato` para os imports antigos continuarem.
 */

import { Quadro } from "./codigo/quadro.ts";
import {
  bytesDeDado,
  intercalarComCorrecao,
  versaoPara,
} from "./codigo/fluxo.ts";

export { capacidadeEmBytes, VERSAO_MAXIMA } from "./codigo/geometria.ts";
export { bitsDeFormato } from "./codigo/mascara.ts";

/** O código pronto para desenhar: `modulos[linha][coluna]`, escuro = `true`. */
export interface CodigoDeLeitura {
  readonly versao: number;
  /** Quantos módulos de lado. Versão 1 tem 21, e cada versão soma 4. */
  readonly tamanho: number;
  readonly modulos: ReadonlyArray<ReadonlyArray<boolean>>;
  /** A máscara escolhida, de 0 a 7. Sai para a prova conferir o formato. */
  readonly mascara: number;
}

/**
 * A margem silenciosa: quatro módulos claros em volta do código.
 *
 * A câmera precisa dela para achar onde o código começa. Sem margem, o código
 * encostado numa borda escura da tela simplesmente não é reconhecido.
 */
export const MARGEM_SILENCIOSA = 4;

/** Gera o código de leitura de um texto, em UTF-8. */
export function gerarCodigo(texto: string): CodigoDeLeitura {
  const conteudo = new TextEncoder().encode(texto);
  const versao = versaoPara(conteudo.length);
  const quadro = new Quadro(versao);
  quadro.desenharPadroesFixos();
  quadro.escreverBytes(
    intercalarComCorrecao(bytesDeDado(conteudo, versao), versao),
  );

  // A máscara com a menor penalidade é a que a câmera lê com mais folga.
  let melhor = 0;
  let menorPenalidade = Number.POSITIVE_INFINITY;
  for (let mascara = 0; mascara < 8; mascara++) {
    quadro.aplicarMascara(mascara);
    quadro.desenharFormato(mascara);
    const penalidade = quadro.penalidade();
    if (penalidade < menorPenalidade) {
      menorPenalidade = penalidade;
      melhor = mascara;
    }
    quadro.aplicarMascara(mascara);
  }
  quadro.aplicarMascara(melhor);
  quadro.desenharFormato(melhor);

  return {
    versao,
    tamanho: quadro.tamanho,
    modulos: quadro.modulos.map((linha) => [...linha]),
    mascara: melhor,
  };
}

/**
 * O caminho SVG dos módulos escuros, já deslocado pela margem silenciosa.
 *
 * Um `path` só, e não um `rect` por módulo: um código de versão 4 tem mais de
 * mil módulos, e mil elementos no DOM por tela do rodízio é peso à toa.
 */
export function caminhoDosModulos(
  codigo: CodigoDeLeitura,
  margem: number = MARGEM_SILENCIOSA,
): string {
  const partes: string[] = [];
  codigo.modulos.forEach((linha, y) => {
    linha.forEach((escuro, x) => {
      if (escuro)
        partes.push(`M${String(x + margem)} ${String(y + margem)}h1v1h-1z`);
    });
  });
  return partes.join("");
}

/** O nome do parâmetro que diz de onde a pessoa veio. */
export const PARAMETRO_DE_ORIGEM = "origem";

/** O valor que a televisão carrega nele. */
export const ORIGEM_DA_TV = "tv";

/**
 * O endereço que o código carrega: a vitrine da loja, marcada como vinda da TV.
 *
 * A marca é o que permite ao dono saber, depois, que a televisão converteu —
 * sem ela, o pedido de quem leu o código é igual ao de quem chegou pelo
 * buscador.
 */
export function enderecoParaOCelular(enderecoDaVitrine: string): string {
  const endereco = new URL(enderecoDaVitrine);
  endereco.searchParams.set(PARAMETRO_DE_ORIGEM, ORIGEM_DA_TV);
  return endereco.toString();
}

/**
 * O endereço como se lê em voz alta, para quem prefere digitar.
 *
 * Sem esquema, sem `www.`, sem a marca de origem e sem barra no fim: é o que
 * cabe numa linha grande ao lado do código.
 */
export function enderecoCurto(enderecoDaVitrine: string): string {
  const endereco = new URL(enderecoDaVitrine);
  const maquina = endereco.host.replace(/^www\./, "");
  const caminho = endereco.pathname.replace(/\/+$/, "");
  return `${maquina}${caminho}`;
}

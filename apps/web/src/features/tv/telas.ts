/**
 * As telas do rodízio, montadas a partir do catálogo público (AC-925, AC-930).
 *
 * PRODUTO INDISPONÍVEL NÃO ENTRA. A vitrine o mostra riscado, com "esgotado"
 * por cima, porque quem está no celular pode querer saber que aquilo existe e
 * voltar amanhã. A parede não tem esse luxo: cardápio de parede não se corrige
 * a caneta, e mostrar o que acabou gera pedido que a cozinha vai recusar.
 *
 * CADA TELA É DE UMA SEÇÃO SÓ. Misturar "Bebidas" com "Salgados" na mesma tela
 * obrigaria a repetir o nome da seção em cada produto, e o nome grande no
 * cabeçalho — que é o que a fila lê primeiro — deixaria de fazer sentido.
 *
 * FUNÇÃO PURA. O preço chega em centavos, como o contrato manda (P-005), e é
 * escrito aqui pelo mesmo escritor da vitrine — nunca calculado.
 */
import type {
  CatalogoDaVitrineNoContrato,
  ProdutoNaVitrineNoContrato,
} from "@simpleclick/contracts";

import { escreverDinheiro } from "../../lib/dinheiro.ts";

/** Um produto, como a parede o mostra. */
export interface ProdutoNaTv {
  readonly id: string;
  readonly nome: string;
  readonly chamada: string | null;
  /** Já escrito. Nulo quando o preço depende de variação. */
  readonly preco: string | null;
  /** O preço "de", quando há promoção. */
  readonly precoAnterior: string | null;
}

/** Uma tela do rodízio. */
export interface TelaDoRodizio {
  /** Única entre as telas: a seção e o pedaço dela. */
  readonly chave: string;
  readonly secao: string;
  readonly produtos: readonly ProdutoNaTv[];
}

/** O nome da tela dos destaques, quando o dono marcou algum. */
export const NOME_DOS_DESTAQUES = "Destaques";

function comoTv(produto: ProdutoNaVitrineNoContrato): ProdutoNaTv {
  return {
    id: produto.id,
    nome: produto.nome,
    chamada: produto.chamada,
    preco:
      produto.precoCentavos === null
        ? null
        : escreverDinheiro(produto.precoCentavos),
    precoAnterior:
      produto.precoAnteriorCentavos === null
        ? null
        : escreverDinheiro(produto.precoAnteriorCentavos),
  };
}

function emPedacos<T>(lista: readonly T[], tamanho: number): T[][] {
  const pedacos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    pedacos.push(lista.slice(i, i + tamanho));
  }
  return pedacos;
}

/**
 * Monta as telas: destaques primeiro, depois cada seção na ordem do dono.
 *
 * Seção sem produto disponível não gera tela — uma tela com o nome da seção e
 * nada embaixo leria como falha, e a fila não tem como saber que é só uma
 * categoria que o dono ainda está montando.
 */
export function montarTelas(
  catalogo: CatalogoDaVitrineNoContrato,
  produtosPorTela: number,
): TelaDoRodizio[] {
  const porTela = Math.max(1, Math.floor(produtosPorTela));
  const telas: TelaDoRodizio[] = [];

  const acrescentar = (
    chave: string,
    secao: string,
    produtos: readonly ProdutoNaVitrineNoContrato[],
  ): void => {
    const disponiveis = produtos
      .filter((produto) => produto.disponivel)
      .map(comoTv);
    emPedacos(disponiveis, porTela).forEach((pedaco, indice) => {
      telas.push({
        chave: `${chave}:${String(indice)}`,
        secao,
        produtos: pedaco,
      });
    });
  };

  acrescentar("destaques", NOME_DOS_DESTAQUES, catalogo.destaques);
  for (const secao of catalogo.secoes) {
    acrescentar(secao.id, secao.nome, secao.produtos);
  }

  return telas;
}

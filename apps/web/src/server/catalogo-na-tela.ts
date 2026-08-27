/**
 * O catálogo do contrato, preparado para a tela (AC-405, AC-406, AC-407).
 *
 * ESTA CAMADA EXISTE POR CAUSA DA TABELA DE FRONTEIRAS, e não por gosto de
 * indireção: `web-features` só alcança `pkg-ui`, `pkg-contracts` e `web-lib` —
 * nunca `pkg-core`. Preço é conta, conta mora em `packages/core` (P-006), e por
 * isso o componente recebe o preço JÁ ESCRITO em vez de calculá-lo. A T-964
 * tomou a mesma decisão pelo mesmo motivo, e a razão dela vale aqui inteira:
 * uma segunda conta escrita na tela diverge da real no dia em que uma das duas
 * mudar.
 *
 * O FILTRO DE CATEGORIA TAMBÉM MORA AQUI, e isso é o que faz o AC-405 conviver
 * com o AC-415. Filtrar no navegador exigiria script para mostrar produto, que
 * é exatamente o que a vitrine não pode exigir. Aqui a escolha chega pelo
 * endereço, o servidor devolve a página já filtrada, e cada aba é um link de
 * verdade — funciona com JavaScript desligado, o buscador segue, e o botão
 * "voltar" do navegador desfaz o filtro sem nenhum código nosso.
 */
import { emReais } from "@simpleclick/core";
import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import {
  PARAMETRO_DA_BUSCA,
  PARAMETRO_DA_CATEGORIA,
  ROTULO_DE_TODAS,
  type AbaDeCategoria,
  type CatalogoNaTela,
  type ProdutoNaTela,
  type SecaoNaTela,
} from "../lib/catalogo.ts";

/**
 * Escreve o preço, ou devolve nulo quando não há um preço só.
 *
 * Produto cujo preço depende de variação chega com `precoCentavos` nulo de
 * propósito: inventar "a partir de" aqui seria escolher um número que o
 * servidor não escolheu, e a vitrine passaria a prometer um preço que o
 * produto pode não ter.
 */
function escrever(centavos: number | null): string | null {
  return centavos === null ? null : emReais(centavos);
}

function prepararProduto(
  produto: CatalogoDaVitrineNoContrato["destaques"][number],
  apelidoDaLoja: string,
): ProdutoNaTela {
  return {
    id: produto.id,
    apelido: produto.apelido,
    nome: produto.nome,
    chamada: produto.chamada,
    preco: escrever(produto.precoCentavos),
    // Só é "preço de" se for MAIOR que o atual. Um valor igual ou menor riscado
    // ao lado do preço faz a loja parecer que aumentou e fingiu promoção.
    precoAnterior:
      produto.precoAnteriorCentavos !== null &&
      produto.precoCentavos !== null &&
      produto.precoAnteriorCentavos > produto.precoCentavos
        ? escrever(produto.precoAnteriorCentavos)
        : null,
    imagem: produto.imagem,
    disponivel: produto.disponivel,
    link: `/l/${apelidoDaLoja}/produto/${produto.id}`,
  };
}

/**
 * O endereço do catálogo com os filtros que estiverem valendo.
 *
 * A BUSCA ATRAVESSA AS ABAS de propósito: quem procurou "coxinha" e clica em
 * "Salgados" está estreitando o resultado, e não recomeçando. Perder o termo ali
 * obrigaria a digitar de novo a cada aba — e faria as duas escolhas brigarem em
 * vez de somarem.
 */
function enderecoDoCatalogo(
  apelidoDaLoja: string,
  categoria: string | null,
  busca: string | null,
): string {
  const base = `/l/${apelidoDaLoja}/catalogo`;
  const partes: string[] = [];
  if (categoria !== null) {
    partes.push(`${PARAMETRO_DA_CATEGORIA}=${encodeURIComponent(categoria)}`);
  }
  if (busca !== null) {
    partes.push(`${PARAMETRO_DA_BUSCA}=${encodeURIComponent(busca)}`);
  }
  return partes.length === 0 ? base : `${base}?${partes.join("&")}`;
}

export interface OpcoesDoCatalogo {
  readonly apelidoDaLoja: string;
  /** O que veio no endereço. Nulo, vazio ou desconhecido significam "todas". */
  readonly categoriaEscolhida?: string | null | undefined;
  /** O termo buscado. O SERVIDOR já filtrou por ele; aqui ele só é escrito. */
  readonly termoBuscado?: string | null | undefined;
}

/**
 * Prepara o catálogo para a tela: escreve preços, monta as abas e aplica o
 * filtro de categoria.
 */
export function prepararCatalogo(
  catalogo: CatalogoDaVitrineNoContrato,
  { apelidoDaLoja, categoriaEscolhida, termoBuscado }: OpcoesDoCatalogo,
): CatalogoNaTela {
  const secoes: readonly SecaoNaTela[] = catalogo.secoes.map((secao) => ({
    id: secao.id,
    apelido: secao.apelido,
    nome: secao.nome,
    produtos: secao.produtos.map((p) => prepararProduto(p, apelidoDaLoja)),
  }));

  const termo =
    termoBuscado !== null && termoBuscado !== undefined && termoBuscado !== ""
      ? termoBuscado
      : null;

  const semProduto = secoes.every((secao) => secao.produtos.length === 0);

  // Loja sem catálogo é loja sem NENHUM produto em nenhuma seção — e não loja
  // sem seção. Uma loja pode ter as seções criadas e nada publicado ainda, e
  // para quem abre a vitrine as duas situações são a mesma (AC-407).
  //
  // COM BUSCA VALENDO, vazio não é isso. As seções que chegam já vêm filtradas
  // pelo termo, e dizer "o cardápio está sendo montado" para uma loja cheia que
  // não vende coxinha seria mentir sobre a loja por causa de uma palavra.
  const lojaSemCatalogo = termo === null && semProduto;
  const buscaSemAcerto = termo !== null && semProduto;

  const pedida =
    categoriaEscolhida !== null &&
    categoriaEscolhida !== undefined &&
    categoriaEscolhida !== ""
      ? categoriaEscolhida
      : null;

  const escolhida =
    pedida === null
      ? null
      : (secoes.find((secao) => secao.apelido === pedida) ?? null);

  // Categoria desconhecida no endereço NÃO é erro: é endereço velho, link
  // compartilhado depois de o dono renomear a seção, ou alguém digitando. A
  // página continua inteira e diz que aquela categoria não existe mais, com o
  // caminho de volta — 404 aqui perderia a loja junto com a categoria.
  const filtroSemAcerto = pedida !== null && escolhida === null;

  const abas: readonly AbaDeCategoria[] = [
    {
      nome: ROTULO_DE_TODAS,
      link: enderecoDoCatalogo(apelidoDaLoja, null, termo),
      emVigor: escolhida === null && !filtroSemAcerto,
    },
    ...secoes.map((secao) => ({
      nome: secao.nome,
      link: enderecoDoCatalogo(apelidoDaLoja, secao.apelido, termo),
      emVigor: escolhida !== null && secao.apelido === escolhida.apelido,
    })),
  ];

  return {
    secoes: escolhida === null ? secoes : [escolhida],
    // OS DESTAQUES SOMEM QUANDO HÁ FILTRO, e é o AC-405 que manda: ele promete
    // que escolher Bebidas mostra APENAS os produtos de Bebidas. Destaque de
    // outra seção continuar no topo desmentiria a promessa na primeira tela.
    destaques:
      escolhida === null && !filtroSemAcerto
        ? catalogo.destaques.map((p) => prepararProduto(p, apelidoDaLoja))
        : [],
    abas,
    filtroEmVigor: escolhida?.nome ?? null,
    linkDeTodas: enderecoDoCatalogo(apelidoDaLoja, null, termo),
    termoBuscado: termo,
    buscaSemAcerto,
    linkSemBusca: enderecoDoCatalogo(apelidoDaLoja, null, null),
    lojaSemCatalogo,
    filtroSemAcerto,
  };
}

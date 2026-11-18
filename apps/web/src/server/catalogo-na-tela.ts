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
import type {
  CatalogoDaVitrineNoContrato,
  PaginaDoCatalogoNoContrato,
  ProdutoNaVitrineNoContrato,
  ResumoDoCatalogoNoContrato,
} from "@simpleclick/contracts";

import { chamadaDoAtacado } from "../lib/atacado-na-vitrine.ts";
import {
  lerOrdem,
  ORDENS_DO_CATALOGO,
  PARAMETRO_DA_BUSCA,
  PARAMETRO_DA_CATEGORIA,
  PARAMETRO_DA_ORDEM,
  PARAMETRO_DO_ATACADO,
  ORDENS_NOVAS,
  PARAMETRO_DO_ESTOQUE,
  PARAMETRO_DO_PRECO_ATE,
  PARAMETRO_DO_PRECO_DE,
  precoParaEndereco,
  precoParaLeitura,
  PARAMETRO_DO_CURSOR,
  ROTULO_DE_TODAS,
  rotuloDoValor,
  type AbaDeCategoria,
  type FiltroAtivoNaTela,
  type MaisProdutosNaTela,
  type RecorteDaLista,
  type OpcaoDeOrdem,
  type OrdemDoCatalogo,
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

export function prepararProduto(
  produto: ProdutoNaVitrineNoContrato,
  apelidoDaLoja: string,
): ProdutoNaTela {
  return {
    id: produto.id,
    apelido: produto.apelido,
    nome: produto.nome,
    chamada: produto.chamada,
    preco: escrever(produto.precoCentavos),
    precoCentavos: produto.precoCentavos,
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
    motivoIndisponivel: produto.motivoIndisponivel ?? null,
    atacado: chamadaDoAtacado(produto.atacado),
    link: `/loja/${apelidoDaLoja}/produto/${produto.id}`,
  };
}

/** O que vai no endereço do catálogo. Nulo ou vazio fica de fora. */
interface RecorteDoEndereco {
  readonly categoria: string | null;
  readonly busca: string | null;
  readonly ordem?: OrdemDoCatalogo | undefined;
  readonly filtros?: readonly string[] | undefined;
  /** `?atacado=1` (card #59): atravessa abas, ordem e busca, como os filtros. */
  readonly atacado?: boolean | undefined;
  /** `?estoque=1`, `?preco-de=` e `?preco-ate=` (card #108); preços em centavos. */
  readonly estoque?: boolean | undefined;
  readonly precoMin?: number | null | undefined;
  readonly precoMax?: number | null | undefined;
  /** `?cursor=` (card #74): a página seguinte de uma lista, sem script. */
  readonly cursor?: string | null | undefined;
}

/**
 * O endereço do catálogo com os filtros que estiverem valendo.
 *
 * A BUSCA ATRAVESSA AS ABAS de propósito: quem procurou "coxinha" e clica em
 * "Salgados" está estreitando o resultado, e não recomeçando. Perder o termo ali
 * obrigaria a digitar de novo a cada aba — e faria as duas escolhas brigarem em
 * vez de somarem. A ORDEM atravessa pelo mesmo motivo: quem pediu "menor preço"
 * continua querendo isso na aba seguinte.
 */
function enderecoDoCatalogo(
  apelidoDaLoja: string,
  {
    categoria,
    busca,
    ordem = "relevancia",
    filtros = [],
    atacado = false,
    estoque = false,
    precoMin = null,
    precoMax = null,
    cursor = null,
  }: RecorteDoEndereco,
): string {
  const base = `/loja/${apelidoDaLoja}/cardapio`;
  const partes: string[] = [];
  if (categoria !== null) {
    partes.push(`${PARAMETRO_DA_CATEGORIA}=${encodeURIComponent(categoria)}`);
  }
  if (busca !== null) {
    partes.push(`${PARAMETRO_DA_BUSCA}=${encodeURIComponent(busca)}`);
  }
  for (const filtro of filtros) {
    partes.push(`filtro=${encodeURIComponent(filtro)}`);
  }
  if (atacado) {
    partes.push(`${PARAMETRO_DO_ATACADO}=1`);
  }
  if (estoque) partes.push(`${PARAMETRO_DO_ESTOQUE}=1`);
  if (precoMin !== null) {
    partes.push(`${PARAMETRO_DO_PRECO_DE}=${precoParaEndereco(precoMin)}`);
  }
  if (precoMax !== null) {
    partes.push(`${PARAMETRO_DO_PRECO_ATE}=${precoParaEndereco(precoMax)}`);
  }
  if (ordem !== "relevancia") {
    partes.push(`${PARAMETRO_DA_ORDEM}=${ordem}`);
  }
  if (cursor) {
    partes.push(`${PARAMETRO_DO_CURSOR}=${encodeURIComponent(cursor)}`);
  }
  return partes.length === 0 ? base : `${base}?${partes.join("&")}`;
}

const COMPARAR_NOMES = new Intl.Collator("pt-BR", { sensitivity: "base" });

/**
 * Ordena os produtos. Produto sem preço único ("Ver opções") vai para o fim
 * nas ordens por preço: pô-lo no começo de "menor preço" prometeria um valor
 * que ele não tem. Empate mantém a ordem do dono (o `sort` é estável).
 *
 * Só serve ao catálogo INTEIRO (`prepararCatalogo`); no catálogo em páginas
 * quem ordena é a API, com a mesma regra. A TV NÃO aplica estoque, faixa nem as
 * ordens novas.
 */
function ordenar(
  produtos: readonly ProdutoNaVitrineNoContrato[],
  ordem: OrdemDoCatalogo,
): readonly ProdutoNaVitrineNoContrato[] {
  // As ordens novas (lançamentos e desconto de atacado, card #108) e o estoque
  // e a faixa de preço só existem na API: este caminho (a TV e as provas, com o
  // catálogo inteiro na mão) mantém a ordem do dono, e o comentário acima vale
  // só para as ordens que ele conhece.
  if (ordem === "relevancia" || ORDENS_NOVAS.includes(ordem)) return produtos;
  const copia = [...produtos];
  if (ordem === "a-z") {
    return copia.sort((a, b) => COMPARAR_NOMES.compare(a.nome, b.nome));
  }
  const sinal = ordem === "menor-preco" ? 1 : -1;
  return copia.sort((a, b) => {
    if (a.precoCentavos === null) return b.precoCentavos === null ? 0 : 1;
    if (b.precoCentavos === null) return -1;
    return sinal * (a.precoCentavos - b.precoCentavos);
  });
}

export interface OpcoesDoCatalogo {
  readonly apelidoDaLoja: string;
  /** O que veio no endereço. Nulo, vazio ou desconhecido significam "todas". */
  readonly categoriaEscolhida?: string | null | undefined;
  /** O termo buscado. O SERVIDOR já filtrou por ele; aqui ele só é escrito. */
  readonly termoBuscado?: string | null | undefined;
  /** O valor de `?ordem=`. Ausente ou desconhecido vale "relevancia". */
  readonly ordem?: string | null | undefined;
  /** Os `?filtro=` em vigor, para o link de cada ordem não desfazê-los. */
  readonly filtros?: readonly string[] | undefined;
  /** O filtro de atacado está ligado no endereço (card #59). */
  readonly atacado?: boolean | undefined;
  /** Estoque e faixa de preço (card #108); preços em centavos. */
  readonly estoque?: boolean | undefined;
  readonly precoMin?: number | null | undefined;
  readonly precoMax?: number | null | undefined;
}

/** O texto não vazio, ou nulo. */
function preenchido(valor: string | null | undefined): string | null {
  return valor !== null && valor !== undefined && valor !== "" ? valor : null;
}

/**
 * A tela precisa de UMA PÁGINA de produtos (além do resumo) quando há
 * categoria escolhida ou ordem fora da do dono: aí a lista é uma só. Sem
 * nenhum dos dois, o cardápio mostra todas as seções, cada uma com os
 * primeiros produtos que vêm no resumo (card #74).
 */
export function precisaDePagina(
  categoriaEscolhida: string | null | undefined,
  ordem: string | null | undefined,
): boolean {
  return preenchido(categoriaEscolhida) !== null || lerOrdem(ordem) !== "relevancia";
}

/**
 * Prepara o catálogo INTEIRO para a tela: escreve preços, monta as abas e
 * aplica o filtro de categoria e a ordem aqui mesmo.
 *
 * É o caminho de quem já tem a loja toda na mão (a TV, as provas). Ele monta
 * o mesmo resumo e a mesma página que a API devolveria e passa pelo MESMO
 * `prepararCatalogoEmPaginas` — as duas formas não têm como divergir nas
 * ordens e filtros que a TV conhece. Estoque, faixa de preço e as ordens novas
 * (card #108) só a API aplica: aqui valem como se não tivessem sido pedidos.
 */
export function prepararCatalogo(
  catalogo: CatalogoDaVitrineNoContrato,
  opcoes: OpcoesDoCatalogo,
): CatalogoNaTela {
  const ordem = lerOrdem(opcoes.ordem);
  const pedida = preenchido(opcoes.categoriaEscolhida);
  const resumo: ResumoDoCatalogoNoContrato = {
    versao: catalogo.versao,
    secoes: catalogo.secoes.map((secao) => ({
      ...secao,
      total: secao.produtos.length,
      proximoCursor: null,
    })),
    destaques: catalogo.destaques,
    filtros: catalogo.filtros,
    atacado: catalogo.atacado,
  };

  let pagina: PaginaDoCatalogoNoContrato | null = null;
  if (precisaDePagina(pedida, ordem)) {
    const daLista =
      pedida === null
        ? catalogo.secoes
        : catalogo.secoes.filter((secao) => secao.apelido === pedida);
    // Produto que está em duas seções aparece uma vez (vale o primeiro).
    const vistos = new Set<string>();
    const primeiraVez = daLista
      .flatMap((secao) => secao.produtos)
      .filter((produto) => !vistos.has(produto.id) && vistos.add(produto.id));
    const produtos = ordenar(primeiraVez, ordem);
    pagina = {
      versao: catalogo.versao,
      produtos: [...produtos],
      total: produtos.length,
      proximoCursor: null,
    };
  }
  return prepararCatalogoEmPaginas(resumo, pagina, opcoes);
}

/**
 * Prepara o catálogo EM PÁGINAS para a tela (card #74): o resumo dá as seções,
 * as contagens, os destaques e as facetas; a página, quando há, é a lista da
 * categoria escolhida ou da ordem pedida.
 *
 * Cada lista que não veio inteira ganha `mais`: o cursor, o recorte e o link
 * do "Ver mais" sem script.
 */
export function prepararCatalogoEmPaginas(
  resumo: ResumoDoCatalogoNoContrato,
  pagina: PaginaDoCatalogoNoContrato | null,
  {
    apelidoDaLoja,
    categoriaEscolhida,
    termoBuscado,
    ordem: ordemPedida,
    filtros = [],
    atacado = false,
    estoque = false,
    precoMin = null,
    precoMax = null,
  }: OpcoesDoCatalogo,
): CatalogoNaTela {
  const termo = preenchido(termoBuscado);
  const ordem = lerOrdem(ordemPedida);
  // Os filtros que atravessam abas, ordem e "Ver mais", como o atacado.
  const globais = { estoque, precoMin, precoMax };
  const recorte = (categoria: string | null): RecorteDaLista => ({
    categoria,
    busca: termo,
    filtros: [...filtros],
    atacado,
    ordem,
    // Só quando ligados: o recorte de sempre não ganha campo nenhum.
    ...(estoque ? { estoque } : {}),
    ...(precoMin !== null ? { precoMin } : {}),
    ...(precoMax !== null ? { precoMax } : {}),
  });

  const secoes: readonly SecaoNaTela[] = resumo.secoes.map((secao) => ({
    id: secao.id,
    apelido: secao.apelido,
    nome: secao.nome,
    produtos: secao.produtos.map((p) => prepararProduto(p, apelidoDaLoja)),
    total: secao.total,
    // Sem script, o "Ver mais" de uma seção leva à categoria inteira.
    mais:
      secao.proximoCursor === null
        ? null
        : {
            cursor: secao.proximoCursor,
            recorte: { ...recorte(secao.apelido), ordem: "relevancia" },
            link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
              categoria: secao.apelido,
              busca: termo,
              filtros,
              atacado,
            }),
          },
  }));

  // Vazio é pela CONTAGEM, e não pelos produtos que vieram: a seção pode ter
  // vindo só com o número, e a categoria escolhida vem na página.
  const semProduto = secoes.every((secao) => (secao.total ?? 0) === 0);

  // Loja sem catálogo é loja sem NENHUM produto em nenhuma seção — e não loja
  // sem seção. Uma loja pode ter as seções criadas e nada publicado ainda, e
  // para quem abre a vitrine as duas situações são a mesma (AC-407).
  //
  // COM BUSCA VALENDO, vazio não é isso. As seções que chegam já vêm filtradas
  // pelo termo, e dizer "o cardápio está sendo montado" para uma loja cheia que
  // não vende coxinha seria mentir sobre a loja por causa de uma palavra.
  //
  // O MESMO VALE PARA O ATACADO (card #59): ligado e sem acerto é "nenhum
  // produto com atacado", e não loja vazia.
  //
  // O MESMO VALE PARA O FILTRO DE ESPECIFICAÇÃO (card #108): a API tira as
  // seções sem acerto, então um filtro sem nenhum produto deixa `secoes` vazio —
  // e isso NÃO é loja sem catálogo, nem "atacado" sem acerto. É "nenhum produto
  // com esse filtro", e a tela precisa manter a barra para desfazê-lo.
  const comFiltro =
    filtros.length > 0 || estoque || precoMin !== null || precoMax !== null;
  const lojaSemCatalogo =
    termo === null && !atacado && !comFiltro && semProduto;
  const buscaSemAcerto = termo !== null && semProduto;
  const atacadoSemAcerto =
    termo === null && atacado && !comFiltro && semProduto;

  const pedida = preenchido(categoriaEscolhida);
  const escolhida =
    pedida === null
      ? null
      : (secoes.find((secao) => secao.apelido === pedida) ?? null);

  // Categoria desconhecida no endereço NÃO é erro: é endereço velho, link
  // compartilhado depois de o dono renomear a seção, ou alguém digitando. A
  // página continua inteira e diz que aquela categoria não existe mais, com o
  // caminho de volta — 404 aqui perderia a loja junto com a categoria.
  const categoriaPedidaAusente = pedida !== null && escolhida === null;
  // Só é "a categoria não existe mais" quando NENHUM filtro está ligado: com
  // filtro, a API também tira a seção que existe mas não tem acerto, e a
  // explicação certa é a do filtro.
  const filtroSemAcerto = categoriaPedidaAusente && !comFiltro;
  const filtroSemAcertoNaLista =
    comFiltro &&
    termo === null &&
    (semProduto || categoriaPedidaAusente);

  const abas: readonly AbaDeCategoria[] = [
    {
      nome: ROTULO_DE_TODAS,
      link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
        categoria: null,
        busca: termo,
        ordem,
        atacado,
      }),
      emVigor: escolhida === null && !categoriaPedidaAusente,
    },
    ...secoes.map((secao) => ({
      nome: secao.nome,
      link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
        categoria: secao.apelido,
        busca: termo,
        ordem,
        atacado,
      }),
      emVigor: escolhida !== null && secao.apelido === escolhida.apelido,
      total: secao.total,
    })),
  ];

  // A lista única (categoria escolhida ou ordem fora da do dono) vem da
  // página; o "Ver mais" dela, sem script, leva à página seguinte.
  const daPagina = (
    base: Pick<SecaoNaTela, "id" | "apelido" | "nome">,
    categoria: string | null,
  ): SecaoNaTela => {
    const mais: MaisProdutosNaTela | null =
      pagina === null || pagina.proximoCursor === null
        ? null
        : {
            cursor: pagina.proximoCursor,
            recorte: recorte(categoria),
            link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
              categoria,
              busca: termo,
              ordem,
              filtros,
              atacado,
              cursor: pagina.proximoCursor,
            }),
          };
    return {
      ...base,
      produtos: (pagina?.produtos ?? []).map((p) =>
        prepararProduto(p, apelidoDaLoja),
      ),
      total: pagina?.total ?? 0,
      mais,
    };
  };

  // FORA DA ORDEM DO DONO, AS SEÇÕES VIRAM UMA LISTA SÓ. "Menor preço" dentro
  // de cada seção deixaria o pastel de R$ 5 da sexta seção lá embaixo, e quem
  // pediu o mais barato quer o mais barato da loja. Produto que está em duas
  // seções aparece uma vez (a API já devolve assim).
  const secoesNaOrdem: readonly SecaoNaTela[] =
    escolhida !== null
      ? [daPagina(escolhida, escolhida.apelido)]
      : ordem === "relevancia" || semProduto || categoriaPedidaAusente
        ? secoes
        : [
            daPagina(
              { id: "todos", apelido: "todos", nome: "Todos os produtos" },
              null,
            ),
          ];

  const ordens: readonly OpcaoDeOrdem[] = ORDENS_DO_CATALOGO.map((opcao) => ({
    valor: opcao.valor,
    nome: opcao.nome,
    link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
      categoria: escolhida?.apelido ?? null,
      busca: termo,
      ordem: opcao.valor,
      filtros,
      atacado,
    }),
    emVigor: opcao.valor === ordem,
  }));

  const faceta = resumo.atacado ?? { produtos: 0, menorPedidoMinimo: null };

  // Um chip por filtro de especificação ligado. O rótulo usa o nome que a API
  // oferece ("Tamanho"); chave que a API não oferece mais cai na própria chave.
  const oferecidos = resumo.filtros ?? [];
  const semOsGlobais = { estoque: false, precoMin: null, precoMax: null };
  const linkSem = (retirar: Partial<RecorteDoEndereco>) =>
    enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
      categoria: pedida,
      busca: termo,
      ordem,
      filtros,
      atacado,
      ...retirar,
    });
  const filtrosDeEspecificacao: readonly FiltroAtivoNaTela[] = filtros.map((ligado) => {
    const separador = ligado.indexOf("=");
    const chave = separador === -1 ? ligado : ligado.slice(0, separador);
    const valor = separador === -1 ? "" : ligado.slice(separador + 1);
    const nome = oferecidos.find((f) => f.chave === chave)?.nome ?? chave;
    return {
      rotulo: valor === "" ? nome : `${nome}: ${rotuloDoValor(valor)}`,
      // A categoria do endereço fica como a pessoa a pediu: tirar um filtro não
      // pode trocar de categoria.
      link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
        categoria: pedida,
        busca: termo,
        ordem,
        filtros: filtros.filter((outro) => outro !== ligado),
        atacado,
      }),
    };
  });
  // Estoque e faixa de preço (card #108): um chip cada, e cada um tira só o seu.
  const filtrosAtivos: readonly FiltroAtivoNaTela[] = [
    ...filtrosDeEspecificacao,
    ...(estoque
      ? [{ rotulo: "Em estoque", link: linkSem({ estoque: false }) }]
      : []),
    ...(precoMin !== null || precoMax !== null
      ? [
          {
            rotulo:
              precoMin !== null && precoMax !== null
                ? `Preço: ${precoParaLeitura(precoMin)} a ${precoParaLeitura(precoMax)}`
                : precoMin !== null
                  ? `Preço: a partir de ${precoParaLeitura(precoMin)}`
                  : `Preço: até ${precoParaLeitura(precoMax ?? 0)}`,
            link: linkSem({ precoMin: null, precoMax: null }),
          },
        ]
      : []),
  ];
  const totalEncontrado =
    pagina !== null
      ? pagina.total
      : secoes.reduce((soma, secao) => soma + (secao.total ?? 0), 0);

  return {
    filtros: resumo.filtros ?? [],
    secoes: secoesNaOrdem,
    // OS DESTAQUES SOMEM QUANDO HÁ FILTRO, e é o AC-405 que manda: ele promete
    // que escolher Bebidas mostra APENAS os produtos de Bebidas. Destaque de
    // outra seção continuar no topo desmentiria a promessa na primeira tela.
    //
    // E SOMEM FORA DA ORDEM DO DONO: "destaques primeiro" é justamente uma das
    // ordens, e quem pediu "menor preço" quer a lista começando pelo mais barato.
    destaques:
      escolhida === null && !categoriaPedidaAusente && ordem === "relevancia"
        ? resumo.destaques.map((p) => prepararProduto(p, apelidoDaLoja))
        : [],
    abas,
    filtroEmVigor: escolhida?.nome ?? null,
    linkDeTodas: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
      categoria: null,
      busca: termo,
      ordem,
      atacado,
    }),
    termoBuscado: termo,
    buscaSemAcerto,
    linkSemBusca: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
      categoria: null,
      busca: null,
    }),
    lojaSemCatalogo,
    filtroSemAcerto,
    filtroSemAcertoNaLista,
    linkSemFiltros: enderecoDoCatalogo(apelidoDaLoja, {
      ...semOsGlobais,
      categoria: pedida,
      busca: termo,
      ordem,
      atacado,
    }),
    ordem,
    ordens,
    atacado: {
      produtos: faceta.produtos,
      menorPedidoMinimo: faceta.menorPedidoMinimo,
      ligado: atacado,
      link: enderecoDoCatalogo(apelidoDaLoja, {
      ...globais,
        categoria: escolhida?.apelido ?? null,
        busca: termo,
        ordem,
        filtros,
        atacado: !atacado,
      }),
    },
    atacadoSemAcerto,
    filtrosAtivos,
    totalEncontrado,
  };
}

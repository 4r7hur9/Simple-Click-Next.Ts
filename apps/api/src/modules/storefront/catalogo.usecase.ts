/**
 * O catálogo público de uma loja (AC-404, AC-406, AC-407, AC-417).
 *
 * O QUE ELE DEVOLVE: as seções visíveis, na ordem que o dono definiu, cada uma
 * com os produtos publicados dela — e a lista separada dos destaques.
 *
 * A LISTA DE CAMPOS É DE PERMITIDOS, como a da loja. `products` guarda coluna
 * que não é de ninguém que esteja navegando: quem criou, custo interno, notas
 * de estoque, o vetor de busca. Uma resposta montada com o registro inteiro
 * entregaria tudo isso, e a coluna acrescentada no ano que vem nasceria pública
 * sem ninguém decidir isso.
 *
 * O QUE ELE NÃO FILTRA, DE PROPÓSITO. Categoria oculta, categoria removida e
 * produto em rascunho não aparecem aqui porque a POLÍTICA DO BANCO os recusa —
 * `categories_storefront_select` desde a migração 0016, `products_storefront_select`
 * desde a 0004. Repetir o filtro na consulta daria a impressão de que a
 * garantia mora aqui; ela mora lá, e é o que faz a próxima consulta escrita por
 * outra pessoa continuar segura.
 *
 * A ORDEM É DO DONO, e não alfabética: qual seção vem primeiro é decisão de
 * negócio. Dentro da seção, a ordem também é dele — e é por isso que ela vive
 * em `product_categories`, e não no produto: o mesmo item é o primeiro em
 * "Promoções" e o quinto em "Lanches".
 */
import type { AtacadoDoProdutoNoContrato } from "@simpleclick/contracts";
import {
  estaNaJanelaDeDisponibilidade,
  lerJanelasDeDisponibilidade,
  precoQueVale,
} from "@simpleclick/core";

import {
  atacadoPublico,
  comoPrecoCadastrado,
  type LinhaDePrecoDoAtacado,
} from "../../core/atacado-publico.ts";
import { transacaoAtual } from "../../core/db.ts";
import { fusoDaLoja } from "./fuso-da-loja.ts";
import type { MotivoIndisponivel } from "./produto.usecase.ts";

/** Um produto, como a vitrine o mostra. */
export interface ProdutoNaVitrine {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  /** A frase curta do cartão. Nula quando o dono não escreveu. */
  readonly chamada: string | null;
  /** Centavos inteiros, sempre. Nulo quando o preço depende de variação. */
  readonly precoCentavos: number | null;
  /** O preço "de", para quando há promoção. */
  readonly precoAnteriorCentavos: number | null;
  readonly imagem: string | null;
  readonly destaque: boolean;
  readonly disponivel: boolean;
  /**
   * Por que não está comprável agora; nulo quando está (AC-321, AC-322).
   *
   * O MESMO VOCABULÁRIO da página do produto: o cartão que diz "esgotado" e a
   * página que diz "fora do horário" para o mesmo item seriam duas regras.
   */
  readonly motivoIndisponivel: MotivoIndisponivel | null;
  /**
   * O atacado sobre `precoCentavos` (card #56): "Atacado a partir de 10 un.:
   * R$ 9,50". Nulo = só varejo, e o cartão fica como sempre foi.
   */
  readonly atacado: AtacadoDoProdutoNoContrato | null;
}

/** Uma seção da vitrine. */
export interface SecaoDaVitrine {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly produtos: readonly ProdutoNaVitrine[];
}

/** O catálogo inteiro, como a vitrine o recebe. */
export interface CatalogoDaVitrine {
  readonly secoes: readonly SecaoDaVitrine[];
  /** Os destaques, em área própria no topo (AC-406). */
  readonly destaques: readonly ProdutoNaVitrine[];
  /**
   * A versão do catálogo no momento da leitura.
   *
   * É o que permite guardar a resposta e saber quando ela venceu sem consultar
   * o catálogo inteiro de novo: o banco incrementa a versão a cada escrita em
   * produto, categoria, vínculo ou imagem (migrações 0004 e 0017).
   *
   * Texto, e não número: a coluna é `bigint`, e `JSON.stringify` recusa esse
   * tipo. Número comum aguentaria o valor, mas converter aqui esconderia que a
   * origem é `bigint` de quem for ler este campo depois.
   */
  readonly versao: string;
}

/**
 * O preço em centavos, como número.
 *
 * O BANCO DEVOLVE `bigint` porque a coluna é `bigint` — e `JSON.stringify`
 * RECUSA `bigint`, com erro em tempo de execução. Sem esta conversão a rota
 * inteira quebraria no primeiro produto com preço, e o erro apontaria para o
 * serializador, não para cá.
 *
 * Número comum aguenta o valor: o limite seguro do JavaScript passa de nove
 * quatrilhões de centavos.
 */
function emCentavos(valor: bigint | null): number | null {
  return valor === null ? null : Number(valor);
}

/** Os campos de produto que podem sair na resposta pública. */
const CAMPOS_DO_PRODUTO = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  displayPriceCents: true,
  compareAtCents: true,
  isFeatured: true,
  isAvailable: true,
  unavailableUntil: true,
  saleWindows: true,
} as const;

/** A imagem principal, e só ela: a vitrine mostra uma por cartão. */
const IMAGEM_PRINCIPAL = {
  where: { isPrimary: true },
  select: { url: true },
  take: 1,
} as const;

/**
 * A linha como o Prisma a devolve.
 *
 * `imagens` é lista MUTÁVEL, e não somente-leitura: é o tipo que o cliente
 * gerado produz, e declará-la imutável aqui faria o tipo do Prisma deixar de
 * ser atribuível a este — o compilador recusa, e o conserto óbvio (um molde de
 * tipo) apagaria justamente a conferência que interessa.
 */
interface LinhaDeProduto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string | null;
  readonly displayPriceCents: bigint | null;
  readonly compareAtCents: bigint | null;
  readonly isFeatured: boolean;
  readonly isAvailable: boolean;
  readonly unavailableUntil: Date | null;
  readonly saleWindows: unknown;
  readonly imagens: { readonly url: string | null }[];
}

/** O instante e o fuso em que a janela de venda é avaliada. */
interface MomentoDaLoja {
  readonly agora: Date;
  readonly fusoHorario: string;
}

/**
 * Se o cartão está comprável agora, e por que não (AC-321, AC-322).
 *
 * A MESMA ORDEM da página do produto: esgotado vence a janela. O cartão não
 * olha as variações — isso é peso da página, e o cartão de um produto com
 * toda a grade zerada continua dizendo "ver opções" até a pessoa abrir.
 */
function disponibilidadeDoCartao(
  linha: LinhaDeProduto,
  momento: MomentoDaLoja,
): Pick<ProdutoNaVitrine, "disponivel" | "motivoIndisponivel"> {
  if (!linha.isAvailable) {
    return { disponivel: false, motivoIndisponivel: "ESGOTADO" };
  }
  const foraDoHorario =
    (linha.unavailableUntil !== null &&
      linha.unavailableUntil > momento.agora) ||
    !estaNaJanelaDeDisponibilidade(
      lerJanelasDeDisponibilidade(linha.saleWindows),
      momento.agora,
      momento.fusoHorario,
    );
  return foraDoHorario
    ? { disponivel: false, motivoIndisponivel: "FORA_DO_HORARIO" }
    : { disponivel: true, motivoIndisponivel: null };
}

/** Os preços cadastrados de um produto, no vocabulário da regra. */
type PrecosDoProduto = readonly LinhaDePrecoDoProduto[];

function comoVitrine(
  linha: LinhaDeProduto,
  momento: MomentoDaLoja,
  precos?: PrecosDoProduto,
): ProdutoNaVitrine {
  const regras = (precos ?? []).map(comoPrecoCadastrado);
  const preco =
    precos === undefined ? undefined : precoQueVale(regras, momento.agora);
  const precoCentavos =
    preco === undefined
      ? emCentavos(linha.displayPriceCents)
      : preco.atualEmCentavos;
  return {
    id: linha.id,
    apelido: linha.slug,
    nome: linha.name,
    chamada: linha.shortDescription,
    precoCentavos,
    precoAnteriorCentavos:
      preco === undefined
        ? emCentavos(linha.compareAtCents)
        : preco.anteriorEmCentavos,
    imagem: linha.imagens[0]?.url ?? null,
    destaque: linha.isFeatured,
    ...disponibilidadeDoCartao(linha, momento),
    // Sobre o MESMO preço que o cartão mostra: é o que o carrinho cobra.
    atacado: atacadoPublico(precoCentavos, regras, momento.agora),
  };
}

interface LinhaDePrecoDoProduto extends LinhaDePrecoDoAtacado {
  readonly productId: string;
}

/** Os preços sem variação dos produtos, agrupados por produto, numa consulta. */
async function precosDosProdutos(
  ids: readonly string[],
): Promise<Map<string, LinhaDePrecoDoProduto[]>> {
  const porProduto = new Map<string, LinhaDePrecoDoProduto[]>();
  if (ids.length === 0) return porProduto;
  const precos = await transacaoAtual().productPrice.findMany({
    where: { productId: { in: [...ids] }, variantId: null },
    select: {
      productId: true,
      kind: true,
      amountCents: true,
      minQuantity: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      label: true,
      discountKind: true,
      discountValue: true,
    },
  });
  for (const preco of precos) {
    const doProduto = porProduto.get(preco.productId) ?? [];
    doProduto.push(preco);
    porProduto.set(preco.productId, doProduto);
  }
  return porProduto;
}

/**
 * Os cartões de uma lista de produtos, NA ORDEM PEDIDA (card #74).
 *
 * É o que as rotas paginadas usam: a consulta delas decide quem entra e em que
 * ordem, e aqui só se monta o cartão — com a mesma regra de preço, atacado e
 * disponibilidade do catálogo inteiro. Identificador que a política pública
 * recusa (rascunho, outra loja) simplesmente não volta.
 */
export async function cartoesDosProdutos(
  ids: readonly string[],
  agora: Date = new Date(),
): Promise<ProdutoNaVitrine[]> {
  if (ids.length === 0) return [];
  const tx = transacaoAtual();
  const momento: MomentoDaLoja = { agora, fusoHorario: await fusoDaLoja() };
  // Em série: as duas correm na mesma transação, que é uma conexão só.
  const linhas = await tx.product.findMany({
    where: { id: { in: [...ids] } },
    select: { ...CAMPOS_DO_PRODUTO, imagens: IMAGEM_PRINCIPAL },
  });
  const precosPorProduto = await precosDosProdutos(ids);
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  return ids.flatMap((id) => {
    const linha = porId.get(id);
    return linha === undefined
      ? []
      : [comoVitrine(linha, momento, precosPorProduto.get(id))];
  });
}

/**
 * Lê o catálogo da loja que já está no contexto da transação.
 *
 * A LOJA NÃO É PARÂMETRO. Ela vem do contexto, definido uma vez no início da
 * transação — receber um identificador aqui abriria a porta para alguém passar
 * o de outra loja, e a assinatura da função sugeriria que isso é uma coisa que
 * se faz.
 */
export interface FiltroDoCatalogo {
  /**
   * Quando presente, só estes produtos entram — é a BUSCA (AC-408).
   *
   * Lista VAZIA significa "nada casou", e não "sem filtro": a diferença é o que
   * separa a tela de "nenhum resultado" da tela do catálogo inteiro. Por isso o
   * campo é a lista, e não um termo — quem decide quem casa é a busca.
   */
  readonly apenasProdutos?: readonly string[] | undefined;
}

export async function catalogoDaVitrine(
  versaoDoCatalogo: string,
  filtro: FiltroDoCatalogo = {},
  agora: Date = new Date(),
): Promise<CatalogoDaVitrine> {
  const tx = transacaoAtual();
  const filtrando = filtro.apenasProdutos !== undefined;
  const permitidos = new Set(filtro.apenasProdutos ?? []);
  // O instante chega por parâmetro e o fuso é o da loja: é o que faz a janela
  // de venda (AC-322) ser provável numa terça e num sábado sem esperar por eles.
  const momento: MomentoDaLoja = { agora, fusoHorario: await fusoDaLoja() };

  // UMA consulta para as seções com seus produtos. A alternativa — uma consulta
  // por seção — faria uma loja com doze seções pagar doze idas ao banco para
  // montar uma tela, que é justamente o que o AC-415 cobra que não aconteça.
  const categorias = await tx.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      produtos: {
        orderBy: { sortOrder: "asc" },
        select: {
          produto: {
            select: { ...CAMPOS_DO_PRODUTO, imagens: IMAGEM_PRINCIPAL },
          },
        },
      },
    },
  });

  // Os destaques vêm de consulta PRÓPRIA, e não de filtrar as seções: o produto
  // em destaque pode não estar em categoria nenhuma, e mesmo estando, ele
  // apareceria uma vez por seção em que estivesse. Com busca não há destaques.
  const destaques = filtrando
    ? []
    : await tx.product.findMany({
        where: { isFeatured: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { ...CAMPOS_DO_PRODUTO, imagens: IMAGEM_PRINCIPAL },
      });

  const idsDosProdutos = [
    ...new Set([
      ...categorias.flatMap((categoria) =>
        categoria.produtos.flatMap((vinculo) =>
          vinculo.produto === null ? [] : [vinculo.produto.id],
        ),
      ),
      ...destaques.map((produto) => produto.id),
    ]),
  ];
  const precosPorProduto = await precosDosProdutos(idsDosProdutos);

  const todasAsSecoes: SecaoDaVitrine[] = categorias.map((categoria) => ({
    id: categoria.id,
    apelido: categoria.slug,
    nome: categoria.name,
    // O vínculo pode apontar para produto que a política pública recusa — em
    // rascunho ou removido. O Prisma devolve o vínculo com o produto nulo, e
    // não o vínculo de fora: filtrar aqui é o que impede um buraco na lista.
    produtos: categoria.produtos.flatMap((vinculo) =>
      vinculo.produto && (!filtrando || permitidos.has(vinculo.produto.id))
        ? [
            comoVitrine(
              vinculo.produto,
              momento,
              precosPorProduto.get(vinculo.produto.id),
            ),
          ]
        : [],
    ),
  }));

  // COM BUSCA, CATEGORIA SEM ACERTO DESAPARECE (AC-408). Sem busca, ela fica: o
  // dono criou a seção e a tela explica que ela está sendo montada. São duas
  // telas diferentes — "não achei o que você procurou" e "esta seção ainda não
  // tem nada" —, e trocar uma pela outra confunde quem está procurando.
  const secoes = filtrando
    ? todasAsSecoes.filter((secao) => secao.produtos.length > 0)
    : todasAsSecoes;

  // COM BUSCA, NÃO HÁ DESTAQUES. Eles são a vitrine do dono, e quem digitou um
  // termo pediu outra coisa — mostrar destaque no meio do resultado seria
  // responder uma pergunta que ninguém fez.
  if (filtrando) {
    return { secoes, destaques: [], versao: versaoDoCatalogo };
  }

  return {
    secoes,
    destaques: destaques.map((produto) =>
      comoVitrine(produto, momento, precosPorProduto.get(produto.id)),
    ),
    versao: versaoDoCatalogo,
  };
}

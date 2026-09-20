/**
 * A página pública de um produto (AC-410, AC-413).
 *
 * O QUE ELE DEVOLVE: as imagens, a descrição, o preço, os grupos de escolha com
 * o que é obrigatório, e as variantes com preço e disponibilidade — tudo que o
 * AC-410 lista como necessário para decidir.
 *
 * SEPARADO DO CATÁLOGO de propósito. O catálogo devolve o cartão; aqui vem o
 * produto inteiro. Juntar os dois faria quem abre a vitrine baixar sessenta
 * descrições e trezentas opções para ver sessenta cartões — que é exatamente o
 * peso que o AC-415 cobra que não exista.
 *
 * A LISTA DE CAMPOS É DE PERMITIDOS, como nas rotas vizinhas. `products` guarda
 * custo interno, notas de estoque e o vetor de busca; `product_variants` guarda
 * o código de barras e o alerta de estoque mínimo. Nada disso é de quem está
 * navegando, e uma resposta montada com o registro inteiro entregaria tudo —
 * inclusive a coluna que alguém acrescentar no ano que vem.
 *
 * O QUE NÃO É FILTRADO AQUI, DE PROPÓSITO: produto em rascunho, categoria
 * oculta, variação apagada, grupo desligado e opção removida. A POLÍTICA DO
 * BANCO os recusa — `products_storefront_select` desde a 0004, as três de
 * escolha desde a 0018. Repetir o filtro na consulta daria a impressão de que a
 * garantia mora aqui.
 *
 * O QUE É FILTRADO AQUI, E POR QUÊ: qual preço vale agora. Janela de vigência e
 * `is_active` decidem se um preço SE APLICA, e isso é regra de negócio, não
 * visibilidade — preço fora da janela não é segredo, é um preço que não vale.
 */
import { precoQueVale, type PrecoCadastrado } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";

/** Uma imagem do produto. */
export interface ImagemDoProduto {
  readonly url: string;
  readonly texto: string | null;
  readonly largura: number | null;
  readonly altura: number | null;
}

/** Uma opção dentro de um grupo. */
export interface OpcaoDoProduto {
  readonly id: string;
  readonly nome: string;
  readonly acrescimoCentavos: number;
  readonly marcadaPorPadrao: boolean;
  readonly disponivel: boolean;
}

/** Um grupo de escolha do produto. */
export interface GrupoDoProduto {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly tipo: string;
  readonly minimo: number;
  readonly maximo: number | null;
  readonly permiteRepetir: boolean;
  readonly eixoDeVariacao: boolean;
  readonly opcoes: readonly OpcaoDoProduto[];
}

/** Uma variante: a unidade que de fato é vendida. */
export interface VariacaoDoProduto {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly precoAnteriorCentavos: number | null;
  readonly disponivel: boolean;
  readonly padrao: boolean;
  readonly valoresDosEixos: readonly {
    readonly grupoId: string;
    readonly opcaoId: string;
  }[];
}

export type MotivoIndisponivel = "ESGOTADO" | "FORA_DO_HORARIO";

/** O produto inteiro, como a página dele o recebe. */
export interface ProdutoDaVitrine {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly chamada: string | null;
  readonly descricao: string | null;
  readonly imagens: readonly ImagemDoProduto[];
  readonly precoCentavos: number | null;
  readonly precoAnteriorCentavos: number | null;
  readonly grupos: readonly GrupoDoProduto[];
  readonly variacoes: readonly VariacaoDoProduto[];
  readonly disponivel: boolean;
  readonly motivoIndisponivel: MotivoIndisponivel | null;
  readonly aceitaObservacao: boolean;
  readonly secao: {
    readonly id: string;
    readonly apelido: string;
    readonly nome: string;
  } | null;
}

/**
 * Centavos como número.
 *
 * O banco devolve `bigint` porque a coluna é `bigint`, e `JSON.stringify`
 * RECUSA `bigint` com erro em tempo de execução. Sem esta conversão a rota
 * quebraria no primeiro produto com preço, apontando para o serializador em vez
 * de para cá — foi o que a T-402 descobriu na primeira rodada.
 */
function emCentavos(valor: bigint | null): number | null {
  return valor === null ? null : Number(valor);
}

/** Um preço lido do banco, antes de decidirmos qual vale. */
interface LinhaDePreco {
  readonly kind: string;
  readonly amountCents: bigint;
  readonly minQuantity: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly variantId?: string | null;
}

/**
 * Traduz os preços do banco para o vocabulário da regra.
 *
 * A REGRA MORA NO CORE (`precoQueVale`) porque a conferência do carrinho toma a
 * mesma decisão, e a tabela de fronteiras não deixa um módulo importar o outro.
 * Duas cópias funcionariam hoje e divergiriam no dia em que alguém corrigisse
 * uma delas — a vitrine anunciando promoção e o fechamento cobrando o cheio.
 */
function comoRegra(linha: LinhaDePreco): PrecoCadastrado {
  return {
    tipo: linha.kind,
    valorEmCentavos: Number(linha.amountCents),
    quantidadeMinima: linha.minQuantity,
    ativo: linha.isActive,
    comecaEm: linha.startsAt,
    terminaEm: linha.endsAt,
  };
}

/**
 * Lê um produto da loja que já está no contexto da transação.
 *
 * A LOJA NÃO É PARÂMETRO, pelo mesmo motivo das rotas vizinhas: ela vem do
 * contexto, definido uma vez no início da transação. Receber um identificador
 * aqui abriria a porta para alguém passar o de outra loja.
 *
 * Devolve `null` quando o produto não existe, não está publicado ou é de outra
 * loja — os três indistinguíveis de fora, e é a rota que os transforma em 404.
 */
export async function produtoDaVitrine(
  produtoId: string,
  agora: Date = new Date(),
): Promise<ProdutoDaVitrine | null> {
  const tx = transacaoAtual();

  const produto = await tx.product.findFirst({
    where: { id: produtoId },
    select: {
      id: true,
      slug: true,
      name: true,
      shortDescription: true,
      description: true,
      displayPriceCents: true,
      compareAtCents: true,
      isAvailable: true,
      unavailableUntil: true,
      hasVariants: true,
      imagens: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { url: true, altText: true, width: true, height: true },
      },
      categorias: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: {
          categoria: { select: { id: true, slug: true, name: true } },
        },
      },
      gruposDeEscolha: {
        orderBy: { sortOrder: "asc" },
        select: {
          grupo: {
            select: {
              id: true,
              name: true,
              description: true,
              kind: true,
              minSelect: true,
              maxSelect: true,
              allowRepeat: true,
              isVariantAxis: true,
              itens: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  priceDeltaCents: true,
                  isDefaultSelected: true,
                  isAvailable: true,
                },
              },
            },
          },
        },
      },
      variacoes: {
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          name: true,
          isDefault: true,
          isAvailable: true,
          stockQuantity: true,
          precos: {
            select: {
              kind: true,
              amountCents: true,
              minQuantity: true,
              isActive: true,
              startsAt: true,
              endsAt: true,
              variantId: true,
            },
          },
          valoresDeEixo: { select: { groupId: true, optionItemId: true } },
        },
      },
    },
  });

  if (produto === null) return null;

  const precosDoProduto = await tx.productPrice.findMany({
    where: { productId: produto.id, variantId: null },
    select: {
      kind: true,
      amountCents: true,
      minQuantity: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
    },
  });
  const precoDoProduto = precoQueVale(precosDoProduto.map(comoRegra), agora);

  const variacoes: VariacaoDoProduto[] = produto.variacoes.map((variante) => {
    const preco = precoQueVale(variante.precos.map(comoRegra), agora);
    return {
      id: variante.id,
      nome: variante.name,
      precoCentavos: preco.atualEmCentavos,
      precoAnteriorCentavos: preco.anteriorEmCentavos,
      // Estoque NULO é "não controla estoque", e não "zero" — é a diferença
      // entre a lanchonete e a loja de roupa, e trocar um pelo outro faria toda
      // lanchonete nascer esgotada.
      disponivel:
        variante.isAvailable &&
        (variante.stockQuantity === null || variante.stockQuantity > 0),
      padrao: variante.isDefault,
      valoresDosEixos: variante.valoresDeEixo.map((valor) => ({
        grupoId: valor.groupId,
        opcaoId: valor.optionItemId,
      })),
    };
  });

  // O preço que a página abre mostrando: o da variante padrão quando há
  // variantes, o do produto quando não há. Produto com variantes e sem padrão
  // definido fica sem preço na abertura, e a página convida a escolher — que é
  // honesto, porque não existe "o preço" antes de a pessoa escolher o tamanho.
  const daVariante = variacoes.find((v) => v.padrao) ?? variacoes[0];
  const semVariantes = variacoes.length === 0;

  const foraDoHorario =
    produto.unavailableUntil !== null && produto.unavailableUntil > agora;
  const esgotado =
    !produto.isAvailable ||
    (!semVariantes && variacoes.every((v) => !v.disponivel));

  return {
    id: produto.id,
    apelido: produto.slug,
    nome: produto.name,
    chamada: produto.shortDescription,
    descricao: produto.description,
    imagens: produto.imagens.flatMap((imagem) =>
      // Imagem sem URL existe no esquema (a linha pode apontar só para o
      // acervo). Sem URL não há o que desenhar, e um `src` vazio faz o
      // navegador pedir a própria página de novo.
      imagem.url === null
        ? []
        : [
            {
              url: imagem.url,
              texto: imagem.altText,
              largura: imagem.width,
              altura: imagem.height,
            },
          ],
    ),
    precoCentavos: semVariantes
      ? precosDoProduto.length > 0
        ? precoDoProduto.atualEmCentavos
        : emCentavos(produto.displayPriceCents)
      : (daVariante?.precoCentavos ?? null),
    precoAnteriorCentavos: semVariantes
      ? precosDoProduto.length > 0
        ? precoDoProduto.anteriorEmCentavos
        : emCentavos(produto.compareAtCents)
      : (daVariante?.precoAnteriorCentavos ?? null),
    grupos: produto.gruposDeEscolha.flatMap((vinculo) =>
      // O vínculo pode apontar para grupo que a política recusa — apagado ou
      // desligado. O Prisma devolve o vínculo com o grupo nulo, e não o vínculo
      // de fora: filtrar aqui é o que impede um buraco na lista.
      vinculo.grupo
        ? [
            {
              id: vinculo.grupo.id,
              nome: vinculo.grupo.name,
              descricao: vinculo.grupo.description,
              tipo: vinculo.grupo.kind,
              minimo: vinculo.grupo.minSelect,
              maximo: vinculo.grupo.maxSelect,
              permiteRepetir: vinculo.grupo.allowRepeat,
              eixoDeVariacao: vinculo.grupo.isVariantAxis,
              opcoes: vinculo.grupo.itens.map((item) => ({
                id: item.id,
                nome: item.name,
                acrescimoCentavos: Number(item.priceDeltaCents),
                marcadaPorPadrao: item.isDefaultSelected,
                disponivel: item.isAvailable,
              })),
            },
          ]
        : [],
    ),
    variacoes,
    disponivel: !esgotado && !foraDoHorario,
    motivoIndisponivel: esgotado
      ? "ESGOTADO"
      : foraDoHorario
        ? "FORA_DO_HORARIO"
        : null,
    // Observação por item ainda não é configurável por loja: a coluna que a
    // ligaria pertence à feature `config-loja` (T-900). Até lá, todo produto
    // aceita — que é o comportamento do concorrente e o que o dono espera.
    aceitaObservacao: true,
    secao: produto.categorias[0]?.categoria
      ? {
          id: produto.categorias[0].categoria.id,
          apelido: produto.categorias[0].categoria.slug,
          nome: produto.categorias[0].categoria.name,
        }
      : null,
  };
}

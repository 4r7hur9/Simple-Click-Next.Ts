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
import {
  estaNaJanelaDeDisponibilidade,
  lerJanelasDeDisponibilidade,
  precoQueVale,
  proximaQuedaDePreco,
  type PrecoCadastrado,
} from "@simpleclick/core";
import type {
  AtacadoDoProdutoNoContrato,
  MidiaPublica,
} from "@simpleclick/contracts";

import {
  atacadoPublico,
  comoPrecoCadastrado,
} from "../../core/atacado-publico.ts";
import { transacaoAtual } from "../../core/db.ts";
import { fusoDaLoja } from "./fuso-da-loja.ts";

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
  /** As faixas de atacado do produto sobre o preço desta variante (card #56). */
  readonly atacado: AtacadoDoProdutoNoContrato | null;
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
  /** Fotos e vídeos na ordem do dono (card #46). */
  readonly midias: readonly MidiaPublica[];
  readonly especificacoes: readonly EspecificacaoPublica[];
  readonly precoCentavos: number | null;
  readonly precoAnteriorCentavos: number | null;
  /**
   * A próxima QUEDA de preço dos próximos 7 dias (card #140). Só existe quando
   * a flag FLAG_VITRINE_PROXIMO_PRECO está ligada — desligada, a CHAVE nem sai,
   * e o corpo é o de sempre. Nulo = ligada, mas sem queda a anunciar. Só varejo
   * unitário; aumento agendado nunca aparece.
   */
  readonly proximoPreco?: {
    readonly precoCentavos: number;
    readonly aPartirDe: string;
  } | null;
  /**
   * A tabela de atacado sobre `precoCentavos` (card #56): cada faixa com o
   * preço por unidade e a economia. Nulo = só varejo.
   */
  readonly atacado: AtacadoDoProdutoNoContrato | null;
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

/** Os preços cadastrados da variante de abertura (a padrão, ou a primeira). */
function precosDaVariante(
  variacoes: readonly { id: string; precos: readonly LinhaDePreco[] }[],
  idDaEscolhida: string | undefined,
): PrecoCadastrado[] {
  const escolhida = variacoes.find((v) => v.id === idDaEscolhida);
  return (escolhida?.precos ?? []).map(comoRegra);
}

/** A próxima queda no formato do contrato, ou nulo quando não há o que dizer. */
function proximoPrecoDoProduto(
  precos: readonly PrecoCadastrado[],
  agora: Date,
): { precoCentavos: number; aPartirDe: string } | null {
  const queda = proximaQuedaDePreco(precos, agora);
  return queda === null
    ? null
    : {
        precoCentavos: queda.precoCentavos,
        aPartirDe: queda.aPartirDe.toISOString(),
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
  opcoes: { readonly proximoPreco?: boolean } = {},
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
      saleWindows: true,
      hasVariants: true,
      imagens: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          url: true,
          altText: true,
          width: true,
          height: true,
          sortOrder: true,
          createdAt: true,
        },
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
      label: true,
      discountKind: true,
      discountValue: true,
    },
  });
  const precoDoProduto = precoQueVale(precosDoProduto.map(comoRegra), agora);
  // As faixas de atacado são do PRODUTO (variant_id nulo) e valem para todas
  // as variantes, cada uma sobre o seu próprio preço (card #53).
  const atacadoDoProduto = precosDoProduto
    .filter((linha) => linha.kind === "WHOLESALE")
    .map(comoPrecoCadastrado);

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
      atacado: atacadoPublico(preco.atualEmCentavos, atacadoDoProduto, agora),
    };
  });

  // O preço que a página abre mostrando: o da variante padrão quando há
  // variantes, o do produto quando não há. Produto com variantes e sem padrão
  // definido fica sem preço na abertura, e a página convida a escolher — que é
  // honesto, porque não existe "o preço" antes de a pessoa escolher o tamanho.
  const daVariante = variacoes.find((v) => v.padrao) ?? variacoes[0];
  const semVariantes = variacoes.length === 0;

  // FORA DO HORÁRIO é a pausa datada OU a janela semanal do produto (AC-322),
  // avaliada no fuso da loja: a feijoada de sábado não aparece comprável na
  // terça e volta no sábado sem o dono mexer em nada. ESGOTADO VENCE A JANELA
  // (AC-321): o dono que marcou "acabou" no sábado não quer ver "fora do
  // horário" — e reativar libera na hora, porque a janela é reavaliada a cada
  // leitura.
  const foraDoHorario =
    (produto.unavailableUntil !== null && produto.unavailableUntil > agora) ||
    !estaNaJanelaDeDisponibilidade(
      lerJanelasDeDisponibilidade(produto.saleWindows),
      agora,
      await fusoDaLoja(),
    );
  const precoCentavos = semVariantes
    ? precosDoProduto.length > 0
      ? precoDoProduto.atualEmCentavos
      : emCentavos(produto.displayPriceCents)
    : (daVariante?.precoCentavos ?? null);

  // A próxima queda sai da MESMA lista de preços que gerou `precoCentavos`
  // (a do produto, ou a da variante de abertura), dentro desta transação — sem
  // consulta nova. Desligada a flag, nada é calculado e a chave não entra.
  const proximoPreco = opcoes.proximoPreco
    ? proximoPrecoDoProduto(
        semVariantes
          ? precosDoProduto.length > 0
            ? precosDoProduto.map(comoRegra)
            : []
          : precosDaVariante(produto.variacoes, daVariante?.id),
        agora,
      )
    : undefined;

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
    midias: await midiasDoProduto(produto.id, produto.imagens),
    especificacoes: await especificacoesDoProduto(produto.id),
    precoCentavos,
    precoAnteriorCentavos: semVariantes
      ? precosDoProduto.length > 0
        ? precoDoProduto.anteriorEmCentavos
        : emCentavos(produto.compareAtCents)
      : (daVariante?.precoAnteriorCentavos ?? null),
    ...(proximoPreco === undefined ? {} : { proximoPreco }),
    atacado: semVariantes
      ? atacadoPublico(precoCentavos, atacadoDoProduto, agora)
      : (daVariante?.atacado ?? null),
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

/**
 * A galeria do post (card #46): as fotos já lidas e os vídeos do produto,
 * misturados na ordem do dono (`sort_order` compartilhado). No empate, a foto
 * principal vem antes (ela já chega primeiro em `imagens`).
 */
async function midiasDoProduto(
  produtoId: string,
  imagens: readonly {
    readonly url: string | null;
    readonly altText: string | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly sortOrder: number;
    readonly createdAt: Date;
  }[],
): Promise<MidiaPublica[]> {
  const videos = await transacaoAtual().productVideo.findMany({
    where: { productId: produtoId },
    select: {
      url: true,
      posterUrl: true,
      durationMs: true,
      width: true,
      height: true,
      sortOrder: true,
      createdAt: true,
    },
  });
  const todas = [
    ...imagens.flatMap((imagem, posicao) =>
      imagem.url === null
        ? []
        : [
            {
              ordem: imagem.sortOrder,
              desempate: posicao,
              criada: imagem.createdAt.getTime(),
              midia: {
                tipo: "imagem",
                url: imagem.url,
                capa: null,
                duracaoSegundos: null,
                largura: imagem.width,
                altura: imagem.height,
                texto: imagem.altText,
              } satisfies MidiaPublica,
            },
          ],
    ),
    ...videos.map((video) => ({
      ordem: video.sortOrder,
      desempate: Number.MAX_SAFE_INTEGER,
      criada: video.createdAt.getTime(),
      midia: {
        tipo: "video",
        url: video.url,
        capa: video.posterUrl,
        duracaoSegundos:
          video.durationMs === null ? null : Math.round(video.durationMs / 100) / 10,
        largura: video.width,
        altura: video.height,
        texto: null,
      } satisfies MidiaPublica,
    })),
  ];
  return todas
    .sort(
      (a, b) => a.ordem - b.ordem || a.desempate - b.desempate || a.criada - b.criada,
    )
    .map((item) => item.midia);
}

/** Uma especificação cadastrada pela loja, pronta para ler. */
export interface EspecificacaoPublica {
  readonly chave: string;
  readonly nome: string;
  readonly valor: string;
}

/**
 * Compatibilidade veicular, placa e chassi nunca vão para a vitrine pública
 * (P-104), mesmo que a loja os tenha cadastrado como especificação.
 */
const ESPECIFICACAO_PROIBIDA = /compatib|placa|chassi|aplica[cç]/i;

function valorLegivel(
  linha: {
    readonly valueText: string | null;
    readonly valueNum: { toString(): string } | null;
    readonly valueBool: boolean | null;
    readonly valueDate: Date | null;
  },
  unidade: string | null,
): string | null {
  if (linha.valueText !== null) {
    const texto = linha.valueText.trim();
    return texto === "" ? null : texto;
  }
  if (linha.valueNum !== null) {
    const numero = Number(linha.valueNum.toString());
    if (!Number.isFinite(numero)) return null;
    const escrito = numero.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
    return unidade ? `${escrito} ${unidade}` : escrito;
  }
  if (linha.valueBool !== null) return linha.valueBool ? "Sim" : "Não";
  if (linha.valueDate !== null) {
    return linha.valueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  return null;
}

/**
 * As especificações que a loja cadastrou para o produto (card #109, T-10912).
 * Roda na transação da loja, que já isola por tenant (RLS); o filtro por
 * produto é o único que falta. Definição aposentada, valor vazio e as
 * proibidas ficam de fora.
 */
async function especificacoesDoProduto(
  produtoId: string,
): Promise<EspecificacaoPublica[]> {
  const linhas = await transacaoAtual().productAttribute.findMany({
    where: { productId: produtoId, definicao: { deprecatedAt: null } },
    select: {
      valueText: true,
      valueNum: true,
      valueBool: true,
      valueDate: true,
      definicao: {
        select: { key: true, label: true, unit: true, sortOrder: true },
      },
    },
  });
  return linhas
    .sort(
      (a, b) =>
        a.definicao.sortOrder - b.definicao.sortOrder ||
        a.definicao.label.localeCompare(b.definicao.label, "pt-BR"),
    )
    .flatMap((linha) => {
      const { key, label, unit } = linha.definicao;
      if (ESPECIFICACAO_PROIBIDA.test(key) || ESPECIFICACAO_PROIBIDA.test(label)) {
        return [];
      }
      const valor = valorLegivel(linha, unit);
      return valor === null ? [] : [{ chave: key, nome: label, valor }];
    });
}

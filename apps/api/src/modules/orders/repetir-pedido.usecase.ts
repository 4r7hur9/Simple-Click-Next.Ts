/**
 * Repetir um pedido antigo: o pedido novo montado com os preços de hoje
 * (AC-712).
 *
 * NÃO CRIA PEDIDO. Monta a proposta — mesmos itens, mesmas escolhas, preço
 * recalculado pelo catálogo de agora — e devolve à tela, que mostra o que
 * mudou e deixa o dono confirmar pelo lançamento manual de sempre. Criar direto
 * cobraria do cliente um preço que o dono nem viu.
 *
 * O QUE SAIU DO CATÁLOGO É APONTADO, e não escondido. Produto apagado ou fora
 * do ar vai para `indisponiveis`, com o nome e o preço da época; a variação que
 * acabou também. A opção que sumiu de um grupo não derruba o item: ele volta
 * com a pendência escrita ("escolha outra opção em Molho"), para o dono
 * decidir com o cliente ao telefone.
 *
 * O preço da época (`precoUnitarioDaEpocaCentavos`) acompanha cada linha: é o
 * que deixa a tela dizer "custava R$ 20,00, hoje custa R$ 22,00" em vez de
 * mudar o total em silêncio.
 */
import type { RepeticaoDoPedidoNoContrato } from "@simpleclick/contracts";
import { calcularItem, type EscolhaFeita } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";
import type { ProdutoParaPedidoManual } from "./pedido-manual.usecase.ts";

/** Uma escolha guardada no item do pedido antigo. */
export interface EscolhaDaEpoca {
  readonly grupoId: string | null;
  readonly opcaoId: string | null;
  readonly grupo: string;
  readonly opcao: string;
  readonly quantidade: number;
}

/** Um item do pedido antigo, como ele foi gravado. */
export interface ItemDaEpoca {
  readonly produtoId: string | null;
  readonly variacaoId: string | null;
  readonly nome: string;
  readonly variacao: string | null;
  readonly quantidade: number;
  readonly precoUnitarioCentavos: number;
  readonly observacao: string | null;
  readonly escolhas: readonly EscolhaDaEpoca[];
}

/** O pedido antigo, lido na transação do dono. */
export interface PedidoDaEpoca {
  readonly id: string;
  readonly codigo: string;
  readonly clienteId: string | null;
  readonly entrega: string;
  readonly itens: readonly ItemDaEpoca[];
}

/**
 * Lê o pedido antigo da loja do contexto, ou nulo.
 *
 * Pedido de outra loja não existe para esta requisição: o isolamento por
 * linha o esconde, e quem chama responde 404 (AC-702).
 */
export async function lerPedidoParaRepetir(
  pedidoId: string,
): Promise<PedidoDaEpoca | null> {
  const tx = transacaoAtual();
  const pedido = await tx.order.findFirst({
    where: { id: pedidoId },
    select: {
      id: true,
      code: true,
      storeCustomerId: true,
      fulfillment: true,
      itens: {
        orderBy: { sortOrder: "asc" },
        select: {
          productId: true,
          variantId: true,
          productName: true,
          variantName: true,
          quantity: true,
          unitPriceCents: true,
          note: true,
          opcoes: {
            orderBy: { sortOrder: "asc" },
            select: {
              optionGroupId: true,
              optionItemId: true,
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              quantity: true,
            },
          },
        },
      },
    },
  });
  if (pedido === null) return null;

  return {
    id: pedido.id,
    codigo: pedido.code,
    clienteId: pedido.storeCustomerId,
    entrega: pedido.fulfillment,
    itens: pedido.itens.map((item) => ({
      produtoId: item.productId,
      variacaoId: item.variantId,
      nome: item.productName,
      variacao: item.variantName,
      quantidade: item.quantity,
      precoUnitarioCentavos: Number(item.unitPriceCents),
      observacao: item.note,
      escolhas: item.opcoes.map((opcao) => ({
        grupoId: opcao.optionGroupId,
        opcaoId: opcao.optionItemId,
        grupo: opcao.groupNameSnapshot,
        opcao: opcao.optionNameSnapshot,
        quantidade: opcao.quantity,
      })),
    })),
  };
}

type Indisponivel = RepeticaoDoPedidoNoContrato["indisponiveis"][number];
type Repetido = RepeticaoDoPedidoNoContrato["itens"][number];

function indisponivel(
  item: ItemDaEpoca,
  motivo: Indisponivel["motivo"],
): Indisponivel {
  return {
    nome: item.nome,
    variacao: item.variacao,
    quantidade: item.quantidade,
    precoUnitarioDaEpocaCentavos: item.precoUnitarioCentavos,
    motivo,
  };
}

/** Um item antigo contra o catálogo de agora. */
function repetirItem(
  item: ItemDaEpoca,
  produto: ProdutoParaPedidoManual | null,
): Repetido | Indisponivel {
  if (item.produtoId === null || produto === null) {
    return indisponivel(item, "FORA_DO_CATALOGO");
  }
  if (!produto.disponivel) return indisponivel(item, "INDISPONIVEL");

  const temVariacoes = produto.variacoes.length > 0;
  const variacao = temVariacoes
    ? (produto.variacoes.find((v) => v.id === item.variacaoId) ?? null)
    : null;
  if (temVariacoes && (variacao === null || !variacao.disponivel)) {
    return indisponivel(item, "VARIACAO_INDISPONIVEL");
  }

  const precoBase = temVariacoes
    ? (variacao?.precoCentavos ?? null)
    : produto.precoCentavos;
  if (precoBase === null) return indisponivel(item, "INDISPONIVEL");

  const grupos = produto.grupos.filter((g) => !g.eixoDeVariacao);
  const pendencias: string[] = [];
  const escolhas: { grupoId: string; opcaoId: string; quantidade: number }[] =
    [];
  for (const escolha of item.escolhas) {
    const grupo = grupos.find((g) => g.id === escolha.grupoId);
    const opcao = grupo?.opcoes.find((o) => o.id === escolha.opcaoId);
    if (grupo === undefined || opcao === undefined || !opcao.disponivel) {
      // A escolha da época não existe mais (ou acabou): sai do item, e o dono
      // fica sabendo qual foi, pelo nome que ela tinha.
      pendencias.push(
        `${escolha.opcao} (${escolha.grupo}) não está mais disponível.`,
      );
      continue;
    }
    escolhas.push({
      grupoId: grupo.id,
      opcaoId: opcao.id,
      quantidade: escolha.quantidade,
    });
  }

  const conta = calcularItem({
    precoBaseEmCentavos: precoBase,
    quantidade: item.quantidade,
    grupos: grupos.map((grupo) => ({
      grupoId: grupo.id,
      nome: grupo.nome,
      minimo: grupo.minimo,
      maximo: grupo.maximo,
      permiteRepetir: grupo.permiteRepetir,
      itens: grupo.opcoes.map((opcao) => ({
        itemId: opcao.id,
        nome: opcao.nome,
        acrescimoEmCentavos: opcao.acrescimoCentavos,
        disponivel: opcao.disponivel,
      })),
    })),
    escolhas: escolhas.map((escolha): EscolhaFeita => ({
      grupoId: escolha.grupoId,
      itemId: escolha.opcaoId,
      quantidade: escolha.quantidade,
    })),
  });
  pendencias.push(...conta.pendencias.map((p) => p.explicacao));

  return {
    produtoId: produto.id,
    variacaoId: variacao?.id ?? null,
    nome: produto.nome,
    variacao: variacao?.nome ?? null,
    quantidade: item.quantidade,
    escolhas,
    observacao: item.observacao,
    precoUnitarioCentavos: conta.unitarioEmCentavos,
    totalDaLinhaCentavos: conta.totalEmCentavos,
    precoUnitarioDaEpocaCentavos: item.precoUnitarioCentavos,
    pendencias,
  };
}

/** Monta a repetição do pedido antigo com o catálogo de agora. */
export function montarRepeticao(
  pedido: PedidoDaEpoca,
  produtos: ReadonlyMap<string, ProdutoParaPedidoManual | null>,
): RepeticaoDoPedidoNoContrato {
  const itens: Repetido[] = [];
  const indisponiveis: Indisponivel[] = [];

  for (const item of pedido.itens) {
    const produto =
      item.produtoId === null ? null : (produtos.get(item.produtoId) ?? null);
    const resultado = repetirItem(item, produto);
    if ("motivo" in resultado) indisponiveis.push(resultado);
    else itens.push(resultado);
  }

  return {
    pedidoOriginal: { id: pedido.id, codigo: pedido.codigo },
    clienteId: pedido.clienteId,
    entrega: pedido.entrega,
    itens,
    indisponiveis,
    subtotalCentavos: itens.reduce(
      (soma, item) => soma + item.totalDaLinhaCentavos,
      0,
    ),
  };
}

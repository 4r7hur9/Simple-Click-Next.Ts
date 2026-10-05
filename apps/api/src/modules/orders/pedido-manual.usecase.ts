/**
 * O pedido que o dono lança no lugar do cliente (AC-707, AC-708, AC-709).
 *
 * É O MESMO PEDIDO DO SITE, com outro canal. Ele passa pelo mesmo caso de uso
 * de criação (`criarPedido`), pela mesma baixa de estoque e pela mesma máquina
 * de status; ganha número da mesma sequência da loja e entra na mesma fila. A
 * única diferença gravada é `channel = 'MANUAL'` — e é ela que a fila, o cupom
 * e as métricas mostram como "Balcão".
 *
 * O PREÇO É DO SERVIDOR (P-006). A tela manda o que o dono escolheu — produto,
 * variação, quantidade, escolhas — e nenhum valor. Cada item é recalculado aqui
 * com `calcularItem`, A MESMA FUNÇÃO que a página do produto e o carrinho usam,
 * sobre o produto lido do catálogo de agora. É isso que faz o grupo de escolha
 * obrigatória barrar o pedido manual exatamente como barra o cliente na
 * vitrine (AC-708): a regra é uma só.
 *
 * QUEM ESTÁ PEDINDO é a ficha de um cliente cadastrado ou nome e telefone
 * informados no próprio pedido (AC-709). O pedido avulso NÃO cria ficha: o
 * dono que não quer cadastrar não é obrigado, e o contato fica guardado no
 * pedido como em qualquer compra de convidado.
 */
import { calcularItem, type EscolhaFeita } from "@simpleclick/core";

import type { ItemParaCriar, OpcaoParaCriar } from "./criar-pedido.usecase.ts";

/**
 * O produto como o pedido manual precisa vê-lo, lido do catálogo de agora.
 *
 * Declarado AQUI, e não importado da vitrine: a forma é a que este caso de uso
 * consome, e quem lê o produto é o módulo da vitrine, passado pela borda
 * (`app.ts`). É a mesma forma que o carrinho consome, e o compilador avisa na
 * borda se um dia deixar de ser.
 */
export interface ProdutoParaPedidoManual {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly disponivel: boolean;
  readonly grupos: readonly {
    readonly id: string;
    readonly nome: string;
    readonly minimo: number;
    readonly maximo: number | null;
    readonly permiteRepetir: boolean;
    readonly eixoDeVariacao: boolean;
    readonly opcoes: readonly {
      readonly id: string;
      readonly nome: string;
      readonly acrescimoCentavos: number;
      readonly disponivel: boolean;
    }[];
  }[];
  readonly variacoes: readonly {
    readonly id: string;
    readonly nome: string;
    readonly precoCentavos: number | null;
    readonly disponivel: boolean;
    readonly padrao: boolean;
  }[];
}

/** Um item como o dono o monta: o que foi escolhido, sem preço. */
export interface ItemDoPedidoManual {
  readonly produtoId: string;
  readonly variacaoId?: string | null | undefined;
  readonly quantidade: number;
  readonly escolhas: readonly {
    readonly grupoId: string;
    readonly opcaoId: string;
    readonly quantidade: number;
  }[];
  readonly observacao?: string | null | undefined;
}

/** Por que um item não fecha. */
export type MotivoDaPendencia =
  | "FORA_DO_CATALOGO"
  | "INDISPONIVEL"
  | "VARIACAO_INDISPONIVEL"
  | "SEM_PRECO"
  | "FALTA_ESCOLHER"
  | "ESCOLHEU_DEMAIS"
  | "ITEM_INDISPONIVEL"
  | "REPETICAO_NAO_PERMITIDA"
  | "ITEM_DESCONHECIDO";

/**
 * O que impede o pedido manual, apontando o produto e o grupo (AC-708).
 *
 * Carrega o identificador do grupo para a tela rolar até ele, e a frase pronta
 * para dizer o que falta — a mesma que a página do produto mostra.
 */
export interface PendenciaDoPedidoManual {
  readonly produtoId: string;
  readonly produto: string;
  readonly grupoId: string | null;
  readonly grupo: string | null;
  readonly motivo: MotivoDaPendencia;
  readonly explicacao: string;
}

/** Os itens precificados, ou o que falta para fecharem. */
export interface ItensPrecificados {
  readonly itens: readonly ItemParaCriar[];
  readonly pendencias: readonly PendenciaDoPedidoManual[];
  readonly subtotalEmCentavos: number;
}

/** Pendência do item inteiro, sem grupo. */
function doItem(
  produtoId: string,
  produto: string,
  motivo: MotivoDaPendencia,
  explicacao: string,
): PendenciaDoPedidoManual {
  return { produtoId, produto, grupoId: null, grupo: null, motivo, explicacao };
}

/** Um item recalculado, ou as pendências dele. */
type ItemConferido =
  | { readonly ok: true; readonly item: ItemParaCriar }
  | { readonly ok: false; readonly pendencias: PendenciaDoPedidoManual[] };

/**
 * Recalcula UM item com o catálogo de agora.
 *
 * É o mesmo raciocínio da conferência do carrinho: produto fora do ar não
 * segue, variação que não existe ou acabou não segue, e as escolhas passam por
 * `calcularItem`. Os eixos de variação (tamanho, cor) ficam fora da conta das
 * escolhas porque quem carrega o preço deles é a variação — contá-los de novo
 * somaria o tamanho duas vezes.
 */
export function conferirItemDoPedidoManual(
  pedido: ItemDoPedidoManual,
  produto: ProdutoParaPedidoManual | null,
): ItemConferido {
  if (produto === null) {
    return {
      ok: false,
      pendencias: [
        doItem(
          pedido.produtoId,
          "Produto",
          "FORA_DO_CATALOGO",
          "Este produto não está mais no catálogo.",
        ),
      ],
    };
  }
  if (!produto.disponivel) {
    return {
      ok: false,
      pendencias: [
        doItem(
          produto.id,
          produto.nome,
          "INDISPONIVEL",
          `${produto.nome} não está disponível agora.`,
        ),
      ],
    };
  }

  const temVariacoes = produto.variacoes.length > 0;
  const variacao = temVariacoes
    ? (produto.variacoes.find((v) => v.id === pedido.variacaoId) ??
      (pedido.variacaoId === null || pedido.variacaoId === undefined
        ? (produto.variacoes.find((v) => v.padrao) ?? null)
        : null))
    : null;

  if (temVariacoes && (variacao === null || !variacao.disponivel)) {
    return {
      ok: false,
      pendencias: [
        doItem(
          produto.id,
          produto.nome,
          "VARIACAO_INDISPONIVEL",
          `Escolha uma variação disponível de ${produto.nome}.`,
        ),
      ],
    };
  }

  const precoBase = temVariacoes
    ? (variacao?.precoCentavos ?? null)
    : produto.precoCentavos;
  if (precoBase === null) {
    // Sem preço não vende — nem no balcão. Nulo não é zero: zero faria o item
    // sair de graça, e quem esqueceu de precificar não vende por engano.
    return {
      ok: false,
      pendencias: [
        doItem(
          produto.id,
          produto.nome,
          "SEM_PRECO",
          `${produto.nome} está sem preço no catálogo.`,
        ),
      ],
    };
  }

  const gruposComuns = produto.grupos.filter((g) => !g.eixoDeVariacao);
  const escolhas: readonly EscolhaFeita[] = pedido.escolhas.map((escolha) => ({
    grupoId: escolha.grupoId,
    itemId: escolha.opcaoId,
    quantidade: escolha.quantidade,
  }));

  const conta = calcularItem({
    precoBaseEmCentavos: precoBase,
    quantidade: pedido.quantidade,
    grupos: gruposComuns.map((grupo) => ({
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
    escolhas,
  });

  if (!conta.podeAdicionar) {
    return {
      ok: false,
      pendencias: conta.pendencias.map((pendencia) => {
        const conhecido = gruposComuns.some((g) => g.id === pendencia.grupoId);
        return {
          produtoId: produto.id,
          produto: produto.nome,
          grupoId: conhecido ? pendencia.grupoId : null,
          grupo: conhecido ? pendencia.nome : null,
          motivo: pendencia.motivo,
          explicacao: pendencia.explicacao,
        };
      }),
    };
  }

  // Os NOMES vêm do catálogo, e não do que a tela mandou: o pedido guarda o
  // que a cozinha vai ler, e texto enviado de fora iria parar no cupom.
  const opcoes: OpcaoParaCriar[] = pedido.escolhas.flatMap((escolha) => {
    const grupo = gruposComuns.find((g) => g.id === escolha.grupoId);
    const opcao = grupo?.opcoes.find((o) => o.id === escolha.opcaoId);
    if (grupo === undefined || opcao === undefined) return [];
    return [
      {
        grupoId: grupo.id,
        opcaoId: opcao.id,
        nomeDoGrupo: grupo.nome,
        nomeDaOpcao: opcao.nome,
        quantidade: escolha.quantidade,
        acrescimoEmCentavos: opcao.acrescimoCentavos,
      },
    ];
  });

  return {
    ok: true,
    item: {
      produtoId: produto.id,
      variacaoId: variacao?.id ?? null,
      nomeDoProduto: produto.nome,
      nomeDaVariacao: variacao?.nome ?? null,
      quantidade: pedido.quantidade,
      precoUnitarioEmCentavos: conta.unitarioEmCentavos,
      opcoesEmCentavos: conta.acrescimosEmCentavos,
      totalDaLinhaEmCentavos: conta.totalEmCentavos,
      observacao: pedido.observacao?.trim() || null,
      opcoes,
    },
  };
}

/**
 * Recalcula todos os itens. Um item que não fecha não derruba a conferência
 * dos outros: o dono vê TODAS as pendências de uma vez, e não uma por envio.
 */
export function precificarItensDoPedidoManual(
  itens: readonly ItemDoPedidoManual[],
  produtos: ReadonlyMap<string, ProdutoParaPedidoManual | null>,
): ItensPrecificados {
  const precificados: ItemParaCriar[] = [];
  const pendencias: PendenciaDoPedidoManual[] = [];

  for (const pedido of itens) {
    const conferido = conferirItemDoPedidoManual(
      pedido,
      produtos.get(pedido.produtoId) ?? null,
    );
    if (conferido.ok) precificados.push(conferido.item);
    else pendencias.push(...conferido.pendencias);
  }

  return {
    itens: precificados,
    pendencias,
    subtotalEmCentavos: precificados.reduce(
      (soma, item) => soma + item.totalDaLinhaEmCentavos,
      0,
    ),
  };
}

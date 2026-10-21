/**
 * As rotas do carrinho do visitante (AC-411, AC-500, AC-501, AC-502).
 *
 * O QUE ELAS FECHAM. O caso de uso do carrinho existe e é provado contra
 * PostgreSQL desde a T-500, e nada o expunha: nem contrato, nem Express. A
 * página do produto tinha o botão e não tinha para onde levar o item; a página
 * do fechamento não podia nascer. Estas rotas são o encanamento que faltava.
 *
 * O PREÇO É RECALCULADO AQUI, e é isso que fecha a segunda metade do AC-411.
 * A tela mostra o total com `calcularItem`; a API chama A MESMA FUNÇÃO com os
 * preços que ela lê do catálogo, e recusa o que não fecha. O que o cliente
 * enviou como total é registrado quando diverge, e NUNCA compõe a conta (P-006)
 * — ler preço do que o navegador manda é o que permite fechar um pedido de mil
 * reais por um.
 *
 * O QUE CHEGA POR PARÂMETRO, E POR QUÊ. Identificar a loja e ler o produto
 * moram no módulo `storefront`, e a tabela de fronteiras não autoriza um módulo
 * a importar outro. Quem junta é `app.ts`, que não pertence a camada nenhuma
 * justamente por ser a borda. Sem essa regra, os módulos viram uma teia.
 *
 * DUAS TRANSAÇÕES, como nas rotas da vitrine: identificar a loja acontece SEM
 * contexto de loja, porque nesse momento ainda não se sabe qual é; o resto
 * acontece com a loja E a sessão declaradas, numa transação nova.
 */
import { Router } from "express";
import {
  calcularItem,
  type EscolhaFeita,
  type FaixaCalculada,
} from "@simpleclick/core";
import {
  esquemaDaDeclaracao,
  esquemaDeItemParaAcrescentar,
  esquemaDeQuantidadeNova,
  esquemaDoApelido,
  esquemaDoApelidoEItem,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { registrador } from "../../core/log.ts";
import { sessaoDoCarrinho } from "../../core/sessao-do-carrinho.ts";
import { validar } from "../../core/validar.ts";
import {
  acrescentarItem,
  mudarQuantidade,
  removerItem,
  verCarrinho,
  type CarrinhoAtual,
} from "./carrinho.usecase.ts";
import {
  conferirAntesDeFechar,
  type PrecoDoItemConferido,
} from "./conferir-preco.usecase.ts";

/**
 * O que a rota precisa saber do catálogo para recalcular um item.
 *
 * Declarado AQUI, e não importado do `storefront`: a forma é a que esta rota
 * consome, e amarrá-la ao tipo do vizinho faria a fronteira ser furada por um
 * `import type`. O que o `app.ts` passa é estruturalmente compatível — e se um
 * dia deixar de ser, o compilador avisa na borda, que é onde a costura mora.
 */
export interface ProdutoParaConferir {
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

/** Identificação da loja pelo apelido, como a resolução do `storefront` devolve. */
export interface IdentificacaoDaLoja {
  readonly encontrada: boolean;
  readonly id?: string | undefined;
}

export interface OpcoesDoCarrinho {
  readonly acesso?: AcessoAoBanco;
  /** O instante, para a prova poder fixar o relógio. */
  readonly agora?: () => Date;
  /** Resolve a loja pelo apelido. Vem da borda, e não por importação. */
  readonly identificarLoja: (params: {
    readonly apelido: string;
  }) => Promise<IdentificacaoDaLoja>;
  /** Lê o produto da loja que já está no contexto. Também vem da borda. */
  readonly lerProduto: (
    produtoId: string,
  ) => Promise<ProdutoParaConferir | null>;
}

export function criarRotasDoCarrinho(opcoes: OpcoesDoCarrinho): Router {
  const rotas = Router();
  const soApelido = validar({ params: esquemaDoApelido });
  const apelidoEItem = validar({ params: esquemaDoApelidoEItem });
  const paraAcrescentar = validar({
    params: esquemaDoApelido,
    body: esquemaDeItemParaAcrescentar,
  });
  const paraQuantidade = validar({
    params: esquemaDoApelidoEItem,
    body: esquemaDeQuantidadeNova,
  });
  const paraConferir = validar({
    params: esquemaDoApelido,
    body: esquemaDaDeclaracao,
  });

  /** Resolve a loja, ou recusa igual a loja inexistente (AC-402). */
  async function exigirLoja(
    acesso: AcessoAoBanco,
    apelido: string,
  ): Promise<string> {
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso.emTransacao(() => opcoes.identificarLoja({ apelido })),
    );

    if (!identificacao.encontrada || identificacao.id === undefined) {
      throw erroDeDominio("nao_encontrado", { recurso: "loja" });
    }
    return identificacao.id;
  }

  rotas.get("/:apelido/carrinho", soApelido, async (req, res, proximo) => {
    try {
      const { params } = soApelido.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const sessao = sessaoDoCarrinho(req, res);
      const lojaId = await exigirLoja(acesso, params.apelido);

      const carrinho = await executarComoRequisicao(
        { papel: "PUBLIC", lojaId, sessaoDoCarrinho: sessao },
        () => acesso.emTransacao(() => verCarrinho()),
      );

      res.json(paraFora(carrinho));
    } catch (erro) {
      proximo(erro);
    }
  });

  rotas.post(
    "/:apelido/carrinho/itens",
    paraAcrescentar,
    async (req, res, proximo) => {
      try {
        const { params, body } = paraAcrescentar.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const sessao = sessaoDoCarrinho(req, res);
        const lojaId = await exigirLoja(acesso, params.apelido);

        const carrinho = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId, sessaoDoCarrinho: sessao },
          () =>
            acesso.emTransacao(async () => {
              const produto = await opcoes.lerProduto(body.produtoId);
              if (produto === null) {
                // Produto inexistente, em rascunho e de outra loja saem pela
                // MESMA porta — a política já os recusou igual.
                throw erroDeDominio("nao_encontrado", { recurso: "produto" });
              }

              const conferido = conferirItem(produto, body);
              registrarDivergencia(conferido, body.totalVistoCentavos ?? null);

              return acrescentarItem({
                produtoId: produto.id,
                variacaoId: conferido.variacaoId,
                quantidade: body.quantidade,
                observacao: body.observacao ?? null,
                opcoes: conferido.opcoes,
              });
            }),
        );

        res.status(201).json(paraFora(carrinho));
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  rotas.patch(
    "/:apelido/carrinho/itens/:itemId",
    paraQuantidade,
    async (req, res, proximo) => {
      try {
        const { params, body } = paraQuantidade.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const sessao = sessaoDoCarrinho(req, res);
        const lojaId = await exigirLoja(acesso, params.apelido);

        const carrinho = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId, sessaoDoCarrinho: sessao },
          () =>
            acesso.emTransacao(() =>
              // Zero REMOVE, e não guarda uma linha com quantidade zero: item
              // que chega a zero sai, que é o que a gaveta já fazia na tela.
              body.quantidade === 0
                ? removerItem(params.itemId)
                : mudarQuantidade(params.itemId, body.quantidade),
            ),
        );

        res.json(paraFora(carrinho));
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  rotas.delete(
    "/:apelido/carrinho/itens/:itemId",
    apelidoEItem,
    async (req, res, proximo) => {
      try {
        const { params } = apelidoEItem.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const sessao = sessaoDoCarrinho(req, res);
        const lojaId = await exigirLoja(acesso, params.apelido);

        const carrinho = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId, sessaoDoCarrinho: sessao },
          () => acesso.emTransacao(() => removerItem(params.itemId)),
        );

        res.json(paraFora(carrinho));
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  /*
   * A CONFERÊNCIA é o último ponto antes de o pedido existir, e o único lugar
   * do sistema em que o preço vira dinheiro.
   *
   * É POST por duas razões que valem mais que a forma: ela carrega a declaração
   * do que a tela mostrou, e REGISTRA a divergência quando os números não
   * batem. Um GET que escreve no registro de segurança mente sobre o que é.
   */
  rotas.post(
    "/:apelido/carrinho/conferencia",
    paraConferir,
    async (req, res, proximo) => {
      try {
        const { params, body } = paraConferir.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const agora = opcoes.agora?.() ?? new Date();
        const sessao = sessaoDoCarrinho(req, res);
        const lojaId = await exigirLoja(acesso, params.apelido);

        const conferencia = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId, sessaoDoCarrinho: sessao },
          () =>
            acesso.emTransacao(async () => {
              // O carrinho é achado pela SESSÃO, e não recebido por parâmetro:
              // um identificador de carrinho no corpo seria o caminho para
              // conferir — e depois fechar — o carrinho de outra pessoa.
              const carrinho = await verCarrinho();
              return conferirAntesDeFechar(
                carrinho.id,
                {
                  totalEmCentavos: body.totalVistoCentavos ?? null,
                  ...(body.precosVistos === undefined
                    ? {}
                    : { precosVistos: body.precosVistos }),
                },
                agora,
              );
            }),
        );

        res.json({
          mudancas: conferencia.mudancas.map((mudanca) => ({
            itemId: mudanca.itemId,
            nome: mudanca.nome,
            tipo: mudanca.tipo,
            deEmCentavos: mudanca.deEmCentavos ?? null,
            paraEmCentavos: mudanca.paraEmCentavos ?? null,
            explicacao: mudanca.explicacao,
          })),
          precisaConfirmar: conferencia.precisaConfirmar,
          itens: conferencia.itensQueSeguem.map((item) => ({
            itemId: item.itemId,
            produtoId: item.produtoId,
            nome: item.nome,
            quantidade: item.quantidade,
            precoUnitarioCentavos: item.precoUnitarioEmCentavos,
            totalDaLinhaCentavos: item.totalDaLinhaEmCentavos,
            // Qual preço foi usado e por quê — o atacado que entrou sozinho
            // precisa se explicar na tela (AC-310). Nulo no preço normal.
            precoAplicado: item.precoAplicado,
            ...precoParaFora(conferencia.precosDosItens.get(item.itemId)),
          })),
          subtotalCentavos: conferencia.subtotalEmCentavos,
        });
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  return rotas;
}

/** Uma faixa calculada, nos nomes do contrato. */
function faixaParaFora(faixa: FaixaCalculada | null) {
  return faixa === null
    ? null
    : {
        quantidadeMinima: faixa.quantidadeMinima,
        tipoDeDesconto: faixa.tipoDeDesconto,
        desconto: faixa.desconto,
        rotulo: faixa.rotulo,
        unitarioCentavos: faixa.unitarioEmCentavos,
        descontoPorUnidadeCentavos: faixa.descontoPorUnidadeEmCentavos,
      };
}

/**
 * O preço explicado do item (card #57): o tipo, o varejo riscado e o atacado —
 * a faixa que valeu, a próxima e quantas peças faltam.
 */
function precoParaFora(preco: PrecoDoItemConferido | undefined) {
  if (preco === undefined) return {};
  const { atacado } = preco;
  return {
    tipoDePreco: preco.tipo,
    varejoUnitarioCentavos: preco.varejoUnitarioEmCentavos,
    atacado:
      atacado === null
        ? null
        : {
            pedidoMinimo: atacado.pedidoMinimo,
            faixaAplicada: faixaParaFora(atacado.faixaAplicada),
            proximaFaixa: faixaParaFora(atacado.proximaFaixa),
            faltamParaProxima: atacado.faltamParaProxima,
            economiaCentavos: atacado.economiaEmCentavos,
          },
  };
}

/** O carrinho como o contrato o publica. */
function paraFora(carrinho: CarrinhoAtual) {
  return {
    itens: carrinho.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      variacaoId: item.variacaoId,
      quantidade: item.quantidade,
      observacao: item.observacao,
      opcoes: item.opcoes.map((opcao) => ({
        grupoNome: opcao.grupoNome,
        opcaoNome: opcao.opcaoNome,
        quantidade: opcao.quantidade ?? 1,
      })),
    })),
    totalDeItens: carrinho.totalDeItens,
  };
}

interface ItemConferido {
  readonly variacaoId: string | null;
  readonly unitarioEmCentavos: number;
  readonly totalEmCentavos: number;
  readonly opcoes: readonly {
    readonly grupoId: string;
    readonly grupoNome: string;
    readonly opcaoId: string;
    readonly opcaoNome: string;
    readonly quantidade: number;
  }[];
}

/**
 * Recalcula o item com os preços do catálogo, e recusa o que não fecha.
 *
 * É A MESMA FUNÇÃO QUE A TELA CHAMA (`calcularItem`), com uma diferença que é o
 * ponto todo: aqui os preços e a lista de opções vêm do BANCO, e não do que o
 * navegador mandou. A tela usa a função para mostrar; a API, para cobrar.
 *
 * A RECUSA É GENÉRICA para quem chamou, e detalhada no registro. A tela já sabe
 * o que falta — ela calculou o mesmo antes de enviar —, e quem chega aqui com
 * um item que não fecha ou está com a página aberta desde antes de o dono mexer
 * no cardápio, ou está montando requisição à mão. Nenhum dos dois precisa de um
 * mapa do catálogo na mensagem de erro.
 */
function conferirItem(
  produto: ProdutoParaConferir,
  pedido: {
    readonly variacaoId?: string | null | undefined;
    readonly quantidade: number;
    readonly escolhas: readonly {
      readonly grupoId: string;
      readonly opcaoId: string;
      readonly quantidade: number;
    }[];
  },
): ItemConferido {
  if (!produto.disponivel) {
    throw erroDeDominio("conflito", {
      recurso: "produto",
      recursoId: produto.id,
      motivo: "indisponivel",
    });
  }

  const temVariantes = produto.variacoes.length > 0;
  const variacao = temVariantes
    ? (produto.variacoes.find((v) => v.id === pedido.variacaoId) ??
      (pedido.variacaoId === null || pedido.variacaoId === undefined
        ? (produto.variacoes.find((v) => v.padrao) ?? null)
        : null))
    : null;

  if (temVariantes && (variacao === null || !variacao.disponivel)) {
    throw erroDeDominio("conflito", {
      recurso: "variacao",
      recursoId: produto.id,
      motivo: "indisponivel_ou_desconhecida",
    });
  }

  // Os EIXOS de variação não entram na conta das escolhas: quem carrega o preço
  // deles é a variante, e contá-los duas vezes somaria o tamanho ao total.
  const gruposComuns = produto.grupos.filter((g) => !g.eixoDeVariacao);

  const escolhas: readonly EscolhaFeita[] = pedido.escolhas.map((escolha) => ({
    grupoId: escolha.grupoId,
    itemId: escolha.opcaoId,
    quantidade: escolha.quantidade,
  }));

  const conta = calcularItem({
    precoBaseEmCentavos: temVariantes
      ? (variacao?.precoCentavos ?? 0)
      : (produto.precoCentavos ?? 0),
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
    registrador().aviso(EVENTO_DE_ITEM_RECUSADO, {
      recurso: "produto",
      recursoId: produto.id,
      detalhe: {
        motivos: conta.pendencias.map((p) => p.motivo).join(","),
      },
    });
    throw erroDeDominio("conflito", {
      recurso: "item",
      recursoId: produto.id,
      motivo: "escolhas_nao_fecham",
    });
  }

  // Os NOMES são resolvidos do catálogo, e não copiados do que o cliente
  // mandou: o carrinho guarda o que a cozinha vai ler, e um nome enviado de
  // fora poria texto arbitrário no cupom impresso.
  const opcoes = pedido.escolhas.flatMap((escolha) => {
    const grupo = gruposComuns.find((g) => g.id === escolha.grupoId);
    const opcao = grupo?.opcoes.find((o) => o.id === escolha.opcaoId);
    if (grupo === undefined || opcao === undefined) return [];
    return [
      {
        grupoId: grupo.id,
        grupoNome: grupo.nome,
        opcaoId: opcao.id,
        opcaoNome: opcao.nome,
        quantidade: escolha.quantidade,
      },
    ];
  });

  return {
    variacaoId: variacao?.id ?? null,
    unitarioEmCentavos: conta.unitarioEmCentavos,
    totalEmCentavos: conta.totalEmCentavos,
    opcoes,
  };
}

/**
 * Anota quando o total da tela não bate com o do servidor (AC-504).
 *
 * NÃO INTERROMPE. O valor do servidor já é o que vale, e barrar a compra por
 * uma diferença de centavos puniria o cliente por uma mudança de preço que o
 * dono acabou de fazer. O que importa é o registro: divergência recorrente é
 * sintoma de tela desatualizada, e sem a anotação ninguém descobre.
 *
 * Os VALORES vão como detalhe omitido no registro — dinheiro de pedido é dado
 * de negócio, e o registro não é lugar dele.
 */
function registrarDivergencia(
  conferido: ItemConferido,
  totalVisto: number | null,
): void {
  if (totalVisto === null || totalVisto === conferido.totalEmCentavos) return;

  registrador().aviso(EVENTO_DE_DIVERGENCIA_NO_ITEM, {
    recurso: "item",
    detalhe: {
      totalDoServidorEmCentavos: conferido.totalEmCentavos,
      totalEnviadoEmCentavos: totalVisto,
    },
  });
}

/** Evento do registro quando o item enviado não fecha com o catálogo. */
export const EVENTO_DE_ITEM_RECUSADO = "carrinho.item_recusado";

/** Evento do registro quando o total da tela não bate com o do servidor. */
export const EVENTO_DE_DIVERGENCIA_NO_ITEM = "carrinho.total_divergente";

/** Onde as rotas do carrinho ficam montadas. */
export const PREFIXO_DO_CARRINHO = "/v1/vitrine";

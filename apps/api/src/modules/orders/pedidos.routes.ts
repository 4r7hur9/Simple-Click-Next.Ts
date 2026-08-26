/**
 * A rota que fecha o pedido (AC-503, AC-504, AC-507, AC-511, AC-516, AC-517).
 *
 * É O ÚLTIMO PASSO, e o mais cuidadoso do sistema: é aqui que o carrinho vira
 * dinheiro e a cozinha ganha trabalho. Tudo que ela faz antes de criar o pedido
 * existe para uma frase só — **o cliente paga o que viu, e a loja recebe o que
 * pode preparar**.
 *
 * O CORPO NÃO TRAZ ITENS, e isso é o ponto. Os itens vêm do CARRINHO daquela
 * sessão, lidos no servidor; os preços vêm do catálogo, lidos no mesmo instante.
 * Aceitar itens no corpo deixaria o cliente escolher o que compra e por quanto
 * — o erro que o AC-504 existe para impedir, e o que a primeira versão deste
 * produto permitia.
 *
 * A ORDEM DOS PASSOS É A REGRA, e não detalhe de implementação:
 *
 *   1. resolve a loja pelo apelido, sem contexto — ainda não se sabe qual é;
 *   2. numa transação com a loja E a sessão declaradas: lê o carrinho, confere
 *      cada item contra o catálogo de agora, calcula a taxa, confere os
 *      impedimentos e só então cria.
 *
 * Inverter qualquer par disso é como se cobra errado: calcular a taxa antes de
 * conferir os itens usa um subtotal que pode não existir mais; criar antes de
 * conferir grava um preço velho.
 *
 * O QUE CHEGA POR PARÂMETRO, e por quê. Ler o carrinho e conferir preço moram
 * no módulo `cart`; a configuração de entrega e a resolução da loja moram em
 * `storefront`; criar o pedido mora aqui. A tabela de fronteiras não autoriza
 * um módulo a importar outro — quem junta é `app.ts`, que é a borda.
 */
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { calcularValores } from "@simpleclick/core";
import type { ConfiguracaoDeEntrega } from "@simpleclick/core";
import {
  esquemaDoApelido,
  esquemaDoPedidoParaCriar,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { registrador } from "../../core/log.ts";
import { sessaoDoCarrinho } from "../../core/sessao-do-carrinho.ts";
import { validar } from "../../core/validar.ts";
import { criarPedido } from "./criar-pedido.usecase.ts";
import type { ItemParaCriar, OpcaoParaCriar } from "./criar-pedido.usecase.ts";

/**
 * O endereço público do pedido, sorteado AQUI e declarado na transação.
 *
 * NÃO PODE SER ADIVINHÁVEL (AC-614): quem tem o token vê o pedido, e um número
 * sequencial deixaria qualquer pessoa passear pelos pedidos da loja inteira.
 * São 32 bytes de aleatoriedade, o mesmo tamanho da sessão do carrinho.
 *
 * E ele é sorteado por QUEM CHAMA, e não dentro do caso de uso, porque é ele
 * que a requisição declara no contexto — o isolamento por linha confere a
 * declaração contra a linha escrita (migração 0009). Sortear lá dentro deixaria
 * as duas divergentes, e o banco recusaria a escrita, corretamente.
 */
function novoTokenDoPedido(): string {
  return randomBytes(32).toString("base64url");
}

/** Evento do registro quando o total da tela não bate com o do servidor. */
export const EVENTO_DE_DIVERGENCIA_NO_PEDIDO = "pedido.total_divergente";

/** O carrinho como esta rota precisa vê-lo. */
export interface CarrinhoParaFechar {
  readonly id: string;
  readonly itens: readonly {
    readonly id: string;
    readonly produtoId: string;
    readonly variacaoId: string | null;
    readonly observacao: string | null;
    readonly opcoes: readonly {
      readonly grupoId?: string | null;
      readonly grupoNome: string;
      readonly opcaoId?: string | null;
      readonly opcaoNome: string;
      readonly quantidade?: number;
    }[];
  }[];
}

/** O veredito da conferência, como esta rota precisa vê-lo. */
export interface ConferenciaParaFechar {
  readonly itensQueSeguem: readonly {
    readonly itemId: string;
    readonly produtoId: string;
    readonly nome: string;
    readonly quantidade: number;
    readonly precoUnitarioEmCentavos: number;
    readonly acrescimosEmCentavos: number;
    readonly totalDaLinhaEmCentavos: number;
  }[];
  readonly subtotalEmCentavos: number;
}

/** A configuração de entrega da loja, como esta rota precisa vê-la. */
export interface FechamentoParaFechar {
  readonly entrega: {
    readonly aceitaEntrega: boolean;
    readonly aceitaRetirada: boolean;
    readonly taxaCentavos: number | null;
    readonly nomeDaTaxa: string | null;
    readonly gratisAcimaDeCentavos: number | null;
    readonly minimoParaEntregaCentavos: number | null;
    readonly minimoParaRetiradaCentavos: number | null;
  };
  readonly pix: {
    readonly chave: string;
    readonly tipo: string | null;
    readonly titular: string | null;
  } | null;
}

/** Se a loja aceita pedido agora. */
export interface AberturaParaFechar {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
}

export interface OpcoesDosPedidos {
  readonly acesso?: AcessoAoBanco;
  readonly agora?: () => Date;
  readonly identificarLoja: (params: {
    readonly apelido: string;
  }) => Promise<{ readonly encontrada: boolean; readonly id?: string }>;
  readonly lerCarrinho: () => Promise<CarrinhoParaFechar>;
  readonly conferirCarrinho: (
    carrinhoId: string,
    agora: Date,
  ) => Promise<ConferenciaParaFechar>;
  readonly lerFechamento: () => Promise<FechamentoParaFechar | null>;
  readonly lerAbertura: (agora: Date) => Promise<AberturaParaFechar>;
}

export function criarRotasDePedidos(opcoes: OpcoesDosPedidos): Router {
  const rotas = Router();
  const borda = validar({
    params: esquemaDoApelido,
    body: esquemaDoPedidoParaCriar,
  });

  rotas.post("/:apelido/pedidos", borda, async (req, res, proximo) => {
    try {
      const { params, body } = borda.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const agora = opcoes.agora?.() ?? new Date();
      const sessao = sessaoDoCarrinho(req, res);
      const tokenDoPedido = novoTokenDoPedido();

      // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () => acesso.emTransacao(() => opcoes.identificarLoja(params)),
      );

      if (!identificacao.encontrada || identificacao.id === undefined) {
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }
      const lojaId = identificacao.id;

      // PASSO 2 — transação nova, com a loja, a sessão E a chave de fechamento
      // declaradas. A chave precisa estar no CONTEXTO, e não só no corpo: é ela
      // que autoriza a leitura do pedido criado por uma tentativa anterior
      // (migração 0010). Divergir não daria erro — a busca simplesmente não
      // acharia nada, e a proteção contra duplicata falharia em silêncio.
      const resultado = await executarComoRequisicao(
        {
          papel: "PUBLIC",
          lojaId,
          sessaoDoCarrinho: sessao,
          chaveDoFechamento: body.chaveDeIdempotencia,
          tokenDoPedido,
        },
        () =>
          acesso.emTransacao(async () => {
            const carrinho = await opcoes.lerCarrinho();
            const conferencia = await opcoes.conferirCarrinho(
              carrinho.id,
              agora,
            );
            const fechamento = await opcoes.lerFechamento();
            const abertura = await opcoes.lerAbertura(agora);

            const configuracao = comoConfiguracao(fechamento);
            const valores = calcularValores(
              configuracao,
              body.entrega,
              conferencia.subtotalEmCentavos,
            );

            // IMPEDIMENTO VEM ANTES DE CRIAR. Subtotal abaixo do mínimo e forma
            // de entrega que a loja não faz são recusas de NEGÓCIO, não erros:
            // o carrinho continua intacto e a pessoa sabe o que falta (AC-508).
            if (valores.impedimento !== null) {
              throw erroDeDominio("conflito", {
                recurso: "pedido",
                motivo: valores.impedimento.causa,
              });
            }

            registrarDivergencia(
              valores.totalEmCentavos,
              body.totalVistoCentavos ?? null,
              lojaId,
              carrinho.id,
            );

            return criarPedido(
              {
                lojaId,
                contato: {
                  nome: body.contato.nome,
                  // O telefone chega como a pessoa digitou; quem normaliza é o
                  // caso de uso, que já conhece a regra (T-509).
                  telefoneE164: body.contato.telefone,
                  email: body.contato.email ?? null,
                  logradouro: body.contato.logradouro ?? null,
                  numero: body.contato.numero ?? null,
                  complemento: body.contato.complemento ?? null,
                  bairro: body.contato.bairro ?? null,
                  cidade: body.contato.cidade ?? null,
                  estado: body.contato.estado ?? null,
                  cep: body.contato.cep ?? null,
                },
                itens: itensDoPedido(carrinho, conferencia),
                entrega: body.entrega,
                canal: "ONLINE",
                formaDePagamento: body.formaDePagamento ?? null,
                // A CHAVE PIX É CONGELADA AQUI (AC-511): o pedido guarda a que
                // valia no momento, e o dono trocar a dele depois não mexe em
                // pedido nenhum. Só é gravada quando o pagamento é PIX.
                ...(body.formaDePagamento === "PIX" && fechamento?.pix
                  ? {
                      chavePixCopiada: fechamento.pix.chave,
                      tipoDaChavePixCopiado: fechamento.pix.tipo,
                      nomeDoRecebedorCopiado: fechamento.pix.titular,
                    }
                  : {}),
                trocoParaEmCentavos: body.trocoParaCentavos ?? null,
                subtotalEmCentavos: valores.subtotalEmCentavos,
                taxaDeEntregaEmCentavos: valores.taxaDeEntrega.valorEmCentavos,
                modoDaTaxaDeEntrega: valores.taxaDeEntrega.modo,
                totalEmCentavos: valores.totalEmCentavos,
                observacaoDoCliente: body.observacao ?? null,
                chaveDeIdempotencia: body.chaveDeIdempotencia,
              },
              {
                aberta: abertura.aberta,
                proximaAbertura: abertura.proximaAbertura,
              },
            ).then((criado) => ({ criado, valores }));
          }),
      );

      if (!resultado.criado.ok) {
        // LOJA FECHADA e CARRINHO VAZIO são recusas de negócio, e o carrinho
        // continua intacto (AC-517). 409 porque o estado do mundo é que
        // impede, e não o que a pessoa enviou.
        throw erroDeDominio("conflito", {
          recurso: "pedido",
          motivo: resultado.criado.recusa.causa,
        });
      }

      const pedido = resultado.criado.pedido;
      res.status(pedido.jaExistia ? 200 : 201).json({
        id: pedido.id,
        numero: pedido.numero,
        codigo: pedido.codigo,
        tokenPublico: pedido.tokenPublico,
        status: pedido.status,
        jaExistia: pedido.jaExistia,
        subtotalCentavos: resultado.valores.subtotalEmCentavos,
        taxaDeEntregaCentavos: resultado.valores.taxaDeEntrega.valorEmCentavos,
        totalCentavos: resultado.valores.totalEmCentavos,
      });
    } catch (erro) {
      proximo(erro);
    }
  });

  return rotas;
}

/**
 * A configuração de entrega no vocabulário da regra.
 *
 * Loja sem configuração nenhuma vira "não aceita nada", e não "aceita tudo de
 * graça": o padrão do que falta é o que não vende por engano.
 */
function comoConfiguracao(
  fechamento: FechamentoParaFechar | null,
): ConfiguracaoDeEntrega {
  if (fechamento === null) {
    return { aceitaEntrega: false, aceitaRetirada: false };
  }
  const entrega = fechamento.entrega;
  return {
    aceitaEntrega: entrega.aceitaEntrega,
    aceitaRetirada: entrega.aceitaRetirada,
    taxaEmCentavos: entrega.taxaCentavos,
    nomeDaTaxa: entrega.nomeDaTaxa,
    gratisAcimaDeEmCentavos: entrega.gratisAcimaDeCentavos,
    minimoParaEntregaEmCentavos: entrega.minimoParaEntregaCentavos,
    minimoParaRetiradaEmCentavos: entrega.minimoParaRetiradaCentavos,
  };
}

/**
 * Monta os itens do pedido: preço da CONFERÊNCIA, texto do CARRINHO.
 *
 * A DIVISÃO É O PONTO. Os valores vêm da conferência, que os leu do catálogo
 * agora; os nomes das escolhas vêm do carrinho, que os gravou quando a pessoa
 * escolheu. O pedido é registro do MOMENTO DA COMPRA (AC-515), e por isso ele
 * grava texto, e não referência viva: mudar o cardápio depois não mexe em
 * pedido nenhum.
 *
 * Item que a conferência RETIROU — esgotado, fora do catálogo, sem preço — não
 * aparece aqui. Seguir faria a cozinha receber o que não tem como preparar.
 */
function itensDoPedido(
  carrinho: CarrinhoParaFechar,
  conferencia: ConferenciaParaFechar,
): ItemParaCriar[] {
  const porItem = new Map(carrinho.itens.map((item) => [item.id, item]));

  return conferencia.itensQueSeguem.map((precificado) => {
    const doCarrinho = porItem.get(precificado.itemId);
    const opcoes: OpcaoParaCriar[] = (doCarrinho?.opcoes ?? []).map(
      (opcao) => ({
        grupoId: opcao.grupoId ?? null,
        opcaoId: opcao.opcaoId ?? null,
        nomeDoGrupo: opcao.grupoNome,
        nomeDaOpcao: opcao.opcaoNome,
        quantidade: opcao.quantidade ?? 1,
      }),
    );

    return {
      produtoId: precificado.produtoId,
      variacaoId: doCarrinho?.variacaoId ?? null,
      nomeDoProduto: precificado.nome,
      quantidade: precificado.quantidade,
      precoUnitarioEmCentavos: precificado.precoUnitarioEmCentavos,
      opcoesEmCentavos: precificado.acrescimosEmCentavos,
      totalDaLinhaEmCentavos: precificado.totalDaLinhaEmCentavos,
      observacao: doCarrinho?.observacao ?? null,
      opcoes,
    };
  });
}

/**
 * Anota quando o total da tela não bate com o do servidor (AC-504).
 *
 * NÃO INTERROMPE. O valor do servidor já é o que vale, e barrar o pedido por
 * uma diferença puniria o cliente por uma mudança de preço que o dono acabou de
 * fazer. O que importa é o registro: divergência recorrente é sintoma de tela
 * desatualizada, e sem a anotação ninguém descobre.
 */
function registrarDivergencia(
  doServidor: number,
  daTela: number | null,
  lojaId: string,
  carrinhoId: string,
): void {
  if (daTela === null || daTela === doServidor) return;

  registrador().aviso(EVENTO_DE_DIVERGENCIA_NO_PEDIDO, {
    lojaId,
    recurso: "carrinho",
    recursoId: carrinhoId,
    detalhe: {
      totalDoServidorEmCentavos: doServidor,
      totalEnviadoEmCentavos: daTela,
    },
  });
}

/** Onde as rotas de pedido ficam montadas. */
export const PREFIXO_DOS_PEDIDOS = "/v1/vitrine";

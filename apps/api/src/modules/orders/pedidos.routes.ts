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
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  calcularValores,
  gerarTextoDoPedido,
  linkDoWhatsApp,
  normalizarWhatsApp,
} from "@simpleclick/core";
import type {
  ConfiguracaoDeEntrega,
  ItemDoPedido,
  PedidoParaTexto,
} from "@simpleclick/core";
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
import { reservarEstoque } from "./reservar-estoque.ts";
import { acompanharPedido } from "./acompanhar.usecase.ts";
import { vincularClienteDaLoja } from "./meus-pedidos.usecase.ts";
import {
  confirmarEnvioNoWhatsApp,
  PedidoDaConfirmacaoNaoEncontrado,
  registrarCliqueNoWhatsApp,
} from "./confirmacao-whatsapp.usecase.ts";

/**
 * O formato do endereço público do pedido (AC-614): o que `tokenPublico()` e
 * `novoTokenDoPedido()` sorteiam, em base64 de endereço. Endereço fora deste
 * formato não é pedido de ninguém — e responde "não encontrado" na borda,
 * igual a um token bem formado que não existe, sem ir ao banco (P-007).
 */
export const FORMATO_DO_TOKEN_DO_PEDIDO = /^[A-Za-z0-9_-]{22,128}$/;

function tokenBemFormado(token: string): boolean {
  return FORMATO_DO_TOKEN_DO_PEDIDO.test(token);
}

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

/**
 * Evento do registro quando o pedido de um cliente logado não pôde ser ligado
 * à conta dele (AC-616). A venda segue como convidado: perder o vínculo é
 * ruim, perder a venda é pior — e o aviso é o que impede a falha de ficar
 * invisível.
 */
export const EVENTO_DE_VINCULO_SEM_CONTA = "pedido.vinculo_com_a_conta_falhou";

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

/** A linha de WhatsApp da loja, como esta rota precisa vê-la. */
export interface WhatsAppParaFechar {
  readonly numero: string;
  readonly saudacao: string | null;
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
  /**
   * A resolução da página de ACOMPANHAMENTO, que enxerga também a loja
   * suspensa: o cliente que já pediu continua acompanhando o pedido (Q-203,
   * decisão de 03/10/2026). Ausente, vale `identificarLoja` — só loja no ar.
   */
  readonly identificarLojaDoAcompanhamento?:
    | ((params: {
        readonly apelido: string;
      }) => Promise<{ readonly encontrada: boolean; readonly id?: string }>)
    | undefined;
  readonly lerCarrinho: () => Promise<CarrinhoParaFechar>;
  readonly conferirCarrinho: (
    carrinhoId: string,
    agora: Date,
  ) => Promise<ConferenciaParaFechar>;
  readonly lerFechamento: () => Promise<FechamentoParaFechar | null>;
  readonly lerAbertura: (agora: Date) => Promise<AberturaParaFechar>;
  /** O número com que a loja recebe pedido. Nulo quando ela não cadastrou. */
  readonly lerWhatsApp: () => Promise<WhatsAppParaFechar | null>;
  /** O endereço do site, para o link de acompanhamento dentro da mensagem. */
  readonly enderecoDoSite?: string | undefined;
  /**
   * Quem está comprando, quando a requisição traz sessão de CLIENTE. O pedido
   * nasce ligado à conta dessa pessoa e entra no histórico dela (AC-616).
   * Nulo é compra de convidado — a maioria (ASM-103).
   */
  readonly autenticarCliente?:
    | ((requisicao: Request) => { readonly identidadeId: string } | null)
    | undefined;
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

      // O cliente logado, quando há sessão de CLIENTE: o pedido nasce ligado
      // à conta dele e entra no histórico (AC-616). É um passo próprio, antes
      // do fechamento, porque o vínculo é escrito no papel CUSTOMER e o
      // fechamento corre como PUBLIC — dois contextos, duas transações.
      const clienteDaLojaId = await clienteDaLojaDaSessao({
        opcoes,
        acesso,
        req,
        lojaId,
        contato: body.contato,
      });

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
            const whatsapp = await opcoes.lerWhatsApp();

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

            const itens = itensDoPedido(carrinho, conferencia);
            const criado = await criarPedido(
              {
                lojaId,
                clienteDaLojaId,
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
                itens,
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
            );

            // Idempotência devolve o pedido já baixado. Só a criação nova
            // reserva saldo; repetir o checkout nunca baixa duas vezes.
            if (criado.ok && !criado.pedido.jaExistia) {
              await reservarEstoque({
                lojaId,
                pedidoId: criado.pedido.id,
                itens,
              });
            }

            return {
              criado,
              valores,
              whatsapp,
              carrinho,
              conferencia,
              fechamento,
            };
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

      // A MENSAGEM É MONTADA AQUI, e não na tela, por dois motivos. O primeiro
      // é que só o servidor tem o pedido inteiro — nomes das escolhas, taxa
      // com o nome que o dono deu, forma de pagamento. O segundo é o número da
      // loja: montando aqui, ele vai embutido no endereço e nunca vira campo
      // de resposta. Quem recebe o endereço é quem acabou de pedir.
      const mensagem = montarMensagem({
        pedido,
        valores: resultado.valores,
        whatsapp: resultado.whatsapp,
        carrinho: resultado.carrinho,
        conferencia: resultado.conferencia,
        fechamento: resultado.fechamento,
        corpo: body,
        enderecoDoSite: opcoes.enderecoDoSite ?? "",
        apelidoDaLoja: params.apelido,
      });

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
        whatsapp: mensagem,
      });
    } catch (erro) {
      proximo(erro);
    }
  });

  rotas.get("/:apelido/pedido/:token", async (req, res, proximo) => {
    try {
      // O status muda a cada passo da loja: nada no caminho guarda cópia, ou a
      // página do cliente mostraria o passado (AC-613).
      res.set("cache-control", "no-store");
      if (!tokenBemFormado(req.params.token)) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }
      const acesso = opcoes.acesso ?? banco();
      // A loja suspensa continua acompanhável (Q-203): a resolução daqui é a
      // única do fechamento que a enxerga.
      const identificar =
        opcoes.identificarLojaDoAcompanhamento ?? opcoes.identificarLoja;
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () =>
          acesso.emTransacao(() =>
            identificar({ apelido: req.params.apelido }),
          ),
      );
      if (!identificacao.encontrada || identificacao.id === undefined) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }

      const pedido = await executarComoRequisicao(
        {
          papel: "PUBLIC",
          lojaId: identificacao.id,
          tokenDoPedido: req.params.token,
        },
        () => acesso.emTransacao(() => acompanharPedido()),
      );
      if (pedido === null) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }

      res.json({ pedido });
    } catch (causa) {
      proximo(causa);
    }
  });

  /**
   * O navegador abre a conversa primeiro e só depois registra o clique. Assim
   * a chamada de rede nunca fica entre o gesto do cliente e a abertura da
   * janela, o que faria o navegador bloquear o WhatsApp.
   */
  async function registrarAcaoDoWhatsApp(
    req: Request<{ apelido: string; token: string }>,
    res: Response,
    proximo: NextFunction,
    confirmado: boolean,
  ): Promise<void> {
    try {
      if (!tokenBemFormado(req.params.token)) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }
      const acesso = opcoes.acesso ?? banco();
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () =>
          acesso.emTransacao(() =>
            opcoes.identificarLoja({ apelido: req.params.apelido }),
          ),
      );
      if (!identificacao.encontrada || identificacao.id === undefined) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }

      const resultado = await executarComoRequisicao(
        {
          papel: "PUBLIC",
          lojaId: identificacao.id,
          tokenDoPedido: req.params.token,
        },
        () =>
          acesso.emTransacao(() =>
            confirmado
              ? confirmarEnvioNoWhatsApp()
              : registrarCliqueNoWhatsApp(),
          ),
      );

      res.json({
        id: resultado.id,
        whatsappClickedAt: resultado.clicadoEm.toISOString(),
        whatsappConfirmedAt: resultado.confirmadoEm?.toISOString() ?? null,
        aguardandoConfirmacaoWhatsapp: resultado.aguardandoConfirmacao,
      });
    } catch (causa) {
      if (causa instanceof PedidoDaConfirmacaoNaoEncontrado) {
        res.status(404).json({ erro: "nao_encontrado" });
        return;
      }
      proximo(causa);
    }
  }

  rotas.post(
    "/:apelido/pedidos/:token/whatsapp-clique",
    (req, res, proximo) => {
      void registrarAcaoDoWhatsApp(req, res, proximo, false);
    },
  );

  rotas.post(
    "/:apelido/pedidos/:token/whatsapp-confirmado",
    (req, res, proximo) => {
      void registrarAcaoDoWhatsApp(req, res, proximo, true);
    },
  );

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

/**
 * O cliente-da-loja da sessão de CLIENTE, ou nulo.
 *
 * Nulo quando a compra é de convidado — e também quando o vínculo falha: a
 * venda segue sem ele, e o registro avisa. O motivo vai só pelo nome do erro:
 * a mensagem de um erro de banco pode carregar o que foi enviado, e o que foi
 * enviado é nome e telefone (P-009).
 */
async function clienteDaLojaDaSessao({
  opcoes,
  acesso,
  req,
  lojaId,
  contato,
}: {
  readonly opcoes: OpcoesDosPedidos;
  readonly acesso: AcessoAoBanco;
  readonly req: Request;
  readonly lojaId: string;
  readonly contato: { readonly nome: string; readonly telefone: string };
}): Promise<string | null> {
  const cliente = opcoes.autenticarCliente?.(req) ?? null;
  if (cliente === null) return null;

  try {
    return await executarComoRequisicao(
      { papel: "CUSTOMER", lojaId, usuarioId: cliente.identidadeId },
      () =>
        acesso.emTransacao(() =>
          vincularClienteDaLoja({
            nome: contato.nome,
            telefoneE164: contato.telefone,
          }),
        ),
    );
  } catch (causa) {
    registrador().aviso(EVENTO_DE_VINCULO_SEM_CONTA, {
      lojaId,
      recurso: "cliente_da_loja",
      recursoId: cliente.identidadeId,
      detalhe: { causa: causa instanceof Error ? causa.name : "desconhecida" },
    });
    return null;
  }
}

/** Onde as rotas de pedido ficam montadas. */
export const PREFIXO_DOS_PEDIDOS = "/v1/vitrine";

/** O que a montagem da mensagem precisa saber. */
interface DadosDaMensagem {
  readonly pedido: {
    readonly codigo: string;
    readonly tokenPublico: string;
  };
  readonly valores: ReturnType<typeof calcularValores>;
  readonly whatsapp: WhatsAppParaFechar | null;
  readonly carrinho: CarrinhoParaFechar;
  readonly conferencia: ConferenciaParaFechar;
  readonly fechamento: FechamentoParaFechar | null;
  readonly corpo: {
    readonly contato: {
      readonly nome: string;
      readonly telefone: string;
      readonly logradouro?: string | null | undefined;
      readonly numero?: string | null | undefined;
      readonly complemento?: string | null | undefined;
      readonly bairro?: string | null | undefined;
      readonly cidade?: string | null | undefined;
      readonly cep?: string | null | undefined;
    };
    readonly entrega: "DELIVERY" | "PICKUP";
    readonly formaDePagamento?: string | null | undefined;
    readonly trocoParaCentavos?: number | null | undefined;
    readonly observacao?: string | null | undefined;
  };
  readonly enderecoDoSite: string;
  readonly apelidoDaLoja: string;
}

/**
 * Monta a mensagem que a pessoa manda para a loja (AC-519 a AC-522).
 *
 * O TEXTO VEM DE `packages/core`, que é onde a regra de encurtar mora — o
 * `wa.me` carrega a mensagem na barra de endereços, e endereço longo é cortado
 * em silêncio por navegador, aplicativo e sistema operacional, cada um com o
 * seu teto.
 *
 * LOJA SEM NÚMERO NÃO IMPEDE O PEDIDO (AC-523). Ele já existe, já tem número e
 * já está na fila do dono; o que falta é o caminho do WhatsApp, e a tela mostra
 * o código para a pessoa combinar por outro meio. Devolver nulo é mais honesto
 * que devolver um endereço que não abre nada.
 */
function montarMensagem(dados: DadosDaMensagem): {
  readonly endereco: string;
  readonly texto: string;
  readonly completo: boolean;
} | null {
  if (dados.whatsapp === null) return null;

  const numero = normalizarWhatsApp(dados.whatsapp.numero);
  if (!numero.ok) {
    // Número impossível gera link silenciosamente inútil: a pessoa toca, abre
    // uma conversa vazia e acha que enviou. Melhor não oferecer o caminho.
    return null;
  }

  const porItem = new Map(dados.carrinho.itens.map((i) => [i.id, i]));
  const itens: ItemDoPedido[] = dados.conferencia.itensQueSeguem.map(
    (precificado) => {
      const doCarrinho = porItem.get(precificado.itemId);
      return {
        nome: precificado.nome,
        quantidade: precificado.quantidade,
        totalDaLinhaEmCentavos: precificado.totalDaLinhaEmCentavos,
        observacao: doCarrinho?.observacao ?? null,
        opcoes: (doCarrinho?.opcoes ?? []).map((opcao) => ({
          grupo: opcao.grupoNome,
          opcao: opcao.opcaoNome,
          quantidade: opcao.quantidade ?? 1,
        })),
      };
    },
  );

  const contato = dados.corpo.contato;
  const paraTexto: PedidoParaTexto = {
    codigo: dados.pedido.codigo,
    cliente: { nome: contato.nome, telefone: contato.telefone },
    itens,
    observacao: dados.corpo.observacao ?? null,
    entrega:
      dados.corpo.entrega === "PICKUP"
        ? { tipo: "PICKUP" }
        : {
            tipo: "DELIVERY",
            endereco: {
              logradouro: contato.logradouro ?? "",
              numero: contato.numero ?? null,
              complemento: contato.complemento ?? null,
              bairro: contato.bairro ?? null,
              cidade: contato.cidade ?? null,
              cep: contato.cep ?? null,
            },
          },
    taxaDeEntrega: {
      modo: dados.valores.taxaDeEntrega.modo,
      valorEmCentavos: dados.valores.taxaDeEntrega.valorEmCentavos,
      nome: dados.valores.taxaDeEntrega.nome ?? null,
    },
    pagamento: {
      forma: (dados.corpo.formaDePagamento ?? "CASH") as never,
      chavePix: dados.fechamento?.pix?.chave ?? null,
      tipoDaChavePix: dados.fechamento?.pix?.tipo ?? null,
      nomeDoRecebedor: dados.fechamento?.pix?.titular ?? null,
      trocoParaEmCentavos: dados.corpo.trocoParaCentavos ?? null,
    },
    subtotalEmCentavos: dados.valores.subtotalEmCentavos,
    totalEmCentavos: dados.valores.totalEmCentavos,
    linkDeAcompanhamento: `${dados.enderecoDoSite}/l/${dados.apelidoDaLoja}/pedido/${dados.pedido.tokenPublico}`,
  };

  const gerado = gerarTextoDoPedido(paraTexto);
  const saudacao = dados.whatsapp.saudacao;
  const texto =
    saudacao === null ? gerado.texto : `${saudacao}\n\n${gerado.texto}`;

  return {
    endereco: linkDoWhatsApp(numero, texto),
    texto,
    completo: gerado.dentroDoLimite && !gerado.encurtado,
  };
}

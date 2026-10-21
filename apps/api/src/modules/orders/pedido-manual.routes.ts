/**
 * As rotas do pedido lançado pelo dono (T-704, T-706).
 *
 *   POST /v1/lojas/:apelido/pedidos/manual       — lança o pedido manual
 *   POST /v1/lojas/:apelido/pedidos/:id/repetir  — monta a repetição de um pedido
 *
 * DUAS TRANSAÇÕES, E A ORDEM É A REGRA.
 *
 *   1. O catálogo é lido COMO A VITRINE O LÊ: papel público, com a loja
 *      declarada. É isso que faz o pedido manual respeitar exatamente o que o
 *      cliente respeita (AC-708) — produto em rascunho, apagado ou de seção
 *      oculta não existe, e o preço é o que a vitrine cobraria agora. Ler como
 *      dono enxergaria o rascunho, e o balcão venderia o que o site não vende.
 *   2. O pedido é criado COMO O DONO: loja, identidade e papel declarados, e o
 *      isolamento por linha confere cada inserção. É a mesma criação do pedido
 *      do site (`criarPedido`), a mesma baixa de estoque e o mesmo número.
 *
 * Ler o produto, a configuração de entrega e resolver a loja moram no módulo
 * da vitrine e no da loja; quem os passa é a borda (`app.ts`).
 */
import { randomBytes } from "node:crypto";

import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { calcularValores, normalizarWhatsApp } from "@simpleclick/core";
import {
  esquemaDoPedidoManualParaCriar,
  type EnderecoDaFichaNoContrato,
  type PedidoManualCriadoNoContrato,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, transacaoAtual, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { validar } from "../../core/validar.ts";
import {
  lerFaixasDeAtacado,
  type FaixasPorProduto,
} from "./atacado-do-pedido.ts";
import { criarPedido, type ContatoParaCriar } from "./criar-pedido.usecase.ts";
import {
  precificarItensDoPedidoManual,
  type ProdutoParaPedidoManual,
} from "./pedido-manual.usecase.ts";
import {
  comoConfiguracao,
  type FechamentoParaFechar,
} from "./pedidos.routes.ts";
import { reservarEstoque } from "./reservar-estoque.ts";
import {
  lerPedidoParaRepetir,
  montarRepeticao,
} from "./repetir-pedido.usecase.ts";

interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface DonoAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

export interface OpcoesDoPedidoManual {
  readonly acesso?: AcessoAoBanco;
  /** O instante, para a prova poder fixar o relógio. */
  readonly agora?: () => Date;
  readonly autenticar: (requisicao: Request) => DonoAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /** Lê o produto da loja do contexto, como a vitrine o mostra. Vem da borda. */
  readonly lerProduto: (
    produtoId: string,
    agora: Date,
  ) => Promise<ProdutoParaPedidoManual | null>;
  /** A configuração de entrega e o PIX da loja do contexto. Vem da borda. */
  readonly lerFechamento: () => Promise<FechamentoParaFechar | null>;
}

const esquemaDoApelidoNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
});

const esquemaDoPedidoNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
  id: z.uuid(),
});

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

/**
 * O endereço público do pedido, sorteado aqui e declarado na transação — o
 * mesmo arranjo do fechamento do site: o isolamento confere a declaração
 * contra a linha escrita, e a baixa de estoque só aceita o pedido desta
 * requisição (migrações 0009 e 0035).
 */
function novoTokenDoPedido(): string {
  return randomBytes(32).toString("base64url");
}

/** Quem pede, já resolvido: o contato do pedido e a ficha, quando há. */
interface QuemPede {
  readonly clienteDaLojaId: string | null;
  readonly nome: string;
  readonly telefoneE164: string;
  readonly enderecoDaFicha: EnderecoDaFichaNoContrato | null;
}

/** Lê o endereço guardado em JSON sem confiar no formato. */
function enderecoGuardado(bruto: unknown): EnderecoDaFichaNoContrato | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const campos = bruto as Record<string, unknown>;
  const texto = (valor: unknown): string | null =>
    typeof valor === "string" && valor.trim() !== "" ? valor : null;
  const logradouro = texto(campos.logradouro);
  if (logradouro === null) return null;
  return {
    logradouro,
    numero: texto(campos.numero),
    complemento: texto(campos.complemento),
    bairro: texto(campos.bairro),
    cidade: texto(campos.cidade),
    estado: texto(campos.estado),
    cep: texto(campos.cep),
    pontoDeReferencia: texto(campos.pontoDeReferencia),
  };
}

/**
 * Resolve quem está pedindo, dentro da transação do dono.
 *
 * A ficha é lida DESTA loja, e só ficha ativa serve: cliente removido ou de
 * outra loja responde "não encontrado" (AC-702). O avulso passa pela mesma
 * conferência de telefone do cadastro, e NÃO vira ficha (AC-709).
 */
async function resolverQuemPede(
  cliente: z.output<typeof esquemaDoPedidoManualParaCriar>["cliente"],
): Promise<QuemPede> {
  if (cliente.tipo === "avulso") {
    const telefone = normalizarWhatsApp(cliente.telefone);
    if (!telefone.ok) {
      throw erroDeDominio("entrada_invalida", { campo: "cliente.telefone" });
    }
    return {
      clienteDaLojaId: null,
      nome: cliente.nome.trim(),
      telefoneE164: `+${telefone.e164}`,
      enderecoDaFicha: null,
    };
  }

  const tx = transacaoAtual();
  const ficha = await tx.storeCustomer.findFirst({
    where: { id: cliente.clienteId, removedAt: null, anonymizedAt: null },
    select: { id: true, displayName: true, phoneE164: true, address: true },
  });
  if (ficha === null) {
    throw erroDeDominio("nao_encontrado", { recurso: "cliente" });
  }
  if (ficha.phoneE164 === null || ficha.phoneE164.trim() === "") {
    // O contato do pedido exige telefone: é por ele que a loja avisa que saiu.
    throw erroDeDominio("conflito", {
      recurso: "cliente",
      motivo: "cliente_sem_telefone",
    });
  }
  return {
    clienteDaLojaId: ficha.id,
    nome: ficha.displayName ?? "Cliente",
    telefoneE164: ficha.phoneE164,
    enderecoDaFicha: enderecoGuardado(ficha.address),
  };
}

export function criarRotasDoPedidoManual(opcoes: OpcoesDoPedidoManual): Router {
  const rotas = Router();
  // Preguiçoso: montar a aplicação não pode exigir banco configurado (AC-001).
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  async function lojaDoApelido(apelido: string): Promise<string | null> {
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    return identificacao.encontrada ? identificacao.id : null;
  }

  /** Lê os produtos citados como a vitrine os lê: papel público, loja declarada. */
  async function catalogoDaVitrine(
    lojaId: string,
    produtoIds: readonly string[],
    agora: Date,
  ): Promise<{
    readonly produtos: Map<string, ProdutoParaPedidoManual | null>;
    readonly fechamento: FechamentoParaFechar | null;
    readonly faixas: FaixasPorProduto;
  }> {
    return executarComoRequisicao({ papel: "PUBLIC", lojaId }, () =>
      acesso().emTransacao(async () => {
        const produtos = new Map<string, ProdutoParaPedidoManual | null>();
        for (const id of new Set(produtoIds)) {
          produtos.set(id, await opcoes.lerProduto(id, agora));
        }
        return {
          produtos,
          fechamento: await opcoes.lerFechamento(),
          // As faixas de atacado do produto, pela mesma visão pública (#57).
          faixas: await lerFaixasDeAtacado(produtoIds, agora),
        };
      }),
    );
  }

  function exigirDono(
    requisicao: Request,
    resposta: Response,
  ): DonoAutenticado | null {
    const dono = opcoes.autenticar(requisicao);
    if (dono === null) {
      erro(resposta, 401, "nao_autenticado");
      return null;
    }
    resposta.locals.dono = dono;
    resposta.set("cache-control", "no-store");
    return dono;
  }

  const paraLancar = validar({
    params: esquemaDoApelidoNaRota,
    body: esquemaDoPedidoManualParaCriar,
  });

  rotas.post(
    "/:apelido/pedidos/manual",
    (requisicao, resposta, proximo) => {
      if (exigirDono(requisicao, resposta) === null) return;
      proximo();
    },
    paraLancar,
    async (requisicao, resposta, proximo) => {
      try {
        const dono = resposta.locals.dono as DonoAutenticado;
        const { params, body } = paraLancar.dados(requisicao);
        const agora = opcoes.agora?.() ?? new Date();

        const lojaId = await lojaDoApelido(params.apelido);
        if (lojaId === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        // PASSO 1 — o catálogo, como a vitrine o vê.
        const { produtos, fechamento, faixas } = await catalogoDaVitrine(
          lojaId,
          body.itens.map((item) => item.produtoId),
          agora,
        );
        const precificados = precificarItensDoPedidoManual(
          body.itens,
          produtos,
          faixas,
        );
        if (precificados.pendencias.length > 0) {
          // A MESMA RECUSA DA VITRINE (AC-708): nada é criado, e o dono vê
          // cada grupo pendente de cada item, de uma vez.
          resposta.status(422).json({
            erro: "pedido_incompleto",
            pendencias: precificados.pendencias,
          });
          return;
        }

        // PASSO 2 — o pedido, como o dono o lança.
        const tokenDoPedido = novoTokenDoPedido();
        const criado = await executarComoRequisicao(
          {
            lojaId,
            usuarioId: dono.identidadeId,
            papel: dono.papel,
            tokenDoPedido,
          },
          () =>
            acesso().emTransacao(async () => {
              const quem = await resolverQuemPede(body.cliente);
              const endereco =
                body.entrega === "DELIVERY"
                  ? (body.endereco ?? quem.enderecoDaFicha)
                  : null;
              if (body.entrega === "DELIVERY" && endereco === null) {
                throw erroDeDominio("entrada_invalida", { campo: "endereco" });
              }

              const valores = calcularValores(
                comoConfiguracao(fechamento),
                body.entrega,
                precificados.subtotalEmCentavos,
              );
              if (valores.impedimento !== null) {
                throw erroDeDominio("conflito", {
                  recurso: "pedido",
                  motivo: valores.impedimento.causa,
                });
              }

              const contato: ContatoParaCriar = {
                nome: quem.nome,
                telefoneE164: quem.telefoneE164,
                logradouro: endereco?.logradouro ?? null,
                numero: endereco?.numero ?? null,
                complemento: endereco?.complemento ?? null,
                bairro: endereco?.bairro ?? null,
                cidade: endereco?.cidade ?? null,
                estado: endereco?.estado ?? null,
                cep: endereco?.cep ?? null,
              };

              const resultado = await criarPedido(
                {
                  lojaId,
                  clienteDaLojaId: quem.clienteDaLojaId,
                  contato,
                  itens: precificados.itens,
                  entrega: body.entrega,
                  canal: "MANUAL",
                  formaDePagamento: body.formaDePagamento,
                  // A chave PIX é congelada como no site (AC-511): o dono
                  // trocar a dele depois não mexe no pedido.
                  ...(body.formaDePagamento === "PIX" && fechamento?.pix
                    ? {
                        chavePixCopiada: fechamento.pix.chave,
                        tipoDaChavePixCopiado: fechamento.pix.tipo,
                        nomeDoRecebedorCopiado: fechamento.pix.titular,
                      }
                    : {}),
                  trocoParaEmCentavos: body.trocoParaCentavos ?? null,
                  subtotalEmCentavos: valores.subtotalEmCentavos,
                  taxaDeEntregaEmCentavos:
                    valores.taxaDeEntrega.valorEmCentavos,
                  modoDaTaxaDeEntrega: valores.taxaDeEntrega.modo,
                  totalEmCentavos: valores.totalEmCentavos,
                  observacaoDoCliente: body.observacao ?? null,
                },
                // O dono lança o pedido que recebeu: é ele quem decide se a
                // loja está atendendo, e não o horário cadastrado.
                { aberta: true },
              );
              if (!resultado.ok) {
                throw erroDeDominio("conflito", {
                  recurso: "pedido",
                  motivo: resultado.recusa.causa,
                });
              }

              await reservarEstoque({
                lojaId,
                pedidoId: resultado.pedido.id,
                itens: precificados.itens,
              });

              const pedido: PedidoManualCriadoNoContrato = {
                id: resultado.pedido.id,
                numero: resultado.pedido.numero,
                codigo: resultado.pedido.codigo,
                status: resultado.pedido.status,
                canal: "MANUAL",
                clienteId: quem.clienteDaLojaId,
                subtotalCentavos: valores.subtotalEmCentavos,
                taxaDeEntregaCentavos: valores.taxaDeEntrega.valorEmCentavos,
                totalCentavos: valores.totalEmCentavos,
              };
              return pedido;
            }),
        );

        resposta.status(201).json(criado);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/pedidos/:id/repetir",
    async (requisicao, resposta, proximo) => {
      try {
        const dono = exigirDono(requisicao, resposta);
        if (dono === null) return;
        const params = esquemaDoPedidoNaRota.safeParse(requisicao.params);
        if (!params.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const agora = opcoes.agora?.() ?? new Date();
        const lojaId = await lojaDoApelido(params.data.apelido);
        if (lojaId === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        const antigo = await executarComoRequisicao(
          { lojaId, usuarioId: dono.identidadeId, papel: dono.papel },
          () =>
            acesso().emTransacao(() => lerPedidoParaRepetir(params.data.id)),
        );
        if (antigo === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        const { produtos, faixas } = await catalogoDaVitrine(
          lojaId,
          antigo.itens.flatMap((item) =>
            item.produtoId === null ? [] : [item.produtoId],
          ),
          agora,
        );
        resposta.json(montarRepeticao(antigo, produtos, faixas));
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

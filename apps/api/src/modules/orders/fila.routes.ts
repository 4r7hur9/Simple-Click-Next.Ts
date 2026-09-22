import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { proximosStatus } from "@simpleclick/core";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import {
  ErroDeTransicaoDoPedido,
  PedidoNaoEncontrado,
  mudarStatusDoPedido,
} from "./mudar-status.usecase.ts";
import type { PedidoDaFila } from "./fila.usecase.ts";

interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER";
}

export interface OpcoesDaFila {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function respostaDoPedido(pedido: {
  readonly id: string;
  readonly number: bigint;
  readonly code: string;
  readonly status: string;
  readonly channel: string;
  readonly fulfillment: string;
  readonly totalCents: bigint;
  readonly placedAt: Date;
  readonly whatsappClickedAt: Date | null;
  readonly whatsappConfirmedAt: Date | null;
  readonly contato: { readonly name: string } | null;
}): PedidoDaFila {
  return {
    id: pedido.id,
    numero: Number(pedido.number),
    codigo: pedido.code,
    status: pedido.status,
    canal: pedido.channel,
    entrega: pedido.fulfillment,
    cliente: pedido.contato?.name ?? "Cliente sem nome",
    totalCentavos: Number(pedido.totalCents),
    criadoEm: pedido.placedAt.toISOString(),
    aguardandoConfirmacaoWhatsapp:
      pedido.whatsappClickedAt !== null && pedido.whatsappConfirmedAt === null,
  };
}

const esquemaDaMudancaDeStatus = z.strictObject({
  status: z.string().trim().min(1).max(40),
  motivo: z.string().trim().max(500).nullable().optional(),
});

export function criarRotasDaFila(opcoes: OpcoesDaFila): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = opcoes.autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  });

  rotas.get("/:apelido/pedidos", async (requisicao, resposta, proximo) => {
    try {
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () =>
          acesso.emTransacao(() =>
            opcoes.resolverLoja({ apelido: requisicao.params.apelido }),
          ),
      );
      if (!identificacao.encontrada) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }

      const pedidos = await executarComoRequisicao(
        {
          lojaId: identificacao.id,
          usuarioId: resposta.locals.usuario.identidadeId,
          papel: resposta.locals.usuario.papel,
        },
        () =>
          acesso.emTransacao((tx) =>
            tx.order.findMany({
              where: {
                storeId: identificacao.id,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
              orderBy: { placedAt: "asc" },
              select: {
                id: true,
                number: true,
                code: true,
                status: true,
                channel: true,
                fulfillment: true,
                totalCents: true,
                placedAt: true,
                whatsappClickedAt: true,
                whatsappConfirmedAt: true,
                contato: { select: { name: true } },
              },
            }),
          ),
      );

      resposta.json({ pedidos: pedidos.map(respostaDoPedido) });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.get("/:apelido/pedidos/:id", async (requisicao, resposta, proximo) => {
    try {
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () =>
          acesso.emTransacao(() =>
            opcoes.resolverLoja({ apelido: requisicao.params.apelido }),
          ),
      );
      if (!identificacao.encontrada) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }

      const pedido = await executarComoRequisicao(
        {
          lojaId: identificacao.id,
          usuarioId: resposta.locals.usuario.identidadeId,
          papel: resposta.locals.usuario.papel,
        },
        () =>
          acesso.emTransacao((tx) =>
            tx.order.findFirst({
              where: { id: requisicao.params.id, storeId: identificacao.id },
              select: {
                id: true,
                number: true,
                code: true,
                status: true,
                channel: true,
                fulfillment: true,
                totalCents: true,
                placedAt: true,
                customerNote: true,
                cancelReason: true,
                contato: {
                  select: {
                    name: true,
                    phoneE164: true,
                    street: true,
                    number: true,
                    complement: true,
                    neighborhood: true,
                    city: true,
                    uf: true,
                    zip: true,
                  },
                },
                itens: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    id: true,
                    productName: true,
                    variantName: true,
                    quantity: true,
                    lineTotalCents: true,
                    note: true,
                    opcoes: {
                      orderBy: { sortOrder: "asc" },
                      select: {
                        groupNameSnapshot: true,
                        optionNameSnapshot: true,
                        quantity: true,
                      },
                    },
                  },
                },
                historico: {
                  orderBy: { occurredAt: "asc" },
                  select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    actorRole: true,
                    reason: true,
                    occurredAt: true,
                  },
                },
              },
            }),
          ),
      );
      if (pedido === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }

      resposta.json({
        pedido: {
          id: pedido.id,
          numero: Number(pedido.number),
          codigo: pedido.code,
          status: pedido.status,
          canal: pedido.channel,
          entrega: pedido.fulfillment,
          totalCentavos: Number(pedido.totalCents),
          criadoEm: pedido.placedAt.toISOString(),
          observacao: pedido.customerNote,
          motivoCancelamento: pedido.cancelReason,
          contato: pedido.contato
            ? {
                nome: pedido.contato.name,
                telefone: pedido.contato.phoneE164,
                endereco: {
                  logradouro: pedido.contato.street,
                  numero: pedido.contato.number,
                  complemento: pedido.contato.complement,
                  bairro: pedido.contato.neighborhood,
                  cidade: pedido.contato.city,
                  uf: pedido.contato.uf,
                  cep: pedido.contato.zip,
                },
              }
            : null,
          itens: pedido.itens.map((item) => ({
            id: item.id,
            nome: item.productName,
            variacao: item.variantName,
            quantidade: item.quantity,
            totalCentavos: Number(item.lineTotalCents),
            observacao: item.note,
            opcoes: item.opcoes.map((opcao) => ({
              grupo: opcao.groupNameSnapshot,
              nome: opcao.optionNameSnapshot,
              quantidade: opcao.quantity,
            })),
          })),
          historico: pedido.historico.map((entrada) => ({
            id: entrada.id,
            de: entrada.fromStatus,
            para: entrada.toStatus,
            papel: entrada.actorRole,
            motivo: entrada.reason,
            ocorridoEm: entrada.occurredAt.toISOString(),
          })),
          proximosStatus: proximosStatus(pedido.status, pedido.fulfillment),
        },
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.patch(
    "/:apelido/pedidos/:id/status",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaMudancaDeStatus.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () =>
            acesso.emTransacao(() =>
              opcoes.resolverLoja({ apelido: requisicao.params.apelido }),
            ),
        );
        if (!identificacao.encontrada) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        const resultado = await executarComoRequisicao(
          {
            lojaId: identificacao.id,
            usuarioId: resposta.locals.usuario.identidadeId,
            papel: resposta.locals.usuario.papel,
          },
          () =>
            acesso.emTransacao(() =>
              mudarStatusDoPedido(
                requisicao.params.id,
                entrada.data.status,
                entrada.data.motivo,
              ),
            ),
        );
        resposta.json(resultado);
      } catch (causa) {
        if (causa instanceof PedidoNaoEncontrado) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        if (causa instanceof ErroDeTransicaoDoPedido) {
          resposta.status(409).json({
            erro: "transicao_invalida",
            explicacao: causa.explicacao,
          });
          return;
        }
        proximo(causa);
      }
    },
  );

  return rotas;
}

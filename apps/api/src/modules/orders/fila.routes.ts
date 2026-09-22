import { Router, type Request, type Response } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
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
    aguardandoConfirmacaoWhatsapp: pedido.whatsappConfirmedAt === null,
  };
}

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

  return rotas;
}

/**
 * Saldo e ajustes manuais de estoque por variação (T-307).
 *
 * A baixa concorrente ligada a pedidos fica em T-308. Aqui o dono ajusta a
 * contagem física; cada mudança preserva saldo anterior, delta, motivo, origem
 * e autor no histórico imutável.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import {
  banco,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import type {
  ChegadaNaLoja,
  IdentificacaoDaLoja,
  UsuarioAutenticado,
} from "./categorias.routes.ts";

const esquemaDoAjuste = z.strictObject({
  quantidadeAlvo: z.number().int().min(0).max(2_147_483_647),
  motivo: z.string().trim().min(1).max(500),
});

const selecaoDoMovimento = {
  id: true,
  quantityBefore: true,
  quantityDelta: true,
  quantityAfter: true,
  reason: true,
  origin: true,
  actorId: true,
  createdAt: true,
} as const;

const selecaoDaVariacao = {
  id: true,
  name: true,
  sku: true,
  stockQuantity: true,
  stockReserved: true,
  stockMinAlert: true,
  isAvailable: true,
  isDefault: true,
  movimentosDeEstoque: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: selecaoDoMovimento,
  },
} as const;

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function identidadeUuidOuNula(identidadeId: string): string | null {
  return z.string().uuid().safeParse(identidadeId).success
    ? identidadeId
    : null;
}

function respostaDoMovimento(movimento: {
  readonly id: string;
  readonly quantityBefore: number;
  readonly quantityDelta: number;
  readonly quantityAfter: number;
  readonly reason: string;
  readonly origin: string;
  readonly actorId: string | null;
  readonly createdAt: Date;
}) {
  return {
    id: movimento.id,
    quantidadeAntes: movimento.quantityBefore,
    delta: movimento.quantityDelta,
    quantidadeDepois: movimento.quantityAfter,
    motivo: movimento.reason,
    origem: movimento.origin,
    autorId: movimento.actorId,
    criadoEm: movimento.createdAt.toISOString(),
  };
}

function respostaDaVariacao(variacao: {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly stockQuantity: number | null;
  readonly stockReserved: number | null;
  readonly stockMinAlert: number | null;
  readonly isAvailable: boolean;
  readonly isDefault: boolean;
  readonly movimentosDeEstoque: ReadonlyArray<{
    readonly id: string;
    readonly quantityBefore: number;
    readonly quantityDelta: number;
    readonly quantityAfter: number;
    readonly reason: string;
    readonly origin: string;
    readonly actorId: string | null;
    readonly createdAt: Date;
  }>;
}) {
  const estoqueBaixo =
    variacao.stockQuantity !== null &&
    variacao.stockMinAlert !== null &&
    variacao.stockQuantity <= variacao.stockMinAlert;
  return {
    id: variacao.id,
    nome: variacao.name,
    sku: variacao.sku,
    quantidade: variacao.stockQuantity,
    reservado: variacao.stockReserved,
    minimoAlerta: variacao.stockMinAlert,
    disponivel:
      variacao.isAvailable &&
      (variacao.stockQuantity === null || variacao.stockQuantity > 0),
    padrao: variacao.isDefault,
    estoqueBaixo,
    movimentos: variacao.movimentosDeEstoque.map(respostaDoMovimento),
  };
}

export interface OpcoesDoEstoque {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDoEstoque(opcoes: OpcoesDoEstoque): Router {
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

  async function comLoja(
    apelido: string,
    resposta: Response,
    executar: (lojaId: string, usuario: UsuarioAutenticado) => Promise<void>,
  ): Promise<void> {
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso.emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return;
    }
    await executar(
      identificacao.id,
      resposta.locals.usuario as UsuarioAutenticado,
    );
  }

  async function produtoDaLoja(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ) {
    return tx.product.findFirst({
      where: { id: produtoId, storeId: lojaId, deletedAt: null },
      select: { id: true },
    });
  }

  rotas.get(
    "/:apelido/catalogo/produtos/:produtoId/estoque",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const variacoes = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  return tx.productVariant.findMany({
                    where: {
                      storeId: lojaId,
                      productId: produto.id,
                      deletedAt: null,
                    },
                    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
                    select: selecaoDaVariacao,
                  });
                }),
            );
            if (variacoes === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json({
              variacoes: variacoes.map(respostaDaVariacao),
            });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/variacoes/:variacaoId/estoque",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDoAjuste.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const resultado = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const variacao = await tx.productVariant.findFirst({
                    where: {
                      id: requisicao.params.variacaoId,
                      storeId: lojaId,
                      productId: produto.id,
                      deletedAt: null,
                    },
                    select: { id: true, stockQuantity: true },
                  });
                  if (variacao === null) return null;
                  if (variacao.stockQuantity === null)
                    throw new Error("estoque_nao_controlado");
                  if (variacao.stockQuantity === entrada.data.quantidadeAlvo)
                    throw new Error("sem_alteracao");
                  const delta =
                    entrada.data.quantidadeAlvo - variacao.stockQuantity;
                  await tx.productVariant.update({
                    where: { id: variacao.id },
                    data: {
                      stockQuantity: entrada.data.quantidadeAlvo,
                      updatedAt: new Date(),
                    },
                  });
                  const movimento = await tx.stockMovement.create({
                    data: {
                      storeId: lojaId,
                      variantId: variacao.id,
                      quantityBefore: variacao.stockQuantity,
                      quantityDelta: delta,
                      quantityAfter: entrada.data.quantidadeAlvo,
                      reason: entrada.data.motivo,
                      origin: "MANUAL",
                      actorId: identidadeUuidOuNula(usuario.identidadeId),
                    },
                    select: selecaoDoMovimento,
                  });
                  return movimento;
                }),
            );
            if (resultado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json({
              movimento: respostaDoMovimento(resultado),
            });
          },
        );
      } catch (causa) {
        if (causa instanceof Error) {
          if (
            causa.message === "estoque_nao_controlado" ||
            causa.message === "sem_alteracao"
          ) {
            erro(resposta, 400, causa.message);
            return;
          }
        }
        proximo(causa);
      }
    },
  );

  return rotas;
}

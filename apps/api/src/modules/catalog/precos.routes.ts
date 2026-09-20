/**
 * Preços nomeados do produto (T-304).
 *
 * O valor nasce como inteiro em centavos e a escolha do preço vigente usa a
 * mesma regra pura do carrinho e da vitrine. Os campos antigos do produto são
 * mantidos como projeção de compatibilidade enquanto esta entidade passa a
 * ser a fonte administrativa.
 */
import { precoQueVale, type PrecoCadastrado } from "@simpleclick/core";
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

const tiposDePreco = z.enum(["BASE", "PROMO", "WHOLESALE", "CLUB"]);
const instante = z.string().datetime({ offset: true }).nullable();

const esquemaDaCriacao = z
  .strictObject({
    tipo: tiposDePreco,
    rotulo: z.string().trim().max(100).nullable(),
    valorCentavos: z.number().int().nonnegative().max(999_999_999),
    quantidadeMinima: z.number().int().min(1).max(1_000_000),
    inicio: instante,
    fim: instante,
    ativo: z.boolean(),
  })
  .refine(
    (valor) =>
      valor.fim === null || valor.inicio === null || valor.fim > valor.inicio,
    {
      message: "A data final precisa ser posterior à inicial.",
    },
  )
  .refine((valor) => valor.tipo !== "WHOLESALE" || valor.quantidadeMinima > 1, {
    message: "Preço de atacado precisa começar acima de uma unidade.",
  });

const esquemaDaAtualizacao = z
  .strictObject({
    rotulo: z.string().trim().max(100).nullable().optional(),
    valorCentavos: z.number().int().nonnegative().max(999_999_999).optional(),
    quantidadeMinima: z.number().int().min(1).max(1_000_000).optional(),
    inicio: instante.optional(),
    fim: instante.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

const selecaoDoPreco = {
  id: true,
  kind: true,
  label: true,
  amountCents: true,
  minQuantity: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
} as const;

type LinhaDePreco = {
  readonly id: string;
  readonly kind: string;
  readonly label: string | null;
  readonly amountCents: bigint;
  readonly minQuantity: number;
  readonly currency: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly isActive: boolean;
};

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function comoRegra(preco: LinhaDePreco): PrecoCadastrado {
  return {
    tipo: preco.kind,
    valorEmCentavos: Number(preco.amountCents),
    quantidadeMinima: preco.minQuantity,
    ativo: preco.isActive,
    comecaEm: preco.startsAt,
    terminaEm: preco.endsAt,
  };
}

function respostaDoPreco(preco: LinhaDePreco) {
  return {
    id: preco.id,
    tipo: preco.kind,
    rotulo: preco.label,
    valorCentavos: Number(preco.amountCents),
    quantidadeMinima: preco.minQuantity,
    moeda: preco.currency,
    inicio: preco.startsAt?.toISOString() ?? null,
    fim: preco.endsAt?.toISOString() ?? null,
    ativo: preco.isActive,
  };
}

export interface OpcoesDosPrecos {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

async function sincronizarProjecaoDoProduto(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<void> {
  const precos = await tx.productPrice.findMany({
    where: { storeId: lojaId, productId: produtoId, variantId: null },
    select: selecaoDoPreco,
  });
  const vigente = precoQueVale(precos.map(comoRegra), new Date());
  await tx.product.updateMany({
    where: { id: produtoId, storeId: lojaId, deletedAt: null },
    data: {
      displayPriceCents: vigente.atualEmCentavos,
      priceMinCents: vigente.atualEmCentavos,
      priceMaxCents: vigente.atualEmCentavos,
      compareAtCents: vigente.anteriorEmCentavos,
      updatedAt: new Date(),
    },
  });
}

export function criarRotasDosPrecos(opcoes: OpcoesDosPrecos): Router {
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
      select: { id: true, displayPriceCents: true },
    });
  }

  rotas.get(
    "/:apelido/catalogo/produtos/:produtoId/precos",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const precos = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  return tx.productPrice.findMany({
                    where: {
                      storeId: lojaId,
                      productId: produto.id,
                      variantId: null,
                    },
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                    select: selecaoDoPreco,
                  });
                }),
            );
            if (precos === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json({ precos: precos.map(respostaDoPreco) });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/precos",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaCriacao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const criado = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const existente = await tx.productPrice.findFirst({
                    where: {
                      storeId: lojaId,
                      productId: produto.id,
                      variantId: null,
                    },
                    orderBy: { createdAt: "asc" },
                    select: { id: true, kind: true },
                  });
                  if (
                    entrada.data.tipo !== "BASE" &&
                    existente === null &&
                    produto.displayPriceCents !== null
                  ) {
                    await tx.productPrice.create({
                      data: {
                        storeId: lojaId,
                        productId: produto.id,
                        kind: "BASE",
                        label: "Preço base",
                        amountCents: produto.displayPriceCents,
                      },
                    });
                  }
                  const ordem = await tx.productPrice.count({
                    where: {
                      storeId: lojaId,
                      productId: produto.id,
                      variantId: null,
                    },
                  });
                  const preco = await tx.productPrice.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      kind: entrada.data.tipo,
                      label: entrada.data.rotulo,
                      amountCents: entrada.data.valorCentavos,
                      minQuantity: entrada.data.quantidadeMinima,
                      startsAt:
                        entrada.data.inicio === null
                          ? null
                          : new Date(entrada.data.inicio),
                      endsAt:
                        entrada.data.fim === null
                          ? null
                          : new Date(entrada.data.fim),
                      isActive: entrada.data.ativo,
                      sortOrder: ordem,
                    },
                    select: selecaoDoPreco,
                  });
                  await sincronizarProjecaoDoProduto(tx, lojaId, produto.id);
                  return preco;
                }),
            );
            if (criado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json(respostaDoPreco(criado));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.patch(
    "/:apelido/catalogo/produtos/:produtoId/precos/:precoId",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaAtualizacao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const atualizado = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const atual = await tx.productPrice.findFirst({
                    where: {
                      id: requisicao.params.precoId,
                      storeId: lojaId,
                      productId: produto.id,
                      variantId: null,
                    },
                    select: { id: true },
                  });
                  if (atual === null) return null;
                  const preco = await tx.productPrice.update({
                    where: { id: atual.id },
                    data: {
                      ...(entrada.data.rotulo === undefined
                        ? {}
                        : { label: entrada.data.rotulo }),
                      ...(entrada.data.valorCentavos === undefined
                        ? {}
                        : { amountCents: entrada.data.valorCentavos }),
                      ...(entrada.data.quantidadeMinima === undefined
                        ? {}
                        : { minQuantity: entrada.data.quantidadeMinima }),
                      ...(entrada.data.inicio === undefined
                        ? {}
                        : {
                            startsAt:
                              entrada.data.inicio === null
                                ? null
                                : new Date(entrada.data.inicio),
                          }),
                      ...(entrada.data.fim === undefined
                        ? {}
                        : {
                            endsAt:
                              entrada.data.fim === null
                                ? null
                                : new Date(entrada.data.fim),
                          }),
                      ...(entrada.data.ativo === undefined
                        ? {}
                        : { isActive: entrada.data.ativo }),
                      updatedAt: new Date(),
                    },
                    select: selecaoDoPreco,
                  });
                  await sincronizarProjecaoDoProduto(tx, lojaId, produto.id);
                  return preco;
                }),
            );
            if (atualizado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(respostaDoPreco(atualizado));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/catalogo/produtos/:produtoId/precos/:precoId",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const removido = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return 0;
                  const resultado = await tx.productPrice.deleteMany({
                    where: {
                      id: requisicao.params.precoId,
                      storeId: lojaId,
                      productId: produto.id,
                      variantId: null,
                    },
                  });
                  if (resultado.count > 0)
                    await sincronizarProjecaoDoProduto(tx, lojaId, produto.id);
                  return resultado.count;
                }),
            );
            if (removido === 0) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(204).end();
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

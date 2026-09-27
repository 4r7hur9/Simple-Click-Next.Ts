/**
 * Grade de variações do produto (T-306).
 *
 * Uma variante é a unidade vendida: ela pode ter SKU, estoque e preço
 * próprios. A combinação só aceita opções de grupos ligados ao produto e
 * marcados como eixo de variação; ingredientes e adicionais ficam fora da
 * grade e continuam sendo escolhas do item.
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

const combinacao = z.strictObject({
  grupoId: z.string().uuid(),
  opcaoId: z.string().uuid(),
});

const camposDaVariacao = z.strictObject({
  nome: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(100).nullable(),
  codigoDeBarras: z.string().trim().max(100).nullable(),
  precoCentavos: z.number().int().nonnegative().max(999_999_999).nullable(),
  estoque: z.number().int().nonnegative().nullable(),
  estoqueMinimo: z.number().int().nonnegative().nullable(),
  pesoGramas: z.number().int().positive().nullable(),
  padrao: z.boolean(),
  disponivel: z.boolean(),
  combinacoes: z.array(combinacao).max(20),
});

const criacaoDaVariacao = camposDaVariacao;
const atualizacaoDaVariacao = camposDaVariacao
  .partial()
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

const selecaoDoPreco = {
  kind: true,
  amountCents: true,
  minQuantity: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
} as const;

const selecaoDaVariacao = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  stockQuantity: true,
  stockMinAlert: true,
  weightGrams: true,
  isDefault: true,
  isAvailable: true,
  sortOrder: true,
  precos: { select: selecaoDoPreco },
  valoresDeEixo: {
    select: { groupId: true, optionItemId: true },
  },
} as const;

type LinhaDePreco = {
  readonly kind: string;
  readonly amountCents: bigint;
  readonly minQuantity: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
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

function respostaDaVariacao(variacao: {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly stockQuantity: number | null;
  readonly stockMinAlert: number | null;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
  readonly precos: ReadonlyArray<LinhaDePreco>;
  readonly valoresDeEixo: ReadonlyArray<{
    readonly groupId: string;
    readonly optionItemId: string;
  }>;
}) {
  const preco = precoQueVale(variacao.precos.map(comoRegra), new Date());
  return {
    id: variacao.id,
    nome: variacao.name,
    sku: variacao.sku,
    codigoDeBarras: variacao.barcode,
    precoCentavos: preco.atualEmCentavos,
    precoAnteriorCentavos: preco.anteriorEmCentavos,
    estoque: variacao.stockQuantity,
    estoqueMinimo: variacao.stockMinAlert,
    pesoGramas: variacao.weightGrams,
    padrao: variacao.isDefault,
    disponivel: variacao.isAvailable,
    ordem: variacao.sortOrder,
    combinacoes: variacao.valoresDeEixo.map((valor) => ({
      grupoId: valor.groupId,
      opcaoId: valor.optionItemId,
    })),
  };
}

export interface OpcoesDasVariacoes {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDasVariacoes(opcoes: OpcoesDasVariacoes): Router {
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

  async function lerVariacoes(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ) {
    return tx.productVariant.findMany({
      where: { storeId: lojaId, productId: produtoId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: selecaoDaVariacao,
    });
  }

  async function validarCombinacoes(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
    combinacoes: ReadonlyArray<z.infer<typeof combinacao>>,
  ): Promise<void> {
    const grupos = await tx.productOptionGroup.findMany({
      where: { storeId: lojaId, productId: produtoId },
      select: {
        groupId: true,
        grupo: { select: { isVariantAxis: true, deletedAt: true } },
      },
    });
    const gruposPorId = new Map(grupos.map((item) => [item.groupId, item]));
    const gruposUsados = new Set<string>();
    for (const item of combinacoes) {
      if (gruposUsados.has(item.grupoId)) {
        throw new Error("combinacao_grupo_repetido");
      }
      gruposUsados.add(item.grupoId);
      const grupo = gruposPorId.get(item.grupoId);
      if (grupo === undefined || !grupo.grupo.isVariantAxis) {
        throw new Error("eixo_invalido");
      }
    }
    const opcoes = await tx.optionItem.findMany({
      where: {
        storeId: lojaId,
        id: { in: combinacoes.map((item) => item.opcaoId) },
        deletedAt: null,
      },
      select: { id: true, groupId: true },
    });
    const opcoesPorId = new Map(opcoes.map((item) => [item.id, item]));
    for (const item of combinacoes) {
      const opcao = opcoesPorId.get(item.opcaoId);
      if (opcao === undefined || opcao.groupId !== item.grupoId) {
        throw new Error("opcao_fora_do_eixo");
      }
    }
  }

  async function garantirSkuLivre(
    tx: TransacaoDoBanco,
    lojaId: string,
    sku: string | null,
    variacaoId?: string,
  ): Promise<void> {
    if (sku === null) return;
    const existente = await tx.productVariant.findFirst({
      where: {
        storeId: lojaId,
        sku,
        deletedAt: null,
        ...(variacaoId === undefined ? {} : { id: { not: variacaoId } }),
      },
      select: { id: true },
    });
    if (existente !== null) throw new Error("sku_duplicado");
  }

  async function sincronizarProduto(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ): Promise<void> {
    const quantidade = await tx.productVariant.count({
      where: { storeId: lojaId, productId: produtoId, deletedAt: null },
    });
    await tx.product.updateMany({
      where: { id: produtoId, storeId: lojaId, deletedAt: null },
      data: { hasVariants: quantidade > 0, updatedAt: new Date() },
    });
  }

  async function gravarPrecoBase(
    contexto: Readonly<{
      tx: TransacaoDoBanco;
      lojaId: string;
      produtoId: string;
      variacaoId: string;
      precoCentavos: number | null;
    }>,
  ): Promise<void> {
    const { tx, lojaId, produtoId, variacaoId, precoCentavos } = contexto;
    const base = await tx.productPrice.findFirst({
      where: {
        storeId: lojaId,
        productId: produtoId,
        variantId: variacaoId,
        kind: "BASE",
      },
      select: { id: true },
    });
    if (precoCentavos === null) {
      if (base !== null)
        await tx.productPrice.delete({ where: { id: base.id } });
      return;
    }
    if (base === null) {
      await tx.productPrice.create({
        data: {
          storeId: lojaId,
          productId: produtoId,
          variantId: variacaoId,
          kind: "BASE",
          label: "Preço base",
          amountCents: precoCentavos,
        },
      });
    } else {
      await tx.productPrice.update({
        where: { id: base.id },
        data: { amountCents: precoCentavos, updatedAt: new Date() },
      });
    }
  }

  rotas.get(
    "/:apelido/catalogo/produtos/:produtoId/variacoes",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const lido = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const loja = await tx.store.findFirst({
                    where: { id: lojaId },
                    select: { ramo: { select: { tracksStock: true } } },
                  });
                  return {
                    variacoes: await lerVariacoes(tx, lojaId, produto.id),
                    controlaEstoque: loja?.ramo.tracksStock ?? false,
                  };
                }),
            );
            if (lido === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            // O RAMO decide se a grade pede quantidade (AC-337, ASM-310): roupa
            // e autopeça contam unidades; a lanchonete trabalha com disponível
            // ou esgotado, e o campo de quantidade só atrapalharia o cadastro.
            resposta.json({
              variacoes: lido.variacoes.map(respostaDaVariacao),
              controlaEstoque: lido.controlaEstoque,
            });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/variacoes",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = criacaoDaVariacao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const criada = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  await garantirSkuLivre(tx, lojaId, entrada.data.sku);
                  await validarCombinacoes(
                    tx,
                    lojaId,
                    produto.id,
                    entrada.data.combinacoes,
                  );
                  const ultima = await tx.productVariant.findFirst({
                    where: { storeId: lojaId, productId: produto.id },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  if (entrada.data.padrao) {
                    await tx.productVariant.updateMany({
                      where: {
                        storeId: lojaId,
                        productId: produto.id,
                        deletedAt: null,
                      },
                      data: { isDefault: false, updatedAt: new Date() },
                    });
                  }
                  const variacao = await tx.productVariant.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      name: entrada.data.nome,
                      sku: entrada.data.sku,
                      barcode: entrada.data.codigoDeBarras,
                      stockQuantity: entrada.data.estoque,
                      stockReserved: entrada.data.estoque === null ? null : 0,
                      stockMinAlert: entrada.data.estoqueMinimo,
                      weightGrams: entrada.data.pesoGramas,
                      isDefault: entrada.data.padrao,
                      isAvailable: entrada.data.disponivel,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                    },
                    select: { id: true },
                  });
                  if (entrada.data.combinacoes.length > 0) {
                    await tx.variantOptionValue.createMany({
                      data: entrada.data.combinacoes.map((item) => ({
                        storeId: lojaId,
                        variantId: variacao.id,
                        groupId: item.grupoId,
                        optionItemId: item.opcaoId,
                      })),
                    });
                  }
                  await gravarPrecoBase({
                    tx,
                    lojaId,
                    produtoId: produto.id,
                    variacaoId: variacao.id,
                    precoCentavos: entrada.data.precoCentavos,
                  });
                  await sincronizarProduto(tx, lojaId, produto.id);
                  const linhas = await lerVariacoes(tx, lojaId, produto.id);
                  return linhas.find((item) => item.id === variacao.id) ?? null;
                }),
            );
            if (criada === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json(respostaDaVariacao(criada));
          },
        );
      } catch (causa) {
        if (causa instanceof Error) {
          if (causa.message === "sku_duplicado") {
            erro(resposta, 409, "sku_duplicado");
            return;
          }
          if (
            causa.message === "eixo_invalido" ||
            causa.message === "opcao_fora_do_eixo" ||
            causa.message === "combinacao_grupo_repetido"
          ) {
            erro(resposta, 400, causa.message);
            return;
          }
        }
        proximo(causa);
      }
    },
  );

  async function alterarVariacao(
    requisicao: Request,
    resposta: Response,
    proximo: (causa?: unknown) => void,
    excluir: boolean,
  ): Promise<void> {
    try {
      const apelido = String(requisicao.params.apelido);
      const produtoId = String(requisicao.params.produtoId);
      const variacaoId = String(requisicao.params.variacaoId);
      const entrada = excluir
        ? null
        : atualizacaoDaVariacao.safeParse(requisicao.body);
      if (entrada !== null && !entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      await comLoja(apelido, resposta, async (lojaId, usuario) => {
        const resultado = await executarComoRequisicao(
          { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
          () =>
            acesso.emTransacao(async (tx) => {
              const produto = await produtoDaLoja(tx, lojaId, produtoId);
              if (produto === null) return null;
              const atual = await tx.productVariant.findFirst({
                where: {
                  id: variacaoId,
                  storeId: lojaId,
                  productId: produto.id,
                  deletedAt: null,
                },
                select: {
                  id: true,
                  isDefault: true,
                  valoresDeEixo: {
                    select: { groupId: true, optionItemId: true },
                  },
                },
              });
              if (atual === null) return null;
              if (excluir) {
                await tx.productVariant.update({
                  where: { id: atual.id },
                  data: {
                    deletedAt: new Date(),
                    isAvailable: false,
                    isDefault: false,
                    updatedAt: new Date(),
                  },
                });
                if (atual.isDefault) {
                  const proxima = await tx.productVariant.findFirst({
                    where: {
                      storeId: lojaId,
                      productId: produto.id,
                      deletedAt: null,
                      id: { not: atual.id },
                    },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true },
                  });
                  if (proxima !== null) {
                    await tx.productVariant.update({
                      where: { id: proxima.id },
                      data: { isDefault: true, updatedAt: new Date() },
                    });
                  }
                }
                await sincronizarProduto(tx, lojaId, produto.id);
                return { apagada: true as const };
              }
              if (!entrada || !entrada.success) return null;
              await garantirSkuLivre(
                tx,
                lojaId,
                entrada.data.sku ?? null,
                atual.id,
              );
              const combinacoes =
                entrada.data.combinacoes ??
                atual.valoresDeEixo.map((item) => ({
                  grupoId: item.groupId,
                  opcaoId: item.optionItemId,
                }));
              await validarCombinacoes(tx, lojaId, produto.id, combinacoes);
              if (entrada.data.padrao === true) {
                await tx.productVariant.updateMany({
                  where: {
                    storeId: lojaId,
                    productId: produto.id,
                    deletedAt: null,
                    id: { not: atual.id },
                  },
                  data: { isDefault: false, updatedAt: new Date() },
                });
              }
              await tx.productVariant.update({
                where: { id: atual.id },
                data: {
                  ...(entrada.data.nome === undefined
                    ? {}
                    : { name: entrada.data.nome }),
                  ...(entrada.data.sku === undefined
                    ? {}
                    : { sku: entrada.data.sku }),
                  ...(entrada.data.codigoDeBarras === undefined
                    ? {}
                    : { barcode: entrada.data.codigoDeBarras }),
                  ...(entrada.data.estoque === undefined
                    ? {}
                    : {
                        stockQuantity: entrada.data.estoque,
                        stockReserved: entrada.data.estoque === null ? null : 0,
                      }),
                  ...(entrada.data.estoqueMinimo === undefined
                    ? {}
                    : { stockMinAlert: entrada.data.estoqueMinimo }),
                  ...(entrada.data.pesoGramas === undefined
                    ? {}
                    : { weightGrams: entrada.data.pesoGramas }),
                  ...(entrada.data.padrao === undefined
                    ? {}
                    : { isDefault: entrada.data.padrao }),
                  ...(entrada.data.disponivel === undefined
                    ? {}
                    : { isAvailable: entrada.data.disponivel }),
                  updatedAt: new Date(),
                },
              });
              if (entrada.data.combinacoes !== undefined) {
                await tx.variantOptionValue.deleteMany({
                  where: { storeId: lojaId, variantId: atual.id },
                });
                if (entrada.data.combinacoes.length > 0) {
                  await tx.variantOptionValue.createMany({
                    data: entrada.data.combinacoes.map((item) => ({
                      storeId: lojaId,
                      variantId: atual.id,
                      groupId: item.grupoId,
                      optionItemId: item.opcaoId,
                    })),
                  });
                }
              }
              if (entrada.data.precoCentavos !== undefined) {
                await gravarPrecoBase({
                  tx,
                  lojaId,
                  produtoId: produto.id,
                  variacaoId: atual.id,
                  precoCentavos: entrada.data.precoCentavos,
                });
              }
              await sincronizarProduto(tx, lojaId, produto.id);
              const linhas = await lerVariacoes(tx, lojaId, produto.id);
              return linhas.find((item) => item.id === atual.id) ?? null;
            }),
        );
        if (resultado === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        if (excluir) {
          resposta.status(204).end();
          return;
        }
        if ("apagada" in resultado) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.json(respostaDaVariacao(resultado));
      });
    } catch (causa) {
      if (causa instanceof Error) {
        if (causa.message === "sku_duplicado") {
          erro(resposta, 409, "sku_duplicado");
          return;
        }
        if (
          causa.message === "eixo_invalido" ||
          causa.message === "opcao_fora_do_eixo" ||
          causa.message === "combinacao_grupo_repetido"
        ) {
          erro(resposta, 400, causa.message);
          return;
        }
      }
      proximo(causa);
    }
  }

  rotas.patch(
    "/:apelido/catalogo/produtos/:produtoId/variacoes/:variacaoId",
    (requisicao, resposta, proximo) =>
      alterarVariacao(requisicao, resposta, proximo, false),
  );
  rotas.delete(
    "/:apelido/catalogo/produtos/:produtoId/variacoes/:variacaoId",
    (requisicao, resposta, proximo) =>
      alterarVariacao(requisicao, resposta, proximo, true),
  );

  return rotas;
}

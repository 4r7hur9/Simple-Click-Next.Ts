/**
 * Gestão da fatia básica de produtos (T-302).
 *
 * Imagens, preços por vigência, opções e estoque têm regras próprias e ficam
 * nas próximas tarefas. Aqui o dono consegue montar um produto simples,
 * deixá-lo em rascunho e publicá-lo quando estiver pronto.
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

const statusDoProduto = z.enum(["DRAFT", "PUBLISHED"]);

const esquemaDaCriacao = z.strictObject({
  nome: z.string().trim().min(1).max(160),
  descricao: z.string().trim().max(2_000).nullable(),
  categoriaId: z.string().uuid(),
  precoCentavos: z.number().int().nonnegative().max(999_999_999),
  status: statusDoProduto,
  disponivel: z.boolean(),
});

const esquemaDaAtualizacao = z
  .strictObject({
    nome: z.string().trim().min(1).max(160).optional(),
    descricao: z.string().trim().max(2_000).nullable().optional(),
    categoriaId: z.string().uuid().optional(),
    precoCentavos: z.number().int().nonnegative().max(999_999_999).optional(),
    status: statusDoProduto.optional(),
    disponivel: z.boolean().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

type LinhaDoProduto = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly displayPriceCents: bigint | null;
  readonly status: string;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
  readonly categorias: ReadonlyArray<{
    readonly categoryId: string;
    readonly categoria: { readonly name: string };
  }>;
};

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function slugDoProduto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function criadorDaSessao(identidadeId: string): string | undefined {
  return z.string().uuid().safeParse(identidadeId).success
    ? identidadeId
    : undefined;
}

function respostaDoProduto(produto: LinhaDoProduto) {
  const categoria = produto.categorias[0];
  return {
    id: produto.id,
    nome: produto.name,
    apelido: produto.slug,
    descricao: produto.description,
    categoriaId: categoria?.categoryId ?? null,
    categoriaNome: categoria?.categoria.name ?? null,
    precoCentavos:
      produto.displayPriceCents === null
        ? null
        : Number(produto.displayPriceCents),
    status: produto.status,
    disponivel: produto.isAvailable,
    ordem: produto.sortOrder,
  };
}

const selecaoDoProduto = {
  id: true,
  name: true,
  slug: true,
  description: true,
  displayPriceCents: true,
  status: true,
  isAvailable: true,
  sortOrder: true,
  categorias: {
    where: { isPrimary: true },
    select: { categoryId: true, categoria: { select: { name: true } } },
  },
} as const;

export interface OpcoesDosProdutos {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDosProdutos(opcoes: OpcoesDosProdutos): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();
  const { autenticar, resolverLoja } = opcoes;

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = autenticar(requisicao);
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
      () => acesso.emTransacao(() => resolverLoja({ apelido })),
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

  async function categoriaDaLoja(
    tx: TransacaoDoBanco,
    lojaId: string,
    categoriaId: string,
  ) {
    return tx.category.findFirst({
      where: { id: categoriaId, storeId: lojaId, deletedAt: null },
      select: { id: true },
    });
  }

  async function slugUnico(
    tx: TransacaoDoBanco,
    lojaId: string,
    nome: string,
    produtoId?: string,
  ): Promise<string> {
    const base = slugDoProduto(nome);
    if (base === "") throw new Error("nome_sem_apelido");
    let slug = base;
    let sufixo = 2;
    while (
      (await tx.product.count({
        where: {
          storeId: lojaId,
          slug,
          deletedAt: null,
          ...(produtoId === undefined ? {} : { id: { not: produtoId } }),
        },
      })) > 0
    ) {
      slug = `${base}-${sufixo}`;
      sufixo += 1;
    }
    return slug;
  }

  rotas.get(
    "/:apelido/catalogo/produtos",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const produtos = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao((tx) =>
                  tx.product.findMany({
                    where: { storeId: lojaId, deletedAt: null },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: selecaoDoProduto,
                  }),
                ),
            );
            resposta.json({ produtos: produtos.map(respostaDoProduto) });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos",
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
                  const categoria = await categoriaDaLoja(
                    tx,
                    lojaId,
                    entrada.data.categoriaId,
                  );
                  if (categoria === null) throw new Error("categoria_invalida");
                  const loja = await tx.store.findUnique({
                    where: { id: lojaId },
                    select: { verticalCode: true },
                  });
                  if (loja === null) throw new Error("nao_encontrado");
                  const ultima = await tx.product.findFirst({
                    where: { storeId: lojaId, deletedAt: null },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  const slug = await slugUnico(tx, lojaId, entrada.data.nome);
                  const produto = await tx.product.create({
                    data: {
                      storeId: lojaId,
                      name: entrada.data.nome,
                      slug,
                      description: entrada.data.descricao,
                      verticalCode: loja.verticalCode,
                      status: entrada.data.status,
                      isAvailable: entrada.data.disponivel,
                      displayPriceCents: entrada.data.precoCentavos,
                      priceMinCents: entrada.data.precoCentavos,
                      priceMaxCents: entrada.data.precoCentavos,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                      createdBy: criadorDaSessao(usuario.identidadeId) ?? null,
                    },
                    select: { id: true },
                  });
                  await tx.productCategory.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      categoryId: categoria.id,
                      isPrimary: true,
                    },
                  });
                  await tx.productPrice.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      kind: "BASE",
                      label: "Preço base",
                      amountCents: entrada.data.precoCentavos,
                    },
                  });
                  return tx.product.findUniqueOrThrow({
                    where: { id: produto.id },
                    select: selecaoDoProduto,
                  });
                }),
            );
            resposta.status(201).json(respostaDoProduto(criado));
          },
        );
      } catch (causa) {
        if (causa instanceof Error && causa.message === "categoria_invalida") {
          erro(resposta, 400, "categoria_invalida");
          return;
        }
        if (causa instanceof Error && causa.message === "nome_sem_apelido") {
          erro(resposta, 400, "nome_sem_apelido");
          return;
        }
        proximo(causa);
      }
    },
  );

  rotas.patch(
    "/:apelido/catalogo/produtos/:id",
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
                  const atual = await tx.product.findFirst({
                    where: {
                      id: requisicao.params.id,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    select: {
                      id: true,
                      name: true,
                      displayPriceCents: true,
                      priceMinCents: true,
                      priceMaxCents: true,
                      status: true,
                      isAvailable: true,
                    },
                  });
                  if (atual === null) return null;
                  if (entrada.data.categoriaId !== undefined) {
                    const categoria = await categoriaDaLoja(
                      tx,
                      lojaId,
                      entrada.data.categoriaId,
                    );
                    if (categoria === null)
                      throw new Error("categoria_invalida");
                    await tx.productCategory.deleteMany({
                      where: { storeId: lojaId, productId: atual.id },
                    });
                    await tx.productCategory.create({
                      data: {
                        storeId: lojaId,
                        productId: atual.id,
                        categoryId: categoria.id,
                        isPrimary: true,
                      },
                    });
                  }
                  const nome = entrada.data.nome ?? atual.name;
                  const preco =
                    entrada.data.precoCentavos ??
                    (atual.displayPriceCents === null
                      ? 0
                      : Number(atual.displayPriceCents));
                  await tx.product.update({
                    where: { id: atual.id },
                    data: {
                      ...(entrada.data.nome === undefined
                        ? {}
                        : {
                            name: nome,
                            slug: await slugUnico(tx, lojaId, nome, atual.id),
                          }),
                      ...(entrada.data.descricao === undefined
                        ? {}
                        : { description: entrada.data.descricao }),
                      ...(entrada.data.precoCentavos === undefined
                        ? {}
                        : {
                            displayPriceCents: preco,
                            priceMinCents: preco,
                            priceMaxCents: preco,
                          }),
                      ...(entrada.data.status === undefined
                        ? {}
                        : { status: entrada.data.status }),
                      ...(entrada.data.disponivel === undefined
                        ? {}
                        : { isAvailable: entrada.data.disponivel }),
                    },
                  });
                  if (entrada.data.precoCentavos !== undefined) {
                    const base = await tx.productPrice.findFirst({
                      where: {
                        storeId: lojaId,
                        productId: atual.id,
                        variantId: null,
                        kind: "BASE",
                      },
                      orderBy: { createdAt: "asc" },
                      select: { id: true },
                    });
                    if (base === null) {
                      await tx.productPrice.create({
                        data: {
                          storeId: lojaId,
                          productId: atual.id,
                          kind: "BASE",
                          label: "Preço base",
                          amountCents: entrada.data.precoCentavos,
                        },
                      });
                    } else {
                      await tx.productPrice.update({
                        where: { id: base.id },
                        data: {
                          amountCents: entrada.data.precoCentavos,
                          updatedAt: new Date(),
                        },
                      });
                    }
                  }
                  return tx.product.findUniqueOrThrow({
                    where: { id: atual.id },
                    select: selecaoDoProduto,
                  });
                }),
            );
            if (atualizado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(respostaDoProduto(atualizado));
          },
        );
      } catch (causa) {
        if (causa instanceof Error && causa.message === "categoria_invalida") {
          erro(resposta, 400, "categoria_invalida");
          return;
        }
        if (causa instanceof Error && causa.message === "nome_sem_apelido") {
          erro(resposta, 400, "nome_sem_apelido");
          return;
        }
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:id/duplicar",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const duplicado = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const original = await tx.product.findFirst({
                    where: {
                      id: requisicao.params.id,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    select: {
                      name: true,
                      description: true,
                      displayPriceCents: true,
                      verticalCode: true,
                      categorias: {
                        where: { isPrimary: true },
                        select: { categoryId: true },
                      },
                    },
                  });
                  if (original === null) return null;
                  const nome = `${original.name} (cópia)`.slice(0, 160);
                  const ultima = await tx.product.findFirst({
                    where: { storeId: lojaId, deletedAt: null },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  const produto = await tx.product.create({
                    data: {
                      storeId: lojaId,
                      name: nome,
                      slug: await slugUnico(tx, lojaId, nome),
                      description: original.description,
                      verticalCode: original.verticalCode,
                      status: "DRAFT",
                      isAvailable: false,
                      displayPriceCents: original.displayPriceCents,
                      priceMinCents: original.displayPriceCents,
                      priceMaxCents: original.displayPriceCents,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                      createdBy: criadorDaSessao(usuario.identidadeId) ?? null,
                    },
                    select: { id: true },
                  });
                  const categoria = original.categorias[0];
                  if (categoria !== undefined) {
                    await tx.productCategory.create({
                      data: {
                        storeId: lojaId,
                        productId: produto.id,
                        categoryId: categoria.categoryId,
                        isPrimary: true,
                      },
                    });
                  }
                  if (original.displayPriceCents !== null) {
                    await tx.productPrice.create({
                      data: {
                        storeId: lojaId,
                        productId: produto.id,
                        kind: "BASE",
                        label: "Preço base",
                        amountCents: original.displayPriceCents,
                      },
                    });
                  }
                  return tx.product.findUniqueOrThrow({
                    where: { id: produto.id },
                    select: selecaoDoProduto,
                  });
                }),
            );
            if (duplicado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json(respostaDoProduto(duplicado));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/catalogo/produtos/:id",
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
                  const resultado = await tx.product.updateMany({
                    where: {
                      id: requisicao.params.id,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    data: {
                      status: "DRAFT",
                      isAvailable: false,
                      deletedAt: new Date(),
                    },
                  });
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

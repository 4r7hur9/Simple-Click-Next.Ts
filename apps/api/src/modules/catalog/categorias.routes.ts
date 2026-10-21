/**
 * Gestão das categorias da loja (T-300).
 *
 * A vitrine só lê categorias visíveis. Este módulo cuida da visão do dono:
 * criar, listar, ocultar/mostrar, ordenar e apagar sem atravessar o limite da
 * loja. Apagar categoria com produtos exige destino (AC-303): a decisão mora em
 * `categorias.usecase.ts`, e a rota só executa o que ela decidiu.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { exigirLimiteDaLoja } from "../../core/limites-da-loja.ts";
import {
  banco,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import {
  decidirRemocaoDaCategoria,
  planejarMudancaDeVinculos,
} from "./categorias.usecase.ts";

const esquemaDaCategoria = z.strictObject({
  nome: z.string().trim().min(1).max(100),
  descricao: z.string().trim().max(500).nullable(),
  visivel: z.boolean(),
});

const esquemaDaAtualizacao = z
  .strictObject({
    nome: z.string().trim().min(1).max(100).optional(),
    descricao: z.string().trim().max(500).nullable().optional(),
    visivel: z.boolean().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

const esquemaDaOrdem = z.strictObject({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * O destino dos produtos de uma categoria que vai sair. Ausente é pergunta: a
 * rota responde quantos produtos precisam de destino e não apaga nada.
 */
const esquemaDaRemocao = z.strictObject({
  destino: z
    .discriminatedUnion("acao", [
      z.strictObject({
        acao: z.literal("mover"),
        categoriaId: z.string().uuid(),
      }),
      z.strictObject({ acao: z.literal("ocultar") }),
    ])
    .optional(),
});

export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

export type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

export interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

export interface OpcoesDasCategorias {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function slugDaCategoria(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function respostaDaCategoria(categoria: {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly isVisible: boolean;
  readonly sortOrder: number;
  readonly _count?: { readonly produtos: number };
}) {
  return {
    id: categoria.id,
    nome: categoria.name,
    apelido: categoria.slug,
    descricao: categoria.description,
    visivel: categoria.isVisible,
    ordem: categoria.sortOrder,
    // Quantos produtos NÃO removidos moram nela: é o que o painel usa para
    // saber, antes de apagar, se precisa perguntar o destino deles (AC-303).
    produtos: categoria._count?.produtos ?? 0,
  };
}

/** Conta só produto vivo: o removido não precisa de destino. */
const contagemDeProdutos = {
  _count: {
    select: { produtos: { where: { produto: { deletedAt: null } } } },
  },
} as const;

/** Vínculos de produto vivo numa categoria, no formato que o plano pede. */
async function vinculosDaCategoria(
  tx: TransacaoDoBanco,
  lojaId: string,
  categoriaId: string,
) {
  const linhas = await tx.productCategory.findMany({
    where: {
      storeId: lojaId,
      categoryId: categoriaId,
      produto: { deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, productId: true, isPrimary: true, sortOrder: true },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    produtoId: linha.productId,
    principal: linha.isPrimary,
    ordem: linha.sortOrder,
  }));
}

export function criarRotasDasCategorias(opcoes: OpcoesDasCategorias): Router {
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

  rotas.get(
    "/:apelido/catalogo/categorias",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const categorias = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao((tx) =>
                  tx.category.findMany({
                    where: { storeId: lojaId, deletedAt: null },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      description: true,
                      isVisible: true,
                      sortOrder: true,
                      ...contagemDeProdutos,
                    },
                  }),
                ),
            );
            resposta.json({ categorias: categorias.map(respostaDaCategoria) });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/categorias",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaCategoria.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const slugBase = slugDaCategoria(entrada.data.nome);
        if (slugBase === "") {
          erro(resposta, 400, "nome_sem_apelido");
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
                  // O limite de categorias da loja (card #25): passou, 409.
                  await exigirLimiteDaLoja("categorias");
                  const ultima = await tx.category.findFirst({
                    where: { storeId: lojaId, deletedAt: null },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  let slug = slugBase;
                  let sufixo = 2;
                  while (
                    (await tx.category.count({
                      where: { storeId: lojaId, slug, deletedAt: null },
                    })) > 0
                  ) {
                    slug = `${slugBase}-${sufixo}`;
                    sufixo += 1;
                  }
                  return tx.category.create({
                    data: {
                      storeId: lojaId,
                      name: entrada.data.nome,
                      slug,
                      description: entrada.data.descricao,
                      isVisible: entrada.data.visivel,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                    },
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      description: true,
                      isVisible: true,
                      sortOrder: true,
                    },
                  });
                }),
            );
            resposta.status(201).json(respostaDaCategoria(criada));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.put(
    "/:apelido/catalogo/categorias",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaOrdem.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const existentes = await tx.category.findMany({
                    where: {
                      storeId: lojaId,
                      deletedAt: null,
                      id: { in: entrada.data.ids },
                    },
                    select: { id: true },
                  });
                  if (existentes.length !== entrada.data.ids.length) {
                    throw new Error("categoria_fora_da_loja");
                  }
                  for (const [ordem, id] of entrada.data.ids.entries()) {
                    await tx.category.updateMany({
                      where: { id, storeId: lojaId, deletedAt: null },
                      data: { sortOrder: ordem, updatedAt: new Date() },
                    });
                  }
                }),
            );
            resposta.status(204).end();
          },
        );
      } catch (causa) {
        if (
          causa instanceof Error &&
          causa.message === "categoria_fora_da_loja"
        ) {
          erro(resposta, 400, "categoria_fora_da_loja");
          return;
        }
        proximo(causa);
      }
    },
  );

  rotas.patch(
    "/:apelido/catalogo/categorias/:id",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaAtualizacao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        if (
          entrada.data.nome !== undefined &&
          slugDaCategoria(entrada.data.nome) === ""
        ) {
          erro(resposta, 400, "nome_sem_apelido");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const atualizada = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const categoria = await tx.category.findFirst({
                    where: {
                      id: requisicao.params.id,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    select: { id: true },
                  });
                  if (categoria === null) return null;
                  let slugAtualizado: string | undefined;
                  if (entrada.data.nome !== undefined) {
                    const slugBase = slugDaCategoria(entrada.data.nome);
                    slugAtualizado = slugBase;
                    let sufixo = 2;
                    while (
                      (await tx.category.count({
                        where: {
                          storeId: lojaId,
                          slug: slugAtualizado,
                          deletedAt: null,
                          id: { not: categoria.id },
                        },
                      })) > 0
                    ) {
                      slugAtualizado = `${slugBase}-${sufixo}`;
                      sufixo += 1;
                    }
                  }
                  return tx.category.update({
                    where: { id: categoria.id },
                    data: {
                      ...(entrada.data.nome === undefined
                        ? {}
                        : {
                            name: entrada.data.nome,
                            slug: slugAtualizado!,
                          }),
                      ...(entrada.data.descricao === undefined
                        ? {}
                        : { description: entrada.data.descricao }),
                      ...(entrada.data.visivel === undefined
                        ? {}
                        : { isVisible: entrada.data.visivel }),
                      updatedAt: new Date(),
                    },
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      description: true,
                      isVisible: true,
                      sortOrder: true,
                      ...contagemDeProdutos,
                    },
                  });
                }),
            );
            if (atualizada === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(respostaDaCategoria(atualizada));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  /*
   * APAGAR NÃO DEIXA PRODUTO ÓRFÃO (AC-303).
   *
   * Sem destino, a rota não apaga: responde 409 com quantos produtos precisam
   * de um. Com destino "mover", os vínculos vão para a outra categoria e só
   * então esta sai — na mesma transação, para que nenhuma leitura veja o
   * produto sem seção. Com "ocultar", nada é apagado: a categoria fica oculta
   * com os produtos dentro, e reaparece inteira quando o dono a mostrar.
   *
   * A remoção é lógica (`deleted_at`): pedido antigo e especificação preenchida
   * continuam apontando para uma linha que existe.
   */
  rotas.delete(
    "/:apelido/catalogo/categorias/:id",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaRemocao.safeParse(requisicao.body ?? {});
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const destino = entrada.data.destino;
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const resultado = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const categoria = await tx.category.findFirst({
                    where: {
                      id: requisicao.params.id,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    select: { id: true },
                  });
                  if (categoria === null)
                    return { tipo: "nao_encontrada" } as const;

                  const daOrigem = await vinculosDaCategoria(
                    tx,
                    lojaId,
                    categoria.id,
                  );
                  const destinoExiste =
                    destino?.acao === "mover"
                      ? (await tx.category.count({
                          where: {
                            id: destino.categoriaId,
                            storeId: lojaId,
                            deletedAt: null,
                          },
                        })) === 1
                      : false;
                  const decisao = decidirRemocaoDaCategoria({
                    categoriaId: categoria.id,
                    produtos: daOrigem.length,
                    destino,
                    destinoExiste,
                  });

                  if (decisao.tipo === "exige_destino") return decisao;
                  if (decisao.tipo === "destino_invalido") return decisao;

                  if (decisao.tipo === "ocultar") {
                    await tx.category.update({
                      where: { id: categoria.id },
                      data: { isVisible: false, updatedAt: new Date() },
                    });
                    return {
                      tipo: "ocultada",
                      produtos: daOrigem.length,
                    } as const;
                  }

                  if (decisao.tipo === "mover") {
                    const doDestino = await vinculosDaCategoria(
                      tx,
                      lojaId,
                      decisao.categoriaId,
                    );
                    const plano = planejarMudancaDeVinculos(
                      daOrigem,
                      doDestino,
                    );
                    // A ordem importa: primeiro sai o vínculo repetido, depois
                    // o destino herda a principal, e só então os demais mudam
                    // de categoria — o índice único de "uma principal por
                    // produto" nunca vê duas ao mesmo tempo.
                    if (plano.descartar.length > 0) {
                      await tx.productCategory.deleteMany({
                        where: {
                          storeId: lojaId,
                          id: { in: [...plano.descartar] },
                        },
                      });
                    }
                    for (const id of plano.tornarPrincipal) {
                      await tx.productCategory.update({
                        where: { id },
                        data: { isPrimary: true, updatedAt: new Date() },
                      });
                    }
                    for (const vinculo of plano.mover) {
                      await tx.productCategory.update({
                        where: { id: vinculo.id },
                        data: {
                          categoryId: decisao.categoriaId,
                          sortOrder: vinculo.ordem,
                          updatedAt: new Date(),
                        },
                      });
                    }
                  }

                  await tx.category.update({
                    where: { id: categoria.id },
                    data: { deletedAt: new Date(), updatedAt: new Date() },
                  });
                  return {
                    tipo:
                      decisao.tipo === "mover"
                        ? ("movida" as const)
                        : ("apagada" as const),
                    produtos: daOrigem.length,
                  };
                }),
            );

            switch (resultado.tipo) {
              case "nao_encontrada":
                erro(resposta, 404, "nao_encontrado");
                return;
              case "exige_destino":
                resposta.status(409).json({
                  erro: "categoria_com_produtos",
                  produtos: resultado.produtos,
                  mensagem:
                    "Escolha mover os produtos para outra categoria ou ocultar a categoria com eles.",
                });
                return;
              case "destino_invalido":
                resposta.status(400).json({
                  erro: "destino_invalido",
                  mensagem: resultado.motivo,
                });
                return;
              default:
                resposta.json({
                  resultado: resultado.tipo,
                  produtos: resultado.produtos,
                });
            }
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

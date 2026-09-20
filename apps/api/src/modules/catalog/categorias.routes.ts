/**
 * Gestão das categorias da loja (T-300).
 *
 * A vitrine só lê categorias visíveis. Este módulo cuida da visão do dono:
 * criar, listar, ocultar/mostrar e ordenar sem atravessar o limite da loja.
 * Remoção com produtos fica reservada para a próxima fatia, quando o painel
 * também puder oferecer um destino de migração.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";

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

export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

export type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

export interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER";
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
}) {
  return {
    id: categoria.id,
    nome: categoria.name,
    apelido: categoria.slug,
    descricao: categoria.description,
    visivel: categoria.isVisible,
    ordem: categoria.sortOrder,
  };
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

  return rotas;
}

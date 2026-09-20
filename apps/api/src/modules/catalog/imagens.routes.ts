/**
 * Imagens do produto — primeira fatia operacional de T-303.
 *
 * A mídia é hospedada fora da API (decisão D2: Cloudinary). O painel grava a
 * URL pública já pronta e este módulo garante as invariantes locais: HTTPS,
 * no máximo cinco imagens, uma principal por produto e isolamento da loja.
 * O upload binário/assinatura do Cloudinary entra quando as credenciais de
 * mídia forem configuradas no ambiente.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import type {
  ChegadaNaLoja,
  IdentificacaoDaLoja,
  UsuarioAutenticado,
} from "./categorias.routes.ts";

const esquemaDaImagem = z.strictObject({
  url: z
    .string()
    .trim()
    .url()
    .max(2_048)
    .refine((valor) => {
      try {
        return new URL(valor).protocol === "https:";
      } catch {
        return false;
      }
    }, "A imagem precisa usar HTTPS."),
  altText: z.string().trim().max(160).nullable(),
  principal: z.boolean(),
});

const esquemaDaAtualizacao = z
  .strictObject({
    altText: z.string().trim().max(160).nullable().optional(),
    principal: z.boolean().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

const selecaoDaImagem = {
  id: true,
  url: true,
  altText: true,
  isPrimary: true,
  sortOrder: true,
  width: true,
  height: true,
} as const;

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function respostaDaImagem(imagem: {
  readonly id: string;
  readonly url: string | null;
  readonly altText: string | null;
  readonly isPrimary: boolean;
  readonly sortOrder: number;
  readonly width: number | null;
  readonly height: number | null;
}) {
  return {
    id: imagem.id,
    url: imagem.url,
    altText: imagem.altText,
    principal: imagem.isPrimary,
    ordem: imagem.sortOrder,
    largura: imagem.width,
    altura: imagem.height,
  };
}

export interface OpcoesDasImagens {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDasImagens(opcoes: OpcoesDasImagens): Router {
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
    tx: Parameters<Parameters<AcessoAoBanco["emTransacao"]>[0]>[0],
    lojaId: string,
    produtoId: string,
  ) {
    return tx.product.findFirst({
      where: { id: produtoId, storeId: lojaId, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  rotas.get(
    "/:apelido/catalogo/produtos/:produtoId/imagens",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const imagens = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  return tx.productImage.findMany({
                    where: { storeId: lojaId, productId: produto.id },
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                    select: selecaoDaImagem,
                  });
                }),
            );
            if (imagens === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json({ imagens: imagens.map(respostaDaImagem) });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/imagens",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaImagem.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const imagem = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null)
                    return { tipo: "nao_encontrado" } as const;
                  const quantidade = await tx.productImage.count({
                    where: { storeId: lojaId, productId: produto.id },
                  });
                  if (quantidade >= 5) return { tipo: "limite" } as const;
                  const ultima = await tx.productImage.findFirst({
                    where: { storeId: lojaId, productId: produto.id },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  if (entrada.data.principal) {
                    await tx.productImage.updateMany({
                      where: { storeId: lojaId, productId: produto.id },
                      data: { isPrimary: false, updatedAt: new Date() },
                    });
                  }
                  const criada = await tx.productImage.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      url: entrada.data.url,
                      altText: entrada.data.altText ?? produto.name,
                      isPrimary: entrada.data.principal || quantidade === 0,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                    },
                    select: selecaoDaImagem,
                  });
                  return { tipo: "criada", imagem: criada } as const;
                }),
            );
            if (imagem.tipo === "nao_encontrado") {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            if (imagem.tipo === "limite") {
              erro(resposta, 400, "limite_de_imagens");
              return;
            }
            resposta.status(201).json(respostaDaImagem(imagem.imagem));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.patch(
    "/:apelido/catalogo/produtos/:produtoId/imagens/:imagemId",
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
            const imagem = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const atual = await tx.productImage.findFirst({
                    where: {
                      id: requisicao.params.imagemId,
                      storeId: lojaId,
                      productId: produto.id,
                    },
                    select: { id: true, isPrimary: true },
                  });
                  if (atual === null) return null;
                  if (entrada.data.principal === true) {
                    await tx.productImage.updateMany({
                      where: { storeId: lojaId, productId: produto.id },
                      data: { isPrimary: false, updatedAt: new Date() },
                    });
                  }
                  let principal = entrada.data.principal;
                  if (entrada.data.principal === false && atual.isPrimary) {
                    const proximaPrincipal = await tx.productImage.findFirst({
                      where: {
                        storeId: lojaId,
                        productId: produto.id,
                        id: { not: atual.id },
                      },
                      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                      select: { id: true },
                    });
                    if (proximaPrincipal === null) {
                      principal = true;
                    } else {
                      await tx.productImage.update({
                        where: { id: proximaPrincipal.id },
                        data: { isPrimary: true, updatedAt: new Date() },
                      });
                    }
                  }
                  return tx.productImage.update({
                    where: { id: atual.id },
                    data: {
                      ...(entrada.data.altText === undefined
                        ? {}
                        : { altText: entrada.data.altText }),
                      ...(principal === undefined
                        ? {}
                        : { isPrimary: principal }),
                      updatedAt: new Date(),
                    },
                    select: selecaoDaImagem,
                  });
                }),
            );
            if (imagem === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(respostaDaImagem(imagem));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/catalogo/produtos/:produtoId/imagens/:imagemId",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const removida = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return 0;
                  const imagem = await tx.productImage.findFirst({
                    where: {
                      id: requisicao.params.imagemId,
                      storeId: lojaId,
                      productId: produto.id,
                    },
                    select: { id: true, isPrimary: true },
                  });
                  if (imagem === null) return 0;
                  await tx.productImage.delete({ where: { id: imagem.id } });
                  if (imagem.isPrimary) {
                    const proximaPrincipal = await tx.productImage.findFirst({
                      where: { storeId: lojaId, productId: produto.id },
                      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                      select: { id: true },
                    });
                    if (proximaPrincipal !== null) {
                      await tx.productImage.update({
                        where: { id: proximaPrincipal.id },
                        data: { isPrimary: true, updatedAt: new Date() },
                      });
                    }
                  }
                  return 1;
                }),
            );
            if (removida === 0) {
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

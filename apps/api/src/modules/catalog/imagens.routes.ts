/**
 * Imagens do produto (T-303).
 *
 * A mídia é hospedada fora da API (decisão D2: Cloudinary). Dois caminhos
 * chegam aqui: a URL pública já pronta, e o ARQUIVO — cujos bytes a API confere
 * antes de qualquer outra coisa (AC-306: a checagem olha o conteúdo, não a
 * extensão) e só então entrega à hospedagem. Os dois terminam nas mesmas
 * invariantes: HTTPS, no máximo cinco imagens, uma principal por produto e
 * isolamento da loja.
 */
import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import type {
  ChegadaNaLoja,
  IdentificacaoDaLoja,
  UsuarioAutenticado,
} from "./categorias.routes.ts";
import {
  ErroDeHospedagemIndisponivel,
  ErroDeHospedagemRecusada,
  hospedagemNoCloudinary,
  type HospedarImagem,
} from "./hospedagem-de-imagem.ts";
import {
  conferirConteudoDaImagem,
  ErroDeImagemInvalida,
  LIMITE_DE_IMAGENS_POR_PRODUTO,
  TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES,
} from "./imagens.usecase.ts";

/** O que acompanha o arquivo, na consulta do endereço (o corpo são os bytes). */
const esquemaDoEnvioDeArquivo = z.strictObject({
  principal: z.enum(["true", "false"]).optional(),
  texto: z.string().trim().max(160).optional(),
});

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
  /** Onde o arquivo fica. Padrão: Cloudinary, com a credencial do ambiente. */
  readonly hospedar?: HospedarImagem;
}

export function criarRotasDasImagens(opcoes: OpcoesDasImagens): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();
  const hospedar = opcoes.hospedar ?? hospedagemNoCloudinary();

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
                  if (quantidade >= LIMITE_DE_IMAGENS_POR_PRODUTO)
                    return { tipo: "limite" } as const;
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

  /*
   * ENVIO DO ARQUIVO (AC-306). O corpo são os bytes da imagem. A conferência
   * do CONTEÚDO vem antes de tudo — antes de resolver a loja e antes de gastar
   * a cota da hospedagem: arquivo que não é imagem de verdade para aqui, com o
   * motivo, seja qual for o nome ou o tipo que ele declarou.
   */
  const CAMINHO_DO_ARQUIVO =
    "/:apelido/catalogo/produtos/:produtoId/imagens/arquivo";

  rotas.post(
    CAMINHO_DO_ARQUIVO,
    express.raw({
      type: () => true,
      limit: TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES,
    }),
    async (requisicao, resposta, proximo) => {
      try {
        const consulta = esquemaDoEnvioDeArquivo.safeParse(requisicao.query);
        const produtoId = z
          .string()
          .uuid()
          .safeParse(requisicao.params.produtoId);
        if (!consulta.success || !produtoId.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const bytes = Buffer.isBuffer(requisicao.body)
          ? new Uint8Array(requisicao.body)
          : new Uint8Array();
        let formato;
        try {
          formato = conferirConteudoDaImagem(bytes).formato;
        } catch (causa) {
          if (causa instanceof ErroDeImagemInvalida) {
            resposta
              .status(400)
              .json({ erro: "imagem_invalida", mensagem: causa.message });
            return;
          }
          throw causa;
        }
        const principalPedida = consulta.data.principal === "true";

        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const contexto = {
              lojaId,
              usuarioId: usuario.identidadeId,
              papel: usuario.papel,
            };
            // 1) Produto e limite ANTES de enviar: não se gasta cota à toa.
            const antes = await executarComoRequisicao(contexto, () =>
              acesso.emTransacao(async (tx) => {
                const produto = await produtoDaLoja(tx, lojaId, produtoId.data);
                if (produto === null)
                  return { tipo: "nao_encontrado" } as const;
                const quantidade = await tx.productImage.count({
                  where: { storeId: lojaId, productId: produto.id },
                });
                if (quantidade >= LIMITE_DE_IMAGENS_POR_PRODUTO)
                  return { tipo: "limite" } as const;
                return { tipo: "pode", produto } as const;
              }),
            );
            if (antes.tipo === "nao_encontrado") {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            if (antes.tipo === "limite") {
              erro(resposta, 400, "limite_de_imagens");
              return;
            }

            // 2) Hospeda FORA da transação: rede lenta não segura conexão.
            const hospedada = await hospedar({
              bytes,
              formato,
              lojaId,
              produtoId: antes.produto.id,
            });

            // 3) Grava, reconferindo o limite: outro envio pode ter chegado.
            const gravada = await executarComoRequisicao(contexto, () =>
              acesso.emTransacao(async (tx) => {
                const quantidade = await tx.productImage.count({
                  where: { storeId: lojaId, productId: antes.produto.id },
                });
                if (quantidade >= LIMITE_DE_IMAGENS_POR_PRODUTO) return null;
                const ultima = await tx.productImage.findFirst({
                  where: { storeId: lojaId, productId: antes.produto.id },
                  orderBy: { sortOrder: "desc" },
                  select: { sortOrder: true },
                });
                if (principalPedida) {
                  await tx.productImage.updateMany({
                    where: { storeId: lojaId, productId: antes.produto.id },
                    data: { isPrimary: false, updatedAt: new Date() },
                  });
                }
                return tx.productImage.create({
                  data: {
                    storeId: lojaId,
                    productId: antes.produto.id,
                    url: hospedada.url,
                    width: hospedada.largura,
                    height: hospedada.altura,
                    altText: consulta.data.texto || antes.produto.name,
                    isPrimary: principalPedida || quantidade === 0,
                    sortOrder: (ultima?.sortOrder ?? -1) + 1,
                  },
                  select: selecaoDaImagem,
                });
              }),
            );
            if (gravada === null) {
              erro(resposta, 400, "limite_de_imagens");
              return;
            }
            resposta.status(201).json(respostaDaImagem(gravada));
          },
        );
      } catch (causa) {
        if (causa instanceof ErroDeHospedagemIndisponivel) {
          resposta
            .status(503)
            .json({ erro: "midia_indisponivel", mensagem: causa.message });
          return;
        }
        if (causa instanceof ErroDeHospedagemRecusada) {
          resposta
            .status(422)
            .json({ erro: "imagem_recusada", mensagem: causa.message });
          return;
        }
        proximo(causa);
      }
    },
  );

  // Arquivo acima do limite nem chega ao código da rota: quem recusa é o
  // leitor do corpo. Aqui a recusa ganha o mesmo aviso claro da conferência.
  rotas.use(
    CAMINHO_DO_ARQUIVO,
    (
      causa: unknown,
      _requisicao: Request,
      resposta: Response,
      proximo: NextFunction,
    ) => {
      if ((causa as { type?: string } | null)?.type === "entity.too.large") {
        resposta.status(413).json({
          erro: "imagem_grande_demais",
          mensagem: "A imagem excede o limite de 10 MB permitido.",
        });
        return;
      }
      proximo(causa);
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

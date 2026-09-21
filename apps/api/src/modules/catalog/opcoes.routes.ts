/**
 * Grupos de escolhas e adicionais do produto (T-305).
 *
 * Obrigatoriedade é derivada de minSelect: não existe uma coluna paralela que
 * possa discordar do mínimo. Opção indisponível continua visível para o
 * cliente, mas não pode ser escolhida; apagar é lógico para preservar o
 * histórico do catálogo.
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

const tiposDeGrupo = z.enum(["INGREDIENT", "ADDON", "VARIATION"]);

const camposDoGrupo = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).nullable(),
  tipo: tiposDeGrupo,
  minimo: z.number().int().min(0).max(100),
  maximo: z.number().int().min(1).max(100).nullable(),
  permiteRepetir: z.boolean(),
  ativo: z.boolean(),
  eixoDeVariacao: z.boolean().optional(),
});

const esquemaDoGrupo = camposDoGrupo.refine(
  (valor) => valor.maximo === null || valor.maximo >= valor.minimo,
  {
    message: "O máximo precisa ser maior ou igual ao mínimo.",
  },
);

const esquemaDaAtualizacaoDoGrupo = camposDoGrupo
  .partial()
  .refine(
    (valor) =>
      Object.keys(valor).length > 0 &&
      (valor.maximo === undefined ||
        valor.maximo === null ||
        valor.minimo === undefined ||
        valor.maximo >= valor.minimo),
    {
      message: "Informe campos válidos para alterar.",
    },
  );

const esquemaDaOpcao = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  acrescimoCentavos: z.number().int().min(-999_999_999).max(999_999_999),
  disponivel: z.boolean(),
  padrao: z.boolean(),
  codigoExterno: z.string().trim().max(100).nullable(),
});

const esquemaDaAtualizacaoDaOpcao = esquemaDaOpcao
  .partial()
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

const selecaoDaOpcao = {
  id: true,
  name: true,
  priceDeltaCents: true,
  isDefaultSelected: true,
  isAvailable: true,
  externalCode: true,
  sortOrder: true,
} as const;

const selecaoDoGrupo = {
  id: true,
  name: true,
  description: true,
  kind: true,
  minSelect: true,
  maxSelect: true,
  allowRepeat: true,
  isVariantAxis: true,
  isActive: true,
  sortOrder: true,
  itens: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
    select: selecaoDaOpcao,
  },
};

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

function respostaDoGrupo(grupo: {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: string;
  readonly minSelect: number;
  readonly maxSelect: number | null;
  readonly allowRepeat: boolean;
  readonly isVariantAxis: boolean;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly itens: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly priceDeltaCents: bigint;
    readonly isDefaultSelected: boolean;
    readonly isAvailable: boolean;
    readonly externalCode: string | null;
    readonly sortOrder: number;
  }>;
}) {
  return {
    id: grupo.id,
    nome: grupo.name,
    descricao: grupo.description,
    tipo: grupo.kind,
    minimo: grupo.minSelect,
    maximo: grupo.maxSelect,
    permiteRepetir: grupo.allowRepeat,
    eixoDeVariacao: grupo.isVariantAxis,
    ativo: grupo.isActive,
    ordem: grupo.sortOrder,
    opcoes: grupo.itens.map((opcao) => ({
      id: opcao.id,
      nome: opcao.name,
      acrescimoCentavos: Number(opcao.priceDeltaCents),
      disponivel: opcao.isAvailable,
      padrao: opcao.isDefaultSelected,
      codigoExterno: opcao.externalCode,
      ordem: opcao.sortOrder,
    })),
  };
}

export interface OpcoesDosGruposDeEscolha {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDosGruposDeEscolha(
  opcoes: OpcoesDosGruposDeEscolha,
): Router {
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

  async function grupoDoProduto(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
    grupoId: string,
  ) {
    return tx.productOptionGroup.findFirst({
      where: { storeId: lojaId, productId: produtoId, groupId: grupoId },
      select: { groupId: true },
    });
  }

  async function lerGrupos(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ) {
    return tx.productOptionGroup.findMany({
      where: { storeId: lojaId, productId: produtoId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { grupo: { select: selecaoDoGrupo } },
    });
  }

  rotas.get(
    "/:apelido/catalogo/produtos/:produtoId/opcoes",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const grupos = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const vinculos = await lerGrupos(tx, lojaId, produto.id);
                  return vinculos.map((vinculo) =>
                    respostaDoGrupo(vinculo.grupo),
                  );
                }),
            );
            if (grupos === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json({ grupos });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/opcoes",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDoGrupo.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const grupo = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const ordem = await tx.productOptionGroup.count({
                    where: { storeId: lojaId, productId: produto.id },
                  });
                  const criado = await tx.optionGroup.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      name: entrada.data.nome,
                      description: entrada.data.descricao,
                      kind: entrada.data.tipo,
                      minSelect: entrada.data.minimo,
                      maxSelect: entrada.data.maximo,
                      allowRepeat: entrada.data.permiteRepetir,
                      isVariantAxis:
                        entrada.data.eixoDeVariacao ??
                        entrada.data.tipo === "VARIATION",
                      isActive: entrada.data.ativo,
                      sortOrder: ordem,
                    },
                    select: { id: true },
                  });
                  await tx.productOptionGroup.create({
                    data: {
                      storeId: lojaId,
                      productId: produto.id,
                      groupId: criado.id,
                      sortOrder: ordem,
                    },
                  });
                  const vinculos = await lerGrupos(tx, lojaId, produto.id);
                  return (
                    vinculos.find((vinculo) => vinculo.grupo.id === criado.id)
                      ?.grupo ?? null
                  );
                }),
            );
            if (grupo === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json(respostaDoGrupo(grupo));
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.patch(
    "/:apelido/catalogo/produtos/:produtoId/opcoes/:grupoId",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaAtualizacaoDoGrupo.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const grupo = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const vinculo = await grupoDoProduto(
                    tx,
                    lojaId,
                    produto.id,
                    requisicao.params.grupoId,
                  );
                  if (vinculo === null) return null;
                  const atual = await tx.optionGroup.findFirst({
                    where: { id: vinculo.groupId, storeId: lojaId },
                    select: { minSelect: true, maxSelect: true },
                  });
                  if (atual === null) return null;
                  const minimo = entrada.data.minimo ?? atual.minSelect;
                  const maximo =
                    entrada.data.maximo === undefined
                      ? atual.maxSelect
                      : entrada.data.maximo;
                  if (maximo !== null && maximo < minimo)
                    throw new Error("limites_invalidos");
                  await tx.optionGroup.update({
                    where: { id: vinculo.groupId },
                    data: {
                      ...(entrada.data.nome === undefined
                        ? {}
                        : { name: entrada.data.nome }),
                      ...(entrada.data.descricao === undefined
                        ? {}
                        : { description: entrada.data.descricao }),
                      ...(entrada.data.tipo === undefined
                        ? {}
                        : { kind: entrada.data.tipo }),
                      ...(entrada.data.minimo === undefined
                        ? {}
                        : { minSelect: entrada.data.minimo }),
                      ...(entrada.data.maximo === undefined
                        ? {}
                        : { maxSelect: entrada.data.maximo }),
                      ...(entrada.data.permiteRepetir === undefined
                        ? {}
                        : { allowRepeat: entrada.data.permiteRepetir }),
                      ...(entrada.data.eixoDeVariacao === undefined
                        ? {}
                        : { isVariantAxis: entrada.data.eixoDeVariacao }),
                      ...(entrada.data.tipo === undefined
                        ? {}
                        : {
                            isVariantAxis:
                              entrada.data.tipo === "VARIATION" ||
                              entrada.data.eixoDeVariacao === true,
                          }),
                      ...(entrada.data.ativo === undefined
                        ? {}
                        : { isActive: entrada.data.ativo }),
                      updatedAt: new Date(),
                    },
                  });
                  const vinculos = await lerGrupos(tx, lojaId, produto.id);
                  return (
                    vinculos.find((item) => item.grupo.id === vinculo.groupId)
                      ?.grupo ?? null
                  );
                }),
            );
            if (grupo === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(respostaDoGrupo(grupo));
          },
        );
      } catch (causa) {
        if (causa instanceof Error && causa.message === "limites_invalidos") {
          erro(resposta, 400, "limites_invalidos");
          return;
        }
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/catalogo/produtos/:produtoId/opcoes/:grupoId",
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
                  const vinculo = await grupoDoProduto(
                    tx,
                    lojaId,
                    produto.id,
                    requisicao.params.grupoId,
                  );
                  if (vinculo === null) return 0;
                  const resultado = await tx.optionGroup.updateMany({
                    where: {
                      id: vinculo.groupId,
                      storeId: lojaId,
                      deletedAt: null,
                    },
                    data: {
                      isActive: false,
                      deletedAt: new Date(),
                      updatedAt: new Date(),
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

  rotas.post(
    "/:apelido/catalogo/produtos/:produtoId/opcoes/:grupoId/itens",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaOpcao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const opcao = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const produto = await produtoDaLoja(
                    tx,
                    lojaId,
                    requisicao.params.produtoId,
                  );
                  if (produto === null) return null;
                  const grupo = await grupoDoProduto(
                    tx,
                    lojaId,
                    produto.id,
                    requisicao.params.grupoId,
                  );
                  if (grupo === null) return null;
                  const ultima = await tx.optionItem.findFirst({
                    where: {
                      storeId: lojaId,
                      groupId: grupo.groupId,
                      deletedAt: null,
                    },
                    orderBy: { sortOrder: "desc" },
                    select: { sortOrder: true },
                  });
                  return tx.optionItem.create({
                    data: {
                      storeId: lojaId,
                      groupId: grupo.groupId,
                      name: entrada.data.nome,
                      priceDeltaCents: entrada.data.acrescimoCentavos,
                      isAvailable: entrada.data.disponivel,
                      isDefaultSelected: entrada.data.padrao,
                      externalCode: entrada.data.codigoExterno,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                    },
                    select: selecaoDaOpcao,
                  });
                }),
            );
            if (opcao === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json({
              id: opcao.id,
              nome: opcao.name,
              acrescimoCentavos: Number(opcao.priceDeltaCents),
              disponivel: opcao.isAvailable,
              padrao: opcao.isDefaultSelected,
              codigoExterno: opcao.externalCode,
              ordem: opcao.sortOrder,
            });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  async function alterarOpcao(
    requisicao: Request,
    resposta: Response,
    proximo: (causa?: unknown) => void,
    excluir: boolean,
  ): Promise<void> {
    try {
      const apelido = String(requisicao.params.apelido);
      const produtoId = String(requisicao.params.produtoId);
      const grupoId = String(requisicao.params.grupoId);
      const itemId = String(requisicao.params.itemId);
      const entrada = excluir
        ? null
        : esquemaDaAtualizacaoDaOpcao.safeParse(requisicao.body);
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
              const grupo = await grupoDoProduto(
                tx,
                lojaId,
                produto.id,
                grupoId,
              );
              if (grupo === null) return null;
              if (excluir) {
                const apagada = await tx.optionItem.updateMany({
                  where: {
                    id: itemId,
                    storeId: lojaId,
                    groupId: grupo.groupId,
                    deletedAt: null,
                  },
                  data: {
                    deletedAt: new Date(),
                    isAvailable: false,
                    updatedAt: new Date(),
                  },
                });
                return apagada.count === 0 ? null : { apagada: true as const };
              }
              const atual = await tx.optionItem.findFirst({
                where: {
                  id: itemId,
                  storeId: lojaId,
                  groupId: grupo.groupId,
                  deletedAt: null,
                },
                select: { id: true },
              });
              if (atual === null || entrada === null || !entrada.success)
                return null;
              return tx.optionItem.update({
                where: { id: atual.id },
                data: {
                  ...(entrada.data.nome === undefined
                    ? {}
                    : { name: entrada.data.nome }),
                  ...(entrada.data.acrescimoCentavos === undefined
                    ? {}
                    : { priceDeltaCents: entrada.data.acrescimoCentavos }),
                  ...(entrada.data.disponivel === undefined
                    ? {}
                    : { isAvailable: entrada.data.disponivel }),
                  ...(entrada.data.padrao === undefined
                    ? {}
                    : { isDefaultSelected: entrada.data.padrao }),
                  ...(entrada.data.codigoExterno === undefined
                    ? {}
                    : { externalCode: entrada.data.codigoExterno }),
                  updatedAt: new Date(),
                },
                select: selecaoDaOpcao,
              });
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
        resposta.json({
          id: resultado.id,
          nome: resultado.name,
          acrescimoCentavos: Number(resultado.priceDeltaCents),
          disponivel: resultado.isAvailable,
          padrao: resultado.isDefaultSelected,
          codigoExterno: resultado.externalCode,
          ordem: resultado.sortOrder,
        });
      });
    } catch (causa) {
      proximo(causa);
    }
  }

  rotas.patch(
    "/:apelido/catalogo/produtos/:produtoId/opcoes/:grupoId/itens/:itemId",
    (requisicao, resposta, proximo) =>
      alterarOpcao(requisicao, resposta, proximo, false),
  );
  rotas.delete(
    "/:apelido/catalogo/produtos/:produtoId/opcoes/:grupoId/itens/:itemId",
    (requisicao, resposta, proximo) =>
      alterarOpcao(requisicao, resposta, proximo, true),
  );

  return rotas;
}

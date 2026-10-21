/**
 * Gestão da fatia básica de produtos (T-302).
 *
 * Imagens, preços por vigência, opções e estoque têm regras próprias e ficam
 * nas próximas tarefas. Aqui o dono consegue montar um produto simples,
 * deixá-lo em rascunho e publicá-lo quando estiver pronto.
 *
 * As FAIXAS DE ATACADO (card #54) entram no cadastro: a lista vem em
 * `faixasDeAtacado` e pode ser enviada na criação e na edição (ausente = não
 * mexe; lista vazia = só varejo). A rota `/atacado` dos preços faz o mesmo
 * sozinha. Trocar o preço confere as faixas em reais que já existem.
 *
 * A LISTA PAGINA NO BANCO (card #76): `GET .../produtos?pagina=&porPagina=&
 * busca=&categoria=&situacao=&marca=&ordem=` devolve só a página, com total,
 * atalhos (`resumo`), categorias e marcas para os filtros. Sem parâmetro
 * nenhum, a lista inteira, como antes.
 */
import {
  MENSAGEM_DE_SEM_PERMISSAO,
  podeNaLoja,
  type FaixaGravadaNoContrato,
} from "@simpleclick/contracts";
import { estaAcabando, lerJanelasDeDisponibilidade } from "@simpleclick/core";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { exigirLimiteDaLoja } from "../../core/limites-da-loja.ts";
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
import {
  ErroDeAtributoInvalido,
  validarAtributosDoRamo,
} from "./atributos.usecase.ts";
import {
  ehRecusaDoBancoNasFaixas,
  ErroDasFaixasDeAtacado,
  exigirFaixasNoPreco,
  gravarFaixasDeAtacado,
  lerFaixasDeAtacado,
  lerFaixasDosProdutos,
  pedidoMinimoDosProdutos,
  recusaDasFaixas,
} from "./atacado.usecase.ts";
import {
  categoriasDoFiltro,
  esquemaDaConsultaDeProdutos,
  lerConsulta,
  marcasDaLoja,
  paginaDeProdutos,
  pedePagina,
} from "./listagem-do-painel.ts";
import { ESTADO_DA_DUPLICATA, nomeDaDuplicata } from "./produtos.usecase.ts";
import { planejarTrocaDeCategoria } from "./mover-categoria.usecase.ts";

/**
 * Leva o produto para outra categoria principal (T-310, AC-329).
 *
 * Os valores de especificação NÃO são tocados: eles pertencem à definição da
 * categoria de origem e ficam guardados, marcados como não usados na nova.
 * Só a principal troca — as seções secundárias continuam —, e o vínculo novo
 * entra no fim da seção de destino.
 */
async function trocarCategoriaPrincipal(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
  novaCategoriaId: string,
): Promise<void> {
  const vinculos = await tx.productCategory.findMany({
    where: { storeId: lojaId, productId: produtoId },
    select: { id: true, categoryId: true, isPrimary: true },
  });
  const plano = planejarTrocaDeCategoria(
    vinculos.map((vinculo) => ({
      id: vinculo.id,
      categoriaId: vinculo.categoryId,
      principal: vinculo.isPrimary,
    })),
    novaCategoriaId,
  );
  if (plano.tipo === "nada") return;

  // Primeiro sai a principal antiga: o índice de "uma principal por produto"
  // nunca vê duas ao mesmo tempo.
  if (plano.apagar.length > 0) {
    await tx.productCategory.deleteMany({
      where: { storeId: lojaId, id: { in: [...plano.apagar] } },
    });
  }
  if (plano.tornarPrincipal !== null) {
    await tx.productCategory.update({
      where: { id: plano.tornarPrincipal },
      data: { isPrimary: true, updatedAt: new Date() },
    });
  }
  if (plano.criarNaCategoria !== null) {
    const ultima = await tx.productCategory.findFirst({
      where: { storeId: lojaId, categoryId: plano.criarNaCategoria },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await tx.productCategory.create({
      data: {
        storeId: lojaId,
        productId: produtoId,
        categoryId: plano.criarNaCategoria,
        isPrimary: true,
        sortOrder: (ultima?.sortOrder ?? -1) + 1,
      },
    });
  }
}

/** O que a coluna JSON aceita de volta: cópia pura, sem nulo na raiz. */
type ObjetoJson = { readonly [chave: string]: ValorJson | null };
type ValorJson =
  string | number | boolean | ObjetoJson | readonly (ValorJson | null)[];

function copiaJson(valor: unknown): ObjetoJson {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (JSON.parse(JSON.stringify(valor)) as ObjetoJson)
    : {};
}

/**
 * Leva para a duplicata as fotos (com a mesma principal) e os valores das
 * especificações. As linhas são NOVAS: apagar a foto da duplicata não pode
 * tirar a foto do original.
 */
async function copiarImagensEEspecificacoes(
  tx: TransacaoDoBanco,
  lojaId: string,
  origemId: string,
  destinoId: string,
): Promise<void> {
  const imagens = await tx.productImage.findMany({
    where: { storeId: lojaId, productId: origemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      assetId: true,
      url: true,
      altText: true,
      isPrimary: true,
      sortOrder: true,
      width: true,
      height: true,
    },
  });
  if (imagens.length > 0) {
    await tx.productImage.createMany({
      data: imagens.map((imagem) => ({
        ...imagem,
        storeId: lojaId,
        productId: destinoId,
      })),
    });
  }
  const valores = await tx.productAttribute.findMany({
    where: { storeId: lojaId, productId: origemId },
    select: {
      definitionId: true,
      valueText: true,
      valueNum: true,
      valueBool: true,
      valueDate: true,
    },
  });
  if (valores.length > 0) {
    await tx.productAttribute.createMany({
      data: valores.map((valor) => ({
        ...valor,
        storeId: lojaId,
        productId: destinoId,
      })),
    });
  }
}

const statusDoProduto = z.enum(["DRAFT", "PUBLISHED"]);

/**
 * A janela semanal de venda (T-311, AC-322): dia da semana com 0 no domingo,
 * como no JavaScript que a avalia, e horas do relógio da loja. A mesma forma
 * que o banco confere ao gravar (migração 0028) — a borda recusa antes, com
 * um motivo que a tela consegue mostrar.
 */
const horaDoRelogio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const esquemaDaJanela = z
  .strictObject({
    diaDaSemana: z.number().int().min(0).max(6),
    abre: horaDoRelogio,
    fecha: horaDoRelogio,
  })
  .refine((janela) => janela.abre < janela.fecha, {
    message: "A janela precisa fechar depois de abrir.",
  });
/** Três faixas por dia bastam para café, almoço e jantar de qualquer loja. */
const esquemaDasJanelas = z.array(esquemaDaJanela).max(21);

const esquemaDaCriacao = z.strictObject({
  nome: z.string().trim().min(1).max(160),
  descricao: z.string().trim().max(2_000).nullable(),
  categoriaId: z.string().uuid(),
  precoCentavos: z.number().int().nonnegative().max(999_999_999),
  atributos: z.record(z.string(), z.unknown()).optional(),
  status: statusDoProduto,
  disponivel: z.boolean(),
  janelas: esquemaDasJanelas.optional(),
  /** Publicar no feed. Ausente: vale a configuração do feed da loja. */
  publicarNoFeed: z.boolean().optional(),
  /** As faixas de atacado; as travas são conferidas na gravação. */
  faixasDeAtacado: z.array(z.unknown()).optional(),
});

const esquemaDaAtualizacao = z
  .strictObject({
    nome: z.string().trim().min(1).max(160).optional(),
    descricao: z.string().trim().max(2_000).nullable().optional(),
    categoriaId: z.string().uuid().optional(),
    precoCentavos: z.number().int().nonnegative().max(999_999_999).optional(),
    atributos: z.record(z.string(), z.unknown()).optional(),
    status: statusDoProduto.optional(),
    disponivel: z.boolean().optional(),
    janelas: esquemaDasJanelas.optional(),
    publicarNoFeed: z.boolean().optional(),
    faixasDeAtacado: z.array(z.unknown()).optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

/** A recusa da janela tem nome próprio: a tela diz qual campo corrigir. */
function motivoDaRecusa(erro: z.ZodError): string {
  return erro.issues.some((problema) => problema.path[0] === "janelas")
    ? "janela_invalida"
    : "entrada_invalida";
}

/** Cópia mutável e pura da janela, como a coluna JSON aceita. */
function janelasParaGravar(
  janelas: readonly z.infer<typeof esquemaDaJanela>[] | undefined,
): { diaDaSemana: number; abre: string; fecha: string }[] {
  return (janelas ?? []).map((janela) => ({
    diaDaSemana: janela.diaDaSemana,
    abre: janela.abre,
    fecha: janela.fecha,
  }));
}

type LinhaDoProduto = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly displayPriceCents: bigint | null;
  readonly status: string;
  readonly isAvailable: boolean;
  readonly saleWindows: unknown;
  readonly attributes: unknown;
  readonly sortOrder: number;
  readonly publishToFeed: boolean;
  readonly categorias: ReadonlyArray<{
    readonly categoryId: string;
    readonly categoria: { readonly name: string };
  }>;
  readonly variacoes: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly stockQuantity: number | null;
    readonly stockMinAlert: number | null;
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

function respostaDoProduto(
  produto: LinhaDoProduto,
  faixasDeAtacado: readonly FaixaGravadaNoContrato[] = [],
  pedidoMinimoDeAtacado: number | null = null,
  temVideo = false,
) {
  const categoria = produto.categorias[0];
  // Soma só das variações com estoque controlado; nulo = nenhuma controla.
  const controladas = produto.variacoes.filter((v) => v.stockQuantity !== null);
  const estoqueTotal =
    controladas.length === 0
      ? null
      : controladas.reduce((soma, v) => soma + (v.stockQuantity as number), 0);
  // O que está acabando vem com o produto, para a lista do dono sinalizar sem
  // abrir produto por produto (AC-336).
  const acabando = produto.variacoes
    .filter((v) => estaAcabando(v.stockQuantity, v.stockMinAlert))
    .map((v) => ({
      id: v.id,
      nome: v.name,
      quantidade: v.stockQuantity as number,
      minimoAlerta: v.stockMinAlert as number,
    }));
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
    // A janela volta como foi gravada, já na forma que a regra entende: o
    // painel a mostra no cadastro, e a vitrine a avalia no fuso da loja.
    janelas: lerJanelasDeDisponibilidade(produto.saleWindows),
    atributos: produto.attributes,
    ordem: produto.sortOrder,
    publicarNoFeed: produto.publishToFeed,
    temVideo,
    estoqueTotal,
    estoqueBaixo: acabando.length > 0,
    variacoesAcabando: acabando,
    // Vazia = só varejo. O preço em cada faixa sai da rota `/atacado`.
    faixasDeAtacado,
    // A menor quantidade que já compra no atacado agora; nulo = só varejo.
    pedidoMinimoDeAtacado,
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
  saleWindows: true,
  attributes: true,
  sortOrder: true,
  publishToFeed: true,
  categorias: {
    where: { isPrimary: true },
    select: { categoryId: true, categoria: { select: { name: true } } },
  },
  variacoes: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, name: true, stockQuantity: true, stockMinAlert: true },
  },
} as const;

/**
 * A marca "publicar no feed" é da permissão `feed`, que a equipe não tem
 * (card #25). Equipe que manda a marca recebe 403; sem a marca, segue.
 */
function podeMarcarOFeed(
  usuario: UsuarioAutenticado,
  publicarNoFeed: boolean | undefined,
  resposta: Response,
): boolean {
  if (publicarNoFeed === undefined || podeNaLoja(usuario.papel, "feed")) {
    return true;
  }
  resposta.status(403).json({
    erro: "sem_permissao",
    permissao: "feed",
    mensagem: MENSAGEM_DE_SEM_PERMISSAO,
  });
  return false;
}

/** A resposta de um produto recém-gravado, com o pedido mínimo de agora. */
async function respostaDoProdutoGravado(
  tx: TransacaoDoBanco,
  lojaId: string,
  produto: LinhaDoProduto,
  faixasDeAtacado: readonly FaixaGravadaNoContrato[],
) {
  const minimos = await pedidoMinimoDosProdutos(tx, lojaId, [produto.id]);
  return respostaDoProduto(
    produto,
    faixasDeAtacado,
    minimos.get(produto.id) ?? null,
  );
}

/** Faixa que não passou nas travas (ou que o banco recusou): 422. */
function recusouAsFaixas(causa: unknown, resposta: Response): boolean {
  if (causa instanceof ErroDasFaixasDeAtacado) {
    resposta.status(422).json(recusaDasFaixas(causa.problemas));
    return true;
  }
  if (ehRecusaDoBancoNasFaixas(causa)) {
    resposta.status(422).json(
      recusaDasFaixas([
        {
          indice: null,
          mensagem:
            "Não deu para salvar as faixas: confira as quantidades e os descontos e tente de novo.",
        },
      ]),
    );
    return true;
  }
  return false;
}

/**
 * A duplicata leva as faixas de atacado do original, regravadas com as
 * travas. Se alguma não couber no preço da duplicata (o original tinha uma
 * variação mais cara), ela nasce só no varejo, e o dono cadastra de novo.
 */
async function copiarFaixas(
  tx: TransacaoDoBanco,
  lojaId: string,
  origemId: string,
  destinoId: string,
): Promise<FaixaGravadaNoContrato[]> {
  const faixas = (await lerFaixasDeAtacado(tx, lojaId, origemId)).filter(
    (faixa) => faixa.ativo,
  );
  if (faixas.length === 0) return [];
  try {
    return await gravarFaixasDeAtacado(
      tx,
      lojaId,
      destinoId,
      faixas.map((faixa) => ({
        quantidadeMinima: faixa.quantidadeMinima,
        tipoDeDesconto: faixa.tipoDeDesconto,
        desconto: faixa.desconto,
        rotulo: faixa.rotulo,
      })),
    );
  } catch (causa) {
    if (causa instanceof ErroDasFaixasDeAtacado) return [];
    throw causa;
  }
}

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
            const query = requisicao.query as Record<string, unknown>;
            // Com `pagina` (ou filtro, ou ordem): só a página pedida, com o
            // total e os atalhos contados no banco (card #76). Sem nada: a
            // loja inteira, como sempre (cadastro, feed e testes usam assim).
            const consulta = pedePagina(query)
              ? lerConsulta(esquemaDaConsultaDeProdutos, query)
              : null;
            const corpo = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(async (tx) => {
                  const pagina =
                    consulta === null
                      ? null
                      : await paginaDeProdutos(tx, lojaId, consulta);
                  const linhas = await tx.product.findMany({
                    where: {
                      storeId: lojaId,
                      deletedAt: null,
                      ...(pagina === null
                        ? {}
                        : { id: { in: [...pagina.ids] } }),
                    },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: selecaoDoProduto,
                  });
                  if (pagina !== null) {
                    const posicao = new Map(
                      pagina.ids.map((id, indice) => [id, indice]),
                    );
                    linhas.sort(
                      (a, b) => posicao.get(a.id)! - posicao.get(b.id)!,
                    );
                  }
                  const ids = linhas.map((linha) => linha.id);
                  const faixas = await lerFaixasDosProdutos(tx, lojaId, ids);
                  const minimos = await pedidoMinimoDosProdutos(
                    tx,
                    lojaId,
                    ids,
                  );
                  const comVideo = new Set(
                    (
                      await tx.productVideo.findMany({
                        where: { storeId: lojaId, productId: { in: ids } },
                        select: { productId: true },
                      })
                    ).map((video) => video.productId),
                  );
                  const produtos = linhas.map((linha) =>
                    respostaDoProduto(
                      linha,
                      faixas.get(linha.id),
                      minimos.get(linha.id) ?? null,
                      comVideo.has(linha.id),
                    ),
                  );
                  if (pagina === null) return { produtos };
                  const { ids: _ids, ...resto } = pagina;
                  return {
                    produtos,
                    ...resto,
                    categorias: await categoriasDoFiltro(tx, lojaId),
                    marcas: await marcasDaLoja(tx, lojaId),
                  };
                }),
            );
            resposta.json(corpo);
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
          erro(resposta, 400, motivoDaRecusa(entrada.error));
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            if (
              !podeMarcarOFeed(usuario, entrada.data.publicarNoFeed, resposta)
            ) {
              return;
            }
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
                  // O limite de produtos da loja (card #25): passou, 409.
                  await exigirLimiteDaLoja("produtos");
                  const loja = await tx.store.findUnique({
                    where: { id: lojaId },
                    select: { verticalCode: true, feedAutoPublishNew: true },
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
                      saleWindows: janelasParaGravar(entrada.data.janelas),
                      displayPriceCents: entrada.data.precoCentavos,
                      attributes: validarAtributosDoRamo(
                        loja.verticalCode,
                        entrada.data.atributos,
                      ),
                      priceMinCents: entrada.data.precoCentavos,
                      priceMaxCents: entrada.data.precoCentavos,
                      sortOrder: (ultima?.sortOrder ?? -1) + 1,
                      createdBy: criadorDaSessao(usuario.identidadeId) ?? null,
                      publishToFeed:
                        entrada.data.publicarNoFeed ?? loja.feedAutoPublishNew,
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
                  const faixas =
                    entrada.data.faixasDeAtacado === undefined
                      ? []
                      : await gravarFaixasDeAtacado(
                          tx,
                          lojaId,
                          produto.id,
                          entrada.data.faixasDeAtacado,
                        );
                  return respostaDoProdutoGravado(
                    tx,
                    lojaId,
                    await tx.product.findUniqueOrThrow({
                      where: { id: produto.id },
                      select: selecaoDoProduto,
                    }),
                    faixas,
                  );
                }),
            );
            resposta.status(201).json(criado);
          },
        );
      } catch (causa) {
        if (recusouAsFaixas(causa, resposta)) return;
        if (causa instanceof ErroDeAtributoInvalido) {
          erro(resposta, 400, "atributos_invalidos");
          return;
        }
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
          erro(resposta, 400, motivoDaRecusa(entrada.error));
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            if (
              !podeMarcarOFeed(usuario, entrada.data.publicarNoFeed, resposta)
            ) {
              return;
            }
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
                      attributes: true,
                      verticalCode: true,
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
                    await trocarCategoriaPrincipal(
                      tx,
                      lojaId,
                      atual.id,
                      categoria.id,
                    );
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
                      ...(entrada.data.publicarNoFeed === undefined
                        ? {}
                        : { publishToFeed: entrada.data.publicarNoFeed }),
                      ...(entrada.data.janelas === undefined
                        ? {}
                        : {
                            saleWindows: janelasParaGravar(
                              entrada.data.janelas,
                            ),
                          }),
                      ...(entrada.data.atributos === undefined
                        ? {}
                        : {
                            attributes: validarAtributosDoRamo(
                              atual.verticalCode,
                              entrada.data.atributos,
                            ),
                          }),
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
                  // Faixas novas são conferidas contra o preço novo; sem
                  // elas, as que já existem também precisam caber nele.
                  if (entrada.data.faixasDeAtacado !== undefined) {
                    await gravarFaixasDeAtacado(
                      tx,
                      lojaId,
                      atual.id,
                      entrada.data.faixasDeAtacado,
                    );
                  } else if (entrada.data.precoCentavos !== undefined) {
                    await exigirFaixasNoPreco(tx, lojaId, atual.id);
                  }
                  return respostaDoProdutoGravado(
                    tx,
                    lojaId,
                    await tx.product.findUniqueOrThrow({
                      where: { id: atual.id },
                      select: selecaoDoProduto,
                    }),
                    await lerFaixasDeAtacado(tx, lojaId, atual.id),
                  );
                }),
            );
            if (atualizado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.json(atualizado);
          },
        );
      } catch (causa) {
        if (recusouAsFaixas(causa, resposta)) return;
        if (causa instanceof ErroDeAtributoInvalido) {
          erro(resposta, 400, "atributos_invalidos");
          return;
        }
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
                      id: true,
                      name: true,
                      description: true,
                      shortDescription: true,
                      unitLabel: true,
                      attributes: true,
                      saleWindows: true,
                      displayPriceCents: true,
                      verticalCode: true,
                      categorias: {
                        where: { isPrimary: true },
                        select: { categoryId: true },
                      },
                    },
                  });
                  if (original === null) return null;
                  await exigirLimiteDaLoja("produtos");
                  const nome = nomeDaDuplicata(original.name);
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
                      shortDescription: original.shortDescription,
                      unitLabel: original.unitLabel,
                      attributes: copiaJson(original.attributes),
                      // A janela é dado editável como os outros (AC-307): a
                      // duplicata do prato de sábado também é de sábado.
                      saleWindows: janelasParaGravar(
                        lerJanelasDeDisponibilidade(original.saleWindows),
                      ),
                      verticalCode: original.verticalCode,
                      status: ESTADO_DA_DUPLICATA.status,
                      isAvailable: ESTADO_DA_DUPLICATA.disponivel,
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
                  // "Com os mesmos dados" (AC-307) inclui as fotos e as
                  // especificações preenchidas: sem elas a duplicata seria um
                  // produto novo com o nome parecido, e o dono refaria tudo.
                  await copiarImagensEEspecificacoes(
                    tx,
                    lojaId,
                    original.id,
                    produto.id,
                  );
                  const faixas = await copiarFaixas(
                    tx,
                    lojaId,
                    original.id,
                    produto.id,
                  );
                  return respostaDoProdutoGravado(
                    tx,
                    lojaId,
                    await tx.product.findUniqueOrThrow({
                      where: { id: produto.id },
                      select: selecaoDoProduto,
                    }),
                    faixas,
                  );
                }),
            );
            if (duplicado === null) {
              erro(resposta, 404, "nao_encontrado");
              return;
            }
            resposta.status(201).json(duplicado);
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

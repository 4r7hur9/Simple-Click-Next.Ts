/**
 * O criador de especificações da categoria, e o preenchimento delas no produto
 * (T-301).
 *
 * O dono cria a categoria Pneus e, DENTRO dela, as especificações Aro, Largura
 * e Índice de carga. Todo produto da categoria herda essas especificações no
 * formulário, na ordem que o dono definiu, e as obrigatórias impedem salvar em
 * branco (AC-325, AC-326).
 *
 * A REGRA NÃO MORA AQUI. Tipo de valor, lista fechada, obrigatoriedade,
 * renomear e remover com histórico estão em `especificacoes.usecase.ts` e
 * `especificacao-esquema.ts`, provados sem banco. Esta rota traduz a linha do
 * banco para o registro do domínio, pede a decisão e grava o resultado — na
 * mesma transação, com a loja no contexto e o isolamento por linha ligado.
 *
 * RENOMEAR E REMOVER AVISAM ANTES (AC-330). Se há produto preenchido, a primeira
 * chamada responde 409 com quantos produtos serão afetados, e nada muda; o dono
 * confirma e a segunda chamada aplica. O nome antigo e a remoção vão para a
 * trilha de auditoria, e o valor do produto nunca é apagado: a linha da
 * especificação fica, marcada como removida.
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
import {
  esquemaDoTipoDeValor,
  type TipoDeValor,
} from "./especificacao-esquema.ts";
import {
  acrescentarOpcaoDaLista,
  criarEspecificacao,
  ErroDeEspecificacaoInvalida,
  ErroDeValorDeEspecificacaoInvalido,
  estimarImpactoDaRemocao,
  herdarEspecificacoesDaCategoria,
  removerEspecificacao,
  renomearEspecificacao,
  validarPreenchimentoDoProduto,
  type Especificacao,
  type ValorDeEspecificacao,
  type VersaoHistoricaDaEspecificacao,
} from "./especificacoes.usecase.ts";
import { moverProdutoDeCategoria } from "./mover-categoria.usecase.ts";

// ---------------------------------------------------------------------------
// Borda: o que cada rota aceita (P-007)
// ---------------------------------------------------------------------------

const esquemaDaCriacao = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  tipo: esquemaDoTipoDeValor,
  unidade: z.string().trim().max(30).nullable(),
  obrigatoria: z.boolean(),
  filtravel: z.boolean(),
  opcoes: z.array(z.string().trim().min(1).max(80)).max(100),
  ordem: z.number().int().min(0).optional(),
});

const esquemaDaAlteracao = z
  .strictObject({
    nome: z.string().trim().min(1).max(120).optional(),
    unidade: z.string().trim().max(30).nullable().optional(),
    obrigatoria: z.boolean().optional(),
    filtravel: z.boolean().optional(),
    confirmado: z.boolean().optional(),
  })
  .refine(
    (valor) =>
      Object.keys(valor).filter((chave) => chave !== "confirmado").length > 0,
    { message: "Informe ao menos um campo para alterar." },
  );

const esquemaDaOpcao = z.strictObject({
  valor: z.string().trim().min(1).max(80),
});

const esquemaDaRemocao = z.strictObject({
  confirmado: z.boolean().optional(),
});

const esquemaDaOrdem = z.strictObject({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/** Valor que o formulário do produto manda para uma especificação. */
const esquemaDoValor = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const esquemaDoPreenchimento = z.strictObject({
  valores: z.record(z.string().uuid(), esquemaDoValor),
});

/**
 * Os parâmetros do endereço também são entrada externa. Identificador que não
 * é UUID não chega ao banco — sem isto, o PostgreSQL recusaria a conversão e o
 * cliente veria um erro 500 no lugar de "não encontrado".
 */
const esquemaDosParametros = z.object({
  apelido: z.string().trim().min(1).max(120),
  categoriaId: z.string().uuid().optional(),
  especificacaoId: z.string().uuid().optional(),
  produtoId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Tradução entre a linha do banco e o registro do domínio
// ---------------------------------------------------------------------------

/** O tipo do domínio e o nome que a verificação do banco conhece. */
const TIPO_NO_BANCO: Readonly<Record<TipoDeValor, string>> = {
  texto: "TEXT",
  numero: "NUMBER",
  lista: "ENUM",
  booleano: "BOOLEAN",
};

const TIPO_DO_BANCO: Readonly<Record<string, TipoDeValor>> = {
  TEXT: "texto",
  NUMBER: "numero",
  ENUM: "lista",
  BOOLEAN: "booleano",
};

/** Ações da trilha de auditoria desta feature. */
export const ACOES_DA_ESPECIFICACAO = {
  criada: "ESPECIFICACAO_CRIADA",
  renomeada: "ESPECIFICACAO_RENOMEADA",
  removida: "ESPECIFICACAO_REMOVIDA",
  opcaoAcrescentada: "ESPECIFICACAO_OPCAO_ACRESCENTADA",
  valorDescartado: "ESPECIFICACAO_VALOR_DESCARTADO",
} as const;

const ENTIDADE_DA_AUDITORIA = "attribute_definition";

export interface LinhaDaEspecificacao {
  readonly id: string;
  readonly categoryId: string;
  readonly key: string;
  readonly label: string;
  readonly dataType: string;
  readonly unit: string | null;
  readonly allowedValues: unknown;
  readonly isRequired: boolean;
  readonly isFilterable: boolean;
  readonly sortOrder: number;
  readonly deprecatedAt: Date | null;
}

const selecaoDaEspecificacao = {
  id: true,
  categoryId: true,
  key: true,
  label: true,
  dataType: true,
  unit: true,
  allowedValues: true,
  isRequired: true,
  isFilterable: true,
  sortOrder: true,
  deprecatedAt: true,
} as const;

/** A linha do banco como o registro que o domínio entende. */
export function especificacaoDaLinha(
  linha: LinhaDaEspecificacao,
  versao = 1,
): Especificacao {
  return {
    id: linha.id,
    categoriaId: linha.categoryId,
    nome: linha.label,
    tipo: TIPO_DO_BANCO[linha.dataType] ?? "texto",
    unidade: linha.unit,
    obrigatoria: linha.isRequired,
    filtravel: linha.isFilterable,
    opcoes: Array.isArray(linha.allowedValues)
      ? linha.allowedValues.map((opcao) => String(opcao))
      : [],
    ordem: linha.sortOrder,
    versao,
    removidaEm: linha.deprecatedAt?.toISOString() ?? null,
  };
}

/** Uma linha de valor preenchido, do jeito que o Prisma a devolve. */
export interface LinhaDoValor {
  readonly definitionId: string;
  readonly valueText: string | null;
  readonly valueNum: { toString(): string } | null;
  readonly valueBool: boolean | null;
  readonly valueDate: Date | null;
}

/** O valor guardado, de volta ao tipo que o formulário usa. */
export function valorDaLinha(linha: LinhaDoValor): ValorDeEspecificacao | null {
  if (linha.valueText !== null) return linha.valueText;
  if (linha.valueNum !== null) return Number(linha.valueNum.toString());
  if (linha.valueBool !== null) return linha.valueBool;
  if (linha.valueDate !== null)
    return linha.valueDate.toISOString().slice(0, 10);
  return null;
}

/**
 * A coluna certa para o valor. Exatamente uma preenchida — o banco cobra —, e
 * as outras explicitamente nulas, para que trocar o tipo de uma resposta nunca
 * deixe duas colunas com valor.
 */
export function colunasDoValor(tipo: TipoDeValor, valor: ValorDeEspecificacao) {
  return {
    valueText: tipo === "texto" || tipo === "lista" ? String(valor) : null,
    valueNum: tipo === "numero" ? (valor as number) : null,
    valueBool: tipo === "booleano" ? (valor as boolean) : null,
    valueDate: null,
  };
}

/** Chave estável da especificação: é ela que vai no endereço do filtro. */
export function chaveDaEspecificacao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function respostaDaEspecificacao(
  especificacao: Especificacao,
  extras: { readonly chave: string; readonly produtos?: number },
) {
  return {
    ...especificacao,
    chave: extras.chave,
    produtos: extras.produtos ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export interface OpcoesDasEspecificacoes {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

/** Autor da trilha: só identidade de verdade entra na chave estrangeira. */
function autorDaTrilha(identidadeId: string): string | null {
  return z.string().uuid().safeParse(identidadeId).success
    ? identidadeId
    : null;
}

/** Recusa previsível do domínio, levada até a resposta sem virar erro 500. */
class Recusa extends Error {
  readonly status: number;
  readonly corpo: Record<string, unknown>;

  constructor(status: number, corpo: Record<string, unknown>) {
    super(String(corpo.erro));
    this.status = status;
    this.corpo = corpo;
  }
}

/** O que a trilha de auditoria e a coluna JSON aceitam. */
type ValorJson =
  | string
  | number
  | boolean
  | { readonly [chave: string]: ValorJson | null }
  | readonly (ValorJson | null)[];

/**
 * Converte para JSON puro antes de gravar: `Date` vira texto, `undefined` some
 * e lista somente-leitura vira lista comum — é o que a coluna guarda de fato.
 */
function comoJson(valor: object): ValorJson {
  return JSON.parse(JSON.stringify(valor)) as ValorJson;
}

export function criarRotasDasEspecificacoes(
  opcoes: OpcoesDasEspecificacoes,
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

  /**
   * Resolve a loja pelo apelido, abre a transação como o dono e traduz as
   * recusas do domínio em resposta. Toda rota daqui passa por este caminho.
   */
  async function comoDono<T>(
    requisicao: Request,
    resposta: Response,
    executar: (
      tx: TransacaoDoBanco,
      lojaId: string,
      usuario: UsuarioAutenticado,
    ) => Promise<T>,
    responder: (resultado: T) => void,
  ): Promise<void> {
    const parametros = esquemaDosParametros.safeParse(requisicao.params);
    if (!parametros.success) {
      erro(resposta, 404, "nao_encontrado");
      return;
    }
    const apelido = parametros.data.apelido;
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso.emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return;
    }
    const usuario = resposta.locals.usuario as UsuarioAutenticado;
    try {
      const resultado = await executarComoRequisicao(
        {
          lojaId: identificacao.id,
          usuarioId: usuario.identidadeId,
          papel: usuario.papel,
        },
        () =>
          acesso.emTransacao((tx) => executar(tx, identificacao.id, usuario)),
      );
      responder(resultado);
    } catch (causa) {
      if (causa instanceof Recusa) {
        resposta.status(causa.status).json(causa.corpo);
        return;
      }
      if (causa instanceof ErroDeEspecificacaoInvalida) {
        resposta.status(400).json({
          erro: "especificacao_invalida",
          problemas: causa.problemas.map((problema) => ({
            campo: problema.path.join("."),
            mensagem: problema.message,
          })),
        });
        return;
      }
      if (causa instanceof ErroDeValorDeEspecificacaoInvalido) {
        resposta
          .status(400)
          .json({ erro: "valor_invalido", mensagem: causa.message });
        return;
      }
      throw causa;
    }
  }

  async function exigirCategoria(
    tx: TransacaoDoBanco,
    lojaId: string,
    categoriaId: string,
  ): Promise<void> {
    const achada = await tx.category.count({
      where: { id: categoriaId, storeId: lojaId, deletedAt: null },
    });
    if (achada !== 1) throw new Recusa(404, { erro: "nao_encontrado" });
  }

  /** A versão atual: uma a mais que as mudanças de nome e de remoção. */
  async function versoesDas(
    tx: TransacaoDoBanco,
    lojaId: string,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const eventos = await tx.auditLog.groupBy({
      by: ["entityId"],
      where: {
        storeId: lojaId,
        entity: ENTIDADE_DA_AUDITORIA,
        entityId: { in: [...ids] },
        action: {
          in: [
            ACOES_DA_ESPECIFICACAO.renomeada,
            ACOES_DA_ESPECIFICACAO.removida,
          ],
        },
      },
      _count: { _all: true },
    });
    return new Map(
      eventos.map((evento) => [evento.entityId ?? "", 1 + evento._count._all]),
    );
  }

  /** Quantos produtos vivos têm valor preenchido em cada especificação. */
  async function produtosPreenchidos(
    tx: TransacaoDoBanco,
    lojaId: string,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const valores = await tx.productAttribute.findMany({
      where: { storeId: lojaId, definitionId: { in: [...ids] } },
      select: { definitionId: true, productId: true },
    });
    const vivos = new Set(
      (
        await tx.product.findMany({
          where: {
            storeId: lojaId,
            deletedAt: null,
            id: { in: [...new Set(valores.map((valor) => valor.productId))] },
          },
          select: { id: true },
        })
      ).map((produto) => produto.id),
    );
    const contagem = new Map<string, number>();
    for (const valor of valores) {
      if (!vivos.has(valor.productId)) continue;
      contagem.set(
        valor.definitionId,
        (contagem.get(valor.definitionId) ?? 0) + 1,
      );
    }
    return contagem;
  }

  async function especificacaoDaCategoria(
    tx: TransacaoDoBanco,
    lojaId: string,
    categoriaId: string,
    especificacaoId: string,
  ): Promise<{
    readonly linha: LinhaDaEspecificacao;
    readonly atual: Especificacao;
  }> {
    const linha = await tx.attributeDefinition.findFirst({
      where: {
        id: especificacaoId,
        storeId: lojaId,
        categoryId: categoriaId,
        deprecatedAt: null,
      },
      select: selecaoDaEspecificacao,
    });
    if (linha === null) throw new Recusa(404, { erro: "nao_encontrado" });
    const versao =
      (await versoesDas(tx, lojaId, [linha.id])).get(linha.id) ?? 1;
    return { linha, atual: especificacaoDaLinha(linha, versao) };
  }

  /** O que aconteceu com a especificação, como a trilha de auditoria guarda. */
  interface EventoDaTrilha {
    readonly acao: string;
    readonly especificacaoId: string;
    readonly antes?: VersaoHistoricaDaEspecificacao | Especificacao;
    readonly depois?: Record<string, unknown>;
  }

  async function registrarNaTrilha(
    tx: TransacaoDoBanco,
    lojaId: string,
    usuario: UsuarioAutenticado,
    evento: EventoDaTrilha,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        storeId: lojaId,
        actorId: autorDaTrilha(usuario.identidadeId),
        actorRole: usuario.papel,
        action: evento.acao,
        entity: ENTIDADE_DA_AUDITORIA,
        entityId: evento.especificacaoId,
        ...(evento.antes === undefined
          ? {}
          : { beforeData: comoJson(evento.antes) }),
        ...(evento.depois === undefined
          ? {}
          : { afterData: comoJson(evento.depois) }),
      },
    });
  }

  async function listarDaCategoria(
    tx: TransacaoDoBanco,
    lojaId: string,
    categoriaId: string,
  ) {
    const linhas = await tx.attributeDefinition.findMany({
      where: { storeId: lojaId, categoryId: categoriaId, deprecatedAt: null },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: selecaoDaEspecificacao,
    });
    const ids = linhas.map((linha) => linha.id);
    const versoes = await versoesDas(tx, lojaId, ids);
    const preenchidos = await produtosPreenchidos(tx, lojaId, ids);
    return linhas.map((linha) =>
      respostaDaEspecificacao(
        especificacaoDaLinha(linha, versoes.get(linha.id) ?? 1),
        { chave: linha.key, produtos: preenchidos.get(linha.id) ?? 0 },
      ),
    );
  }

  const BASE = "/:apelido/catalogo/categorias/:categoriaId/especificacoes";

  // ── Listar as especificações da categoria, na ordem do dono (AC-326) ──────
  rotas.get(BASE, async (requisicao, resposta, proximo) => {
    try {
      await comoDono(
        requisicao,
        resposta,
        async (tx, lojaId) => {
          const categoriaId = String(requisicao.params.categoriaId);
          await exigirCategoria(tx, lojaId, categoriaId);
          return listarDaCategoria(tx, lojaId, categoriaId);
        },
        (especificacoes) => resposta.json({ especificacoes }),
      );
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Criar especificação dentro da categoria (AC-325) ─────────────────────
  rotas.post(BASE, async (requisicao, resposta, proximo) => {
    try {
      const entrada = esquemaDaCriacao.safeParse(requisicao.body);
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      const chaveBase = chaveDaEspecificacao(entrada.data.nome);
      if (chaveBase === "") {
        erro(resposta, 400, "nome_sem_chave");
        return;
      }
      await comoDono(
        requisicao,
        resposta,
        async (tx, lojaId, usuario) => {
          const categoriaId = String(requisicao.params.categoriaId);
          await exigirCategoria(tx, lojaId, categoriaId);
          const ultima = await tx.attributeDefinition.findFirst({
            where: {
              storeId: lojaId,
              categoryId: categoriaId,
              deprecatedAt: null,
            },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
          });
          // O domínio valida tipo, unidade e lista antes de qualquer escrita.
          const nova = criarEspecificacao({
            categoriaId,
            nome: entrada.data.nome,
            tipo: entrada.data.tipo,
            unidade: entrada.data.unidade || null,
            obrigatoria: entrada.data.obrigatoria,
            filtravel: entrada.data.filtravel,
            opcoes: entrada.data.opcoes,
            ordem: entrada.data.ordem ?? (ultima?.sortOrder ?? -1) + 1,
          });
          let chave = chaveBase;
          for (
            let sufixo = 2;
            (await tx.attributeDefinition.count({
              where: {
                storeId: lojaId,
                categoryId: categoriaId,
                key: chave,
                deprecatedAt: null,
              },
            })) > 0;
            sufixo += 1
          ) {
            chave = `${chaveBase}-${sufixo}`;
          }
          const criada = await tx.attributeDefinition.create({
            data: {
              storeId: lojaId,
              categoryId: categoriaId,
              key: chave,
              label: nova.nome,
              dataType: TIPO_NO_BANCO[nova.tipo],
              unit: nova.unidade,
              ...(nova.tipo === "lista"
                ? { allowedValues: [...nova.opcoes] }
                : {}),
              isRequired: nova.obrigatoria,
              isFilterable: nova.filtravel,
              sortOrder: nova.ordem,
            },
            select: selecaoDaEspecificacao,
          });
          const registro = especificacaoDaLinha(criada);
          await registrarNaTrilha(tx, lojaId, usuario, {
            acao: ACOES_DA_ESPECIFICACAO.criada,
            especificacaoId: criada.id,
            depois: { ...registro },
          });
          return respostaDaEspecificacao(registro, { chave: criada.key });
        },
        (criada) => resposta.status(201).json(criada),
      );
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Reordenar as especificações da categoria (AC-326) ────────────────────
  rotas.put(BASE, async (requisicao, resposta, proximo) => {
    try {
      const entrada = esquemaDaOrdem.safeParse(requisicao.body);
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      await comoDono(
        requisicao,
        resposta,
        async (tx, lojaId) => {
          const categoriaId = String(requisicao.params.categoriaId);
          await exigirCategoria(tx, lojaId, categoriaId);
          const existentes = await tx.attributeDefinition.count({
            where: {
              storeId: lojaId,
              categoryId: categoriaId,
              deprecatedAt: null,
              id: { in: entrada.data.ids },
            },
          });
          if (existentes !== entrada.data.ids.length) {
            throw new Recusa(400, { erro: "especificacao_fora_da_categoria" });
          }
          for (const [ordem, id] of entrada.data.ids.entries()) {
            await tx.attributeDefinition.update({
              where: { id },
              data: { sortOrder: ordem, updatedAt: new Date() },
            });
          }
          return listarDaCategoria(tx, lojaId, categoriaId);
        },
        (especificacoes) => resposta.json({ especificacoes }),
      );
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Renomear e ajustar, avisando antes quando há produto afetado (AC-330) ─
  rotas.patch(
    `${BASE}/:especificacaoId`,
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaAlteracao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comoDono(
          requisicao,
          resposta,
          async (tx, lojaId, usuario) => {
            const categoriaId = String(requisicao.params.categoriaId);
            const { linha, atual } = await especificacaoDaCategoria(
              tx,
              lojaId,
              categoriaId,
              String(requisicao.params.especificacaoId),
            );
            const novoNome = entrada.data.nome;
            const renomeia = novoNome !== undefined && novoNome !== atual.nome;
            let resultado = atual;

            if (renomeia) {
              const afetados =
                (await produtosPreenchidos(tx, lojaId, [atual.id])).get(
                  atual.id,
                ) ?? 0;
              if (afetados > 0 && entrada.data.confirmado !== true) {
                const aviso = `Renomear ${atual.nome} afetará ${afetados} produto(s). Os valores ficam, e o nome anterior fica no histórico.`;
                throw new Recusa(409, {
                  erro: "confirmacao_necessaria",
                  impacto: {
                    especificacaoId: atual.id,
                    nome: atual.nome,
                    produtosAfetados: afetados,
                    aviso,
                  },
                  aviso,
                });
              }
              const renomeada = renomearEspecificacao(atual, novoNome);
              await registrarNaTrilha(tx, lojaId, usuario, {
                acao: ACOES_DA_ESPECIFICACAO.renomeada,
                especificacaoId: atual.id,
                antes: renomeada.versaoAnterior,
                depois: {
                  nome: renomeada.especificacao.nome,
                  produtosAfetados: afetados,
                },
              });
              resultado = renomeada.especificacao;
            }

            const atualizada = await tx.attributeDefinition.update({
              where: { id: linha.id },
              data: {
                ...(renomeia ? { label: resultado.nome } : {}),
                ...(entrada.data.unidade === undefined
                  ? {}
                  : { unit: entrada.data.unidade || null }),
                ...(entrada.data.obrigatoria === undefined
                  ? {}
                  : { isRequired: entrada.data.obrigatoria }),
                ...(entrada.data.filtravel === undefined
                  ? {}
                  : { isFilterable: entrada.data.filtravel }),
                updatedAt: new Date(),
              },
              select: selecaoDaEspecificacao,
            });
            return respostaDaEspecificacao(
              especificacaoDaLinha(atualizada, resultado.versao),
              { chave: atualizada.key },
            );
          },
          (atualizada) => resposta.json(atualizada),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Acrescentar um valor à lista, sem tirar os anteriores (AC-327) ───────
  rotas.post(
    `${BASE}/:especificacaoId/opcoes`,
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaOpcao.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comoDono(
          requisicao,
          resposta,
          async (tx, lojaId, usuario) => {
            const { linha, atual } = await especificacaoDaCategoria(
              tx,
              lojaId,
              String(requisicao.params.categoriaId),
              String(requisicao.params.especificacaoId),
            );
            const ampliada = acrescentarOpcaoDaLista(atual, entrada.data.valor);
            if (ampliada.opcoes.length !== atual.opcoes.length) {
              await tx.attributeDefinition.update({
                where: { id: linha.id },
                data: {
                  allowedValues: [...ampliada.opcoes],
                  updatedAt: new Date(),
                },
              });
              await registrarNaTrilha(tx, lojaId, usuario, {
                acao: ACOES_DA_ESPECIFICACAO.opcaoAcrescentada,
                especificacaoId: atual.id,
                depois: { opcao: entrada.data.valor.trim() },
              });
            }
            return respostaDaEspecificacao(ampliada, { chave: linha.key });
          },
          (ampliada) => resposta.json(ampliada),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Remover da categoria, avisando antes e sem apagar valor (AC-330) ─────
  rotas.delete(
    `${BASE}/:especificacaoId`,
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaRemocao.safeParse(requisicao.body ?? {});
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comoDono(
          requisicao,
          resposta,
          async (tx, lojaId, usuario) => {
            const { linha, atual } = await especificacaoDaCategoria(
              tx,
              lojaId,
              String(requisicao.params.categoriaId),
              String(requisicao.params.especificacaoId),
            );
            const afetados =
              (await produtosPreenchidos(tx, lojaId, [atual.id])).get(
                atual.id,
              ) ?? 0;
            const impacto = estimarImpactoDaRemocao(atual, afetados);
            if (afetados > 0 && entrada.data.confirmado !== true) {
              throw new Recusa(409, {
                erro: "confirmacao_necessaria",
                impacto,
                aviso: impacto.aviso,
              });
            }
            const agora = new Date();
            const removida = removerEspecificacao(atual, impacto, agora);
            await tx.attributeDefinition.update({
              where: { id: linha.id },
              data: { deprecatedAt: agora, updatedAt: agora },
            });
            await registrarNaTrilha(tx, lojaId, usuario, {
              acao: ACOES_DA_ESPECIFICACAO.removida,
              especificacaoId: atual.id,
              antes: removida.versaoAnterior,
              depois: { produtosAfetados: afetados },
            });
            return { impacto };
          },
          (resultado) => resposta.json(resultado),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── O produto herda as especificações da categoria dele (AC-326) ─────────

  /** A categoria principal do produto vivo, ou recusa 404. */
  async function categoriaDoProduto(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ): Promise<string | null> {
    const produto = await tx.product.findFirst({
      where: { id: produtoId, storeId: lojaId, deletedAt: null },
      select: {
        categorias: {
          where: { isPrimary: true },
          select: { categoryId: true },
        },
      },
    });
    if (produto === null) throw new Recusa(404, { erro: "nao_encontrado" });
    return produto.categorias[0]?.categoryId ?? null;
  }

  async function especificacoesDoProduto(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ) {
    const categoriaId = await categoriaDoProduto(tx, lojaId, produtoId);
    const definicoes =
      categoriaId === null
        ? []
        : await tx.attributeDefinition.findMany({
            where: {
              storeId: lojaId,
              categoryId: categoriaId,
              deprecatedAt: null,
            },
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            select: selecaoDaEspecificacao,
          });
    const linhasDeValor = await tx.productAttribute.findMany({
      where: { storeId: lojaId, productId: produtoId },
      select: {
        id: true,
        definitionId: true,
        valueText: true,
        valueNum: true,
        valueBool: true,
        valueDate: true,
      },
    });
    const valores = Object.fromEntries(
      linhasDeValor.map((linha) => [linha.definitionId, valorDaLinha(linha)]),
    );
    const especificacoes = definicoes.map((linha) =>
      especificacaoDaLinha(linha),
    );
    return {
      categoriaId,
      especificacoes,
      chaves: new Map(definicoes.map((linha) => [linha.id, linha.key])),
      valores,
      linhasDeValor,
    };
  }

  /**
   * O estado das especificações do produto, como o formulário o mostra:
   *
   * - `campos`: as da categoria atual, na ordem do dono, com o valor gravado;
   * - `paraPreencher`: as da categoria atual ainda sem valor (AC-329: depois
   *   de mover, as da categoria nova aparecem para preencher);
   * - `naoUsadas`: os valores GUARDADOS que a categoria atual não usa — de uma
   *   categoria anterior ou de especificação removida —, com o nome e a
   *   categoria de onde vieram. Nada disso é apagado sem o dono confirmar.
   */
  async function estadoDoProduto(
    tx: TransacaoDoBanco,
    lojaId: string,
    produtoId: string,
  ) {
    const atual = await especificacoesDoProduto(tx, lojaId, produtoId);
    const idsDasAtivas = new Set(atual.especificacoes.map((item) => item.id));
    const sobras = atual.linhasDeValor.filter(
      (linha) => !idsDasAtivas.has(linha.definitionId),
    );
    const definicoesDasSobras =
      sobras.length === 0
        ? []
        : await tx.attributeDefinition.findMany({
            where: {
              storeId: lojaId,
              id: { in: sobras.map((linha) => linha.definitionId) },
            },
            select: {
              id: true,
              label: true,
              unit: true,
              categoryId: true,
              deprecatedAt: true,
            },
          });
    const definicaoPorId = new Map(
      definicoesDasSobras.map((definicao) => [definicao.id, definicao]),
    );
    const categorias =
      definicoesDasSobras.length === 0
        ? []
        : await tx.category.findMany({
            where: {
              storeId: lojaId,
              id: {
                in: [...new Set(definicoesDasSobras.map((d) => d.categoryId))],
              },
            },
            select: { id: true, name: true },
          });
    const nomeDaCategoria = new Map(
      categorias.map((categoria) => [categoria.id, categoria.name]),
    );

    // A regra de "usado na categoria atual" é do domínio (mover-categoria).
    const mudanca = moverProdutoDeCategoria({
      categoriaAtualId: atual.categoriaId ?? "",
      valores: atual.linhasDeValor.map((linha) => ({
        id: linha.id,
        produtoId,
        definicaoId: linha.definitionId,
        categoriaId: idsDasAtivas.has(linha.definitionId)
          ? (atual.categoriaId ?? "")
          : (definicaoPorId.get(linha.definitionId)?.categoryId ?? ""),
        valor: valorDaLinha(linha),
      })),
      especificacoesDaNovaCategoria: atual.especificacoes.map((item) => ({
        id: item.id,
        categoriaId: item.categoriaId,
        chave: atual.chaves.get(item.id) ?? "",
        rotulo: item.nome,
        obrigatoria: item.obrigatoria,
      })),
    });

    return {
      produtoId,
      categoriaId: atual.categoriaId,
      campos: herdarEspecificacoesDaCategoria(
        atual.especificacoes,
        atual.categoriaId ?? "",
        atual.valores,
      ).map(({ especificacao, valor }) => ({
        especificacao: respostaDaEspecificacao(especificacao, {
          chave: atual.chaves.get(especificacao.id) ?? "",
        }),
        valor: valor ?? null,
      })),
      paraPreencher: mudanca.especificacoesParaPreencher.map((item) => item.id),
      naoUsadas: mudanca.valoresPreservados
        .filter((valor) => !idsDasAtivas.has(valor.definicaoId))
        .map((valor) => {
          const definicao = definicaoPorId.get(valor.definicaoId);
          return {
            especificacaoId: valor.definicaoId,
            nome: definicao?.label ?? "",
            unidade: definicao?.unit ?? null,
            categoriaId: valor.categoriaId,
            categoriaNome: nomeDaCategoria.get(valor.categoriaId) ?? null,
            valor: valor.valor as ValorDeEspecificacao | null,
            motivo:
              definicao?.deprecatedAt != null || valor.usadoNaCategoriaAtual
                ? ("removida" as const)
                : ("outra_categoria" as const),
          };
        }),
    };
  }

  const DO_PRODUTO = "/:apelido/catalogo/produtos/:produtoId/especificacoes";

  rotas.get(DO_PRODUTO, async (requisicao, resposta, proximo) => {
    try {
      await comoDono(
        requisicao,
        resposta,
        (tx, lojaId) =>
          estadoDoProduto(tx, lojaId, String(requisicao.params.produtoId)),
        (corpo) => resposta.json(corpo),
      );
    } catch (causa) {
      proximo(causa);
    }
  });

  /*
   * DESCARTAR UM VALOR GUARDADO (AC-329: "nada é apagado sem eu confirmar").
   * Só vale para valor que a categoria atual não usa; o valor em uso se limpa
   * pelo preenchimento. Sem confirmação, a resposta diz o que seria apagado e
   * nada muda.
   */
  rotas.delete(
    `${DO_PRODUTO}/:especificacaoId`,
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaRemocao.safeParse(requisicao.body ?? {});
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comoDono(
          requisicao,
          resposta,
          async (tx, lojaId, usuario) => {
            const produtoId = String(requisicao.params.produtoId);
            const especificacaoId = String(requisicao.params.especificacaoId);
            const estado = await estadoDoProduto(tx, lojaId, produtoId);
            const guardado = estado.naoUsadas.find(
              (item) => item.especificacaoId === especificacaoId,
            );
            if (guardado === undefined) {
              const emUso = estado.campos.some(
                (campo) => campo.especificacao.id === especificacaoId,
              );
              throw new Recusa(emUso ? 400 : 404, {
                erro: emUso ? "valor_em_uso" : "nao_encontrado",
              });
            }
            const descricao = `${guardado.nome}${guardado.categoriaNome ? ` (${guardado.categoriaNome})` : ""}: ${String(guardado.valor)}`;
            if (entrada.data.confirmado !== true) {
              throw new Recusa(409, {
                erro: "confirmacao_necessaria",
                aviso: `O valor guardado ${descricao} será apagado deste produto.`,
              });
            }
            await tx.productAttribute.deleteMany({
              where: {
                storeId: lojaId,
                productId: produtoId,
                definitionId: especificacaoId,
              },
            });
            await registrarNaTrilha(tx, lojaId, usuario, {
              acao: ACOES_DA_ESPECIFICACAO.valorDescartado,
              especificacaoId,
              depois: { produtoId, descartado: descricao },
            });
            return estadoDoProduto(tx, lojaId, produtoId);
          },
          (corpo) => resposta.json(corpo),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  /*
   * PREENCHER. O que chega é sobreposto ao que já estava gravado, e o conjunto
   * inteiro passa pela regra do domínio: a obrigatória não fica em branco nem
   * quando o formulário manda só uma parte. Especificação de OUTRA categoria é
   * recusada — valor antigo, de categoria anterior, não se edita por aqui, e
   * não é apagado por aqui.
   */
  rotas.put(DO_PRODUTO, async (requisicao, resposta, proximo) => {
    try {
      const entrada = esquemaDoPreenchimento.safeParse(requisicao.body);
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      await comoDono(
        requisicao,
        resposta,
        async (tx, lojaId) => {
          const produtoId = String(requisicao.params.produtoId);
          const atual = await especificacoesDoProduto(tx, lojaId, produtoId);
          const daCategoria = new Map(
            atual.especificacoes.map((especificacao) => [
              especificacao.id,
              especificacao,
            ]),
          );
          const estranhas = Object.keys(entrada.data.valores).filter(
            (id) => !daCategoria.has(id),
          );
          if (estranhas.length > 0) {
            throw new Recusa(400, {
              erro: "especificacao_fora_da_categoria",
              especificacoes: estranhas,
            });
          }

          const combinados: Record<string, unknown> = {
            ...Object.fromEntries(
              [...daCategoria.keys()].map((id) => [id, atual.valores[id]]),
            ),
            ...entrada.data.valores,
          };
          const conferencia = validarPreenchimentoDoProduto(
            atual.especificacoes,
            combinados,
          );
          if (!conferencia.valido) {
            throw new Recusa(400, {
              erro: "especificacoes_invalidas",
              erros: conferencia.erros,
            });
          }

          for (const [id, valor] of Object.entries(entrada.data.valores)) {
            const especificacao = daCategoria.get(id)!;
            const existente = atual.linhasDeValor.find(
              (linha) => linha.definitionId === id,
            );
            const vazio = valor === null || valor === "";
            if (vazio) {
              if (existente !== undefined) {
                await tx.productAttribute.delete({
                  where: { id: existente.id },
                });
              }
              continue;
            }
            const colunas = colunasDoValor(especificacao.tipo, valor);
            if (existente === undefined) {
              await tx.productAttribute.create({
                data: {
                  storeId: lojaId,
                  productId: produtoId,
                  definitionId: id,
                  ...colunas,
                },
              });
            } else {
              await tx.productAttribute.update({
                where: { id: existente.id },
                data: { ...colunas, updatedAt: new Date() },
              });
            }
          }
          // A versão do catálogo acompanha: filtro da vitrine depende disto.
          await tx.product.update({
            where: { id: produtoId },
            data: { updatedAt: new Date() },
          });
          return estadoDoProduto(tx, lojaId, produtoId);
        },
        (corpo) => resposta.json(corpo),
      );
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}

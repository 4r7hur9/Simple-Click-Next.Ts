/**
 * A visão geral do catálogo para as páginas próprias do painel (card #52):
 * Estoque, Variações e Opções e adicionais leem TODOS os produtos da loja de
 * uma vez, com as variações (preço que vale agora, saldo e aviso de mínimo) e
 * o resumo dos grupos de escolha. Só leitura: cada mudança continua indo pelas
 * rotas do produto (estoque, variações, opções), com as regras delas.
 *
 * Loja grande (card #76): com `?recorte=estoque|variacoes|opcoes` a rota
 * devolve UMA página (busca, filtros, ordem, total e números do topo vêm do
 * banco, em `listagem-do-painel.ts`); sem recorte, a forma antiga, inteira.
 *
 * A permissão é a do catálogo de produtos (`core/equipe-da-loja.ts`).
 */
import { estaAcabando, precoQueVale } from "@simpleclick/core";
import { Router, type Request, type Response } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import {
  banco,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import {
  categoriasDoFiltro,
  esquemaDaConsultaDaGrade,
  esquemaDaConsultaDoEstoque,
  lerConsulta,
  paginaDaGrade,
  paginaDoEstoque,
} from "./listagem-do-painel.ts";
import type {
  ChegadaNaLoja,
  IdentificacaoDaLoja,
  UsuarioAutenticado,
} from "./categorias.routes.ts";

const selecaoDoPreco = {
  kind: true,
  amountCents: true,
  minQuantity: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
} as const;

const selecaoDoProduto = {
  id: true,
  name: true,
  status: true,
  isAvailable: true,
  displayPriceCents: true,
  // A principal; sem marca de principal, a primeira que houver.
  categorias: {
    orderBy: { isPrimary: "desc" as const },
    take: 1,
    select: { categoryId: true, categoria: { select: { name: true } } },
  },
  variacoes: {
    where: { deletedAt: null },
    orderBy: [{ isDefault: "desc" as const }, { sortOrder: "asc" as const }],
    select: {
      id: true,
      name: true,
      sku: true,
      stockQuantity: true,
      stockReserved: true,
      stockMinAlert: true,
      isDefault: true,
      isAvailable: true,
      precos: { select: selecaoDoPreco },
    },
  },
  gruposDeEscolha: {
    where: { grupo: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      grupo: {
        select: {
          id: true,
          name: true,
          kind: true,
          minSelect: true,
          maxSelect: true,
          isVariantAxis: true,
          isActive: true,
          itens: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
            select: { name: true, priceDeltaCents: true, isAvailable: true },
          },
        },
      },
    },
  },
};

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

/**
 * Os produtos na forma da visão geral. `ids` nulo traz a loja toda (na ordem
 * do cardápio); com ids, só eles, na ordem dada.
 */
export async function produtosDaVisao(
  tx: TransacaoDoBanco,
  lojaId: string,
  ids: readonly string[] | null,
  agora: Date,
) {
  if (ids !== null && ids.length === 0) return [];
  const linhas = await tx.product.findMany({
    where: {
      storeId: lojaId,
      deletedAt: null,
      ...(ids === null ? {} : { id: { in: [...ids] } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: selecaoDoProduto,
  });
  const posicao = new Map((ids ?? []).map((id, indice) => [id, indice]));
  if (ids !== null) {
    linhas.sort((a, b) => posicao.get(a.id)! - posicao.get(b.id)!);
  }
  // Na forma que as páginas Estoque, Variações e Opções leem.
  return linhas.map((produto) => {
    const categoria = produto.categorias[0];
    return {
      id: produto.id,
      nome: produto.name,
      status: produto.status,
      disponivel: produto.isAvailable,
      // O preço de vitrine, para o produto que não tem variação.
      precoCentavos:
        produto.displayPriceCents === null
          ? null
          : Number(produto.displayPriceCents),
      categoriaId: categoria?.categoryId ?? null,
      categoriaNome: categoria?.categoria.name ?? null,
      variacoes: produto.variacoes.map((variacao) => ({
        id: variacao.id,
        nome: variacao.name,
        sku: variacao.sku,
        padrao: variacao.isDefault,
        disponivel: variacao.isAvailable,
        precoCentavos: precoQueVale(
          variacao.precos.map((preco) => ({
            tipo: preco.kind,
            valorEmCentavos: Number(preco.amountCents),
            quantidadeMinima: preco.minQuantity,
            ativo: preco.isActive,
            comecaEm: preco.startsAt,
            terminaEm: preco.endsAt,
          })),
          agora,
        ).atualEmCentavos,
        quantidade: variacao.stockQuantity,
        reservado: variacao.stockReserved,
        minimoAlerta: variacao.stockMinAlert,
        estoqueBaixo: estaAcabando(variacao.stockQuantity, variacao.stockMinAlert),
      })),
      grupos: produto.gruposDeEscolha.map(({ grupo }) => ({
        id: grupo.id,
        nome: grupo.name,
        tipo: grupo.kind,
        minimo: grupo.minSelect,
        maximo: grupo.maxSelect,
        eixoDeVariacao: grupo.isVariantAxis,
        ativo: grupo.isActive,
        opcoes: grupo.itens.map((item) => ({
          nome: item.name,
          acrescimoCentavos: Number(item.priceDeltaCents),
          disponivel: item.isAvailable,
        })),
      })),
    };
  });
}

export interface OpcoesDaVisaoGeral {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

export function criarRotasDaVisaoGeral(opcoes: OpcoesDaVisaoGeral): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();

  rotas.get(
    "/:apelido/catalogo/visao-geral",
    async (requisicao, resposta, proximo) => {
      try {
        const usuario = opcoes.autenticar(requisicao);
        if (usuario === null) {
          erro(resposta, 401, "nao_autenticado");
          return;
        }
        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () =>
            acesso.emTransacao(() =>
              opcoes.resolverLoja({ apelido: requisicao.params.apelido }),
            ),
        );
        if (!identificacao.encontrada) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const lojaId = identificacao.id;
        const contexto = {
          lojaId,
          usuarioId: usuario.identidadeId,
          papel: usuario.papel,
        };
        const recorte = requisicao.query.recorte;
        const agora = new Date();

        // Sem recorte: todos os produtos de uma vez (a forma do card #52).
        if (
          recorte !== "estoque" &&
          recorte !== "variacoes" &&
          recorte !== "opcoes"
        ) {
          const produtos = await executarComoRequisicao(contexto, () =>
            acesso.emTransacao((tx) => produtosDaVisao(tx, lojaId, null, agora)),
          );
          resposta.json({ produtos });
          return;
        }

        // Com recorte: uma página, com filtro, ordem e números do banco (#76).
        const query = requisicao.query as Record<string, unknown>;
        const corpo = await executarComoRequisicao(contexto, () =>
          acesso.emTransacao(async (tx) => {
            if (recorte === "estoque") {
              const consulta = lerConsulta(esquemaDaConsultaDoEstoque, query);
              const pagina = await paginaDoEstoque(tx, lojaId, consulta, agora);
              const ids = [...new Set(pagina.linhas.map((l) => l.produtoId))];
              const { linhas, ...resto } = pagina;
              return {
                ...resto,
                linhas,
                produtos: await produtosDaVisao(tx, lojaId, ids, agora),
                categorias: await categoriasDoFiltro(tx, lojaId),
              };
            }
            const consulta = lerConsulta(esquemaDaConsultaDaGrade, query);
            const { ids, ...pagina } = await paginaDaGrade(
              tx,
              lojaId,
              recorte,
              consulta,
            );
            return {
              ...pagina,
              produtos: await produtosDaVisao(tx, lojaId, ids, agora),
              categorias: await categoriasDoFiltro(tx, lojaId),
            };
          }),
        );
        resposta.json(corpo);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

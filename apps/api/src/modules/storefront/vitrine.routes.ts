/**
 * A rota da vitrine pública (AC-400, AC-401, AC-402).
 *
 * ESTA ROTA É A COSTURA. Três peças já existiam e não se falavam, porque a
 * tabela de fronteiras não deixa um módulo importar outro: identificar a loja
 * pelo endereço mora em `storefront`, ler o horário mora em `stores`, e decidir
 * se está aberta mora em `packages/core`. Quem junta é a borda — a única camada
 * que enxerga os dois lados.
 *
 * DUAS TRANSAÇÕES, e não uma. Identificar a loja acontece SEM contexto de loja,
 * porque nesse momento ainda não se sabe qual é; ler a vitrine acontece com a
 * loja declarada, numa transação nova. O contexto é definido uma vez, no início
 * da transação, e não muda mais — é essa regra que impede uma requisição de
 * escorregar de uma loja para outra no meio do caminho.
 */

import { Router, type RequestHandler } from "express";
import type { HorarioDaLoja } from "@simpleclick/core";
import {
  atacadoLigado,
  estoqueLigado,
  esquemaDaBuscaDoCatalogo,
  esquemaDaConsultaDaPagina,
  esquemaDaConsultaDoResumo,
  esquemaDoApelido,
  esquemaDoApelidoEProduto,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { validar } from "../../core/validar.ts";
import { catalogoDaVitrine } from "./catalogo.usecase.ts";
import {
  paginaDoCatalogo,
  produtosNaFaixaDePreco,
  resumoDoCatalogo,
} from "./catalogo-paginado.usecase.ts";
import {
  cruzarAcertos,
  prepararTermo,
  produtosQueCasam,
} from "./busca.usecase.ts";
import { fechamentoDaLoja } from "./fechamento.usecase.ts";
import { horarioPublico } from "./horario-publico.ts";
import { produtoDaVitrine } from "./produto.usecase.ts";
import {
  atacadoDentroDoPedidoMinimo,
  facetaDeAtacado,
  filtrosDaVitrine,
  produtosComAtacado,
  produtosEmEstoque,
  produtosQueCasamComEspecificacoes,
} from "./filtros.usecase.ts";
import { identificarLoja, lojaDaVitrine } from "./resolver-loja.usecase.ts";
import {
  resumoOuZero,
  socialDasLojas,
  socialDosProdutos,
} from "../../core/resumo-social.ts";

/**
 * O que a rota precisa de fora.
 *
 * `lerHorario` chega por parâmetro, e não é importado: quem sabe ler o horário é
 * o módulo da loja, e a tabela de fronteiras não autoriza um módulo a importar
 * outro. Quem junta os dois é `app.ts`, que não pertence a camada nenhuma
 * justamente por ser a borda. Sem essa regra, os módulos viram uma teia em que
 * tudo importa tudo.
 */
export interface OpcoesDaVitrine {
  readonly acesso?: AcessoAoBanco;
  /** O instante, para a prova poder fixar o relógio. */
  readonly agora?: () => Date;
  /** Como obter o horário da loja que já está no contexto. */
  readonly lerHorario: (agora: Date) => Promise<HorarioDaLoja>;
  /** Limite por IP para as três consultas públicas de catálogo. */
  readonly limiteDoCatalogo?: RequestHandler;
}

/** Os filtros do catálogo, como chegam na consulta. */
interface FiltrosDaConsulta {
  readonly busca?: string | undefined;
  readonly categoria?: string | undefined;
  readonly filtro?: string | string[] | undefined;
  readonly atacado?: string | undefined;
  readonly pedidoMinimo?: number | undefined;
  /** `?estoque=1`: só o que não está esgotado (card #108). */
  readonly estoque?: string | undefined;
  /** Faixa de preço em centavos, como TEXTO de dígitos (o contrato valida). */
  readonly precoMin?: string | undefined;
  readonly precoMax?: string | undefined;
}

/**
 * Busca, especificações e atacado viram UMA lista de produtos (ou `undefined`,
 * sem filtro), mais o que a tela mostra ao lado: os filtros oferecidos e a
 * faceta de atacado. Corre na transação da loja. É a mesma conta para o
 * catálogo inteiro, o resumo e a página — e por isso mora num lugar só.
 */
async function aplicarFiltros(
  query: FiltrosDaConsulta,
  agora: Date,
): Promise<{
  acertos: readonly string[] | undefined;
  pelaBusca: boolean;
  filtros: Awaited<ReturnType<typeof filtrosDaVitrine>>;
  atacado: ReturnType<typeof facetaDeAtacado>;
}> {
  const { acertos, pelaBusca, semAtacado, comAtacado } =
    await acertosDosFiltros(query, agora);
  const filtros = await filtrosDaVitrine({ categoria: query.categoria });
  return {
    acertos,
    pelaBusca,
    filtros,
    atacado: facetaDeAtacado(await comAtacado(), semAtacado),
  };
}

/**
 * Só a lista de produtos que passa nos filtros, sem as facetas — é o que a
 * página precisa. A lista de atacado só é lida quando o filtro está ligado
 * ou quando alguém pede a faceta.
 */
async function acertosDosFiltros(query: FiltrosDaConsulta, agora: Date) {
  const termo = prepararTermo(query.busca ?? "");
  const filtrosSelecionados =
    query.filtro === undefined
      ? []
      : Array.isArray(query.filtro)
        ? query.filtro
        : [query.filtro];
  const porTexto = termo === null ? undefined : await produtosQueCasam(termo);
  const porEspecificacao = await produtosQueCasamComEspecificacoes({
    categoria: query.categoria,
    filtros: filtrosSelecionados,
  });
  // Estoque e faixa de preço (card #108) entram DEPOIS da busca de texto de
  // propósito: `cruzarAcertos` mantém a ordem da primeira lista pedida, e a
  // relevância da busca não pode se perder. Como o atacado, ficam no resultado
  // "sem o próprio chip" da faceta de atacado.
  const porEstoque = estoqueLigado(query.estoque)
    ? await produtosEmEstoque()
    : undefined;
  const porFaixa =
    query.precoMin === undefined && query.precoMax === undefined
      ? undefined
      : await produtosNaFaixaDePreco(
          {
            minimo: query.precoMin === undefined ? undefined : Number(query.precoMin),
            maximo: query.precoMax === undefined ? undefined : Number(query.precoMax),
          },
          agora,
        );
  const semAtacado = cruzarAcertos(
    porTexto,
    porEspecificacao,
    porEstoque,
    porFaixa,
  );
  // Atacado (card #59): a faceta conta sobre o resultado SEM o próprio filtro,
  // para o número não sumir ao ligar o chip.
  let lidos: Awaited<ReturnType<typeof produtosComAtacado>> | undefined;
  const comAtacado = async () => (lidos ??= await produtosComAtacado(agora));
  const porAtacado = atacadoLigado(query.atacado)
    ? atacadoDentroDoPedidoMinimo(await comAtacado(), query.pedidoMinimo)
    : undefined;
  return {
    acertos: cruzarAcertos(semAtacado, porAtacado),
    // Com busca, os acertos já vêm na ordem de relevância (card #75): a
    // ordem "relevancia" da página e do resumo passa a ser essa.
    pelaBusca: porTexto !== undefined,
    semAtacado,
    comAtacado,
  };
}

export function criarRotasDaVitrine(opcoes: OpcoesDaVitrine): Router {
  const rotas = Router();
  // O esquema vem do CONTRATO, e não é reescrito aqui: o documento publicado e
  // a validação de borda precisam dizer a mesma coisa, senão o aplicativo
  // nativo gera cliente com uma regra e a API cobra outra.
  const borda = validar({ params: esquemaDoApelido });

  rotas.get("/:apelido", borda, async (req, res, proximo) => {
    try {
      const { params } = borda.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const agora = opcoes.agora?.() ?? new Date();

      // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () => acesso.emTransacao(() => identificarLoja(params)),
      );

      if (!identificacao.encontrada) {
        // Inexistente e suspensa saem pela MESMA porta, com a mesma resposta
        // (AC-402). Distinguir contaria a quem perguntasse que aquele
        // endereço já existiu e foi suspenso.
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      // PASSO 2 — transação nova, com a loja declarada desde o início.
      const vitrine = await executarComoRequisicao(
        { papel: "PUBLIC", lojaId: identificacao.id },
        () =>
          acesso.emTransacao(async () => {
            const horario = await opcoes.lerHorario(agora);
            const doBanco = await lojaDaVitrine(agora, horario);
            if (doBanco === null) return null;
            // Curtidas e comentários na loja (card #47), sem o "curtiu": a
            // vitrine é pública.
            const chave = params.apelido.toLowerCase();
            const { curtidas, comentarios } = resumoOuZero(
              await socialDasLojas([chave]),
              chave,
            );
            return { ...doBanco, horario, curtidas, comentarios };
          }),
      );

      if (vitrine === null) {
        // A política pública é a segunda trava: ela recusa a loja que não
        // estiver ativa mesmo que a resolução tenha deixado passar.
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      res.json({
        loja: {
          ...vitrine.publica,
          curtidas: vitrine.curtidas,
          comentarios: vitrine.comentarios,
        },
        abertura: vitrine.abertura,
        horario: horarioPublico(vitrine.horario),
        // O cadastro dos banners ainda não existe: a lista sai vazia, e a
        // vitrine esconde a seção. O campo já está no contrato para o cliente
        // nativo e o site não precisarem mudar quando ele chegar.
        banners: [],
      });
    } catch (erro) {
      proximo(erro);
    }
  });

  /*
   * O CATÁLOGO TEM ENDEREÇO PRÓPRIO, e não vem junto da apresentação.
   *
   * São duas telas com necessidades diferentes: a apresentação da loja mostra
   * nome, horário e boas-vindas, e é a primeira coisa que carrega; a vitrine
   * mostra o catálogo inteiro. Servir os dois juntos faria quem só quer saber
   * se a loja está aberta baixar o cardápio completo.
   *
   * Separados, as duas telas podem pedir em paralelo o que cada uma precisa — e
   * a apresentação continua respondendo no prazo que o AC-415 cobra mesmo em
   * loja com catálogo grande.
   */
  const bordaDoCatalogo = validar({
    params: esquemaDoApelido,
    query: esquemaDaBuscaDoCatalogo,
  });

  rotas.get(
    "/:apelido/catalogo",
    bordaDoCatalogo,
    ...(opcoes.limiteDoCatalogo === undefined
      ? []
      : [opcoes.limiteDoCatalogo]),
    async (req, res, proximo) => {
      try {
        const { params, query } = bordaDoCatalogo.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const agora = opcoes.agora?.() ?? new Date();
        // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () => acesso.emTransacao(() => identificarLoja(params)),
        );

        if (!identificacao.encontrada) {
          throw erroDeDominio("nao_encontrado", { recurso: "loja" });
        }

        // PASSO 2 — transação nova, com a loja declarada desde o início.
        const catalogo = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId: identificacao.id },
          () =>
            acesso.emTransacao(async () => {
              const { acertos, filtros, atacado } = await aplicarFiltros(
                query,
                agora,
              );
              const resultado = await catalogoDaVitrine(
                identificacao.versaoDoCatalogo,
                { apenasProdutos: acertos },
                agora,
              );
              return { ...resultado, filtros, atacado };
            }),
        );

        res.json(catalogo);
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  /*
   * O CATÁLOGO EM PEDAÇOS (card #74). O catálogo inteiro acima continua para
   * quem precisa dele todo (cardápio na TV, mapa do site); a vitrine pede o
   * resumo e as páginas. Loja de dez mil produtos responde em quilobytes.
   */
  const bordaDoResumo = validar({
    params: esquemaDoApelido,
    query: esquemaDaConsultaDoResumo,
  });

  rotas.get(
    "/:apelido/catalogo/resumo",
    bordaDoResumo,
    ...(opcoes.limiteDoCatalogo === undefined
      ? []
      : [opcoes.limiteDoCatalogo]),
    async (req, res, proximo) => {
      try {
        const { params, query } = bordaDoResumo.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const agora = opcoes.agora?.() ?? new Date();

        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () => acesso.emTransacao(() => identificarLoja(params)),
        );
        if (!identificacao.encontrada) {
          throw erroDeDominio("nao_encontrado", { recurso: "loja" });
        }

        const resumo = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId: identificacao.id },
          () =>
            acesso.emTransacao(async () => {
              const { acertos, pelaBusca, filtros, atacado } =
                await aplicarFiltros(query, agora);
              const lido = await resumoDoCatalogo(
                {
                  apenasProdutos: acertos,
                  ordenarPelosAcertos: pelaBusca,
                  porSecao: query.porSecao,
                  totalMaximo: query.totalMaximo,
                },
                agora,
              );
              return {
                versao: identificacao.versaoDoCatalogo,
                ...lido,
                filtros,
                atacado,
              };
            }),
        );

        res.json(resumo);
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  const bordaDaPagina = validar({
    params: esquemaDoApelido,
    query: esquemaDaConsultaDaPagina,
  });

  rotas.get(
    "/:apelido/catalogo/produtos",
    bordaDaPagina,
    ...(opcoes.limiteDoCatalogo === undefined
      ? []
      : [opcoes.limiteDoCatalogo]),
    async (req, res, proximo) => {
      try {
        const { params, query } = bordaDaPagina.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const agora = opcoes.agora?.() ?? new Date();

        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () => acesso.emTransacao(() => identificarLoja(params)),
        );
        if (!identificacao.encontrada) {
          throw erroDeDominio("nao_encontrado", { recurso: "loja" });
        }

        const pagina = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId: identificacao.id },
          () =>
            acesso.emTransacao(async () => {
              const { acertos, pelaBusca } = await acertosDosFiltros(
                query,
                agora,
              );
              const lida = await paginaDoCatalogo(
                {
                  apenasProdutos: acertos,
                  ordenarPelosAcertos: pelaBusca,
                  categoria: query.categoria,
                  ordem: query.ordem,
                  cursor: query.cursor,
                  limite: query.limite,
                },
                agora,
              );
              return { versao: identificacao.versaoDoCatalogo, ...lida };
            }),
        );

        res.json(pagina);
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  /*
   * A PÁGINA DE UM PRODUTO tem endereço próprio pelo mesmo motivo do catálogo,
   * e com o peso invertido: aqui vem MUITO dado de UM produto — todas as
   * imagens, a descrição inteira, os grupos de escolha e as variantes.
   *
   * Servir isso dentro do catálogo faria quem abre a vitrine baixar sessenta
   * descrições e trezentas opções para ver sessenta cartões, que é o peso que o
   * AC-415 cobra que não exista.
   */
  const bordaDoProduto = validar({ params: esquemaDoApelidoEProduto });

  rotas.get(
    "/:apelido/produto/:produtoId",
    bordaDoProduto,
    async (req, res, proximo) => {
      try {
        const { params } = bordaDoProduto.dados(req);
        const acesso = opcoes.acesso ?? banco();
        const agora = opcoes.agora?.() ?? new Date();

        // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
        const identificacao = await executarComoRequisicao(
          { papel: "PUBLIC" },
          () => acesso.emTransacao(() => identificarLoja(params)),
        );

        if (!identificacao.encontrada) {
          throw erroDeDominio("nao_encontrado", { recurso: "loja" });
        }

        // PASSO 2 — transação nova, com a loja declarada desde o início.
        const produto = await executarComoRequisicao(
          { papel: "PUBLIC", lojaId: identificacao.id },
          () =>
            acesso.emTransacao(async () => {
              const lido = await produtoDaVitrine(params.produtoId, agora);
              if (lido === null) return null;
              // Curtidas e comentários aprovados (card #47), sem o "curtiu".
              const { curtidas, comentarios } = resumoOuZero(
                await socialDosProdutos([lido.id]),
                lido.id,
              );
              return { ...lido, curtidas, comentarios };
            }),
        );

        if (produto === null) {
          // Produto inexistente, em rascunho e de outra loja saem pela MESMA
          // porta, e com o mesmo corpo de loja inexistente. Distinguir contaria
          // a quem perguntasse o que existe atrás do que não está publicado —
          // e um identificador que responde "existe mas não é seu" é um mapa do
          // catálogo do concorrente.
          throw erroDeDominio("nao_encontrado", { recurso: "produto" });
        }

        res.json(produto);
      } catch (erro) {
        proximo(erro);
      }
    },
  );

  /*
   * O FECHAMENTO TEM ENDEREÇO PRÓPRIO PORQUE CARREGA A CHAVE PIX.
   *
   * Juntá-lo à apresentação entregaria a chave a todo mundo que abrisse a
   * página da loja — que é exatamente o que o AC-904 proíbe. Ninguém que só
   * quer ver o cardápio precisa saber a forma de pagamento, e quem chegou ao
   * fechamento precisa da chave para pagar (AC-510). São momentos diferentes,
   * e por isso são rotas diferentes.
   */
  rotas.get("/:apelido/fechamento", borda, async (req, res, proximo) => {
    try {
      const { params } = borda.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const agora = opcoes.agora?.() ?? new Date();

      // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () => acesso.emTransacao(() => identificarLoja(params)),
      );

      if (!identificacao.encontrada) {
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      // PASSO 2 — transação nova, com a loja declarada desde o início.
      const fechamento = await executarComoRequisicao(
        { papel: "PUBLIC", lojaId: identificacao.id },
        () =>
          acesso.emTransacao(async () => {
            // As formas de ENTREGA vêm da loja, e não da configuração: é a
            // coluna que o resto do sistema já usa, e duas fontes para a mesma
            // pergunta divergem no dia em que uma for editada.
            const vitrine = await lojaDaVitrine(
              agora,
              await opcoes.lerHorario(agora),
            );
            if (vitrine === null) return null;
            return fechamentoDaLoja(vitrine.publica.formasDeEntrega);
          }),
      );

      if (fechamento === null) {
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      res.json(fechamento);
    } catch (erro) {
      proximo(erro);
    }
  });

  return rotas;
}

/** Onde as rotas da vitrine ficam montadas. */
export const PREFIXO_DA_VITRINE = "/v1/vitrine";

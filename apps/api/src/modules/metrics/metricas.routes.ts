/**
 * As rotas das métricas do dono (T-800 a T-808):
 *
 *   GET /v1/lojas/:apelido/metricas            o painel de um período
 *   GET /v1/lojas/:apelido/metricas/exportar   o mesmo período, em planilha
 *
 * A ORDEM DAS PORTAS É FIXA: sessão de dono (401), loja pelo apelido (404),
 * vínculo desta identidade com a loja (404), período que faz sentido (400) —
 * e só então a transação faz a conta. A loja vem do apelido e vai para o
 * contexto; nenhum parâmetro a substitui, e a borda de validação recusa
 * qualquer chave que a rota não declarou (AC-811).
 *
 * O VÍNCULO NÃO É CONFERIDO AQUI. Quem pergunta "esta pessoa é desta loja?" é
 * `core/db.ts` (regra 7, dívida 92), uma vez, ao abrir a transação com o
 * papel do dono — o mesmo caminho de toda rota do painel. Dono da loja A
 * pedindo as métricas da loja B sai por "não encontrado", a mesma porta do
 * apelido que não existe: responder diferente contaria a quem tenta que a
 * loja existe e é de outra pessoa.
 *
 * O FUSO DA LOJA VEM DE FORA. Ler a loja é do módulo da vitrine
 * (`storefront/fuso-da-loja.ts`), e a tabela de fronteiras não deixa um
 * módulo importar o outro: `app.ts` passa a função pronta, como faz com o
 * horário da vitrine.
 */
import { Router, type Request, type Response } from "express";

import { cache as cacheDaAplicacao, type Cache } from "../../core/cache.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { validar } from "../../core/validar.ts";
import { lembrarMetricas } from "./cache.ts";
import { marcaDaguaDosPedidos } from "./consultas.ts";
import { exportarPedidosDoPeriodo, nomeDoArquivo } from "./exportar.usecase.ts";
import { calcularMetricas } from "./metricas.usecase.ts";
import {
  esquemaDaConsultaDeExportacao,
  esquemaDaConsultaDeMetricas,
  esquemaDoApelidoNaRota,
} from "./metrics.schema.ts";
import {
  fusoOuPadrao,
  resolverPeriodo,
  type PedidoDePeriodo,
  type PeriodoResolvido,
} from "./periodo.ts";

interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER";
}

export interface OpcoesDasMetricas {
  readonly acesso?: AcessoAoBanco;
  /** O cache das métricas. A prova troca por um em memória. */
  readonly cache?: Cache;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /**
   * O fuso da loja do contexto (`stores.timezone`), lido dentro da transação
   * dela. É o que decide o que é "hoje" (ASM-800) — nunca o relógio do servidor.
   */
  readonly lerFusoDaLoja: () => Promise<string | null>;
  /** O relógio. A prova trava o "hoje" da loja com ele. */
  readonly agora?: () => Date;
}

/** Recusa de período, no formato que o contrato promete (AC-805). */
class ErroDePeriodoInvalido extends Error {
  readonly explicacao: string;

  constructor(explicacao: string) {
    super(explicacao);
    this.name = "ErroDePeriodoInvalido";
    this.explicacao = explicacao;
  }
}

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

const bordaDasMetricas = validar({
  params: esquemaDoApelidoNaRota,
  query: esquemaDaConsultaDeMetricas,
});
const bordaDaExportacao = validar({
  params: esquemaDoApelidoNaRota,
  query: esquemaDaConsultaDeExportacao,
});

export function criarRotasDasMetricas(opcoes: OpcoesDasMetricas): Router {
  const rotas = Router();
  // Preguiçosos: montar a aplicação não pode exigir banco nem cache no ar.
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const cache = (): Cache => opcoes.cache ?? cacheDaAplicacao();
  const agora = opcoes.agora ?? (() => new Date());

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = opcoes.autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  });

  async function identificar(apelido: string): Promise<IdentificacaoDaLoja> {
    return executarComoRequisicao({ papel: "PUBLIC" }, () =>
      acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
  }

  /** Resolve o período no fuso da loja e roda `executar` na transação dela. */
  function naLojaDoDono<T>(
    lojaId: string,
    usuario: UsuarioAutenticado,
    pedido: PedidoDePeriodo,
    executar: (periodo: PeriodoResolvido, instante: Date) => Promise<T>,
  ): Promise<T> {
    return executarComoRequisicao(
      { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
      () =>
        acesso().emTransacao(async () => {
          const instante = agora();
          const fuso = fusoOuPadrao(await opcoes.lerFusoDaLoja());
          const resultado = resolverPeriodo(pedido, instante, fuso);
          if (!resultado.ok)
            throw new ErroDePeriodoInvalido(resultado.explicacao);
          return executar(resultado.periodo, instante);
        }),
    );
  }

  function responderRecusa(causa: unknown, resposta: Response): boolean {
    if (causa instanceof ErroDePeriodoInvalido) {
      resposta
        .status(400)
        .json({ erro: "periodo_invalido", explicacao: causa.explicacao });
      return true;
    }
    return false;
  }

  rotas.get(
    "/:apelido/metricas",
    bordaDasMetricas,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, query } = bordaDasMetricas.dados(requisicao);
        const identificacao = await identificar(params.apelido);
        // A MESMA resposta do vínculo recusado em `core/db.ts`: apelido que
        // não existe e loja de outro dono saem pela mesma porta, com o mesmo
        // corpo, e quem tenta não distingue um do outro.
        if (!identificacao.encontrada) throw erroDeDominio("nao_encontrado");
        const usuario = resposta.locals.usuario as UsuarioAutenticado;

        const lembradas = await naLojaDoDono(
          identificacao.id,
          usuario,
          { atalho: query.periodo, de: query.de, ate: query.ate },
          async (periodo, instante) => {
            const marca = await marcaDaguaDosPedidos(identificacao.id);
            return lembrarMetricas(
              cache(),
              {
                lojaId: identificacao.id,
                periodo,
                marca,
                atualizar: query.atualizar !== undefined,
              },
              () => calcularMetricas(periodo, instante),
            );
          },
        );

        // O cache que vale é o da API, com horário de referência; o do
        // navegador esconderia o "atualizar agora".
        resposta.set("cache-control", "no-store");
        resposta.json({
          loja: { apelido: params.apelido },
          ...lembradas.metricas,
          deCache: lembradas.deCache,
        });
      } catch (causa) {
        if (!responderRecusa(causa, resposta)) proximo(causa);
      }
    },
  );

  rotas.get(
    "/:apelido/metricas/exportar",
    bordaDaExportacao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, query } = bordaDaExportacao.dados(requisicao);
        const identificacao = await identificar(params.apelido);
        if (!identificacao.encontrada) throw erroDeDominio("nao_encontrado");
        const usuario = resposta.locals.usuario as UsuarioAutenticado;

        const exportacao = await naLojaDoDono(
          identificacao.id,
          usuario,
          { atalho: query.periodo, de: query.de, ate: query.ate },
          async (periodo, instante) => ({
            ...(await exportarPedidosDoPeriodo(periodo, instante)),
            arquivo: nomeDoArquivo(params.apelido, periodo),
          }),
        );

        resposta.set("cache-control", "no-store");
        resposta.set("content-type", "text/csv; charset=utf-8");
        resposta.set(
          "content-disposition",
          `attachment; filename="${exportacao.arquivo}"`,
        );
        resposta.set("x-quantidade-de-pedidos", String(exportacao.quantidade));
        resposta.send(exportacao.csv);
      } catch (causa) {
        if (!responderRecusa(causa, resposta)) proximo(causa);
      }
    },
  );

  return rotas;
}

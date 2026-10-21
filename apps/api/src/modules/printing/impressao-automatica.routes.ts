/**
 * As rotas da impressão automática (T-608 — AC-622..AC-626): o agente de
 * impressão e o painel do dono.
 *
 * UM ROTEADOR PRÓPRIO, montado numa linha só em `app.ts`, para que o portão de
 * funcionalidade por loja (T-207) entre também numa linha — e para que o resto
 * da API não precise saber que existe um agente.
 *
 * Duas portas, com credenciais que nunca se misturam:
 *
 * - **O agente** (`/v1/impressao/agente/...`) se apresenta com a credencial
 *   que recebeu no pareamento, no cabeçalho `Authorization: Bearer`. A API
 *   resume a credencial, pergunta ao banco de qual agente e de qual loja ela
 *   é, e só então abre a transação com a loja e o papel `PRINT_AGENT`. O
 *   token do dono não abre nada aqui, e a credencial do agente não abre nada
 *   fora daqui.
 * - **O dono** (`/v1/lojas/:apelido/impressao/...`) entra como em todo o
 *   painel: sessão de dono, loja pelo apelido, vínculo conferido pelo núcleo
 *   (`core/db.ts`, regra 7).
 *
 * O pareamento é a única porta sem credencial nenhuma — o agente ainda não é
 * ninguém —, e por isso tem dois limites de tentativas: o do banco, que fecha
 * o código depois de poucos erros, e o da borda, por loja e por origem, no
 * Redis. Se o Redis não responder, a porta FECHA (503): sem contagem, o código
 * de seis dígitos ficaria aberto à força bruta.
 *
 * Toda resposta passa pelo esquema do contrato que o agente e o painel leem.
 */
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";

import {
  esquemaDaFalhaDeImpressao,
  esquemaDoAgentePareado,
  esquemaDoCodigoDePareamento,
  esquemaDoEstadoDaImpressaoAutomatica,
  esquemaDoPedidoDePareamento,
  esquemaDosTrabalhosPendentes,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import {
  limitarTentativas,
  limiteDaRequisicao,
  type CacheDoLimite,
  type RegraDeLimite,
} from "../../core/limite.ts";
import { descreverErro, registrar } from "../../core/log.ts";
import {
  confirmarPeloAgente,
  entregarTrabalhosAoAgente,
  registrarFalhaPeloAgente,
} from "./entregar.usecase.ts";
import { estadoDaImpressaoAutomatica } from "./estado-do-agente.usecase.ts";
import { listarPendentes, type OpcoesDaReivindicacao } from "./fila.usecase.ts";
import {
  gerarCodigoDePareamento,
  identificarAgente,
  parearAgente,
  type OpcoesDaGeracao,
} from "./parear.usecase.ts";
import type { LerConfiguracaoDoCupom } from "./pedido-para-cupom.ts";

interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

/** Os limites da porta do pareamento. Tudo tem padrão; a prova encurta. */
export interface LimitesDoPareamento {
  /** Por loja (o apelido que o agente mandou): o ataque concentrado. */
  readonly porLoja?: RegraDeLimite;
  /** Por origem: o ataque espalhado entre lojas. */
  readonly porOrigem?: RegraDeLimite;
  readonly proxiesConfiaveis?: number;
  /** De onde sai o instante do limite. Padrão: o relógio do sistema. */
  readonly agora?: () => number;
}

export interface OpcoesDaImpressaoAutomatica {
  readonly acesso?: AcessoAoBanco;
  readonly autenticarDono: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /** Vem do módulo da loja, pela borda: um módulo não importa o outro. */
  readonly lerConfiguracaoDoCupom: LerConfiguracaoDoCupom;
  /** Onde o limite de tentativas do pareamento conta (Redis). */
  readonly cacheDoLimite: CacheDoLimite;
  readonly limitesDoPareamento?: LimitesDoPareamento;
  /** Ajustes da reivindicação (a prova encurta o prazo de posse). */
  readonly reivindicacao?: OpcoesDaReivindicacao;
  /** Ajustes da geração do código (a prova escolhe o código). */
  readonly geracao?: OpcoesDaGeracao;
}

/**
 * Dez códigos errados por loja em quinze minutos, e a loja espera quinze
 * minutos — dobrando a cada bloqueio, até seis horas. Junto com o fechamento
 * do código no banco (cinco erros), adivinhar seis dígitos deixa de ser
 * questão de tempo.
 */
export const LIMITE_DO_PAREAMENTO_POR_LOJA: RegraDeLimite = {
  limite: 10,
  janelaMs: 15 * 60_000,
  esperaBaseMs: 15 * 60_000,
  esperaMaximaMs: 6 * 60 * 60_000,
};

/** Vinte tentativas por origem na mesma janela, contra quem varre várias lojas. */
export const LIMITE_DO_PAREAMENTO_POR_ORIGEM: RegraDeLimite = {
  limite: 20,
  janelaMs: 15 * 60_000,
  esperaBaseMs: 15 * 60_000,
  esperaMaximaMs: 6 * 60 * 60_000,
};

/** A recusa do pareamento: igual para código errado, vencido, esgotado e loja que não existe. */
export const RECUSA_DO_PAREAMENTO = "codigo_invalido";

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

/** O trabalho pedido na rota. Formato errado é trabalho que não existe. */
const esquemaDoTrabalhoNaRota = z.object({ id: z.uuid() });

/** A credencial do cabeçalho `Authorization: Bearer <credencial>`. */
function credencialDoCabecalho(cabecalho: string | undefined): string | null {
  const achado = /^Bearer\s+(\S+)\s*$/i.exec(cabecalho?.trim() ?? "");
  return achado?.[1] ?? null;
}

/**
 * O limitador, com a falha FECHADA: o limitador entrega a falha do Redis ao
 * próximo passo como erro, e aqui ela vira 503 — em vez de seguir sem
 * contagem, ou de virar um 500 que não diz nada a quem está instalando o
 * agente.
 */
function limitarFechando(limitador: RequestHandler): RequestHandler {
  return (requisicao, resposta, proximo) => {
    limitador(requisicao, resposta, ((causa?: unknown) => {
      if (causa === undefined) {
        proximo();
        return;
      }
      registrar.erro("impressao.pareamento_sem_limite", {
        erro: descreverErro(causa),
      });
      erro(resposta, 503, "indisponivel");
    }) as NextFunction);
  };
}

/** O desfecho do pareamento no limitador: nunca derruba a resposta. */
async function contarNoLimite(
  requisicao: Request,
  deuCerto: boolean,
): Promise<void> {
  try {
    const limite = limiteDaRequisicao(requisicao);
    if (deuCerto) await limite.registrarSucesso();
    else await limite.registrarFalha();
  } catch (causa) {
    // O pareamento já aconteceu (ou já foi recusado e contado no banco); o
    // Redis que caiu agora não pode fazer o agente perder a credencial.
    registrar.erro("impressao.pareamento_contagem_perdida", {
      erro: descreverErro(causa),
    });
  }
}

export function criarRotasDaImpressaoAutomatica(
  opcoes: OpcoesDaImpressaoAutomatica,
): Router {
  const rotas = Router();
  // Preguiçoso: montar a aplicação não pode exigir banco configurado (AC-001).
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const limites = opcoes.limitesDoPareamento ?? {};

  const limitador = limitarFechando(
    limitarTentativas({
      cache: opcoes.cacheDoLimite,
      prefixo: "sc:limite:pareamento-agente",
      porConta: {
        ...(limites.porLoja ?? LIMITE_DO_PAREAMENTO_POR_LOJA),
        identificar: (requisicao) => {
          const apelido = (requisicao.body as { apelido?: unknown } | undefined)
            ?.apelido;
          return typeof apelido === "string"
            ? apelido.trim().toLowerCase()
            : undefined;
        },
      },
      porOrigem: limites.porOrigem ?? LIMITE_DO_PAREAMENTO_POR_ORIGEM,
      ...(limites.proxiesConfiaveis === undefined
        ? {}
        : { proxiesConfiaveis: limites.proxiesConfiaveis }),
      ...(limites.agora === undefined ? {} : { agora: limites.agora }),
    }),
  );

  // -------------------------------------------------------------------------
  // O agente
  // -------------------------------------------------------------------------

  /**
   * Roda `acao` como o agente da credencial apresentada: a loja e o agente
   * vêm do banco, e a transação abre com o papel `PRINT_AGENT`. Credencial
   * ausente, desconhecida ou revogada responde 401 sem tocar em nada.
   */
  async function comoAgente<T>(
    requisicao: Request,
    resposta: Response,
    acao: (agenteId: string) => Promise<T>,
  ): Promise<{ readonly feito: true; readonly valor: T } | { feito: false }> {
    const credencial = credencialDoCabecalho(requisicao.headers.authorization);
    if (credencial === null) {
      erro(resposta, 401, "nao_autenticado");
      return { feito: false };
    }
    const agente = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
      acesso().emTransacao(() => identificarAgente(credencial)),
    );
    if (agente === null) {
      erro(resposta, 401, "nao_autenticado");
      return { feito: false };
    }
    const valor = await executarComoRequisicao(
      { lojaId: agente.lojaId, papel: "PRINT_AGENT" },
      () => acesso().emTransacao(() => acao(agente.agenteId)),
    );
    return { feito: true, valor };
  }

  rotas.post(
    "/impressao/agente/pareamento",
    async (requisicao, resposta, proximo) => {
      // A forma é conferida ANTES do limitador: corpo malformado não é
      // tentativa de código, e não deve gastar a cota de ninguém.
      const entrada = esquemaDoPedidoDePareamento.safeParse(requisicao.body);
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      resposta.locals.pedidoDePareamento = entrada.data;
      proximo();
    },
    limitador,
    async (requisicao, resposta, proximo) => {
      try {
        const pedido = resposta.locals.pedidoDePareamento as z.infer<
          typeof esquemaDoPedidoDePareamento
        >;
        const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
          acesso().emTransacao(() =>
            opcoes.resolverLoja({ apelido: pedido.apelido }),
          ),
        );

        const resultado = loja.encontrada
          ? await executarComoRequisicao(
              { lojaId: loja.id, papel: "PUBLIC" },
              () =>
                acesso().emTransacao(() =>
                  parearAgente({ codigo: pedido.codigo, nome: pedido.nome }),
                ),
            )
          : ({ ok: false, motivo: "sem_codigo" } as const);

        await contarNoLimite(requisicao, resultado.ok);
        resposta.setHeader("cache-control", "no-store");
        if (!resultado.ok) {
          erro(resposta, 401, RECUSA_DO_PAREAMENTO);
          return;
        }
        registrar.info("impressao.agente_pareado", {
          ...(loja.encontrada ? { lojaId: loja.id } : {}),
          recurso: "agente_de_impressao",
          recursoId: resultado.agente.id,
        });
        resposta.status(201).json(
          esquemaDoAgentePareado.parse({
            credencial: resultado.credencial,
            agente: resultado.agente,
            loja: resultado.loja,
          }),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/impressao/agente/trabalhos",
    async (requisicao, resposta, proximo) => {
      try {
        const feito = await comoAgente(requisicao, resposta, (agenteId) =>
          entregarTrabalhosAoAgente(
            agenteId,
            opcoes.lerConfiguracaoDoCupom,
            opcoes.reivindicacao,
          ),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta.json(feito.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/impressao/agente/trabalhos/:id/confirmacao",
    async (requisicao, resposta, proximo) => {
      try {
        const trabalho = esquemaDoTrabalhoNaRota.safeParse(requisicao.params);
        if (!trabalho.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const feito = await comoAgente(requisicao, resposta, (agenteId) =>
          confirmarPeloAgente(agenteId, trabalho.data.id),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta.json(feito.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/impressao/agente/trabalhos/:id/falha",
    async (requisicao, resposta, proximo) => {
      try {
        const trabalho = esquemaDoTrabalhoNaRota.safeParse(requisicao.params);
        if (!trabalho.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const falha = esquemaDaFalhaDeImpressao.safeParse(requisicao.body);
        if (!falha.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const feito = await comoAgente(requisicao, resposta, (agenteId) =>
          registrarFalhaPeloAgente(
            agenteId,
            trabalho.data.id,
            falha.data.motivo,
          ),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta.json(feito.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // -------------------------------------------------------------------------
  // O dono
  // -------------------------------------------------------------------------

  /**
   * Roda `acao` como o dono, na loja do apelido. Sem sessão de dono, 401;
   * loja que não existe (ou de que ele não é membro, pelo núcleo), 404.
   */
  async function comoDono<T>(
    requisicao: Request,
    resposta: Response,
    acao: () => Promise<T>,
  ): Promise<{ readonly feito: true; readonly valor: T } | { feito: false }> {
    const usuario = opcoes.autenticarDono(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return { feito: false };
    }
    const apelido = String(requisicao.params.apelido ?? "");
    const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
      acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!loja.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return { feito: false };
    }
    const valor = await executarComoRequisicao(
      {
        lojaId: loja.id,
        usuarioId: usuario.identidadeId,
        papel: usuario.papel,
      },
      () => acesso().emTransacao(acao),
    );
    return { feito: true, valor };
  }

  rotas.post(
    "/lojas/:apelido/impressao/pareamento",
    async (requisicao, resposta, proximo) => {
      try {
        const feito = await comoDono(requisicao, resposta, () =>
          gerarCodigoDePareamento(opcoes.geracao),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta
          .status(201)
          .json(esquemaDoCodigoDePareamento.parse(feito.valor));
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/lojas/:apelido/impressao/estado",
    async (requisicao, resposta, proximo) => {
      try {
        const feito = await comoDono(requisicao, resposta, () =>
          estadoDaImpressaoAutomatica(),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta.json(esquemaDoEstadoDaImpressaoAutomatica.parse(feito.valor));
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/lojas/:apelido/impressao/pendentes",
    async (requisicao, resposta, proximo) => {
      try {
        const feito = await comoDono(requisicao, resposta, () =>
          listarPendentes(),
        );
        if (!feito.feito) return;
        resposta.setHeader("cache-control", "no-store");
        resposta.json(
          esquemaDosTrabalhosPendentes.parse({ trabalhos: feito.valor }),
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}

/**
 * Verificações de saúde: VIVO e PRONTO são coisas diferentes (AC-023).
 *
 * A distinção não é preciosismo de nomenclatura — é o que decide se o
 * orquestrador REINICIA o processo ou apenas para de MANDAR TRÁFEGO para ele:
 *
 * - **vivo** responde "o processo está de pé e o laço de eventos anda". Não
 *   toca banco, não toca cache, não abre soquete. Se ele dependesse do banco, a
 *   primeira queda do banco faria o orquestrador matar e recriar todas as
 *   instâncias da API — trocando uma indisponibilidade parcial por uma total, e
 *   ainda inundando o banco de reconexões justo quando ele está sofrendo.
 * - **pronto** responde "eu consigo atender uma requisição de verdade agora".
 *   Aqui banco e cache são consultados, porque uma instância que não os alcança
 *   só sabe devolver erro, e é melhor sair da rotação até voltar.
 *
 * Daí o comportamento que o critério cobra: a API que sobe com o banco fora do
 * ar responde **vivo=sim, pronto=não**, e passa a responder pronto=sim assim
 * que banco e cache responderem — sem reiniciar nada.
 *
 * Por isso cada consulta a `/ready` verifica de novo. Guardar o resultado
 * pareceria eficiente e transformaria a verificação numa mentira com atraso.
 */

import { Router } from "express";

import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import { registrar } from "../../core/log.ts";
import { cacheResponde } from "./health.cache.ts";

// ---------------------------------------------------------------------------
// Forma das respostas
// ---------------------------------------------------------------------------

/** Caminho da verificação de processo de pé. */
export const CAMINHO_VIVO = "/live";

/** Caminho da verificação de "pode receber tráfego". */
export const CAMINHO_PRONTO = "/ready";

/** Como uma dependência aparece na resposta. */
export type EstadoDeDependencia = "ok" | "indisponivel";

/** Nomes das dependências que a verificação de pronto consulta. */
export const DEPENDENCIAS = ["banco", "cache"] as const;

/** Uma dependência consultada. */
export type NomeDeDependencia = (typeof DEPENDENCIAS)[number];

/** Resposta de `/live`. */
export interface RespostaDeVivo {
  readonly vivo: true;
  readonly servico: string;
  /** Segundos desde a partida do processo — a medida direta de "está de pé". */
  readonly emPeSegundos: number;
}

/** Resposta de `/ready`. */
export interface RespostaDePronto {
  readonly pronto: boolean;
  readonly dependencias: Readonly<
    Record<NomeDeDependencia, EstadoDeDependencia>
  >;
}

/** Nome do serviço, igual ao que o registro carrega. */
const SERVICO = "simpleclick-api";

/**
 * Quanto uma dependência pode demorar antes de ser dada como fora do ar.
 *
 * Curto de propósito: verificação de saúde que pendura fica sem resposta e o
 * orquestrador a trata como falha de qualquer jeito — só que depois de segurar
 * uma conexão por muito mais tempo.
 */
const ESPERA_PADRAO_MS = 2_000;

/** Eventos que este módulo emite. */
const EVENTOS_DE_SAUDE = {
  dependenciaFora: "saude.dependencia_fora",
} as const;

// ---------------------------------------------------------------------------
// As verificações
// ---------------------------------------------------------------------------

/** Ajustes das rotas. Tudo tem padrão; o teste injeta o que precisa provar. */
export interface OpcoesDeSaude {
  /** Acesso ao banco. Padrão: o da aplicação, montado a partir do ambiente. */
  readonly acesso?: AcessoAoBanco;
  /** Cadeia do cache. Padrão: `REDIS_URL` do ambiente (P-002). */
  readonly urlDoCache?: string;
  /** Quanto cada dependência pode demorar para responder. */
  readonly esperaMaximaMs?: number;
}

/** Encerra a espera por uma dependência que não respondeu a tempo. */
function comEspera<T>(
  promessa: Promise<T>,
  esperaMs: number,
  valorNaDemora: T,
): Promise<T> {
  return new Promise<T>((resolver) => {
    const relogio = setTimeout(() => resolver(valorNaDemora), esperaMs);
    promessa
      .then((valor) => resolver(valor))
      .catch(() => resolver(valorNaDemora))
      .finally(() => clearTimeout(relogio));
  });
}

/**
 * Pergunta ao banco pelo caminho que a API realmente usa (P-004).
 *
 * A consulta roda dentro de um contexto de requisição porque `core/db.ts` exige
 * um — e exige com razão: consulta sem contexto é consulta que o isolamento
 * recusaria. Verificar por uma conexão paralela provaria que o PostgreSQL está
 * de pé, não que a API consegue falar com ele.
 */
async function bancoResponde(acesso: AcessoAoBanco): Promise<boolean> {
  try {
    await executarComoRequisicao({}, () =>
      acesso.emTransacao(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
      }),
    );
    return true;
  } catch (erro) {
    // O detalhamento fica só aqui, no registro do servidor (AC-024). A resposta
    // de `/ready` diz apenas "indisponivel" — nome de banco, de máquina e de
    // credencial não saem para quem consulta uma rota pública.
    registrar.aviso(EVENTOS_DE_SAUDE.dependenciaFora, {
      dependencia: "banco",
      erro,
    });
    return false;
  }
}

/** Pergunta ao cache, com o mesmo cuidado de não vazar detalhe na resposta. */
async function cacheDisponivel(url: string | undefined): Promise<boolean> {
  if (url === undefined || url.trim() === "") {
    registrar.aviso(EVENTOS_DE_SAUDE.dependenciaFora, {
      dependencia: "cache",
      estado: "sem_configuracao",
    });
    return false;
  }
  const respondeu = await cacheResponde(url, ESPERA_PADRAO_MS);
  if (!respondeu) {
    registrar.aviso(EVENTOS_DE_SAUDE.dependenciaFora, {
      dependencia: "cache",
      estado: "sem_resposta",
    });
  }
  return respondeu;
}

/** Consulta as duas dependências ao mesmo tempo e monta o veredito. */
export async function verificarPronto(
  opcoes: OpcoesDeSaude = {},
): Promise<RespostaDePronto> {
  const esperaMs = opcoes.esperaMaximaMs ?? ESPERA_PADRAO_MS;
  const acesso = opcoes.acesso;
  const urlDoCache = opcoes.urlDoCache ?? process.env.REDIS_URL;

  // Em paralelo: uma dependência lenta não pode somar o tempo da outra.
  const [bancoOk, cacheOk] = await Promise.all([
    comEspera(
      // `banco()` é preguiçoso e lê o ambiente na primeira chamada; montá-lo
      // aqui dentro do `try` faz a falta de configuração virar "indisponivel"
      // em vez de derrubar a rota.
      Promise.resolve()
        .then(() => bancoResponde(acesso ?? banco()))
        .catch(() => false),
      esperaMs,
      false,
    ),
    comEspera(cacheDisponivel(urlDoCache), esperaMs, false),
  ]);

  const estado = (ok: boolean): EstadoDeDependencia =>
    ok ? "ok" : "indisponivel";

  return {
    pronto: bancoOk && cacheOk,
    dependencias: { banco: estado(bancoOk), cache: estado(cacheOk) },
  };
}

// ---------------------------------------------------------------------------
// As rotas
// ---------------------------------------------------------------------------

/** Status HTTP de quem ainda não pode receber tráfego. */
export const STATUS_NAO_PRONTO = 503;

/**
 * Monta `/live` e `/ready` para serem montadas sob `/v1/health`.
 *
 * As duas são públicas e não dizem nada além do necessário: quem consulta de
 * fora fica sabendo se pode mandar tráfego, e nunca o motivo interno.
 */
export function criarRotasDeSaude(opcoes: OpcoesDeSaude = {}): Router {
  const rotas = Router();

  rotas.get(CAMINHO_VIVO, (_req, res) => {
    // Nenhuma dependência é consultada aqui, e isso é a regra do critério: a
    // resposta é sobre o PROCESSO, não sobre o que ele alcança.
    const resposta: RespostaDeVivo = {
      vivo: true,
      servico: SERVICO,
      emPeSegundos: Math.floor(process.uptime()),
    };
    res.status(200).json(resposta);
  });

  rotas.get(CAMINHO_PRONTO, (_req, res, next) => {
    verificarPronto(opcoes)
      .then((resposta) => {
        res.status(resposta.pronto ? 200 : STATUS_NAO_PRONTO).json(resposta);
      })
      .catch(next);
  });

  return rotas;
}

/**
 * O limite de tentativas montado nas rotas de login e de segundo fator
 * (AC-107, AC-119, AC-120, T-112).
 *
 * A regra mora em `core/limite.ts` (script atômico no Redis, endereço real
 * pela borda confiável). Aqui ficam os números, a conexão preguiçosa com o
 * cache (montar a API não abre conexão; a primeira tentativa de login abre) e
 * duas peças que só a identidade sabe montar:
 *
 * - **O segundo fator conta na CONTA dona do desafio**, e não no desafio.
 *   Contar por desafio deixava quem tem a senha vazada recomeçar o login e
 *   ganhar mais cinco chances a cada desafio novo, sem fim.
 * - **O endereço do visitante pela ponte do site** (AC-120). O navegador
 *   entra pelo servidor do site, e a API só vê o endereço dele: todo visitante
 *   cairia num balde de origem só. O site informa o endereço do visitante, e
 *   ele só vale com o segredo compartilhado da ponte.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import {
  CABECALHO_DA_PONTE,
  CABECALHO_DO_ENDERECO_DO_VISITANTE,
  TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE,
} from "@simpleclick/contracts";
import type { Request, RequestHandler } from "express";

import {
  conectarNoCacheDoLimite,
  limitarTentativas,
  type AvisoDeBloqueio,
  type CacheDoLimite,
  type CacheDoLimiteAberto,
  type RegraDeLimite,
} from "../../core/limite.ts";

const MINUTO = 60_000;

/** Dez senhas erradas em 15 minutos bloqueiam a conta; a espera dobra. */
const REGRA_DA_CONTA: RegraDeLimite = {
  limite: 10,
  janelaMs: 15 * MINUTO,
  esperaBaseMs: MINUTO,
  esperaMaximaMs: 60 * MINUTO,
};

/** Sessenta requisições por minuto de um mesmo endereço real. */
const REGRA_DA_ORIGEM: RegraDeLimite = {
  limite: 60,
  janelaMs: MINUTO,
  esperaBaseMs: MINUTO,
  esperaMaximaMs: 15 * MINUTO,
};

let cacheCompartilhado: Promise<CacheDoLimiteAberto> | undefined;

/**
 * O cache do limite a partir do endereço do Redis, aberto na primeira
 * tentativa. Falha de conexão não fica guardada: a próxima tentativa tenta
 * de novo. Sem endereço, a rota falha alto em vez de liberar sem limite.
 */
export function cacheDoLimiteDoAmbiente(
  urlDoRedis: string | undefined,
): CacheDoLimite {
  return {
    async executarScript(script, chaves, argumentos) {
      if (urlDoRedis === undefined || urlDoRedis.trim() === "") {
        throw new Error("REDIS_URL ausente: o limite de tentativas não monta");
      }
      cacheCompartilhado ??= conectarNoCacheDoLimite(urlDoRedis).catch(
        (erro: unknown) => {
          cacheCompartilhado = undefined;
          throw erro;
        },
      );
      return (await cacheCompartilhado).executarScript(
        script,
        chaves,
        argumentos,
      );
    },
  };
}

/** Fecha a conexão do limite, se ela chegou a abrir (desligamento da API). */
export async function encerrarCacheDoLimite(): Promise<void> {
  const aberto = cacheCompartilhado;
  cacheCompartilhado = undefined;
  if (aberto === undefined) return;
  await (await aberto.catch(() => undefined))?.encerrar();
}

/** Resumo de tamanho fixo, para comparar segredos sem vazar pelo tempo. */
function resumo(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}

/**
 * O endereço do visitante que a ponte do site informou, ou `undefined` sem
 * ponte configurada, sem a prova certa ou com um valor que não é endereço.
 */
export function enderecoInformadoPelaPonte(
  segredoDaPonte: string | undefined,
): (req: Request) => string | undefined {
  const segredo = segredoDaPonte?.trim() ?? "";
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE)
    return () => undefined;
  const esperado = resumo(segredo);
  return (req) => {
    const prova = req.get(CABECALHO_DA_PONTE);
    if (prova === undefined || !timingSafeEqual(resumo(prova), esperado)) {
      return undefined;
    }
    const endereco = req.get(CABECALHO_DO_ENDERECO_DO_VISITANTE)?.trim();
    return endereco !== undefined && isIP(endereco) !== 0
      ? endereco
      : undefined;
  };
}

/** Onde o middleware guarda a conta dona do desafio desta requisição. */
const CONTA_DO_DESAFIO = Symbol("conta dona do desafio");

/** Campo de texto do corpo, sem confiar no formato (a validação vem depois). */
function campo(corpo: unknown, nome: string): string | undefined {
  const valor = (corpo as Record<string, unknown> | undefined)?.[nome];
  return typeof valor === "string" && valor.trim() !== ""
    ? valor.trim().toLowerCase()
    : undefined;
}

/** Os limitadores da identidade, sobre o mesmo cache. */
export function limitadoresDaIdentidade(opcoes: {
  readonly cache: CacheDoLimite;
  readonly proxiesConfiaveis?: number;
  /** Segredo compartilhado com o site (`SEGREDO_DA_PONTE`), se houver. */
  readonly segredoDaPonte?: string | undefined;
  /** De quem é o desafio aberto (identificador da identidade), ou `null`. */
  readonly donoDoDesafio: (desafioId: string) => Promise<string | null>;
  /** Bloqueio novo de conta no login: quem avisa o dono (AC-119). */
  readonly aoBloquearConta: (aviso: AvisoDeBloqueio) => Promise<void>;
}): {
  readonly login: RequestHandler;
  readonly segundoFator: RequestHandler[];
} {
  const comum = {
    cache: opcoes.cache,
    porOrigem: REGRA_DA_ORIGEM,
    enderecoInformado: enderecoInformadoPelaPonte(opcoes.segredoDaPonte),
    ...(opcoes.proxiesConfiaveis === undefined
      ? {}
      : { proxiesConfiaveis: opcoes.proxiesConfiaveis }),
  };

  /**
   * Descobre a conta dona do desafio ANTES do limite. Desafio que não existe
   * mais fica contado por ele mesmo: a rota recusa de qualquer jeito.
   */
  const acharContaDoDesafio: RequestHandler = (req, _res, proximo) => {
    const desafioId = campo(req.body, "desafioId");
    if (desafioId === undefined) return proximo();
    opcoes
      .donoDoDesafio(desafioId)
      .then((conta) => {
        if (conta !== null) {
          (req as unknown as Record<symbol, unknown>)[CONTA_DO_DESAFIO] = conta;
        }
        proximo();
      })
      .catch(proximo);
  };

  return {
    login: limitarTentativas({
      ...comum,
      prefixo: "sc:limite:login",
      porConta: {
        ...REGRA_DA_CONTA,
        identificar: (req) => campo(req.body, "email"),
      },
      aoBloquear: (aviso) =>
        aviso.escopo === "conta" ? opcoes.aoBloquearConta(aviso) : undefined,
    }),
    segundoFator: [
      acharContaDoDesafio,
      limitarTentativas({
        ...comum,
        prefixo: "sc:limite:segundo-fator",
        porConta: {
          ...REGRA_DA_CONTA,
          identificar: (req) => {
            const conta = (req as unknown as Record<symbol, unknown>)[
              CONTA_DO_DESAFIO
            ];
            return typeof conta === "string"
              ? `identidade:${conta}`
              : campo(req.body, "desafioId");
          },
        },
      }),
    ],
  };
}

/**
 * O limite de tentativas montado nas rotas de login e de segundo fator
 * (AC-119, AC-120, T-112).
 *
 * A regra mora em `core/limite.ts` (script atômico no Redis, endereço real
 * pela borda confiável). Aqui ficam só os números e a conexão preguiçosa com o
 * cache: montar a API não abre conexão; a primeira tentativa de login abre.
 */
import {
  conectarNoCacheDoLimite,
  limitarTentativas,
  type AvisoDeBloqueio,
  type CacheDoLimite,
  type CacheDoLimiteAberto,
  type RegraDeLimite,
} from "../../core/limite.ts";
import type { RequestHandler } from "express";

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

/** Os dois limitadores da identidade, sobre o mesmo cache. */
export function limitadoresDaIdentidade(opcoes: {
  readonly cache: CacheDoLimite;
  readonly proxiesConfiaveis?: number;
  /** Bloqueio novo de conta no login: quem avisa o dono (AC-119). */
  readonly aoBloquearConta: (aviso: AvisoDeBloqueio) => Promise<void>;
}): { readonly login: RequestHandler; readonly segundoFator: RequestHandler } {
  const comum = {
    cache: opcoes.cache,
    porOrigem: REGRA_DA_ORIGEM,
    ...(opcoes.proxiesConfiaveis === undefined
      ? {}
      : { proxiesConfiaveis: opcoes.proxiesConfiaveis }),
  };
  /** Campo de texto do corpo, sem confiar no formato (a validação vem depois). */
  const campo = (corpo: unknown, nome: string): string | undefined => {
    const valor = (corpo as Record<string, unknown> | undefined)?.[nome];
    return typeof valor === "string" && valor.trim() !== ""
      ? valor.trim().toLowerCase()
      : undefined;
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
    segundoFator: limitarTentativas({
      ...comum,
      prefixo: "sc:limite:segundo-fator",
      porConta: {
        ...REGRA_DA_CONTA,
        identificar: (req) => campo(req.body, "desafioId"),
      },
    }),
  };
}

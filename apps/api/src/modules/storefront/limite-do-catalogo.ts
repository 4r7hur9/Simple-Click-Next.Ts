/** Limite público por endereço para as consultas mais caras do catálogo. */
import {
  limitarTentativas,
  type CacheDoLimite,
  type RegraDeLimite,
} from "../../core/limite.ts";

const MINUTO = 60_000;

function inteiroConfigurado(
  ambiente: NodeJS.ProcessEnv,
  nome: string,
  padrao: number,
): number {
  const lido = ambiente[nome]?.trim();
  if (lido === undefined || lido === "") return padrao;
  const numero = Number(lido);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : padrao;
}

/** Valores operacionais configuráveis; os padrões dão 60 consultas/minuto/IP. */
export function regraDoCatalogoDoAmbiente(
  ambiente: NodeJS.ProcessEnv = process.env,
): RegraDeLimite {
  const janelaMs = inteiroConfigurado(
    ambiente,
    "VITRINE_CATALOGO_JANELA_MS",
    MINUTO,
  );
  const esperaBaseMs = inteiroConfigurado(
    ambiente,
    "VITRINE_CATALOGO_ESPERA_MS",
    MINUTO,
  );
  return {
    limite: inteiroConfigurado(ambiente, "VITRINE_CATALOGO_LIMITE", 60),
    janelaMs,
    esperaBaseMs,
    esperaMaximaMs: Math.max(esperaBaseMs, 15 * MINUTO),
  };
}

/** Usa o contador atômico Redis compartilhado com os demais limites da API. */
export function criarLimitadorDoCatalogo(
  cache: CacheDoLimite,
  ambiente: NodeJS.ProcessEnv = process.env,
) {
  return limitarTentativas({
    cache,
    prefixo: "sc:limite:vitrine-catalogo",
    porOrigem: regraDoCatalogoDoAmbiente(ambiente),
  });
}

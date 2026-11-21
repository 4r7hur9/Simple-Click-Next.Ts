/**
 * Faz a API parecer FORA DO AR para um site de teste (card #170, T-6).
 *
 * Carregado com `node --require` antes do servidor do site: troca o `fetch`
 * global por um que recusa, como a rede recusaria, toda chamada ao endereço da
 * API informado em `E2E_API_FORA_DO_AR`. O resto do tráfego passa. É a única
 * forma de provar "API fora" sem derrubar a API compartilhada pelos outros
 * cenários, e sem refazer o build: o endereço da API entra no build do site.
 *
 * Só serve ao ponta a ponta (`e2e/specs/area-por-papel.spec.ts`).
 */
const apiForaDoAr = process.env.E2E_API_FORA_DO_AR;
const original = globalThis.fetch;

if (apiForaDoAr && typeof original === "function") {
  globalThis.fetch = function fetchComApiForaDoAr(entrada, opcoes) {
    const endereco =
      typeof entrada === "string"
        ? entrada
        : entrada instanceof URL
          ? entrada.href
          : (entrada && entrada.url) || "";
    if (endereco.startsWith(apiForaDoAr)) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    return original.call(this, entrada, opcoes);
  };
}

/**
 * Onde as verificações de saúde ficam montadas (AC-023).
 *
 * Uma definição só (card #137): a montagem das rotas (`app.ts`) e o
 * rastreamento, que não abre trace para a sonda, leem daqui. Mora em `core/`
 * porque o rastreamento não pode importar `app.ts`, que o importa.
 */
export const PREFIXO_DE_SAUDE = "/v1/health";

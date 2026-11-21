/**
 * `GET /escolher-loja/propria` — regrava a escolha da loja com a única loja
 * da conta e abre o painel dela (card #170, T-6). A regra mora em
 * `responder-loja-propria.ts`.
 */
import { responderLojaPropria } from "./responder-loja-propria.ts";

/** Lê o cookie do pedido e grava outro: nunca pode ser estático nem cacheado. */
export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return responderLojaPropria(requisicao);
}

/**
 * `POST /api/revalidate` — a tomada da invalidação de cache do site (AC-028).
 *
 * Quem chama é a API, quando o catálogo de uma loja muda, apresentando o
 * segredo compartilhado que vem do ambiente (P-002). Quem decide se aceita,
 * confere o corpo e invalida é `server/revalidacao.ts`.
 *
 * Este arquivo é fino de propósito: arquivo de rota do Next só pode exportar
 * os verbos HTTP e a configuração de segmento, então toda regra que precise de
 * teste tem de morar fora dele.
 */

import {
  dependenciasDoAmbiente,
  responderRevalidacao,
} from "../../../server/revalidacao";

/**
 * A comparação em tempo constante e o resumo criptográfico vêm de `node:crypto`.
 * Declarar o ambiente de execução evita que uma mudança de padrão do framework
 * mova esta rota para um ambiente sem essas funções — falha que só apareceria
 * na publicação.
 */
export const runtime = "nodejs";

/** Recebe o aviso da API e devolve o que foi invalidado. */
export async function POST(requisicao: Request): Promise<Response> {
  return responderRevalidacao(requisicao, dependenciasDoAmbiente());
}

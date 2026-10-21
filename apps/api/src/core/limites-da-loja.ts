/**
 * A conferência de limite antes de criar (card #25).
 *
 * Toda criação limitada — pessoa na equipe, produto, categoria, cliente
 * cadastrado no painel — chama `exigirLimiteDaLoja(recurso)` DENTRO da
 * transação da criação, antes de gravar. O banco trava o recurso daquela loja
 * até o fim da transação (`app.medir_limite_da_loja`, migração 0051), então
 * duas criações ao mesmo tempo não passam juntas do limite.
 *
 * Passou do limite, a transação inteira é desfeita e a resposta é
 * `409 limite_atingido {recurso, limite, uso, mensagem}` — o manipulador de
 * erros (`core/erros.ts`) sabe responder este erro.
 */

import type { RecursoLimitadoDaLoja } from "@simpleclick/contracts";

import { transacaoAtual } from "./db.ts";
import { ErroDeLimiteAtingido } from "./erro-de-limite.ts";

export { ErroDeLimiteAtingido };

/**
 * Confere o limite do recurso na loja do contexto e lança
 * `ErroDeLimiteAtingido` quando criar mais `quantos` passaria dele.
 */
export async function exigirLimiteDaLoja(
  recurso: RecursoLimitadoDaLoja,
  quantos = 1,
): Promise<{ readonly limite: number; readonly uso: number }> {
  const [linha] = await transacaoAtual().$queryRaw<
    { limite: number; uso: number }[]
  >`SELECT limite, uso FROM app.medir_limite_da_loja(${recurso})`;
  const limite = Number(linha?.limite ?? 0);
  const uso = Number(linha?.uso ?? 0);
  if (uso + quantos > limite)
    throw new ErroDeLimiteAtingido(recurso, limite, uso);
  return { limite, uso };
}

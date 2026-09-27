/**
 * O fuso horário da loja que já está no contexto da transação (T-311).
 *
 * A JANELA DE VENDA É AVALIADA NO RELÓGIO DA LOJA, e não no do servidor: a
 * feijoada "de sábado, das 11h às 15h" é das 11h em Fortaleza para a loja de
 * Fortaleza, e das 11h em Rio Branco para a de Rio Branco. O fuso mora em
 * `stores.timezone`, e é lido aqui pela política pública — a loja suspensa
 * não responde, e isso é correto.
 *
 * O PADRÃO É O DO ESQUEMA: a coluna nasce com `America/Sao_Paulo`, e uma loja
 * que por algum motivo não seja lida não pode transformar a janela em erro
 * interno — ela vale como se estivesse no fuso padrão, que é o que a coluna
 * também diria.
 */
import { transacaoAtual } from "../../core/db.ts";

/** O mesmo valor de `stores.timezone` quando ninguém o preencheu. */
export const FUSO_PADRAO_DA_LOJA = "America/Sao_Paulo";

export async function fusoDaLoja(): Promise<string> {
  const loja = await transacaoAtual().store.findFirst({
    select: { timezone: true },
  });
  return loja?.timezone ?? FUSO_PADRAO_DA_LOJA;
}

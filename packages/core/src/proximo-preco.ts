/**
 * A próxima QUEDA de preço de um produto (card #140).
 *
 * Serve à vitrine pública quando a flag FLAG_VITRINE_PROXIMO_PRECO está ligada:
 * "daqui a pouco este produto fica mais barato". Só queda — aumento agendado é
 * informação comercial da loja e nunca sai nesta função.
 *
 * REUSA `precoQueVale`: a pergunta é feita a cada fronteira (`comecaEm` e
 * `terminaEm` futuros) e só vale o que a regra de verdade cobraria. Por isso um
 * aumento cadastrado sem encerrar o preço antigo (vale o MENOR) não gera nada —
 * anunciar um preço que nunca será cobrado seria mentir ao cliente.
 *
 * Só olha o preço unitário de varejo (quantidade 1): faixas de atacado não
 * entram. Pura: recebe o instante, não lê o relógio.
 */
import { precoQueVale, type PrecoCadastrado } from "./preco-vigente.ts";

/** Quanto à frente a vitrine olha: 7 dias. */
export const HORIZONTE_DO_PROXIMO_PRECO_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProximaQuedaDePreco {
  readonly precoCentavos: number;
  readonly aPartirDe: Date;
}

export function proximaQuedaDePreco(
  precos: readonly PrecoCadastrado[],
  agora: Date,
  horizonteEmMs: number = HORIZONTE_DO_PROXIMO_PRECO_MS,
): ProximaQuedaDePreco | null {
  const limite = agora.getTime() + horizonteEmMs;

  // As fronteiras são os instantes em que algum preço ativo entra ou sai.
  const fronteiras = new Set<number>();
  for (const preco of precos) {
    if (!preco.ativo) continue;
    for (const instante of [preco.comecaEm, preco.terminaEm]) {
      if (instante === null) continue;
      const ms = instante.getTime();
      if (ms > agora.getTime() && ms <= limite) fronteiras.add(ms);
    }
  }

  const atual = precoQueVale(precos, agora).atualEmCentavos;
  for (const ms of [...fronteiras].sort((a, b) => a - b)) {
    const depois = precoQueVale(precos, new Date(ms)).atualEmCentavos;
    if (depois === atual) continue;

    // A PRIMEIRA mudança decide. Se ela é aumento (ou envolve "sem preço"), não
    // se anuncia nada: pular para uma queda posterior esconderia o intervalo
    // mais caro entre as duas.
    if (atual !== null && depois !== null && depois < atual) {
      return { precoCentavos: depois, aPartirDe: new Date(ms) };
    }
    return null;
  }
  return null;
}

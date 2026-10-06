/**
 * Tarefa periódica de retenção: a remoção definitiva do que venceu o prazo
 * (AC-211 — a loja excluída fica retida 30 dias e depois sai em definitivo).
 *
 * POR QUE NÃO É UMA FILA DO REDIS. A remoção é guiada pela DATA gravada no
 * banco (`purge_after`), e não por um trabalho enfileirado no momento da
 * exclusão. O Redis deste projeto é cache com descarte por memória
 * (`allkeys-lru`, veja `fila.ts`): um trabalho agendado para daqui a 30 dias
 * pode simplesmente sumir. Perguntar ao banco, de tempos em tempos, "o que
 * venceu?" não perde nada — a rodada que não aconteceu é recuperada pela
 * seguinte, porque a pergunta é a mesma.
 *
 * Este arquivo só agenda e protege: não sabe o que é uma loja. A remoção vem
 * pronta de quem compõe o processo (`modules/admin/remocao-definitiva.ts`,
 * passada a `montarSegundoPlano`) — a fila não importa módulo de domínio.
 *
 * Duas garantias:
 * - uma rodada por vez: se a anterior ainda corre, a seguinte não começa
 *   outra em paralelo (o banco já pula a loja travada, mas duas rodadas no
 *   mesmo processo seriam só desperdício);
 * - falha não derruba nada: a rodada que falha é registrada e a próxima
 *   tenta de novo, no intervalo de sempre.
 */

/** De quanto em quanto tempo a retenção pergunta o que venceu: uma hora. */
export const INTERVALO_DA_RETENCAO_MS = 60 * 60 * 1000;

export interface OpcoesDaRetencao {
  /** Remove o que venceu até `agora` e devolve quantos itens saíram. */
  readonly remover: (agora: Date) => Promise<number>;
  readonly intervaloMs?: number | undefined;
  /** O relógio. Trocável na prova. */
  readonly agora?: (() => Date) | undefined;
  /** Chamado com o motivo quando uma rodada falha. */
  readonly aoFalhar?: ((motivo: string) => void) | undefined;
}

/** A retenção agendada, com um único ponto de desligamento. */
export interface RetencaoAgendada {
  /** Roda uma rodada já — ou devolve a que está em curso. */
  rodarAgora(): Promise<number>;
  /** Para o relógio e espera a rodada em curso terminar. */
  fechar(): Promise<void>;
}

/**
 * Agenda a retenção: uma rodada logo na partida — para recuperar o que
 * venceu enquanto o processo estava parado — e uma a cada intervalo.
 */
export function agendarRetencao(opcoes: OpcoesDaRetencao): RetencaoAgendada {
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_DA_RETENCAO_MS;
  const agora = opcoes.agora ?? (() => new Date());
  let emCurso: Promise<number> | null = null;
  let fechada = false;

  function rodarAgora(): Promise<number> {
    if (emCurso !== null) return emCurso;
    const rodada = (async () => {
      try {
        return await opcoes.remover(agora());
      } catch (causa) {
        opcoes.aoFalhar?.(
          causa instanceof Error ? causa.message : String(causa),
        );
        return 0;
      }
    })();
    // A liberação vai no `finally` da promessa, e não dentro da função: ela
    // precisa rodar DEPOIS desta atribuição, mesmo quando a remoção falha
    // antes do primeiro `await`.
    const vigiada = rodada.finally(() => {
      emCurso = null;
    });
    emCurso = vigiada;
    return vigiada;
  }

  const disparar = () => {
    if (!fechada) void rodarAgora();
  };
  // `unref`: o relógio da retenção não segura o processo de pé sozinho.
  const partida = setTimeout(disparar, 0);
  partida.unref?.();
  const relogio = setInterval(disparar, intervaloMs);
  relogio.unref?.();

  return {
    rodarAgora,
    fechar: async () => {
      fechada = true;
      clearTimeout(partida);
      clearInterval(relogio);
      if (emCurso !== null) await emCurso;
    },
  };
}

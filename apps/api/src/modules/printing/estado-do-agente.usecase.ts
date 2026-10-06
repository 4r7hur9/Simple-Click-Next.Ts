/**
 * O estado da impressão automática que o painel mostra (T-608 — AC-622,
 * AC-624, AC-626).
 *
 * É o que acende, na fila de pedidos, o aviso de que a impressão automática
 * está indisponível — e o que mantém à vista os cupons que esperam o agente,
 * para o clique. Uma rota própria, e não um campo a mais na resposta da fila
 * de pedidos: o formato da fila (T-600) não muda por causa da impressão.
 *
 * O relógio é o do banco: o último contato do agente é gravado com o `now()`
 * de lá (`app.registrar_batimento`), e comparar com o relógio da API trocaria
 * uma diferença de relógio entre máquinas por um aviso falso.
 */
import type { EstadoDaImpressaoAutomaticaNoContrato } from "@simpleclick/contracts";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

/**
 * Silêncio que faz o agente contar como fora do ar. Ele consulta a cada
 * poucos segundos; trinta segundos sem notícia são várias consultas perdidas
 * em sequência, e não um soluço da rede.
 */
export const SILENCIO_QUE_DESCONECTA_MS = 30_000;

/** O que a regra precisa saber para dizer a situação. */
export interface FatosDaImpressaoAutomatica {
  readonly automatico: boolean;
  /** Agentes pareados e não revogados. */
  readonly agentesAtivos: number;
  readonly ultimoContato: Date | null;
  readonly agora: Date;
}

/**
 * A situação, em ordem de precedência: desligada (a loja imprime por clique,
 * e o agente não importa), sem agente (ligou, mas não pareou), conectada
 * (falou há pouco) ou desconectada (sumiu — ou nunca falou).
 */
export function situacaoDaImpressaoAutomatica(
  fatos: FatosDaImpressaoAutomatica,
): EstadoDaImpressaoAutomaticaNoContrato["situacao"] {
  if (!fatos.automatico) return "desligada";
  if (fatos.agentesAtivos === 0) return "sem_agente";
  if (fatos.ultimoContato === null) return "desconectada";
  const silencio = fatos.agora.getTime() - fatos.ultimoContato.getTime();
  return silencio <= SILENCIO_QUE_DESCONECTA_MS ? "conectada" : "desconectada";
}

/** O estado da impressão automática da loja do contexto, para a equipe. */
export async function estadoDaImpressaoAutomatica(): Promise<EstadoDaImpressaoAutomaticaNoContrato> {
  const lojaId = exigirLojaDoContexto();
  const [linha] = await transacaoAtual().$queryRaw<
    {
      automatico: boolean | null;
      agentes: number;
      ultimo: Date | null;
      pendentes: number;
      agora: Date;
    }[]
  >`
    SELECT (SELECT ss.printing -> 'automatico' = 'true'::jsonb
              FROM app.store_settings ss
             WHERE ss.store_id = ${lojaId}::uuid) AS automatico,
           (SELECT count(*)::int
              FROM app.print_agents a
             WHERE a.store_id = ${lojaId}::uuid
               AND a.revoked_at IS NULL) AS agentes,
           (SELECT max(a.last_heartbeat_at)
              FROM app.print_agents a
             WHERE a.store_id = ${lojaId}::uuid
               AND a.revoked_at IS NULL) AS ultimo,
           (SELECT count(*)::int
              FROM app.print_jobs j
             WHERE j.store_id = ${lojaId}::uuid
               AND j.status IN ('QUEUED', 'LEASED', 'FAILED', 'DEAD')) AS pendentes,
           now() AS agora`;

  const automatico = linha?.automatico === true;
  const ultimoContato = linha?.ultimo ?? null;
  return {
    automatico,
    situacao: situacaoDaImpressaoAutomatica({
      automatico,
      agentesAtivos: Number(linha?.agentes ?? 0),
      ultimoContato,
      agora: linha?.agora ?? new Date(),
    }),
    ultimoContatoEm: ultimoContato?.toISOString() ?? null,
    pendentes: Number(linha?.pendentes ?? 0),
  };
}

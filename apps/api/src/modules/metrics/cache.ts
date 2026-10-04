/**
 * O cache das métricas, com horário de referência e invalidação por
 * marca-d'água (T-807, AC-814).
 *
 * O cache da API (`core/cache.ts`) guarda por loja, com prazo de validade e
 * invalidação por chave. As métricas usam-no de um jeito particular: a chave
 * carrega, além do período, a MARCA-D'ÁGUA dos pedidos da loja — o instante
 * da última alteração em qualquer pedido dela. Pedido novo, status mudado,
 * WhatsApp confirmado: tudo toca `updated_at`, a marca muda, e a chave
 * anterior simplesmente deixa de ser consultada. É a invalidação por
 * construção: nenhum caso de uso de pedido precisa lembrar de chamar
 * "esqueça as métricas" — e o pedido lançado à mão por outra faixa invalida
 * do mesmo jeito, sem conhecer este módulo.
 *
 * O que sobra para o prazo de validade é a rede de proteção de sempre: a
 * entrada com marca velha morre sozinha em `TTL_DAS_METRICAS_SEGUNDOS`.
 *
 * O HORÁRIO DE REFERÊNCIA VIAJA DENTRO DO VALOR GUARDADO. Quem lê do cache
 * recebe o `calculadoEm` de quando a conta foi feita, e não o de agora — é
 * isso que a tela mostra ao lado de "atualizar agora", para que número
 * guardado nunca se passe por número do instante.
 */
import type { Cache } from "../../core/cache.ts";
import type { MetricasCalculadas } from "./metricas.usecase.ts";
import type { PeriodoResolvido } from "./periodo.ts";

/** Nome do dado na chave: `<loja>:metricas:<periodo>:<marca>`. */
export const NOME_DO_DADO = "metricas";

/**
 * Prazo de validade das métricas guardadas (ASM-802: "até um minuto").
 *
 * É a rede de proteção, não o mecanismo: a marca-d'água invalida antes.
 */
export const TTL_DAS_METRICAS_SEGUNDOS = 60;

/** O que a leitura com cache devolve. */
export interface MetricasLembradas {
  readonly metricas: MetricasCalculadas;
  /** Verdadeiro quando o valor veio guardado, sem recálculo. */
  readonly deCache: boolean;
}

/**
 * A parte da chave que identifica o período: `7d_2026-09-21_2026-09-27`.
 *
 * O ATALHO ENTRA NA CHAVE. "7 dias" e o intervalo a dedo com as mesmas datas
 * cobrem os mesmos pedidos, mas a resposta diz qual dos dois está em vigor —
 * e é isso que a tela marca no seletor. Sem o atalho, a segunda leitura
 * devolveria o período com o rótulo da primeira.
 */
export function parteDoPeriodo(periodo: PeriodoResolvido): string {
  return `${periodo.atalho}_${periodo.de}_${periodo.ate}`;
}

export interface OpcoesDeLembranca {
  readonly lojaId: string;
  readonly periodo: PeriodoResolvido;
  /** A marca-d'água dos pedidos da loja, já lida do banco. */
  readonly marca: string;
  /** Pede o recálculo e regrava, ignorando o que está guardado. */
  readonly atualizar?: boolean | undefined;
}

/**
 * Lê as métricas do cache ou calcula-as e guarda.
 *
 * `atualizar` apaga a entrada antes de ler: é o "atualizar agora" da tela. O
 * apagamento passa pelo mesmo cache, então falha de cache não sobe — o pior
 * caso é recalcular, que é exatamente o que foi pedido.
 */
export async function lembrarMetricas(
  cache: Cache,
  opcoes: OpcoesDeLembranca,
  calcular: () => Promise<MetricasCalculadas>,
): Promise<MetricasLembradas> {
  const partes = [parteDoPeriodo(opcoes.periodo), opcoes.marca];
  if (opcoes.atualizar === true) {
    await cache.esquecer(opcoes.lojaId, NOME_DO_DADO, ...partes);
  }

  let calculou = false;
  const metricas = await cache.lembrar(
    opcoes.lojaId,
    NOME_DO_DADO,
    async () => {
      calculou = true;
      return calcular();
    },
    { partes, ttlSegundos: TTL_DAS_METRICAS_SEGUNDOS },
  );
  return { metricas, deCache: !calculou };
}

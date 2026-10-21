/**
 * A grade semanal da loja, como a página "Sobre" a mostra.
 *
 * Função PURA sobre o horário que a borda já leu para calcular a abertura: não
 * há segunda consulta ao banco. Sai só a semana — as exceções datadas ficam de
 * fora, porque a de hoje já aparece em `abertura` e as futuras trariam o motivo
 * que o dono escreveu para dentro de uma tabela que não tem lugar para ele.
 */
import type { HorarioDaLoja } from "@simpleclick/core";
import type { HorarioPublicoNoContrato } from "@simpleclick/contracts";

export function horarioPublico(
  horario: HorarioDaLoja,
): HorarioPublicoNoContrato {
  return {
    modo: horario.estado,
    semana: Array.from({ length: 7 }, (_, dia) => ({
      dia,
      faixas: (horario.faixas?.[dia] ?? []).map(({ abre, fecha }) => ({
        abre,
        fecha,
      })),
    })),
  };
}

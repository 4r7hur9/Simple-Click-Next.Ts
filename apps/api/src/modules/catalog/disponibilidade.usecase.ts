/** Combina disponibilidade manual e janela semanal do produto (T-311). */
import {
  estaNaJanelaDeDisponibilidade,
  type JanelaDeDisponibilidade,
} from "@simpleclick/core";

export type MotivoDaDisponibilidade =
  "DISPONIVEL" | "ESGOTADO" | "FORA_DA_JANELA";

export interface EntradaDaDisponibilidade {
  readonly disponivelManualmente: boolean;
  readonly janelas: readonly JanelaDeDisponibilidade[];
  readonly agora: Date;
  readonly fusoHorario: string;
}

export interface ResultadoDaDisponibilidade {
  readonly disponivel: boolean;
  readonly motivo: MotivoDaDisponibilidade;
}

/** O esgotado vence a janela; se o dono reativar, a janela volta a valer. */
export function disponibilidadeDoProduto(
  entrada: EntradaDaDisponibilidade,
): ResultadoDaDisponibilidade {
  if (!entrada.disponivelManualmente) {
    return { disponivel: false, motivo: "ESGOTADO" };
  }
  if (
    !estaNaJanelaDeDisponibilidade(
      entrada.janelas,
      entrada.agora,
      entrada.fusoHorario,
    )
  ) {
    return { disponivel: false, motivo: "FORA_DA_JANELA" };
  }
  return { disponivel: true, motivo: "DISPONIVEL" };
}

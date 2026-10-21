/**
 * A variação de uma medida contra o período anterior, em um selo curto
 * (card #34): seta, porcentagem e uma frase para o leitor de tela.
 *
 * A DIREÇÃO VAI EM PALAVRA (leitor de tela) E EM SETA; a cor só a reforça.
 * `inverso` vale para medidas em que subir é ruim (cancelamentos): a seta
 * sobe, mas o tom é vermelho.
 */
import {
  descreverVariacao,
  type VariacaoDeMetricaNoContrato,
} from "../../lib/metricas.ts";

const SETA: Readonly<Record<VariacaoDeMetricaNoContrato["direcao"], string>> = {
  subiu: "↑",
  caiu: "↓",
  igual: "=",
  "sem-base": "•",
};

function tom(
  direcao: VariacaoDeMetricaNoContrato["direcao"],
  inverso: boolean,
): string {
  if (direcao === "subiu") return inverso ? "text-erro" : "text-sucesso";
  if (direcao === "caiu") return inverso ? "text-sucesso" : "text-erro";
  return "text-tinta-suave";
}

export interface VariacaoEmSetaProps {
  readonly variacao: VariacaoDeMetricaNoContrato;
  readonly unidade: "dinheiro" | "pedidos";
  /** Contra o que foi comparado, para o leitor de tela ("ontem"). */
  readonly contra: string;
  readonly inverso?: boolean | undefined;
}

export function VariacaoEmSeta({
  variacao,
  unidade,
  contra,
  inverso = false,
}: VariacaoEmSetaProps) {
  const { direcao, texto } = descreverVariacao(variacao, unidade);
  const porCento =
    variacao.variacaoPorCento === null
      ? direcao === "sem-base"
        ? "novo"
        : "0%"
      : `${Math.abs(variacao.variacaoPorCento)}%`;
  return (
    <span
      data-direcao={direcao}
      className={`inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${tom(direcao, inverso)}`}
    >
      <span aria-hidden="true">{SETA[direcao]}</span>
      <span aria-hidden="true">{porCento}</span>
      <span className="sc-so-leitor">
        {texto}, comparado com {contra}
      </span>
    </span>
  );
}

"use client";

/**
 * O seletor do dia do quadro: anterior, próximo, "Hoje" e o calendário.
 *
 * O calendário é o `SeletorDePeriodo` do design system, usado em modo dia: o
 * período escolhido vale pelo seu PRIMEIRO dia (o quadro mostra um dia por
 * vez). Não existe dia depois de hoje — não há pedido do futuro.
 */
import {
  Botao,
  IconeAvancar,
  IconeVoltar,
  SeletorDePeriodo,
} from "@simpleclick/ui";

import {
  descreverDia,
  somarDiasDoQuadro,
} from "../../lib/quadro-de-pedidos.ts";

export interface SeletorDoDiaProps {
  /** O dia mostrado (`aaaa-mm-dd`). */
  readonly dia: string;
  /** O dia de hoje da loja. */
  readonly hoje: string;
  readonly fuso?: string | undefined;
  readonly aoMudar: (dia: string) => void;
}

export function SeletorDoDia({ dia, hoje, fuso, aoMudar }: SeletorDoDiaProps) {
  const ehHoje = dia === hoje;
  return (
    <div className="sc-dia" role="group" aria-label="Dia dos pedidos">
      <Botao
        variante="secundaria"
        soIcone
        icone={<IconeVoltar />}
        onClick={() => aoMudar(somarDiasDoQuadro(dia, -1))}
      >
        Dia anterior
      </Botao>
      <SeletorDePeriodo
        value={{ inicio: dia, fim: dia }}
        onChange={(periodo) =>
          aoMudar(periodo.inicio > hoje ? hoje : periodo.inicio)
        }
        max={hoje}
        hoje={hoje}
        fuso={fuso}
        rotulo="Escolher o dia"
      />
      <Botao
        variante="secundaria"
        soIcone
        icone={<IconeAvancar />}
        desabilitado={ehHoje}
        onClick={() => aoMudar(somarDiasDoQuadro(dia, 1))}
      >
        Próximo dia
      </Botao>
      <Botao
        variante="secundaria"
        desabilitado={ehHoje}
        onClick={() => aoMudar(hoje)}
      >
        Hoje
      </Botao>
      <p className="sc-so-leitor" role="status">
        {descreverDia(dia)}
      </p>
    </div>
  );
}

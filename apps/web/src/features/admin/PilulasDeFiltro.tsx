/**
 * Os filtros em chips, com o número de cada um (lojas por situação, contas
 * por tipo, período das métricas). Usa o `Chip` e a `FaixaDeChips` do pacote
 * de interface (card #113): cada filtro é um botão com `aria-pressed`, dentro
 * de um grupo com nome, e a faixa rola na horizontal em tela estreita — todo
 * chip continua alcançável pelo Tab.
 *
 * Um filtro pode pedir atenção (as lojas pendentes): enquanto houver o que
 * fazer, ele ganha o tom de atenção e um texto para o leitor de tela, então a
 * diferença não depende só da cor. Chip de filtro nunca é link: com `href`, o
 * `Link` do Next pré-carregaria endereços com a busca digitada.
 */

import { Chip, FaixaDeChips } from "@simpleclick/ui";
import type { ReactNode } from "react";

export interface PilulaDeFiltro<V extends string> {
  readonly valor: V;
  readonly rotulo: string;
  readonly quantidade?: number | undefined;
  /** Destaca o chip quando há quantidade: é a fila que espera por alguém. */
  readonly destaque?: boolean | undefined;
}

/**
 * O tom de atenção, só com tokens. O `!` vence o estilo do chip, que não tem
 * tom de atenção próprio (o pacote de interface é do card #104).
 */
const TOM_DE_ATENCAO =
  "border-[var(--cor-atencao)]! bg-[var(--cor-atencao-suave)]! text-[var(--cor-tinta)]!";

export function PilulasDeFiltro<V extends string>({
  rotulo,
  pilulas,
  valor,
  aoEscolher,
}: {
  readonly rotulo: string;
  readonly pilulas: readonly PilulaDeFiltro<V>[];
  readonly valor: V;
  readonly aoEscolher: (valor: V) => void;
}): ReactNode {
  return (
    // RELATIVE prende à faixa o texto só para leitor de tela dos chips (é
    // absoluto): sem isso, o de um chip fora da vista escapa do recorte da
    // faixa e alarga a página inteira em 344px (card 133).
    <FaixaDeChips rotulo={rotulo} className="relative">
      {pilulas.map((pilula) => {
        const escolhida = pilula.valor === valor;
        const chama =
          !escolhida &&
          pilula.destaque === true &&
          (pilula.quantidade ?? 0) > 0;
        return (
          <Chip
            key={pilula.valor}
            ativo={escolhida}
            contagem={pilula.quantidade}
            aoAlternar={() => aoEscolher(pilula.valor)}
            className={chama ? TOM_DE_ATENCAO : undefined}
          >
            {pilula.rotulo}
            {chama && <span className="sc-so-leitor"> (esperam por você)</span>}
          </Chip>
        );
      })}
    </FaixaDeChips>
  );
}

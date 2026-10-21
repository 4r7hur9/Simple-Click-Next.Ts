"use client";

/**
 * O período da Visão geral (card #35): 30 dias, 90 dias, este ano ou um
 * intervalo livre no calendário do `@simpleclick/ui`. A escolha mora no
 * endereço (`?periodo=`), então a página inteira se refaz com os números do
 * período — e dá para voltar e compartilhar.
 */
import { Botao, SeletorDePeriodo as Calendario, hojeNoFuso } from "@simpleclick/ui";
import { useRouter } from "next/navigation";

import type { AtalhoDaVisao, PeriodoDaVisao } from "../../lib/conta-do-cliente.ts";

const ATALHOS: readonly { id: AtalhoDaVisao; rotulo: string }[] = [
  { id: "30d", rotulo: "30 dias" },
  { id: "90d", rotulo: "90 dias" },
  { id: "ano", rotulo: "Este ano" },
];

export function SeletorDoPeriodoDaConta({ periodo }: { readonly periodo: PeriodoDaVisao }) {
  const roteador = useRouter();
  const hoje = hojeNoFuso("America/Sao_Paulo");

  return (
    <div data-seletor-de-periodo data-atalho={periodo.atalho} className="flex flex-wrap items-center gap-2">
      {ATALHOS.map((atalho) => (
        <Botao
          key={atalho.id}
          type="button"
          forma="pilula"
          variante={periodo.atalho === atalho.id ? "primaria" : "secundaria"}
          aria-pressed={periodo.atalho === atalho.id}
          onClick={() => roteador.push(atalho.id === "30d" ? "/conta" : `/conta?periodo=${atalho.id}`)}
        >
          {atalho.rotulo}
        </Botao>
      ))}
      <Calendario
        value={{ inicio: periodo.de, fim: periodo.ate }}
        max={hoje}
        hoje={hoje}
        fuso="America/Sao_Paulo"
        rotulo="Escolher outro período"
        onChange={(novo) =>
          roteador.push(`/conta?periodo=personalizado&de=${novo.inicio}&ate=${novo.fim}`)
        }
      />
    </div>
  );
}

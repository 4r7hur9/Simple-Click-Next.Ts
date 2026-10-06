"use client";

/**
 * O seletor de período das métricas (T-804; AC-803, AC-805, AC-806).
 *
 * TRÊS ATALHOS E UM INTERVALO. Hoje, três e sete dias resolvem a pergunta do
 * dia a dia com um toque; o intervalo a dedo resolve o fechamento do mês. Os
 * atalhos são botões de alternância (`aria-pressed`): quem ouve a tela sabe
 * qual está valendo sem depender da cor.
 *
 * O SELETOR NÃO DECIDE SE O INTERVALO SERVE. Data final antes da inicial ou
 * intervalo acima de um ano vão para a API, que recusa com explicação, e a
 * tela mantém o período anterior (AC-805). Conferir também aqui seria a
 * segunda implementação da mesma régua — e a primeira a ficar desatualizada.
 *
 * As datas digitadas NÃO são apagadas quando a API recusa: quem errou o dia
 * corrige o dia, em vez de digitar as duas datas de novo.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Botao, Campo } from "@simpleclick/ui";

import {
  nomeDoAtalho,
  type AtalhoDoPeriodo,
  type ConsultaDoPeriodo,
  type PeriodoDeMetricasNoContrato,
} from "../../lib/metricas.ts";

export interface SeletorDePeriodoProps {
  /** O período em vigor, para marcar o atalho (nulo enquanto nada valeu). */
  readonly vigente: ConsultaDoPeriodo | null;
  /** As pontas do período em vigor, para começar o intervalo a partir delas. */
  readonly periodo: PeriodoDeMetricasNoContrato | null;
  /**
   * Uma leitura está no ar. Os controles NÃO são desabilitados por isso:
   * botão que se desabilita com o foco nele joga o foco de quem usa teclado
   * para o começo da página. A troca seguinte simplesmente vence a anterior.
   */
  readonly ocupado: boolean;
  readonly aoEscolher: (consulta: ConsultaDoPeriodo) => void;
}

const ATALHOS: readonly { atalho: AtalhoDoPeriodo; rotulo: string }[] = [
  { atalho: "hoje", rotulo: "Hoje" },
  { atalho: "3d", rotulo: "3 dias" },
  { atalho: "7d", rotulo: "7 dias" },
];

export function SeletorDePeriodo({
  vigente,
  periodo,
  ocupado,
  aoEscolher,
}: SeletorDePeriodoProps) {
  const idDoTitulo = useId();
  const idDoIntervalo = useId();
  const [de, setDe] = useState(periodo?.de ?? "");
  const [ate, setAte] = useState(periodo?.ate ?? "");

  // Quando um período passa a valer, o intervalo começa das pontas dele. Uma
  // recusa não muda o período em vigor, então não apaga o que foi digitado.
  const deVigente = periodo?.de;
  const ateVigente = periodo?.ate;
  useEffect(() => {
    if (deVigente !== undefined) setDe(deVigente);
    if (ateVigente !== undefined) setAte(ateVigente);
  }, [deVigente, ateVigente]);

  function aplicarIntervalo(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    aoEscolher({ periodo: "personalizado", de, ate });
  }

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-seletor-de-periodo
      aria-busy={ocupado || undefined}
      className="rounded-lg border border-borda bg-superficie p-4"
    >
      <h2 id={idDoTitulo} className="text-base font-semibold">
        Período
      </h2>

      <div
        role="group"
        aria-label="Atalhos de período"
        className="mt-3 flex flex-wrap gap-2"
      >
        {ATALHOS.map(({ atalho, rotulo }) => {
          const marcado = vigente?.periodo === atalho;
          return (
            <Botao
              key={atalho}
              data-atalho={atalho}
              aria-pressed={marcado}
              aria-label={nomeDoAtalho(atalho)}
              variante={marcado ? "primaria" : "secundaria"}
              onClick={() => aoEscolher({ periodo: atalho })}
            >
              {rotulo}
            </Botao>
          );
        })}
      </div>

      <form
        aria-labelledby={idDoIntervalo}
        data-intervalo
        onSubmit={aplicarIntervalo}
        className="mt-4 grid grid-cols-1 items-end gap-3 min-[540px]:grid-cols-[1fr_1fr_auto]"
      >
        <p
          id={idDoIntervalo}
          className="text-sm font-medium min-[540px]:col-span-3"
        >
          Ou escolha as datas (até um ano)
        </p>
        <Campo
          id={`${idDoIntervalo}-de`}
          name="de"
          rotulo="De"
          type="date"
          value={de}
          onChange={(evento) => setDe(evento.currentTarget.value)}
          className="min-w-0"
        />
        <Campo
          id={`${idDoIntervalo}-ate`}
          name="ate"
          rotulo="Até"
          type="date"
          value={ate}
          onChange={(evento) => setAte(evento.currentTarget.value)}
          className="min-w-0"
        />
        <Botao
          type="submit"
          variante={
            vigente?.periodo === "personalizado" ? "primaria" : "secundaria"
          }
        >
          Aplicar datas
        </Botao>
      </form>
    </section>
  );
}

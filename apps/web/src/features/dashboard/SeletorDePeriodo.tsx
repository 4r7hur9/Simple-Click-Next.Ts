"use client";

/**
 * O seletor de período das métricas (T-804; AC-803, AC-805, AC-806).
 *
 * TRÊS ATALHOS E UM INTERVALO. Hoje, três e sete dias ficam num menu
 * suspenso cujo botão já diz o período em vigor ("Período: Últimos 7 dias");
 * o intervalo a dedo, que resolve o fechamento do mês, fica à vista ao lado.
 * No menu, o atalho em vigor leva a marca de conferido E o texto "em vigor"
 * para o leitor de tela: quem ouve a tela sabe qual vale sem depender do
 * desenho.
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
import {
  Botao,
  Campo,
  IconeConfirmar,
  MenuSuspenso,
  type ItemDoMenu,
} from "@simpleclick/ui";

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

const ATALHOS: readonly AtalhoDoPeriodo[] = ["hoje", "3d", "7d"];

/** O que o botão do menu diz: o período em vigor, ou o convite a escolher. */
export function rotuloDoMenuDePeriodo(
  vigente: ConsultaDoPeriodo | null,
): string {
  if (vigente === null) return "Período: escolha";
  return `Período: ${nomeDoAtalho(vigente.periodo)}`;
}

/** A marca do atalho em vigor: o desenho, e o texto para quem não o vê. */
function MarcaEmVigor({ emVigor }: { readonly emVigor: boolean }) {
  if (!emVigor) {
    return <span aria-hidden="true" className="inline-block size-5 shrink-0" />;
  }
  return (
    <>
      <IconeConfirmar />
      <span data-em-vigor className="sc-so-leitor">
        Em vigor:{" "}
      </span>
    </>
  );
}

export function SeletorDePeriodo({
  vigente,
  periodo,
  ocupado,
  aoEscolher,
}: SeletorDePeriodoProps) {
  const idDoTitulo = useId();
  const idDoMenu = useId();
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

  const itens: ItemDoMenu[] = ATALHOS.map((atalho) => ({
    id: atalho,
    rotulo: nomeDoAtalho(atalho),
    icone: <MarcaEmVigor emVigor={vigente?.periodo === atalho} />,
    aoEscolher: () => aoEscolher({ periodo: atalho }),
  }));

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-seletor-de-periodo
      data-vigente={vigente?.periodo}
      aria-busy={ocupado || undefined}
      className="sc-cartao"
    >
      {/* O nome da seção já está no botão do menu ("Período: …"). */}
      <h2 id={idDoTitulo} className="sc-so-leitor">
        Período
      </h2>
      <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <MenuSuspenso
          id={idDoMenu}
          rotulo={rotuloDoMenuDePeriodo(vigente)}
          titulo="Atalhos de período"
          itens={itens}
          variante="secundaria"
          className="self-start min-[900px]:self-end"
        />

      <form
        aria-labelledby={idDoIntervalo}
        data-intervalo
        onSubmit={aplicarIntervalo}
        className="grid min-w-0 grid-cols-1 items-end gap-3 min-[540px]:grid-cols-[1fr_1fr_auto]"
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
          forma="pilula"
          variante={
            vigente?.periodo === "personalizado" ? "primaria" : "secundaria"
          }
        >
          Aplicar datas
        </Botao>
      </form>
      </div>
    </section>
  );
}

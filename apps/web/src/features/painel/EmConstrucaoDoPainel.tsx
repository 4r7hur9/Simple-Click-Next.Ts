/**
 * O estado "em construção" das áreas do painel que ainda não foram entregues
 * (ajuda, feed): o endereço e o item do menu já existem, a tela diz com
 * clareza que está a caminho — sem fingir que há funcionalidade.
 */
import type { Icone } from "@simpleclick/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { FOCO } from "./estilo-do-menu.ts";

export function EmConstrucaoDoPainel({
  titulo,
  descricao,
  icone: Desenho,
  topicos = [],
  acao,
}: {
  readonly titulo: string;
  readonly descricao: string;
  readonly icone: Icone;
  /** O que vem nesta área, em poucas linhas. */
  readonly topicos?: readonly string[];
  readonly acao?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="titulo-em-construcao"
      className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-[var(--raio-cartao)] bg-[var(--cor-superficie)] text-[var(--cor-primaria)]"
      >
        <Desenho className="size-7" />
      </span>
      <p className="inline-flex items-center rounded-[var(--raio-completo)] bg-[var(--cor-primaria)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cor-em-primaria)]">
        Em construção
      </p>
      <h1
        id="titulo-em-construcao"
        className="text-4xl font-semibold tracking-[-0.04em]"
      >
        {titulo}
      </h1>
      <p className="text-lg leading-8 text-[var(--cor-tinta-suave)]">
        {descricao}
      </p>
      {topicos.length > 0 ? (
        <ul className="flex w-full flex-col gap-2 rounded-[var(--raio-cartao)] bg-[var(--cor-superficie)] p-5 text-sm text-[var(--cor-tinta)]">
          {topicos.map((topico) => (
            <li key={topico} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-[var(--raio-completo)] bg-[var(--cor-primaria)]"
              />
              {topico}
            </li>
          ))}
        </ul>
      ) : null}
      {acao ?? (
        <Link
          href="/painel"
          className={`inline-flex min-h-[var(--altura-toque)] items-center rounded-[var(--raio-completo)] border border-[var(--cor-borda-forte)] px-5 text-sm font-semibold hover:bg-[var(--cor-superficie-alta)] ${FOCO}`}
        >
          Voltar ao início
        </Link>
      )}
    </section>
  );
}

import type { ReactNode } from "react";
import { Info, type ConteudoDoInfo, type Icone } from "@simpleclick/ui";
import Link from "next/link";

import type { Variacao } from "./formatar.ts";

function Seta({ sentido }: { readonly sentido: "alta" | "queda" | "igual" }) {
  if (sentido === "igual") {
    return (
      <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
        <path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
      <path
        d={sentido === "alta" ? "M6 10V2M2.5 5.5 6 2l3.5 3.5" : "M6 2v8M2.5 6.5 6 10l3.5-3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A seta e o percentual do comparativo. Verde sobe, vermelho cai. */
export function Comparativo({
  variacao,
  anteriorTexto,
}: {
  readonly variacao: Variacao;
  readonly anteriorTexto: string;
}) {
  const cor =
    variacao.sentido === "alta"
      ? "text-[var(--cor-sucesso)] bg-[var(--cor-sucesso-suave)]"
      : variacao.sentido === "queda"
        ? "text-[var(--cor-erro)] bg-[var(--cor-erro-suave)]"
        : "text-tinta-suave bg-superficie";
  const leitura =
    variacao.sentido === "alta"
      ? `Subiu: ${variacao.texto}`
      : variacao.sentido === "queda"
        ? `Caiu: ${variacao.texto}`
        : variacao.texto;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tinta-suave">
      <span
        data-variacao={variacao.sentido}
        className={`inline-flex items-center gap-1 rounded-[var(--raio-completo)] px-2 py-0.5 font-semibold ${cor}`}
      >
        <Seta sentido={variacao.sentido} />
        <span className="sc-so-leitor">{leitura}</span>
        <span aria-hidden="true">{variacao.texto}</span>
      </span>
      <span>antes: {anteriorTexto}</span>
    </p>
  );
}

export interface CartaoDeNumeroProps {
  readonly nome: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly detalhe?: ReactNode;
  readonly variacao?: Variacao | null | undefined;
  readonly anteriorTexto?: string | undefined;
  readonly icone: Icone;
  readonly atalho?: { readonly href: string; readonly texto: string } | undefined;
  readonly destaque?: boolean | undefined;
  /** O que o número significa, atrás do "i" ao lado do rótulo. */
  readonly info?: ConteudoDoInfo | undefined;
}

export function CartaoDeNumero({
  nome,
  rotulo,
  valor,
  detalhe,
  variacao,
  anteriorTexto,
  icone: Desenho,
  atalho,
  destaque,
  info,
}: CartaoDeNumeroProps) {
  return (
    <div
      data-metrica={nome}
      data-destaque={destaque || undefined}
      className={[
        "flex min-w-0 flex-col gap-2 rounded-[var(--raio-cartao)] border bg-superficie-alta p-4 shadow-[var(--sombra-larga)] min-[540px]:p-5",
        destaque ? "border-[var(--cor-primaria)]" : "border-borda",
      ].join(" ")}
    >
      <dt className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 [overflow-wrap:anywhere]">
          {rotulo}
          {info !== undefined && <Info rotulo={rotulo} conteudo={info} />}
        </span>
        {/* No celular o cartão é estreito: o desenho sai para o "i" não
            disputar lugar com ele. */}
        <span className="hidden size-8 shrink-0 min-[540px]:inline-flex items-center justify-center rounded-[var(--raio-botao)] bg-superficie text-tinta-suave">
          <Desenho className="size-4" />
        </span>
      </dt>
      <dd className="m-0 flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-xl leading-none min-[540px]:text-[1.75rem] font-semibold tracking-[-0.03em] tabular-nums break-words">
          {valor}
        </span>
        {variacao ? (
          <Comparativo variacao={variacao} anteriorTexto={anteriorTexto ?? ""} />
        ) : null}
        {detalhe ? <span className="text-xs text-tinta-suave">{detalhe}</span> : null}
        {atalho ? (
          <Link
            href={atalho.href}
            className="mt-auto inline-flex min-h-[var(--altura-toque)] items-center text-sm font-semibold text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
          >
            {atalho.texto} →
          </Link>
        ) : null}
      </dd>
    </div>
  );
}

export function EsqueletoDoCartao() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-[8.5rem] flex-col gap-3 rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-5"
    >
      <span className="sc-esqueleto__linha !h-3 !w-1/2" />
      <span className="sc-esqueleto__linha !h-8 !w-2/3" />
      <span className="sc-esqueleto__linha !h-3 !w-1/3" />
    </div>
  );
}

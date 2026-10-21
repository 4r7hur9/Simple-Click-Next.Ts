/**
 * A identificação da loja no topo do menu: o nome da loja atual, o selo do
 * papel da pessoa nela (Dono ou Equipe) e, para quem tem mais de uma loja, o
 * atalho para trocar.
 */
import { IconeLoja, IconeTrocar } from "@simpleclick/ui";
import Link from "next/link";

import { rotuloDoPapel } from "../../lib/permissoes.ts";
import { FOCO } from "./estilo-do-menu.ts";

export function SeloDoPapel({ papel }: { readonly papel: string }) {
  const dono = papel === "OWNER";
  return (
    <span
      className={`inline-flex items-center rounded-[var(--raio-completo)] px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${
        dono
          ? "bg-[var(--cor-primaria)] text-[var(--cor-em-primaria)]"
          : "border border-[var(--cor-borda-forte)] text-[var(--cor-tinta)]"
      }`}
    >
      {rotuloDoPapel(papel)}
    </span>
  );
}

export function CabecalhoDaLoja({
  nomeDaLoja,
  papel,
  temOutrasLojas,
}: {
  readonly nomeDaLoja: string;
  readonly papel: string;
  readonly temOutrasLojas: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[var(--raio)] bg-[var(--cor-superficie-alta)] p-3">
      <p className="flex min-w-0 items-center gap-2 text-sm text-[var(--cor-tinta)]">
        <IconeLoja className="size-4 shrink-0 text-[var(--cor-tinta-suave)]" />
        <strong className="truncate font-semibold">{nomeDaLoja}</strong>
      </p>
      <div className="flex items-center justify-between gap-2">
        <SeloDoPapel papel={papel} />
        {temOutrasLojas ? (
          <Link
            href="/escolher-loja"
            className={`inline-flex items-center gap-1 rounded-[var(--raio)] text-xs font-medium text-[var(--cor-tinta-suave)] hover:text-[var(--cor-tinta)] ${FOCO}`}
          >
            <IconeTrocar className="size-3.5" aria-hidden="true" />
            Trocar de loja
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** A versão de uma linha, para a barra do topo no celular. */
export function CabecalhoCompactoDaLoja({
  nomeDaLoja,
  papel,
}: {
  readonly nomeDaLoja: string;
  readonly papel: string;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-[var(--cor-tinta-suave)]">
      <strong className="truncate font-semibold text-[var(--cor-tinta)]">
        {nomeDaLoja}
      </strong>
      <SeloDoPapel papel={papel} />
    </p>
  );
}

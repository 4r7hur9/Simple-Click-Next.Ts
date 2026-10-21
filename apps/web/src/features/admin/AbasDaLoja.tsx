"use client";

/**
 * As abas da ficha da loja. Cada aba é uma página: o endereço guarda onde a
 * pessoa estava e o botão de voltar funciona. Todas ficam visíveis o tempo
 * todo; a da página atual leva o verde da marca.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AbaDaLoja {
  readonly rotulo: string;
  /** O que vem depois de `/admin/lojas/{id}`; vazio é o resumo. */
  readonly trecho: string;
}

export const ABAS_DA_LOJA: readonly AbaDaLoja[] = [
  { rotulo: "Resumo", trecho: "" },
  { rotulo: "Cadastro", trecho: "/cadastro" },
  { rotulo: "Contrato e documentos", trecho: "/documentos" },
  { rotulo: "Funcionalidades", trecho: "/funcionalidades" },
  { rotulo: "Histórico", trecho: "/historico" },
];

export function AbasDaLoja({ lojaId }: { readonly lojaId: string }) {
  const caminho = usePathname();
  const base = `/admin/lojas/${encodeURIComponent(lojaId)}`;
  return (
    <nav
      aria-label="Seções da loja"
      className="mt-6 overflow-x-auto overflow-y-hidden border-b border-[var(--cor-borda)]"
    >
      <ul className="flex min-w-max gap-1">
        {ABAS_DA_LOJA.map((aba) => {
          const destino = `${base}${aba.trecho}`;
          const atual = caminho === destino;
          return (
            <li key={aba.rotulo}>
              <Link
                href={destino}
                aria-current={atual ? "page" : undefined}
                className={`-mb-px inline-flex min-h-[var(--altura-toque)] items-center border-b-2 px-4 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--cor-foco)] ${
                  atual
                    ? "border-[var(--cor-primaria)] font-semibold text-[var(--cor-tinta)]"
                    : "border-transparent text-[var(--cor-tinta-suave)] hover:text-[var(--cor-tinta)]"
                }`}
              >
                {aba.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

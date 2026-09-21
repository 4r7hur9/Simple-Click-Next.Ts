import Link from "next/link";
import type { ReactNode } from "react";

export default function LayoutDaConfiguracao({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/painel"
      >
        ← Voltar ao painel
      </Link>
      <nav
        className="mt-6 flex flex-wrap gap-2"
        aria-label="Configurações da loja"
      >
        <Link
          className="sc-botao sc-botao--fantasma"
          href="/painel/config/aparencia"
        >
          Aparência
        </Link>
        <Link
          className="sc-botao sc-botao--fantasma"
          href="/painel/config/contato"
        >
          Contato
        </Link>
        <Link
          className="sc-botao sc-botao--fantasma"
          href="/painel/config/pagamento"
        >
          Pagamento
        </Link>
        <Link
          className="sc-botao sc-botao--fantasma"
          href="/painel/config/entrega"
        >
          Entrega
        </Link>
        <Link
          className="sc-botao sc-botao--fantasma"
          href="/painel/config/impressao"
        >
          Impressão
        </Link>
      </nav>
      {children}
    </div>
  );
}

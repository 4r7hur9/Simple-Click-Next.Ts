import Link from "next/link";
import type { ReactNode } from "react";

import { AvisosPendentes } from "../../../features/config/AvisosPendentes.tsx";

/**
 * Casca sem dados do painel da loja.
 *
 * A decisão de papel e de loja é feita no servidor pela API, antes de qualquer
 * consulta. Esta casca não busca nem serializa dado de loja, para que abrir
 * uma URL não vire uma fonte de enumeração de recursos.
 */
export default function LayoutDoPainel({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)]">
      <header className="border-b border-[var(--cor-borda)] bg-[var(--cor-superficie)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/painel"
            className="text-xl font-semibold tracking-[-0.04em]"
          >
            simpleclick
          </Link>
          <nav aria-label="Navegação do painel">
            <ul className="flex flex-wrap items-center gap-2">
              <li>
                <Link className="sc-botao sc-botao--fantasma" href="/painel">
                  Visão geral
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/painel/metricas"
                >
                  Métricas
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/l/pastelaria-da-vila"
                >
                  Ver minha loja
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/minha-conta/seguranca"
                >
                  Segurança
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/painel/config/aparencia"
                >
                  Configurar loja
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/painel/pedidos"
                >
                  Pedidos
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/painel/categorias"
                >
                  Categorias
                </Link>
              </li>
              <li>
                <Link
                  className="sc-botao sc-botao--fantasma"
                  href="/painel/produtos"
                >
                  Produtos
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main aria-label="Painel da loja">
        <AvisosPendentes />
        {children}
      </main>
    </div>
  );
}

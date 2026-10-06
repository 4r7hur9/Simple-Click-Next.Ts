import Link from "next/link";
import type { ReactNode } from "react";

import { AvisoDeSuspensao } from "../../../features/config/AvisoDeSuspensao.tsx";
import { AvisosPendentes } from "../../../features/config/AvisosPendentes.tsx";
import { exigirLojaDaPagina } from "../../../server/loja-da-pagina.ts";

/**
 * Casca do painel da loja.
 *
 * A loja vem da sessão (T-115): sem sessão a pessoa vai para a entrada, e
 * dono de mais de uma loja escolhe antes de ver o painel. A casca mostra só o
 * nome e o apelido da loja da própria sessão — o acesso a cada dado continua
 * decidido pela API, que confere o vínculo do dono em toda rota.
 */
export default async function LayoutDoPainel({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { loja, lojas } = await exigirLojaDaPagina();
  return (
    <div className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)]">
      <header className="border-b border-[var(--cor-borda)] bg-[var(--cor-superficie)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col">
            <Link
              href="/painel"
              className="text-xl font-semibold tracking-[-0.04em]"
            >
              simpleclick
            </Link>
            <p className="text-sm text-[var(--cor-tinta-suave)]">
              Loja: <strong className="font-semibold">{loja.nome}</strong>
            </p>
          </div>
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
                  href={`/l/${encodeURIComponent(loja.apelido)}`}
                >
                  Ver minha loja
                </Link>
              </li>
              {lojas.length > 1 ? (
                <li>
                  <Link
                    className="sc-botao sc-botao--fantasma"
                    href="/escolher-loja"
                  >
                    Trocar de loja
                  </Link>
                </li>
              ) : null}
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
        {/* A suspensão vem antes das pendências: com a loja fora do ar,
            é o que o dono precisa ler primeiro (AC-209). */}
        <AvisoDeSuspensao />
        <AvisosPendentes />
        {children}
      </main>
    </div>
  );
}

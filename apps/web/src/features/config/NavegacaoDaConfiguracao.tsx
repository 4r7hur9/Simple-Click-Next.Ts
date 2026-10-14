"use client";

/**
 * A navegação das configurações do dono, sem a área que a administração
 * desligou para a loja (T-207 — AC-212).
 *
 * A lista vem de `secoes.ts`; o que muda aqui é só esconder a seção cuja
 * funcionalidade está desligada, lida de `/api/loja/funcionalidades`. Até a
 * resposta chegar — e se a leitura falhar — a navegação é a completa, a mesma
 * que o servidor desenha: esconder é conforto, e quem barra a rota é a API.
 */

import { esquemaDasFuncionalidadesParaODono } from "@simpleclick/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { navegacaoVisivel, type ItemDaNavegacao } from "./secoes.ts";

/** Enquanto não se sabe, nada está desligado. */
const SEM_RESPOSTA_AINDA: ReadonlySet<string> = new Set();

export function NavegacaoDaConfiguracaoNaTela({
  itens,
}: {
  readonly itens: readonly ItemDaNavegacao[];
}) {
  const caminho = usePathname();
  return (
    <nav
      className="mt-6 -mx-1 overflow-x-auto px-1 pb-1"
      aria-label="Configurações da loja"
    >
      <ul className="flex w-max gap-2">
        {itens.map((item) => {
          const atual = caminho === item.href;
          return (
            <li key={item.secao}>
              <Link
                aria-current={atual ? "page" : undefined}
                className={`inline-flex min-h-[var(--altura-toque)] items-center rounded-[var(--raio-completo)] border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)] motion-safe:transition-colors motion-safe:duration-150 ${
                  atual
                    ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] font-semibold text-[var(--cor-em-primaria)]"
                    : "border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] text-[var(--cor-tinta-suave)] hover:border-[var(--cor-borda-forte)] hover:text-[var(--cor-tinta)]"
                }`}
                href={item.href}
              >
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * As seções que a loja pode configurar agora, sem as desligadas pela
 * administração. Também alimenta os subitens de "Configurações" no menu
 * lateral do painel.
 */
export function useNavegacaoDaConfiguracao(): readonly ItemDaNavegacao[] {
  const [desligadas, setDesligadas] =
    useState<ReadonlySet<string>>(SEM_RESPOSTA_AINDA);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const resposta = await fetch("/api/loja/funcionalidades", {
          cache: "no-store",
        });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const { funcionalidades } = esquemaDasFuncionalidadesParaODono.parse(
          await resposta.json(),
        );
        if (ativo) {
          setDesligadas(
            new Set(
              funcionalidades
                .filter((item) => !item.ligada)
                .map((item) => item.chave),
            ),
          );
        }
      } catch {
        if (ativo) setDesligadas(new Set());
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return navegacaoVisivel(desligadas);
}

export function NavegacaoDaConfiguracao() {
  return <NavegacaoDaConfiguracaoNaTela itens={useNavegacaoDaConfiguracao()} />;
}

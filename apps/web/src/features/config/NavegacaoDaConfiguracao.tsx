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
import { useEffect, useState } from "react";

import { navegacaoVisivel, type ItemDaNavegacao } from "./secoes.ts";

/** Enquanto não se sabe, nada está desligado. */
const SEM_RESPOSTA_AINDA: ReadonlySet<string> = new Set();

export function NavegacaoDaConfiguracaoNaTela({
  itens,
}: {
  readonly itens: readonly ItemDaNavegacao[];
}) {
  return (
    <nav
      className="mt-6 flex flex-wrap gap-2"
      aria-label="Configurações da loja"
    >
      {itens.map((item) => (
        <Link
          key={item.secao}
          className="sc-botao sc-botao--fantasma"
          href={item.href}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function NavegacaoDaConfiguracao() {
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

  return <NavegacaoDaConfiguracaoNaTela itens={navegacaoVisivel(desligadas)} />;
}

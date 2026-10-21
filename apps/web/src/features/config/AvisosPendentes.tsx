"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Aviso } from "@simpleclick/ui";

interface Pendencia {
  readonly codigo: string;
  readonly titulo: string;
  readonly descricao: string;
  readonly href: string | null;
}

interface RespostaDasPendencias {
  readonly pendencias: Pendencia[];
}

/**
 * Mostra no painel o que ainda impede uma configuração completa da loja.
 * Falha de leitura não vira um aviso falso: o dono pode continuar usando o
 * painel e tentar novamente na próxima navegação.
 */
export function AvisosPendentes() {
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);

  useEffect(() => {
    void fetch("/api/loja/pendencias", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as RespostaDasPendencias;
      })
      .then((dados) => setPendencias(dados.pendencias))
      .catch(() => setPendencias([]));
  }, []);

  if (pendencias === null || pendencias.length === 0) return null;

  return (
    <Aviso
      tom="atencao"
      titulo="Sua loja ainda precisa de atenção"
      className="mx-auto mt-8 max-w-7xl"
    >
      <ul className="space-y-4">
        {pendencias.map((pendencia) => (
          <li
            key={pendencia.codigo}
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <p className="font-medium">{pendencia.titulo}</p>
              <p className="mt-1 text-sm">{pendencia.descricao}</p>
            </div>
            {pendencia.href === null ? null : (
              <Link
                className="sc-botao sc-botao--secundaria whitespace-nowrap"
                href={pendencia.href}
              >
                Configurar
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Aviso>
  );
}

"use client";

/**
 * O "Sair" do menu: um item como os outros, que encerra a sessão. A ação de
 * sair vem do servidor (mesma da barra do usuário) e leva de volta à página
 * pública.
 */
import { IconeSair } from "@simpleclick/ui";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { classeDoItem, NOME_DO_ITEM } from "./estilo-do-menu.ts";

export function SairDoMenu({
  sair,
}: {
  readonly sair: (caminho: string) => Promise<void>;
}) {
  const caminho = usePathname();
  const [saindo, iniciarSaida] = useTransition();
  return (
    <button
      type="button"
      disabled={saindo}
      onClick={() => {
        iniciarSaida(async () => {
          await sair(caminho ?? "/");
        });
      }}
      className={`${classeDoItem(false)} disabled:opacity-60`}
    >
      <IconeSair className="shrink-0" />
      <span className={NOME_DO_ITEM} data-nome-do-item>
        {saindo ? "Saindo…" : "Sair"}
      </span>
    </button>
  );
}

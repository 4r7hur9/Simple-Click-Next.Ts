"use client";

/**
 * O menu da administração da plataforma: os itens do `MenuLateral`.
 *
 * Mora no cliente porque os ícones são componentes, e componente não atravessa
 * a fronteira servidor → cliente como propriedade.
 */

import { IconeLoja, IconeSeguranca } from "@simpleclick/ui";
import Link from "next/link";

import { MenuLateral, type ItemDoMenu } from "./MenuLateral.tsx";

const LOJAS: ItemDoMenu = {
  rotulo: "Lojas",
  href: "/admin/lojas",
  icone: IconeLoja,
};
const AUDITORIA: ItemDoMenu = {
  rotulo: "Auditoria",
  href: "/admin/auditoria",
  icone: IconeSeguranca,
};

export function MenuDaAdministracao() {
  return (
    <MenuLateral
      rotulo="Navegação da administração"
      marca={
        <Link
          href="/admin/lojas"
          className="font-[family-name:var(--fonte-titulo)] text-xl font-semibold tracking-[-0.04em] text-[var(--cor-tinta)]"
        >
          simpleclick
        </Link>
      }
      contexto={
        <p className="truncate text-sm text-[var(--cor-tinta-suave)]">
          Administração da plataforma
        </p>
      }
      itens={[LOJAS, AUDITORIA]}
      atalhos={[LOJAS, AUDITORIA]}
    />
  );
}

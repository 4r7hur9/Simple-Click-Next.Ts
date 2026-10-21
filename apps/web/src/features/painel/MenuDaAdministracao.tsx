"use client";

/**
 * O menu da administração da plataforma, no `MenuLateral` (card #29).
 *
 * Todas as funções ficam visíveis, agrupadas em seções, sem submenu escondido:
 * Início, Lojas (todas, pendentes com o número que espera, nova), Contas e
 * Auditoria. "Minha conta" e "Sair" vêm no pé do menu (`usuario`).
 *
 * Mora no cliente porque os ícones são componentes, e componente não atravessa
 * a fronteira servidor → cliente como propriedade. O número de lojas
 * pendentes chega pronto do layout, que o lê no servidor.
 */

import {
  IconeClientes,
  IconeAdicionar,
  IconeInicio,
  IconeLoja,
  IconeSeguranca,
  IconeRelogio,
} from "@simpleclick/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { MenuLateral, type SecaoDoMenu } from "./MenuLateral.tsx";
import type { ItemDoMenu } from "./tipos-do-menu.ts";

/** Os itens do menu da administração, com o número de lojas pendentes. */
export function secoesDaAdministracao(pendentes: number): {
  readonly secoes: readonly SecaoDoMenu[];
  readonly atalhos: readonly ItemDoMenu[];
} {
  const inicio: ItemDoMenu = {
    rotulo: "Início",
    href: "/admin",
    icone: IconeInicio,
    exato: true,
  };
  const todas: ItemDoMenu = {
    rotulo: "Todas as lojas",
    href: "/admin/lojas",
    icone: IconeLoja,
    excluir: ["/admin/lojas/nova"],
  };
  const pendentesDeAprovacao: ItemDoMenu = {
    rotulo: "Pendentes",
    href: "/admin/lojas?situacao=PENDING_APPROVAL",
    icone: IconeRelogio,
    contador: pendentes,
  };
  const nova: ItemDoMenu = {
    rotulo: "Nova loja",
    href: "/admin/lojas/nova",
    icone: IconeAdicionar,
  };
  const contas: ItemDoMenu = {
    rotulo: "Contas",
    href: "/admin/contas",
    icone: IconeClientes,
  };
  const auditoria: ItemDoMenu = {
    rotulo: "Auditoria",
    href: "/admin/auditoria",
    icone: IconeSeguranca,
  };
  return {
    secoes: [
      { itens: [inicio] },
      { titulo: "Lojas", itens: [todas, pendentesDeAprovacao, nova] },
      { titulo: "Pessoas", itens: [contas] },
      { titulo: "Segurança", itens: [auditoria] },
    ],
    // Cinco atalhos na barra de baixo do celular; "Nova loja" fica na gaveta.
    atalhos: [inicio, todas, pendentesDeAprovacao, contas, auditoria],
  };
}

export function MenuDaAdministracao({
  usuario,
  pendentes = 0,
}: {
  /** Quem está logado, montado pelo layout (avatar, Minha conta, Sair). */
  readonly usuario?: ReactNode;
  /** Lojas esperando aprovação, lidas no servidor pelo layout. */
  readonly pendentes?: number;
} = {}) {
  const { secoes, atalhos } = secoesDaAdministracao(pendentes);
  return (
    <MenuLateral
      rotulo="Navegação da administração"
      marca={
        <Link
          href="/admin"
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
      secoes={secoes}
      atalhos={atalhos}
      usuario={usuario}
    />
  );
}

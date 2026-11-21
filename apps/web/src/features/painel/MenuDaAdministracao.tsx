"use client";

/**
 * O menu da administração da plataforma, no `MenuLateral` (cards 29 e 170).
 *
 * Plano: um item por tela, sem destino repetido, sem submenu nem sanfona
 * (D-12): Visão geral, Aprovações (com o número que espera), Lojas, Pessoas,
 * Donos e equipes, Auditoria e Configurações. "Nova loja" e "Cadastrar pessoa"
 * são botões das listas, não itens do menu. "Minha conta" e "Sair" vêm no pé
 * do menu (`usuario`). O menu usa o modo `administracao` (D-13): selo e fundo
 * próprios, vindos do design system.
 *
 * Mora no cliente porque os ícones são componentes, e componente não atravessa
 * a fronteira servidor → cliente como propriedade. O número de lojas
 * pendentes chega pronto do layout, que o lê no servidor.
 */

import {
  IconeClientes,
  IconeConfiguracoes,
  IconeEquipe,
  IconeInicio,
  IconeLoja,
  IconeRelogio,
  IconeSeguranca,
} from "@simpleclick/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { MenuLateral, type SecaoDoMenu } from "./MenuLateral.tsx";
import type { ItemDoMenu } from "./tipos-do-menu.ts";

/** Os sete itens do menu da administração, com o número de lojas pendentes. */
export function secoesDaAdministracao(pendentes: number): {
  readonly secoes: readonly SecaoDoMenu[];
  readonly atalhos: readonly ItemDoMenu[];
} {
  const visaoGeral: ItemDoMenu = {
    rotulo: "Visão geral",
    href: "/admin",
    icone: IconeInicio,
    exato: true,
  };
  const aprovacoes: ItemDoMenu = {
    rotulo: "Aprovações",
    href: "/admin/aprovacoes",
    icone: IconeRelogio,
    contador: pendentes,
  };
  const lojas: ItemDoMenu = {
    rotulo: "Lojas",
    href: "/admin/lojas",
    icone: IconeLoja,
  };
  const pessoas: ItemDoMenu = {
    rotulo: "Pessoas",
    href: "/admin/contas",
    icone: IconeClientes,
  };
  const donosEEquipes: ItemDoMenu = {
    rotulo: "Donos e equipes",
    href: "/admin/donos-e-equipes",
    icone: IconeEquipe,
  };
  const auditoria: ItemDoMenu = {
    rotulo: "Auditoria",
    href: "/admin/auditoria",
    icone: IconeSeguranca,
  };
  const configuracoes: ItemDoMenu = {
    rotulo: "Configurações",
    href: "/admin/configuracoes",
    icone: IconeConfiguracoes,
  };
  return {
    secoes: [
      {
        itens: [
          visaoGeral,
          aprovacoes,
          lojas,
          pessoas,
          donosEEquipes,
          auditoria,
          configuracoes,
        ],
      },
    ],
    // Quatro atalhos e o botão "Menu", que abre a gaveta com os sete itens.
    atalhos: [visaoGeral, aprovacoes, lojas, pessoas],
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
      modo="administracao"
      secoes={secoes}
      atalhos={atalhos}
      botaoDoMenuNosAtalhos
      usuario={usuario}
    />
  );
}

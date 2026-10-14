"use client";

/**
 * O menu do painel do dono: os itens do `MenuLateral` para uma loja.
 *
 * Mora no cliente porque os ícones são componentes, e componente não atravessa
 * a fronteira servidor → cliente como propriedade. O layout manda só o que é
 * dado: o nome e o apelido da loja e se a pessoa tem mais de uma.
 *
 * Os subitens de "Configurações" são os mesmos da navegação das
 * configurações, sem a seção que a administração desligou (AC-212).
 */

import {
  IconeAbrirFora,
  IconeCategoria,
  IconeClientes,
  IconeConfiguracoes,
  IconeInicio,
  IconeMetricas,
  IconePedido,
  IconeProduto,
  IconeSeguranca,
  IconeTrocar,
} from "@simpleclick/ui";
import Link from "next/link";

import { useNavegacaoDaConfiguracao } from "../config/NavegacaoDaConfiguracao.tsx";
import { MenuLateral, type ItemDoMenu } from "./MenuLateral.tsx";

export function MenuDoPainel({
  nomeDaLoja,
  apelidoDaLoja,
  temOutrasLojas,
}: {
  readonly nomeDaLoja: string;
  readonly apelidoDaLoja: string;
  readonly temOutrasLojas: boolean;
}) {
  const secoes = useNavegacaoDaConfiguracao();

  const inicio: ItemDoMenu = {
    rotulo: "Início",
    href: "/painel",
    icone: IconeInicio,
    exato: true,
  };
  const pedidos: ItemDoMenu = {
    rotulo: "Pedidos",
    href: "/painel/pedidos",
    icone: IconePedido,
  };
  const produtos: ItemDoMenu = {
    rotulo: "Produtos",
    href: "/painel/produtos",
    icone: IconeProduto,
  };
  const clientes: ItemDoMenu = {
    rotulo: "Clientes",
    href: "/painel/clientes",
    icone: IconeClientes,
  };
  const configuracoes: ItemDoMenu = {
    rotulo: "Configurações",
    href: secoes[0]?.href ?? "/painel/config/aparencia",
    icone: IconeConfiguracoes,
    subitens: secoes.map((secao) => ({
      rotulo: secao.rotulo,
      href: secao.href,
    })),
  };

  const itens: readonly ItemDoMenu[] = [
    inicio,
    pedidos,
    produtos,
    {
      rotulo: "Categorias",
      href: "/painel/categorias",
      icone: IconeCategoria,
    },
    clientes,
    { rotulo: "Métricas", href: "/painel/metricas", icone: IconeMetricas },
    configuracoes,
  ];

  const itensDoRodape: readonly ItemDoMenu[] = [
    {
      rotulo: "Ver minha loja",
      href: `/l/${encodeURIComponent(apelidoDaLoja)}`,
      icone: IconeAbrirFora,
    },
    ...(temOutrasLojas
      ? [
          {
            rotulo: "Trocar de loja",
            href: "/escolher-loja",
            icone: IconeTrocar,
          },
        ]
      : []),
    {
      rotulo: "Segurança",
      href: "/minha-conta/seguranca",
      icone: IconeSeguranca,
    },
  ];

  return (
    <MenuLateral
      rotulo="Navegação do painel"
      marca={
        <Link
          href="/painel"
          className="font-[family-name:var(--fonte-titulo)] text-xl font-semibold tracking-[-0.04em] text-[var(--cor-tinta)]"
        >
          simpleclick
        </Link>
      }
      contexto={
        <p className="truncate text-sm text-[var(--cor-tinta-suave)]">
          Loja: <strong className="font-semibold">{nomeDaLoja}</strong>
        </p>
      }
      itens={itens}
      itensDoRodape={itensDoRodape}
      atalhos={[
        pedidos,
        produtos,
        inicio,
        clientes,
        { ...configuracoes, rotulo: "Config" },
      ]}
    />
  );
}

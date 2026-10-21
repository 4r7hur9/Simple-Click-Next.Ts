/**
 * O endereço do carrinho (AC-500 a AC-503).
 *
 * O carrinho é uma JANELA sobre o cardápio; este endereço é o cardápio com a
 * janela já aberta no carrinho, a mesma lógica do checkout, do produto e do
 * Sobre. Fechar a janela deixa a pessoa no cardápio.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/produto.css";
import "@simpleclick/ui/styles/fechamento.css";

import type { Metadata } from "next";

import { buscarVitrine } from "../../../../../server/vitrine.ts";
import { TelaDoCatalogo } from "../cardapio/TelaDoCatalogo.tsx";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
}

/** O carrinho NÃO É INDEXÁVEL: é uma página de sessão, só faz sentido para quem tem carrinho. */
export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);

  return {
    title:
      vitrine.estado === "encontrada"
        ? `Carrinho · ${vitrine.vitrine.loja.nome}`
        : "Carrinho",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDoCarrinho({
  params,
}: ParametrosDaPagina) {
  const { slug } = await params;
  return <TelaDoCatalogo slug={slug} consulta={{}} carrinhoAberto />;
}

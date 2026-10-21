/**
 * O endereço do fechamento (AC-503 a AC-512).
 *
 * O FECHAMENTO É UMA JANELA sobre o cardápio — o segundo passo da janela do
 * carrinho. Este endereço é o cardápio com essa janela já aberta, a mesma
 * lógica do Sobre e do produto: o link direto continua funcionando, e fechar a
 * janela deixa a pessoa no cardápio, e não numa página sem saída.
 *
 * Nada da loja é carregado aqui além do cardápio: a configuração do fechamento
 * (com a chave PIX) e a conta de quem pede chegam pela ação da janela quando
 * ela abre (`acoes.ts`).
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

/**
 * O fechamento NÃO É INDEXÁVEL, e isso é de propósito: é uma página de sessão,
 * que só faz sentido para quem tem carrinho.
 */
export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);

  return {
    title:
      vitrine.estado === "encontrada"
        ? `Finalizar pedido · ${vitrine.vitrine.loja.nome}`
        : "Finalizar pedido",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDoFechamento({
  params,
}: ParametrosDaPagina) {
  const { slug } = await params;
  return <TelaDoCatalogo slug={slug} consulta={{}} fechamentoAberto />;
}

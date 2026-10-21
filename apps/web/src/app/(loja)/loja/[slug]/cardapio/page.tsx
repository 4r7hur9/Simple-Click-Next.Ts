/**
 * O cardápio da loja (AC-404, AC-405, AC-406, AC-407). A tela mora em
 * `TelaDoCatalogo`, que a rota do produto também usa; aqui ficam os metadados.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/produto.css";
import "@simpleclick/ui/styles/fechamento.css";

import type { Metadata } from "next";

import { buscarVitrine } from "../../../../../server/vitrine.ts";
import { enderecoDoCatalogo } from "../../../../../server/endereco-do-site.ts";

import { TelaDoCatalogo } from "./TelaDoCatalogo.tsx";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  if (resultado.estado !== "encontrada") {
    return { title: "Loja não disponível" };
  }

  const { loja } = resultado.vitrine;
  const titulo = `${loja.rotulos.catalogo} · ${loja.nome}`;
  const descricao =
    loja.boasVindas ??
    `Veja o ${loja.rotulos.catalogo.toLowerCase()} de ${loja.nome} e peça pelo WhatsApp.`;

  return {
    title: titulo,
    description: descricao,
    // O CANÔNICO NÃO CARREGA FILTRO NEM BUSCA (AC-403). `?categoria=bebidas` e
    // `?busca=pao` são a mesma página vista por um recorte: indexá-los como
    // páginas distintas espalharia a loja por dezenas de endereços quase
    // iguais, e o buscador chama isso de conteúdo duplicado.
    alternates: { canonical: enderecoDoCatalogo(loja.apelido) },
    openGraph: {
      title: titulo,
      description: descricao,
      url: enderecoDoCatalogo(loja.apelido),
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function PaginaDoCatalogo({
  params,
  searchParams,
}: ParametrosDaPagina) {
  const { slug } = await params;
  const consulta = await searchParams;
  return <TelaDoCatalogo slug={slug} consulta={consulta} />;
}

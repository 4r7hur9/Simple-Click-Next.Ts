/**
 * O endereço do "Sobre a loja" (AC-421 a AC-423).
 *
 * O Sobre é uma JANELA sobre a página da loja; este endereço é a loja com a
 * janela aberta. Existe para o link ser compartilhável e para o buscador ler o
 * texto — título, descrição e canônico continuam sendo os do Sobre.
 */
import type { Metadata } from "next";

import { TelaDaLoja } from "../TelaDaLoja.tsx";
import { enderecoSobreDaLoja } from "../../../../../server/endereco-do-site.ts";
import { buscarVitrine } from "../../../../../server/vitrine.ts";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
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
  return {
    title: `Sobre a ${loja.nome}`,
    description: loja.sobre ?? `Conheça a ${loja.nome}.`,
    alternates: { canonical: enderecoSobreDaLoja(loja.apelido) },
    openGraph: {
      title: `Sobre a ${loja.nome}`,
      description: loja.sobre ?? `Conheça a ${loja.nome}.`,
      url: enderecoSobreDaLoja(loja.apelido),
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
    },
  };
}

/**
 * A mesma página da loja, com a janela do Sobre já aberta. Fechar a janela
 * mostra a loja embaixo, sem navegar.
 */
export default async function PaginaSobreDaLoja({
  params,
}: ParametrosDaPagina) {
  const { slug } = await params;
  return <TelaDaLoja apelido={slug} sobreAberto />;
}

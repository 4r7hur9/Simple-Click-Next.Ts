import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SobreDaLoja } from "../../../../../features/loja/SobreDaLoja.tsx";
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

export default async function PaginaSobreDaLoja({
  params,
}: ParametrosDaPagina) {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  if (resultado.estado === "nao-encontrada") notFound();
  if (resultado.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${resultado.motivo}`);
  }

  const { loja } = resultado.vitrine;
  return <SobreDaLoja loja={loja} />;
}

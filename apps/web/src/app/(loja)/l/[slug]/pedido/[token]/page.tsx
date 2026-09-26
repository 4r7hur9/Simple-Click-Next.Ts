import "@simpleclick/ui/styles/vitrine.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA } from "@simpleclick/ui";

import { AcompanhamentoDoPedido } from "../../../../../../features/pedido/AcompanhamentoDoPedido.tsx";
import { buscarAcompanhamento } from "../../../../../../lib/acompanhamento.ts";
import { buscarVitrine } from "../../../../../../server/vitrine.ts";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string; readonly token: string }>;
}

export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);
  return {
    title:
      vitrine.estado === "encontrada"
        ? `Acompanhar pedido · ${vitrine.vitrine.loja.nome}`
        : "Acompanhar pedido",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDeAcompanhamento({
  params,
}: ParametrosDaPagina) {
  const { slug, token } = await params;
  const [vitrine, resultado] = await Promise.all([
    buscarVitrine(slug),
    buscarAcompanhamento(slug, token),
  ]);

  if (
    vitrine.estado === "nao-encontrada" ||
    resultado.estado === "nao-encontrado"
  ) {
    notFound();
  }
  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }
  if (resultado.estado === "indisponivel") {
    throw new Error(`acompanhamento indisponível: ${resultado.motivo}`);
  }

  return (
    <AcompanhamentoDoPedido
      apelidoDaLoja={slug}
      tokenDoPedido={token}
      inicial={resultado.acompanhamento.pedido}
      corPrincipal={
        vitrine.vitrine.loja.cores?.primaria ?? PALETA_CLARA.primaria
      }
    />
  );
}

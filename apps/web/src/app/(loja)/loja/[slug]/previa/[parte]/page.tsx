/**
 * A loja de verdade, com o rascunho da Aparência por cima (card #36).
 *
 * - `/loja/<loja>/previa/vitrine`: a página inicial da loja (`TelaDaLoja`).
 * - `/loja/<loja>/previa/cardapio`: o cardápio com o topo (`TelaDoCatalogo`).
 *
 * São as MESMAS telas das rotas públicas, dentro da MESMA moldura da loja (o
 * layout `[slug]`, com a barra do usuário e as folhas de estilo) — mesmos
 * componentes, mesmo CSS, mesma letra —, só que aqui elas recebem o rascunho
 * que o navegador do dono deixou no cookie. A tela de Aparência abre estas
 * rotas dentro de molduras com a largura de verdade (1280 px e 390 px), e por
 * isso os pontos de quebra do CSS respondem como respondem no aparelho do
 * cliente. Não são indexadas e não guardam nada.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/produto.css";
import "@simpleclick/ui/styles/fechamento.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { rascunhoDoPedido } from "../../../../../../server/previa.ts";
import { TelaDaLoja } from "../../TelaDaLoja.tsx";
import { TelaDoCatalogo } from "../../cardapio/TelaDoCatalogo.tsx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prévia da loja",
  robots: { index: false, follow: false },
};

export default async function PreviaDaLoja({
  params,
}: {
  readonly params: Promise<{ readonly slug: string; readonly parte: string }>;
}) {
  const { slug, parte } = await params;
  const rascunho = await rascunhoDoPedido(slug);

  const tela =
    parte === "vitrine" ? (
      <TelaDaLoja apelido={slug} sobreAberto={false} rascunho={rascunho} />
    ) : parte === "cardapio" ? (
      <TelaDoCatalogo slug={slug} consulta={{}} rascunho={rascunho} />
    ) : null;
  if (tela === null) notFound();

  return (
    <>
      {/* A prévia só mostra: nada de aviso de cookies por cima. */}
      <style>{".sc-cookies{display:none !important}"}</style>
      {tela}
    </>
  );
}

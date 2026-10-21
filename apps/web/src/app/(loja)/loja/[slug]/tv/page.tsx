/**
 * O cardápio na televisão da loja (AC-925 a AC-931).
 *
 * ENDEREÇO PÚBLICO, SEM LOGIN (ASM-032): ninguém vai digitar senha numa
 * televisão com controle remoto. O que a tela mostra é o mesmo catálogo
 * público da vitrine (ASM-031) — nada aqui é da configuração da loja —, então
 * não há o que proteger além do que a vitrine já expõe.
 *
 * O SERVIDOR DESENHA A PRIMEIRA TELA com o catálogo que já tem, e o navegador
 * assume a partir daí: avança as telas e busca o catálogo de novo de tempos em
 * tempos. As duas buscas saem em paralelo, como na vitrine.
 *
 * NÃO ENTRA NO BUSCADOR. É uma tela de parede, e indexá-la espalharia a loja
 * por um endereço que não serve a quem chega pela busca.
 */
import "@simpleclick/ui/styles/exibicao.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PALETA_ESCURA } from "@simpleclick/ui";

import { ExibicaoDeCardapio } from "../../../../../features/tv/ExibicaoDeCardapio.tsx";
import {
  PARAMETRO_DE_ATUALIZACAO,
  PARAMETRO_DE_SEGUNDOS,
  SEGUNDOS_DE_ATUALIZACAO_MAXIMO,
  SEGUNDOS_DE_ATUALIZACAO_MINIMO,
  SEGUNDOS_POR_TELA_MAXIMO,
  SEGUNDOS_POR_TELA_MINIMO,
  segundosDoParametro,
} from "../../../../../features/tv/ritmo.ts";
import { SEGUNDOS_ENTRE_ATUALIZACOES } from "../../../../../features/tv/useCatalogoDaTv.ts";
import { SEGUNDOS_POR_TELA } from "../../../../../features/tv/useRodizio.ts";
import { enderecoDoCatalogo } from "../../../../../server/endereco-do-site.ts";
import {
  buscarCatalogo,
  buscarVitrine,
} from "../../../../../server/vitrine.ts";

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_ESCURA.primaria;

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
    return { title: "Loja não disponível", robots: { index: false } };
  }

  const { loja } = resultado.vitrine;
  return {
    title: `${loja.rotulos.catalogo} na TV · ${loja.nome}`,
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDaTv({
  params,
  searchParams,
}: ParametrosDaPagina) {
  const { slug } = await params;
  const consulta = await searchParams;

  const [vitrine, catalogo] = await Promise.all([
    buscarVitrine(slug),
    buscarCatalogo(slug),
  ]);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402).
  if (
    vitrine.estado === "nao-encontrada" ||
    catalogo.estado === "nao-encontrada"
  ) {
    notFound();
  }

  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }

  const { loja } = vitrine.vitrine;

  return (
    <ExibicaoDeCardapio
      loja={{
        apelido: loja.apelido,
        nome: loja.nome,
        rotuloDoCatalogo: loja.rotulos.catalogo,
        corPrincipal: loja.tema?.corDestaque ?? COR_DE_RESERVA,
      }}
      // Catálogo indisponível NÃO derruba a página: a televisão abre em
      // "carregando", busca sozinha e mostra o cardápio assim que a rede
      // responder — sem ninguém precisar recarregar.
      catalogoInicial={
        catalogo.estado === "encontrado" ? catalogo.catalogo : null
      }
      enderecoDaVitrine={enderecoDoCatalogo(loja.apelido)}
      segundosPorTela={segundosDoParametro(
        consulta[PARAMETRO_DE_SEGUNDOS],
        SEGUNDOS_POR_TELA,
        SEGUNDOS_POR_TELA_MINIMO,
        SEGUNDOS_POR_TELA_MAXIMO,
      )}
      segundosEntreAtualizacoes={segundosDoParametro(
        consulta[PARAMETRO_DE_ATUALIZACAO],
        SEGUNDOS_ENTRE_ATUALIZACOES,
        SEGUNDOS_DE_ATUALIZACAO_MINIMO,
        SEGUNDOS_DE_ATUALIZACAO_MAXIMO,
      )}
    />
  );
}

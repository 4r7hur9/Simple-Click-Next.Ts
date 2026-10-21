/**
 * `GET /loja/{apelido}/sitemap.xml` — o mapa do site de uma loja (AC-403).
 *
 * É ROTA, e não o `sitemap.ts` do framework: dentro de um segmento dinâmico o
 * Next não passa `params` para a função de mapa, e o caminho previsto
 * (`generateSitemaps`) exigiria enumerar todas as lojas da plataforma para
 * servir a de uma. A razão inteira está em `server/mapa-do-site.ts`.
 *
 * Este arquivo é fino de propósito: arquivo de rota do Next só pode exportar os
 * verbos HTTP e a configuração de segmento, então toda regra que precise de
 * teste mora fora dele.
 */
import { mapaDaLoja, xmlDoMapa } from "../../../../../server/mapa-do-site";

interface ContextoDaRota {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function GET(
  _requisicao: Request,
  { params }: ContextoDaRota,
): Promise<Response> {
  const { slug } = await params;
  const paginas = await mapaDaLoja(slug);

  return new Response(xmlDoMapa(paginas), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // O robô do buscador volta muitas vezes e o mapa muda pouco. Uma hora
      // segura a rajada sem atrasar produto novo de forma perceptível — o
      // buscador leva mais que isso para reindexar de qualquer jeito.
      "cache-control": "public, max-age=3600",
    },
  });
}

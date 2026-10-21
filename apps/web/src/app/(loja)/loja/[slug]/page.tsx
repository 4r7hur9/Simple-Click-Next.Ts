/**
 * A página pública de uma loja (AC-400, AC-401, AC-402).
 *
 * Componente de SERVIDOR: o conteúdo chega pronto ao navegador, sem depender de
 * script para aparecer. É o que o AC-415 exige da vitrine e o que torna a página
 * encontrável — e é também o que faz a loja abrir em rede ruim, que é a condição
 * de quem está com fome na fila do ônibus.
 *
 * A busca acontece no servidor (`TelaDaLoja`), e não num efeito do lado do cliente: assim o servidor
 * já sabe se a loja existe antes de mandar qualquer coisa, e responde 404 de
 * verdade em vez de mandar uma página vazia que depois se conserta.
 */
import type { Metadata } from "next";

import { TelaDaLoja } from "./TelaDaLoja.tsx";
import { enderecoDaLoja } from "../../../../server/endereco-do-site.ts";
import { buscarVitrine } from "../../../../server/vitrine.ts";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * Título e descrição para o buscador e para quem compartilha o link.
 *
 * Loja indisponível recebe título genérico de propósito: o título aparece no
 * histórico do navegador e na prévia do compartilhamento, e dizer "Loja X não
 * existe" contaria o que o AC-402 manda não contar.
 */
export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  if (resultado.estado !== "encontrada") {
    return { title: "Loja não disponível" };
  }

  const { loja } = resultado.vitrine;
  const descricao = loja.boasVindas ?? `Peça em ${loja.nome} pelo WhatsApp.`;
  const canonico = enderecoDaLoja(loja.apelido);

  return {
    title: loja.nome,
    description: descricao,
    // O CANÔNICO É UM SÓ (AC-403). A mesma loja alcançável por dois caminhos
    // divide a relevância entre os dois, e o buscador escolhe um — normalmente
    // o que ninguém compartilhou. Declarar o oficial encerra a dúvida.
    alternates: { canonical: canonico },
    openGraph: {
      title: loja.nome,
      description: descricao,
      url: canonico,
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      // `summary_large_image` porque a imagem desenhada é 1200×630: no cartão
      // pequeno ela apareceria cortada num quadrado, sem o nome da loja.
      card: "summary_large_image",
      title: loja.nome,
      description: descricao,
    },
  };
}

export default async function PaginaDaLoja({ params }: ParametrosDaPagina) {
  const { slug } = await params;
  return <TelaDaLoja apelido={slug} sobreAberto={false} />;
}

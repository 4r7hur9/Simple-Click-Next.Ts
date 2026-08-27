/**
 * A página pública de uma loja (AC-400, AC-401, AC-402).
 *
 * Componente de SERVIDOR: o conteúdo chega pronto ao navegador, sem depender de
 * script para aparecer. É o que o AC-415 exige da vitrine e o que torna a página
 * encontrável — e é também o que faz a loja abrir em rede ruim, que é a condição
 * de quem está com fome na fila do ônibus.
 *
 * A busca acontece aqui, e não num efeito do lado do cliente: assim o servidor
 * já sabe se a loja existe antes de mandar qualquer coisa, e responde 404 de
 * verdade em vez de mandar uma página vazia que depois se conserta.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ApresentacaoDaLoja } from "../../../../features/loja/ApresentacaoDaLoja.tsx";
import { EntradaDaLoja } from "../../../../features/loja/EntradaDaLoja.tsx";
import {
  DadosEstruturados,
  negocioDaLoja,
} from "../../../../lib/dados-estruturados.tsx";
import {
  enderecoDaLoja,
  enderecoDoSite,
} from "../../../../server/endereco-do-site.ts";
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
  const resultado = await buscarVitrine(slug);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402). Distinguir aqui desfaria o cuidado tomado lá.
  if (resultado.estado === "nao-encontrada") notFound();

  if (resultado.estado === "indisponivel") {
    // API fora do ar não é loja inexistente. Mandar para o 404 faria o dono
    // achar que a loja dele sumiu quando o problema é nosso.
    throw new Error(`vitrine indisponível: ${resultado.motivo}`);
  }

  const { loja, abertura } = resultado.vitrine;

  return (
    <main className="sc-pagina-da-loja">
      {/*
        Os dados estruturados vão no CORPO, e não no `<head>`: o buscador lê os
        dois, e aqui o bloco fica ao lado do conteúdo que ele descreve — quem
        editar a apresentação vê o bloco na mesma tela e lembra dele.
      */}
      <DadosEstruturados
        dados={negocioDaLoja({ loja, enderecoDoSite: enderecoDoSite() })}
      />

      <ApresentacaoDaLoja
        loja={loja}
        abertura={abertura}
        linkDoCardapio={`/l/${loja.apelido}/catalogo`}
        rotuloDoCatalogo={loja.rotulos.catalogo}
      />
      {/*
        A entrada vem DEPOIS do conteúdo, e não em volta dele. Ela não desenha
        nada: acha os blocos que já estão na página e os anima. Se nunca rodar,
        a página continua inteira.
      */}
      <EntradaDaLoja />
    </main>
  );
}

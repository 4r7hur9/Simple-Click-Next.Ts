/**
 * A página de um produto (AC-410, AC-413, AC-414).
 *
 * É O CARDÁPIO COM A JANELA DO PRODUTO ABERTA — a mesma lógica do Sobre. No
 * cardápio, tocar num produto abre a janela sem trocar de página (e o endereço
 * vira este); aberto do zero, este endereço desenha o cardápio no servidor com
 * a janela já aberta por cima. Fechar deixa a pessoa no cardápio, e não numa
 * página sem saída.
 *
 * O ENDEREÇO CONTINUA COMPARTILHÁVEL e indexável (AC-414): o conteúdo da
 * janela sai pronto do servidor, os metadados abaixo dão a prévia do
 * compartilhamento e o bloco de dados estruturados descreve o produto.
 *
 * O produto é buscado DEPOIS da vitrine porque precisa saber se a loja está
 * aberta — é a apresentação que sabe o horário.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/produto.css";
import "@simpleclick/ui/styles/fechamento.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  DadosEstruturados,
  produtoParaBuscador,
} from "../../../../../../lib/dados-estruturados.tsx";
import {
  enderecoDoProduto,
  enderecoDoSite,
} from "../../../../../../server/endereco-do-site.ts";
import {
  buscarProduto,
  resumoParaCompartilhar,
} from "../../../../../../server/produto.ts";
import { buscarVitrine } from "../../../../../../server/vitrine.ts";
import { TelaDoCatalogo } from "../../cardapio/TelaDoCatalogo.tsx";

interface ParametrosDaPagina {
  readonly params: Promise<{
    readonly slug: string;
    readonly id: string;
  }>;
}

/**
 * Título, descrição e a prévia do compartilhamento (AC-414).
 *
 * O PREÇO ENTRA NA DESCRIÇÃO porque é o que a pessoa que recebe o link quer
 * saber antes de abrir. A IMAGEM do compartilhamento é a foto principal do
 * produto — a imagem desenhada com nome e preço é da T-406, e apontar para ela
 * antes de ela existir daria uma prévia quebrada em toda rede social.
 */
export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug, id } = await params;
  const vitrine = await buscarVitrine(slug);

  if (vitrine.estado !== "encontrada") {
    return { title: "Produto não disponível" };
  }

  const produto = await buscarProduto(id, { apelidoDaLoja: slug });
  if (produto.estado !== "encontrado") {
    return { title: "Produto não disponível" };
  }

  const { loja } = vitrine.vitrine;
  const item = produto.produto;
  const comPreco = resumoParaCompartilhar(item, loja.nome);
  const canonico = enderecoDoProduto(loja.apelido, id);

  return {
    title: `${item.nome} · ${loja.nome}`,
    description: comPreco,
    // O ENDEREÇO DO PRODUTO É ÚNICO (AC-414): o mesmo item pode ser alcançado
    // por mais de uma seção, e sem canônico o buscador trataria cada caminho
    // como um produto diferente da mesma loja.
    alternates: { canonical: canonico },
    openGraph: {
      title: `${item.nome} · ${loja.nome}`,
      description: comPreco,
      url: canonico,
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${item.nome} · ${loja.nome}`,
      description: comPreco,
    },
  };
}

export default async function PaginaDoProduto({ params }: ParametrosDaPagina) {
  const { slug, id } = await params;

  const vitrine = await buscarVitrine(slug);
  if (vitrine.estado === "nao-encontrada") notFound();
  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }

  const { loja, abertura } = vitrine.vitrine;

  // O produto é buscado DEPOIS da vitrine porque precisa saber se a loja está
  // aberta — é a apresentação que sabe o horário, e a rota do produto não
  // devolve isso de propósito, para não haver duas cópias da regra.
  const resultado = await buscarProduto(id, {
    apelidoDaLoja: slug,
    lojaAberta: abertura.aberta,
  });

  if (resultado.estado === "nao-encontrado") notFound();
  if (resultado.estado === "indisponivel") {
    throw new Error(`produto indisponível: ${resultado.motivo}`);
  }

  const produto = resultado.produto;

  return (
    <>
      <DadosEstruturados
        dados={produtoParaBuscador({
          loja,
          nome: produto.nome,
          descricao: produto.descricao ?? produto.chamada,
          imagens: produto.imagens.map((imagem) => imagem.url),
          precoCentavos: produto.precoCentavos,
          disponivel: produto.disponivel,
          enderecoDoProduto: enderecoDoProduto(loja.apelido, id),
          enderecoDoSite: enderecoDoSite(),
        })}
      />
      <TelaDoCatalogo slug={slug} consulta={{}} produtoAberto={produto} />
    </>
  );
}

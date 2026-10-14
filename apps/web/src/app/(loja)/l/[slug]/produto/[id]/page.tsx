/**
 * A página de um produto (AC-410, AC-413, AC-414).
 *
 * COMPONENTE DE SERVIDOR. As imagens, a descrição e o preço de abertura chegam
 * prontos ao navegador — só o formulário de escolhas é de navegador, e ele é
 * quem precisa ser, porque o AC-411 exige o total mudando na hora.
 *
 * AS DUAS BUSCAS SAEM JUNTAS, como no catálogo: a apresentação diz o nome, a
 * cor e se a loja está ABERTA; a rota do produto diz o resto. Em série, o tempo
 * até a primeira imagem seria a soma das duas idas.
 *
 * O ENDEREÇO É COMPARTILHÁVEL (AC-414): tudo que a página precisa está no
 * caminho — o apelido da loja e o identificador do produto. Não há estado
 * escondido em sessão, então o link aberto em outro aparelho chega ao mesmo
 * lugar. A prévia do compartilhamento vem dos metadados abaixo.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/produto.css";

import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { EscolhasDoProduto } from "../../../../../../features/produto/EscolhasDoProduto.tsx";
import { SeloDePreco } from "../../../../../../features/produto/SeloDePreco.tsx";
import { BarraDoTopo } from "../../../../../../features/vitrine/BarraDoTopo.tsx";
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

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

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
  const capa = produto.imagens[0];

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-pagina-da-loja"
    >
      <BarraDoTopo
        apelidoDaLoja={loja.apelido}
        nomeDaLoja={loja.nome}
        logo={loja.logo}
        rotuloDoCatalogo={loja.rotulos.catalogo}
      />

      <main className="sc-produto">
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

        <nav className="sc-produto__caminho" aria-label="Você está em">
          <a className="sc-vitrine__voltar" href={produto.linkDoCatalogo}>
            ← {loja.rotulos.catalogo}
          </a>
          {produto.linkDaSecao && produto.nomeDaSecao ? (
            <a className="sc-vitrine__voltar" href={produto.linkDaSecao}>
              {produto.nomeDaSecao}
            </a>
          ) : null}
        </nav>

        {capa ? (
          <figure className="sc-produto__figura">
            {/*
              A moldura tem proporção fixa no estilo e a foto a preenche
              (`fill`): o espaço existe antes de ela chegar, e a página não
              pula quando a foto carrega (AC-416) — saiba o catálogo a
              dimensão da foto ou não.
            */}
            <Image
              className="sc-produto__foto"
              src={capa.url}
              alt={capa.texto ?? ""}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 36rem"
            />
          </figure>
        ) : null}

        <header className="sc-produto__cabecalho">
          <h1 className="sc-produto__nome">{produto.nome}</h1>
          {produto.chamada ? (
            <p className="sc-produto__chamada">{produto.chamada}</p>
          ) : null}
          <SeloDePreco
            preco={produto.preco}
            precoAnterior={produto.precoAnterior}
          />
        </header>

        {produto.descricao ? (
          <section className="sc-produto__descricao" aria-labelledby="sobre">
            <h2 className="sc-produto__secao-nome" id="sobre">
              Sobre o item
            </h2>
            <p>{produto.descricao}</p>
          </section>
        ) : null}

        {/*
          As imagens seguintes vêm DEPOIS da descrição e do preço: quem abriu o
          produto quer decidir, e a segunda foto ajuda menos que o preço.
        */}
        {produto.imagens.length > 1 ? (
          <section className="sc-produto__galeria" aria-label="Mais imagens">
            <ul className="sc-vitrine__tira" tabIndex={0}>
              {produto.imagens.slice(1).map((imagem) => (
                <li className="sc-produto__galeria-item" key={imagem.url}>
                  <Image
                    src={imagem.url}
                    alt={imagem.texto ?? ""}
                    width={320}
                    height={320}
                    loading="lazy"
                    sizes="10rem"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <EscolhasDoProduto
          produto={produto}
          apelidoDaLoja={loja.apelido}
          rotulos={loja.rotulos}
        />
      </main>
    </TemaDaLoja>
  );
}

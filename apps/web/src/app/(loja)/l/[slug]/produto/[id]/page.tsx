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

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { EscolhasDoProduto } from "../../../../../../features/produto/EscolhasDoProduto.tsx";
import { SeloDePreco } from "../../../../../../features/produto/SeloDePreco.tsx";
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
  const capa = item.imagens[0];

  return {
    title: `${item.nome} · ${loja.nome}`,
    description: comPreco,
    openGraph: {
      title: `${item.nome} · ${loja.nome}`,
      description: comPreco,
      type: "website",
      ...(capa ? { images: [{ url: capa.url }] } : {}),
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
      <main className="sc-produto">
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
            <img
              className="sc-produto__foto"
              src={capa.url}
              alt={capa.texto ?? ""}
              // A dimensão vai na marcação quando o catálogo a conhece, para a
              // página não pular quando a foto chegar (AC-416). Sem ela, a
              // proporção do estilo segura o espaço.
              {...(capa.largura !== null && capa.altura !== null
                ? { width: capa.largura, height: capa.altura }
                : {})}
              loading="eager"
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
                  <img
                    src={imagem.url}
                    alt={imagem.texto ?? ""}
                    loading="lazy"
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

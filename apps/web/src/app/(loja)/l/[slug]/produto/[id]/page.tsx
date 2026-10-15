/**
 * A página de um produto (AC-410, AC-413, AC-414).
 *
 * COMPONENTE DE SERVIDOR. As fotos, a descrição e o preço de abertura chegam
 * prontos ao navegador — só o formulário de escolhas é de navegador, e ele é
 * quem precisa ser, porque o AC-411 exige o total mudando na hora.
 *
 * NO CELULAR, A FOTO É A PÁGINA. Ela ocupa o topo de ponta a ponta, encaixa de
 * foto em foto ao arrastar (`scroll-snap`, sem script), e o caminho de volta
 * flutua sobre ela. A FOLHA com nome, preço e escolhas sobe por cima da foto
 * com os cantos arredondados — o gesto de quem olha a foto e desce para
 * decidir. No computador, a foto fica parada à esquerda e a folha rola à
 * direita. A ordem da marcação é a mesma nos dois.
 *
 * AS DUAS BUSCAS SAEM JUNTAS, como no catálogo: a apresentação diz o nome, a
 * cor e se a loja está ABERTA; a rota do produto diz o resto.
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
import { IconeSeta, PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { ContadorDoCarrinho } from "../../../../../../features/carrinho/ContadorDoCarrinho.tsx";
import { EscolhasDoProduto } from "../../../../../../features/produto/EscolhasDoProduto.tsx";
import { SeloDePreco } from "../../../../../../features/produto/SeloDePreco.tsx";
import { BarraDoTopo } from "../../../../../../features/vitrine/BarraDoTopo.tsx";
import {
  DadosEstruturados,
  produtoParaBuscador,
} from "../../../../../../lib/dados-estruturados.tsx";
import { fraseDaSituacao } from "../../../../../../lib/situacao-da-loja.ts";
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
 * produto.
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
  const rotulo = loja.rotulos.catalogo;

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-pagina-da-loja"
    >
      <BarraDoTopo
        apelidoDaLoja={loja.apelido}
        nomeDaLoja={loja.nome}
        logo={loja.logo}
        rotuloDoCatalogo={rotulo}
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

        {/* --- as fotos ------------------------------------------------- */}
        <section
          className="sc-produto__galeria"
          aria-label={`Fotos de ${produto.nome}`}
        >
          {/*
            O caminho de volta flutua sobre a foto: no celular a barra do topo
            recolhe ao rolar, e o polegar precisa de um "voltar" que não suma.
          */}
          <a
            className="sc-produto__voltar"
            href={produto.linkDoCatalogo}
            aria-label={`Voltar ao ${rotulo.toLowerCase()}`}
          >
            <IconeSeta className="sc-produto__voltar-seta" />
          </a>

          {produto.imagens.length > 0 ? (
            // `tabindex` na tira: um contêiner que rola precisa ser alcançável
            // pelo teclado (regra `scrollable-region-focusable` do axe).
            <ul className="sc-produto__fotos" tabIndex={0}>
              {produto.imagens.map((imagem, indice) => (
                <li className="sc-produto__foto-item" key={imagem.url}>
                  {/*
                    A moldura tem proporção fixa no estilo e a foto a preenche
                    (`fill`): o espaço existe antes de ela chegar, e a página
                    não pula quando a foto carrega (AC-416).
                  */}
                  <Image
                    className="sc-produto__foto"
                    src={imagem.url}
                    alt={imagem.texto ?? ""}
                    fill
                    priority={indice === 0}
                    loading={indice === 0 ? undefined : "lazy"}
                    sizes="(min-width: 1024px) 40rem, 100vw"
                  />
                </li>
              ))}
            </ul>
          ) : (
            // Produto sem foto não perde a moldura: a inicial ocupa o lugar e
            // a folha continua subindo por cima de alguma coisa.
            <div className="sc-produto__fotos sc-produto__fotos--vazia">
              <span className="sc-produto__sem-foto" aria-hidden="true">
                {produto.nome.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}

          {produto.imagens.length > 1 ? (
            <p className="sc-produto__fotos-contagem">
              {produto.imagens.length} fotos
              <span className="sc-so-leitor">, arraste para ver</span>
            </p>
          ) : null}
        </section>

        {/* --- a folha -------------------------------------------------- */}
        <div className="sc-produto__folha">
          <nav className="sc-produto__caminho" aria-label="Você está em">
            <a className="sc-produto__chip" href={produto.linkDoCatalogo}>
              {rotulo}
            </a>
            {produto.linkDaSecao && produto.nomeDaSecao ? (
              <a className="sc-produto__chip" href={produto.linkDaSecao}>
                {produto.nomeDaSecao}
              </a>
            ) : null}
          </nav>

          <header className="sc-produto__cabecalho">
            <h1 className="sc-produto__nome">{produto.nome}</h1>
            {produto.chamada ? (
              <p className="sc-produto__chamada">{produto.chamada}</p>
            ) : null}
            <SeloDePreco
              preco={produto.preco}
              precoAnterior={produto.precoAnterior}
            />
            {/*
              Loja fechada é dito AQUI, antes das escolhas, e não só no botão
              desabilitado lá embaixo: quem vai montar o pedido merece saber
              antes de escolher o ponto da carne.
            */}
            {abertura.aberta ? null : (
              <p className="sc-situacao sc-situacao--fechada">
                <span className="sc-situacao__pulso" aria-hidden="true" />
                <span>{fraseDaSituacao(abertura)}</span>
              </p>
            )}
          </header>

          {produto.descricao ? (
            <section className="sc-produto__descricao" aria-labelledby="sobre">
              <h2 className="sc-produto__secao-nome" id="sobre">
                Sobre o item
              </h2>
              <p>{produto.descricao}</p>
            </section>
          ) : null}

          <EscolhasDoProduto
            produto={produto}
            apelidoDaLoja={loja.apelido}
            rotulos={loja.rotulos}
            contadorDoCarrinho={
              <ContadorDoCarrinho apelidoDaLoja={loja.apelido} />
            }
          />
        </div>
      </main>
    </TemaDaLoja>
  );
}

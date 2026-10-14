/**
 * O cardápio da loja (AC-404, AC-405, AC-406, AC-407).
 *
 * COMPONENTE DE SERVIDOR, e é isso que a página é. O conteúdo chega pronto ao
 * navegador, sem depender de script para mostrar produto — o que o AC-415 exige
 * e o que faz o cardápio abrir na fila do ônibus com uma barra de sinal. O único
 * `"use client"` desta árvore é o que recolhe a barra do topo ao rolar, e ele
 * não desenha nada: a vitrine é a superfície de quem está com fome, e a régua
 * do projeto não permite peso aqui.
 *
 * AS DUAS BUSCAS SAEM JUNTAS. A apresentação e o catálogo são rotas separadas
 * na API de propósito (quem só quer saber se a loja está aberta não baixa o
 * cardápio inteiro), então esta página pede as duas EM PARALELO. Em série, o
 * tempo até o primeiro produto seria a soma das duas idas — e é justamente esse
 * tempo que o AC-415 mede.
 */
import "@simpleclick/ui/styles/vitrine.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA, TemaDaLoja, Vazio } from "@simpleclick/ui";

import { AbasDeCategoria } from "../../../../../features/vitrine/AbasDeCategoria.tsx";
import { BarraDoTopo } from "../../../../../features/vitrine/BarraDoTopo.tsx";
import { SemResultado } from "../../../../../features/vitrine/BuscaProduto.tsx";
import { Destaques } from "../../../../../features/vitrine/Destaques.tsx";
import { GradeDeProdutos } from "../../../../../features/vitrine/GradeDeProdutos.tsx";
import { FiltroEspecificacao } from "../../../../../features/vitrine/FiltroEspecificacao.tsx";
import { BlocosPorRamo } from "../../../../../features/painel-catalogo/BlocosPorRamo.tsx";
import {
  PARAMETRO_DA_BUSCA,
  PARAMETRO_DA_CATEGORIA,
} from "../../../../../lib/catalogo.ts";
import {
  cardapioDaLoja,
  DadosEstruturados,
} from "../../../../../lib/dados-estruturados.tsx";
import {
  enderecoDoCatalogo,
  enderecoDoSite,
} from "../../../../../server/endereco-do-site.ts";
import { prepararCatalogo } from "../../../../../server/catalogo-na-tela.ts";
import {
  buscarCatalogo,
  buscarVitrine,
} from "../../../../../server/vitrine.ts";

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** O primeiro valor do parâmetro, quando alguém repete `?categoria=` no endereço. */
function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  if (resultado.estado !== "encontrada") {
    return { title: "Loja não disponível" };
  }

  const { loja } = resultado.vitrine;
  const titulo = `${loja.rotulos.catalogo} · ${loja.nome}`;
  const descricao =
    loja.boasVindas ??
    `Veja o ${loja.rotulos.catalogo.toLowerCase()} de ${loja.nome} e peça pelo WhatsApp.`;

  return {
    title: titulo,
    description: descricao,
    // O CANÔNICO NÃO CARREGA FILTRO NEM BUSCA (AC-403). `?categoria=bebidas` e
    // `?busca=pao` são a mesma página vista por um recorte: indexá-los como
    // páginas distintas espalharia a loja por dezenas de endereços quase
    // iguais, e o buscador chama isso de conteúdo duplicado.
    alternates: { canonical: enderecoDoCatalogo(loja.apelido) },
    openGraph: {
      title: titulo,
      description: descricao,
      url: enderecoDoCatalogo(loja.apelido),
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function PaginaDoCatalogo({
  params,
  searchParams,
}: ParametrosDaPagina) {
  const { slug } = await params;

  // A CONSULTA VEM PRIMEIRO, e é a única espera em série da página: o termo
  // buscado muda o que se pede à API, então não há como pedir antes de lê-lo.
  // As duas idas à API continuam em paralelo, que é o que o AC-415 mede.
  const consulta = await searchParams;
  const termo = primeiro(consulta[PARAMETRO_DA_BUSCA]);
  const categoria = primeiro(consulta[PARAMETRO_DA_CATEGORIA]);
  const filtros =
    consulta.filtro === undefined
      ? []
      : Array.isArray(consulta.filtro)
        ? consulta.filtro
        : [consulta.filtro];

  const [vitrine, catalogo] = await Promise.all([
    buscarVitrine(slug),
    buscarCatalogo(slug, { busca: termo, categoria, filtros }),
  ]);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402). Distinguir aqui desfaria o cuidado tomado lá.
  if (
    vitrine.estado === "nao-encontrada" ||
    catalogo.estado === "nao-encontrada"
  ) {
    notFound();
  }

  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }

  if (catalogo.estado === "indisponivel") {
    // API fora do ar não é loja sem produto. Cair no estado vazio faria o dono
    // achar que o cardápio dele sumiu quando o problema é nosso.
    throw new Error(`catálogo indisponível: ${catalogo.motivo}`);
  }

  const { loja } = vitrine.vitrine;
  const naTela = prepararCatalogo(catalogo.catalogo, {
    apelidoDaLoja: loja.apelido,
    categoriaEscolhida: primeiro(consulta[PARAMETRO_DA_CATEGORIA]),
    termoBuscado: termo,
  });

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-pagina-da-loja"
    >
      {/*
        A barra fica FORA do `main`: é a moldura da loja (marca, busca e
        carrinho), e não o conteúdo da página. A busca some só na loja sem
        catálogo, onde não há o que buscar — quem buscou e não achou continua
        com o campo à mão para tentar outra palavra.
      */}
      <BarraDoTopo
        apelidoDaLoja={loja.apelido}
        nomeDaLoja={loja.nome}
        logo={loja.logo}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        termo={naTela.termoBuscado}
        comBusca={!naTela.lojaSemCatalogo}
      />

      <main className="sc-vitrine">
        <h1 className="sc-vitrine__titulo">{loja.rotulos.catalogo}</h1>

        {/*
          O bloco descreve o CATÁLOGO INTEIRO, e por isso sai só quando não há
          filtro nem busca: publicar o recorte como se fosse o cardápio faria o
          buscador guardar "esta loja vende três coisas" no dia em que alguém
          compartilhou um link filtrado.
        */}
        {naTela.filtroEmVigor === null && naTela.termoBuscado === null ? (
          <DadosEstruturados
            dados={cardapioDaLoja({
              loja,
              catalogo: naTela,
              enderecoDoSite: enderecoDoSite(),
            })}
          />
        ) : null}

        {naTela.lojaSemCatalogo ? (
          // AC-407: loja recém-criada explica que está montando o catálogo, em
          // vez de mostrar uma tela vazia que lê como erro de carregamento.
          <Vazio
            titulo={`O ${loja.rotulos.catalogo.toLowerCase()} está sendo montado`}
            descricao={`${loja.nome} ainda não publicou produtos. Volte em breve.`}
          />
        ) : (
          <>
            <BlocosPorRamo
              blocos={loja.blocos}
              tela="vitrine"
              bloco="categorias"
            >
              <AbasDeCategoria
                abas={naTela.abas}
                filtroEmVigor={naTela.filtroEmVigor}
              />
            </BlocosPorRamo>

            <FiltroEspecificacao
              filtros={naTela.filtros ?? []}
              selecionados={filtros}
              acao={`/l/${loja.apelido}/catalogo`}
              categoria={categoria}
              busca={termo}
            />

            <BlocosPorRamo
              blocos={loja.blocos}
              tela="vitrine"
              bloco="destaques"
            >
              <Destaques destaques={naTela.destaques} />
            </BlocosPorRamo>

            {naTela.buscaSemAcerto ? (
              <SemResultado
                termo={naTela.termoBuscado ?? ""}
                linkDeTodos={naTela.linkSemBusca}
                rotuloDoCatalogo={loja.rotulos.catalogo}
              />
            ) : naTela.filtroSemAcerto ? (
              // Categoria que não existe mais não derruba a página: ela explica
              // e oferece a saída, porque vazio sem caminho é beco sem saída.
              <Vazio
                titulo="Essa categoria não existe mais"
                descricao={`Ela pode ter sido renomeada ou retirada do ${loja.rotulos.catalogo.toLowerCase()}.`}
                acao={
                  <a className="sc-vitrine__aba" href={naTela.linkDeTodas}>
                    Ver o {loja.rotulos.catalogo.toLowerCase()} inteiro
                  </a>
                }
              />
            ) : (
              <div className="sc-vitrine__secoes">
                {naTela.secoes.map((secao, indice) => (
                  <GradeDeProdutos
                    key={secao.id}
                    secao={secao}
                    primeira={indice === 0}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </TemaDaLoja>
  );
}

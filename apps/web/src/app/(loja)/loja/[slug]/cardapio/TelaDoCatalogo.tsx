/**
 * O cardápio da loja, desenhado no servidor (AC-404, AC-405, AC-406, AC-407).
 *
 * SERVE A DUAS ROTAS. `/loja/<loja>/cardapio` é o cardápio; `/loja/<loja>/produto/<id>`
 * é o MESMO cardápio com a janela do produto já aberta por cima — a mesma
 * lógica do Sobre. Assim o link compartilhado de um produto abre o produto, e
 * fechar a janela deixa a pessoa no cardápio, e não numa página sem saída.
 * `/loja/<loja>/checkout` é o mesmo cardápio com a janela do carrinho aberta já
 * no passo do fechamento.
 *
 * COMPONENTE DE SERVIDOR. O conteúdo chega pronto ao navegador, sem depender de
 * script para mostrar produto — o que o AC-415 exige. Os `"use client"` desta
 * árvore só ACRESCENTAM: a troca automática dos banners, a sacola flutuante e a
 * janela do produto. Sem eles, categorias, busca, filtro, ordem e banners
 * continuam funcionando como links, formulários e faixa rolável, e o cartão
 * leva à página do produto.
 *
 * NÃO HÁ BARRA DO TOPO. A identidade da loja (logo e nome, que levam à página
 * da loja) mora na capa, com o "Sobre", que abre a janela do Sobre aqui mesmo; a busca, as categorias, o filtro e a ordem moram na
 * barra do catálogo; o carrinho é a sacola flutuante. A ordem da página é a
 * hierarquia: capa, barra do catálogo, banners, destaques e a grade.
 *
 * AS DUAS BUSCAS SAEM JUNTAS. A apresentação e o catálogo são rotas separadas
 * na API, e esta tela pede as duas EM PARALELO: em série, o tempo até o
 * primeiro produto seria a soma das duas idas — que é o que o AC-415 mede.
 */
import { notFound } from "next/navigation";
import { corDaImagem } from "@simpleclick/contracts";
import {
  COR_DE_DESTAQUE_PADRAO_DA_LOJA,
  TemaDaMarca,
  Vazio,
} from "@simpleclick/ui";

import { CarrinhoFlutuante } from "../../../../../features/carrinho/CarrinhoFlutuante.tsx";
import {
  SobreDaLoja,
  type RecebimentoDaLoja,
} from "../../../../../features/loja/SobreDaLoja.tsx";
import { JanelaDoProduto } from "../../../../../features/produto/JanelaDoProduto.tsx";
import { CapaDaVitrine } from "../../../../../features/vitrine/CapaDaVitrine.tsx";
import { BannersPromocionais } from "../../../../../features/vitrine/BannersPromocionais.tsx";
import { BarraDeCatalogo } from "../../../../../features/vitrine/BarraDeCatalogo.tsx";
import {
  BANNERS_DE_DEMONSTRACAO,
  PARAMETRO_DOS_BANNERS_DE_DEMONSTRACAO,
} from "../../../../../features/vitrine/banners-de-demonstracao.ts";
import { SemResultado } from "../../../../../features/vitrine/BuscaProduto.tsx";
import { Destaques } from "../../../../../features/vitrine/Destaques.tsx";
import { GradeDeProdutos } from "../../../../../features/vitrine/GradeDeProdutos.tsx";
import { BlocosPorRamo } from "../../../../../features/painel-catalogo/BlocosPorRamo.tsx";
import {
  PARAMETRO_DA_BUSCA,
  PARAMETRO_DA_CATEGORIA,
  PARAMETRO_DA_ORDEM,
  PARAMETRO_DO_ATACADO,
  PARAMETRO_DO_CURSOR,
  lerAtacado,
  lerOrdem,
} from "../../../../../lib/catalogo.ts";
import type { ProdutoNaTela } from "../../../../../lib/produto.ts";
import { temBloco } from "../../../../../lib/vertical.ts";
import {
  cardapioDaLoja,
  DadosEstruturados,
} from "../../../../../lib/dados-estruturados.tsx";
import type { RascunhoDaVitrine } from "../../../../../lib/rascunho-da-vitrine.ts";
import { enderecoDoSite } from "../../../../../server/endereco-do-site.ts";
import { resultadoComRascunho } from "../../../../../server/previa.ts";
import { buscarFechamento } from "../../../../../server/fechamento.ts";
import {
  prepararCatalogoEmPaginas,
  precisaDePagina,
} from "../../../../../server/catalogo-na-tela.ts";
import {
  buscarPaginaDoCatalogo,
  buscarResumoDoCatalogo,
  buscarVitrine,
} from "../../../../../server/vitrine.ts";

import { prepararFechamentoDaJanela } from "../checkout/acoes.ts";
import { carregarMaisProdutos, carregarProdutoDaJanela } from "./acoes.ts";

/**
 * Quantos produtos cada seção mostra de saída (card #74), e o teto somando
 * todas: loja de seis seções pequenas aparece inteira, como sempre; loja de
 * quinze seções com mil itens cada mostra a vitrine de cada uma e o "Ver mais".
 */
const PRODUTOS_POR_SECAO = 24;
const PRODUTOS_NA_PRIMEIRA_TELA = 72;

/** O primeiro valor do parâmetro, quando alguém repete `?categoria=` no endereço. */
function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export interface TelaDoCatalogoProps {
  readonly slug: string;
  /** Os parâmetros do endereço (`?categoria=`, `?busca=`, `?filtro=`, `?ordem=`). */
  readonly consulta: Readonly<Record<string, string | string[] | undefined>>;
  /** O produto da janela aberta pelo servidor — só na rota do produto. */
  readonly produtoAberto?: ProdutoNaTela | null | undefined;
  /** A janela do carrinho abre já no fechamento — só na rota do checkout. */
  readonly fechamentoAberto?: boolean | undefined;
  /** A janela do carrinho abre no carrinho — só na rota do carrinho. */
  readonly carrinhoAberto?: boolean | undefined;
  /** Só na prévia da Aparência: o que o dono está editando, por cima da loja. */
  readonly rascunho?: RascunhoDaVitrine | null | undefined;
}

export async function TelaDoCatalogo({
  slug,
  consulta,
  produtoAberto = null,
  fechamentoAberto = false,
  carrinhoAberto = false,
  rascunho = null,
}: TelaDoCatalogoProps) {
  const termo = primeiro(consulta[PARAMETRO_DA_BUSCA]);
  const categoria = primeiro(consulta[PARAMETRO_DA_CATEGORIA]);
  const filtroNoEndereco = consulta["filtro"];
  const filtros =
    filtroNoEndereco === undefined
      ? []
      : Array.isArray(filtroNoEndereco)
        ? filtroNoEndereco
        : [filtroNoEndereco];
  const atacado = lerAtacado(primeiro(consulta[PARAMETRO_DO_ATACADO]));

  const ordemPedida = primeiro(consulta[PARAMETRO_DA_ORDEM]);
  const comPagina = precisaDePagina(categoria, ordemPedida);
  const recorte = { busca: termo, categoria, filtros, atacado };

  // Em paralelo. O fechamento só alimenta a janela do Sobre (pagamento e
  // entrega), e não pode atrasar o cardápio.
  //
  // O CATÁLOGO VEM EM PEDAÇOS (card #74): o resumo dá as seções e as
  // contagens (e, sem categoria, os primeiros produtos de cada seção); com
  // categoria ou ordem, a página traz só a primeira leva da lista. Nenhuma
  // resposta carrega a loja inteira.
  const [vitrineSalva, resumo, pagina, fechamento] = await Promise.all([
    buscarVitrine(slug),
    buscarResumoDoCatalogo(
      slug,
      comPagina
        ? recorte
        : {
            ...recorte,
            porSecao: PRODUTOS_POR_SECAO,
            totalMaximo: PRODUTOS_NA_PRIMEIRA_TELA,
          },
    ),
    comPagina
      ? buscarPaginaDoCatalogo(slug, {
          ...recorte,
          ordem: lerOrdem(ordemPedida),
          cursor: primeiro(consulta[PARAMETRO_DO_CURSOR]),
        })
      : null,
    buscarFechamento(slug),
  ]);

  const vitrine = resultadoComRascunho(vitrineSalva, rascunho);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402). Distinguir aqui desfaria o cuidado tomado lá.
  if (
    vitrine.estado === "nao-encontrada" ||
    resumo.estado === "nao-encontrada" ||
    pagina?.estado === "nao-encontrada"
  ) {
    notFound();
  }

  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }

  if (resumo.estado === "indisponivel") {
    // API fora do ar não é loja sem produto. Cair no estado vazio faria o dono
    // achar que o cardápio dele sumiu quando o problema é nosso.
    throw new Error(`catálogo indisponível: ${resumo.motivo}`);
  }
  if (pagina?.estado === "indisponivel") {
    throw new Error(`catálogo indisponível: ${pagina.motivo}`);
  }

  const { loja, abertura } = vitrine.vitrine;
  const naTela = prepararCatalogoEmPaginas(
    resumo.dados,
    pagina?.dados ?? null,
    {
      apelidoDaLoja: loja.apelido,
      categoriaEscolhida: categoria,
      termoBuscado: termo,
      ordem: ordemPedida,
      filtros,
      atacado,
    },
  );
  const carregarMais = carregarMaisProdutos.bind(null, loja.apelido);

  // `?banners=demo` mostra artes de exemplo, SÓ fora de produção: o cadastro
  // dos banners ainda não existe, e assim dá para ver a faixa funcionando.
  const banners =
    process.env.NODE_ENV !== "production" &&
    primeiro(consulta["banners"]) === PARAMETRO_DOS_BANNERS_DE_DEMONSTRACAO
      ? BANNERS_DE_DEMONSTRACAO
      : (vitrine.vitrine.banners ?? []);

  const acao = `/loja/${loja.apelido}/cardapio`;

  // SÓ o que a janela do Sobre mostra sai daqui: a resposta do fechamento traz
  // a chave PIX, e ela não vai para a página pública (AC-904).
  const recebimento: RecebimentoDaLoja | null =
    fechamento.estado === "encontrado"
      ? {
          formasDePagamento: fechamento.fechamento.formasDePagamento,
          entrega: fechamento.fechamento.entrega,
        }
      : null;

  const capaDoTopo = loja.tema?.topoCardapio ?? loja.capa;
  // A versão do celular só vale junto da foto do topo do tema.
  const capaDoTopoNoCelular = loja.tema?.topoCardapio
    ? (loja.tema.topoCardapioCelular ?? null)
    : null;

  return (
    <TemaDaMarca
      corDestaque={loja.tema?.corDestaque ?? COR_DE_DESTAQUE_PADRAO_DA_LOJA}
      className="sc-pagina-da-loja"
    >
      <main className="sc-vitrine">
        <CapaDaVitrine
          apelidoDaLoja={loja.apelido}
          nomeDaLoja={loja.nome}
          capa={capaDoTopo}
          capaCelular={capaDoTopoNoCelular}
          ramo={loja.ramo}
          rotuloDoCatalogo={loja.rotulos.catalogo}
          abertura={abertura}
          seloDeStatus={loja.tema?.seloDeStatus}
          corDaCapa={corDaImagem(loja.tema, capaDoTopo)}
        />

        {/*
          O bloco descreve o CATÁLOGO INTEIRO, e por isso sai só quando não há
          filtro, busca, ordem nem produto aberto: publicar o recorte como se
          fosse o cardápio faria o buscador guardar "esta loja vende três
          coisas" no dia em que alguém compartilhou um link filtrado. Na rota
          do produto, quem fala ao buscador é o bloco do produto.
        */}
        {naTela.filtroEmVigor === null &&
        naTela.termoBuscado === null &&
        naTela.ordem === "relevancia" &&
        !atacado &&
        produtoAberto === null ? (
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
            <BarraDeCatalogo
              abas={
                temBloco(loja.blocos, "vitrine", "categorias")
                  ? naTela.abas
                  : null
              }
              filtroEmVigor={naTela.filtroEmVigor}
              filtros={naTela.filtros ?? []}
              selecionados={filtros}
              ordens={naTela.ordens}
              ordem={naTela.ordem}
              acao={acao}
              categoria={categoria}
              busca={termo}
              termo={naTela.termoBuscado}
              rotuloDoCatalogo={loja.rotulos.catalogo}
              atacado={naTela.atacado}
            />

            <BannersPromocionais banners={banners} />

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
            ) : naTela.atacadoSemAcerto ? (
              <Vazio
                titulo="Nenhum produto com preço de atacado"
                descricao={`Por enquanto, ${loja.nome} não tem produtos com preço de atacado.`}
                acao={
                  <a className="sc-vitrine__aba" href={naTela.atacado.link}>
                    Ver o {loja.rotulos.catalogo.toLowerCase()} inteiro
                  </a>
                }
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
                    carregarMais={carregarMais}
                    // A lista única carrega sozinha na rolagem.
                    automatico={comPagina}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/*
        O "Sobre" da capa abre esta janela por cima do cardápio, sem sair dele
        (o link tem `data-abre-sobre`). Sem script, o link leva à loja com a
        janela aberta.
      */}
      <SobreDaLoja
        loja={loja}
        abertura={abertura}
        horario={vitrine.vitrine.horario ?? null}
        recebimento={recebimento}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        aberta={false}
      />

      <JanelaDoProduto
        apelidoDaLoja={loja.apelido}
        rotulos={loja.rotulos}
        ramo={loja.ramo}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        produtoInicial={produtoAberto}
        carregarProduto={carregarProdutoDaJanela.bind(null, loja.apelido)}
      />

      {/*
        A sacola é a ÚNICA entrada do carrinho: flutua por cima de tudo, só
        aparece com item dentro, e o toque abre o carrinho numa janela.
      */}
      <CarrinhoFlutuante
        apelidoDaLoja={loja.apelido}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        carregarProduto={carregarProdutoDaJanela.bind(null, loja.apelido)}
        prepararFechamento={prepararFechamentoDaJanela.bind(null, loja.apelido)}
        abrirNoFechamento={fechamentoAberto}
        abrirNoCarrinho={carrinhoAberto}
      />
    </TemaDaMarca>
  );
}

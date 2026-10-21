/**
 * A barra do catálogo: categorias, filtro e ordem numa faixa só, grudada logo
 * abaixo da barra do topo.
 *
 * UMA FAIXA SÓ, COM A BUSCA. Categorias, busca, filtro e ordem ficam onde o
 * olho já está, e a faixa inteira gruda ao rolar — quem está no vigésimo
 * produto busca, troca de categoria ou de ordem sem voltar ao topo. Não há
 * outra busca na página.
 *
 * TUDO FUNCIONA SEM SCRIPT, como o resto da vitrine (AC-415):
 *   * as categorias e as ordens são LINKS — o endereço muda, se compartilha e o
 *     "voltar" desfaz;
 *   * a busca e o filtro são formulários `GET` comuns;
 *   * os painéis abrem pelo atributo `popover` do HTML: o próprio navegador
 *     abre, fecha no Esc e no toque fora, e devolve o foco ao botão.
 *
 * NO COMPUTADOR, o campo de busca compacto, "Filtrar" e "Ordenar" ficam à
 * direita, cada botão com o seu painel. NO CELULAR, a busca vira uma lupa (o
 * campo abre num painel no alto da tela) e filtro e ordem viram um botão só,
 * com uma gaveta de baixo: tudo disputando a largura com as categorias as
 * deixaria sem espaço. A troca é só de CSS — a lista de ordens existe nos
 * dois painéis, e a cópia que não vale na largura atual fica `display: none`,
 * fora da árvore de acessibilidade.
 */
import {
  IconeBuscar,
  IconeConfirmar,
  IconeFechar,
  IconeFiltro,
  IconeOrdenar,
} from "@simpleclick/ui";

import type {
  AbaDeCategoria,
  FiltroDeAtacadoNaTela,
  OpcaoDeOrdem,
  OrdemDoCatalogo,
} from "../../lib/catalogo.ts";

import { AbasDeCategoria } from "./AbasDeCategoria.tsx";
import { BuscaProduto } from "./BuscaProduto.tsx";
import { FiltroEspecificacao } from "./FiltroEspecificacao.tsx";

type Filtro = {
  readonly chave: string;
  readonly nome: string;
  readonly valores: readonly string[];
};

/** Os `id` dos painéis. Uma barra por página. */
const PAINEL_DA_ORDEM = "painel-da-ordem";
const PAINEL_DOS_AJUSTES = "painel-dos-ajustes";
const PAINEL_DA_BUSCA = "painel-da-busca";

export interface BarraDeCatalogoProps {
  /** As abas; `null` quando o ramo não mostra categorias. */
  readonly abas: readonly AbaDeCategoria[] | null;
  readonly filtroEmVigor: string | null;
  readonly filtros: readonly Filtro[];
  readonly selecionados: readonly string[];
  readonly ordens: readonly OpcaoDeOrdem[];
  readonly ordem: OrdemDoCatalogo;
  /** Para onde o formulário do filtro envia — o próprio catálogo. */
  readonly acao: string;
  readonly categoria: string | null;
  readonly busca: string | null;
  /** O termo que está sendo buscado, para o campo abrir preenchido. */
  readonly termo?: string | null | undefined;
  /** Como a loja chama o catálogo, para o rótulo da busca. */
  readonly rotuloDoCatalogo?: string | undefined;
  /**
   * O chip "Atacado" (card #59). Só aparece quando há produto com atacado no
   * resultado — ou quando o filtro já está ligado, para poder desligá-lo.
   */
  readonly atacado?: FiltroDeAtacadoNaTela | undefined;
}

/**
 * O chip "Atacado": um LINK, como as abas — liga e desliga sem script, e o
 * endereço com `?atacado=1` se compartilha.
 */
function ChipDeAtacado({ atacado }: { readonly atacado: FiltroDeAtacadoNaTela }) {
  const dica =
    atacado.menorPedidoMinimo === null
      ? undefined
      : `Preço de atacado a partir de ${atacado.menorPedidoMinimo} unidades`;
  return (
    <a
      className={`sc-catalogo-barra__botao sc-catalogo-barra__chip${
        atacado.ligado ? " sc-catalogo-barra__chip--ligado" : ""
      }`}
      href={atacado.link}
      {...(atacado.ligado ? { "aria-current": "true" as const } : {})}
      {...(dica === undefined ? {} : { title: dica })}
    >
      {atacado.ligado ? <IconeConfirmar aria-hidden="true" /> : null}
      Atacado
      {atacado.ligado ? (
        <span className="sc-so-leitor"> (filtro ligado; tocar desliga)</span>
      ) : null}
      {atacado.produtos > 0 ? (
        <span className="sc-catalogo-barra__contagem">
          <span className="sc-so-leitor">, </span>
          {atacado.produtos}
          <span className="sc-so-leitor">
            {atacado.produtos === 1 ? " produto" : " produtos"}
          </span>
        </span>
      ) : null}
    </a>
  );
}

/** As ordens como links. Aparece no painel do computador e na gaveta. */
function ListaDeOrdens({
  ordens,
}: {
  readonly ordens: readonly OpcaoDeOrdem[];
}) {
  return (
    <ul className="sc-catalogo-barra__ordens">
      {ordens.map((opcao) => (
        <li key={opcao.valor}>
          <a
            className={`sc-catalogo-barra__ordem${
              opcao.emVigor ? " sc-catalogo-barra__ordem--em-vigor" : ""
            }`}
            href={opcao.link}
            {...(opcao.emVigor ? { "aria-current": "true" as const } : {})}
          >
            {opcao.nome}
            {opcao.emVigor ? <IconeConfirmar aria-hidden="true" /> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function BarraDeCatalogo({
  abas,
  filtroEmVigor,
  filtros,
  selecionados,
  ordens,
  ordem,
  acao,
  categoria,
  busca,
  termo = null,
  rotuloDoCatalogo = "Catálogo",
  atacado,
}: BarraDeCatalogoProps) {
  const atacadoLigado = atacado?.ligado ?? false;
  const mostrarAtacado =
    atacado !== undefined && (atacado.ligado || atacado.produtos > 0);
  const temFiltro = filtros.length > 0;
  const ordemEmVigor = ordens.find((opcao) => opcao.emVigor);
  // O selo do botão do celular conta tudo o que está mexendo na lista: cada
  // filtro marcado e a ordem, quando não é a do dono.
  const ajustes = selecionados.length + (ordem === "relevancia" ? 0 : 1);

  return (
    <div className="sc-catalogo-barra">
      <div className="sc-catalogo-barra__conteudo">
        {abas === null ? (
          <span className="sc-catalogo-barra__vao" />
        ) : (
          <AbasDeCategoria abas={abas} filtroEmVigor={filtroEmVigor} />
        )}

        <div className="sc-catalogo-barra__acoes">
          <div className="sc-catalogo-barra__busca">
            <BuscaProduto
              acao={acao}
              termo={termo}
              rotuloDoCatalogo={rotuloDoCatalogo}
              ordem={ordem}
              atacado={atacadoLigado}
            />
          </div>

          {mostrarAtacado ? <ChipDeAtacado atacado={atacado} /> : null}

          <button
            type="button"
            className="sc-catalogo-barra__botao sc-catalogo-barra__botao--estreito"
            popoverTarget={PAINEL_DA_BUSCA}
          >
            <IconeBuscar aria-hidden="true" />
            <span className="sc-so-leitor">
              {termo ? `Buscar (buscando "${termo}")` : "Buscar"}
            </span>
            {termo ? (
              <span className="sc-catalogo-barra__ponto" aria-hidden="true" />
            ) : null}
          </button>

          {temFiltro ? (
            <button
              type="button"
              className="sc-catalogo-barra__botao sc-catalogo-barra__botao--largo"
              popoverTarget={PAINEL_DOS_AJUSTES}
            >
              <IconeFiltro aria-hidden="true" />
              Filtrar
              {selecionados.length > 0 ? (
                <span className="sc-catalogo-barra__selo">
                  <span className="sc-so-leitor">, </span>
                  {selecionados.length}
                  <span className="sc-so-leitor"> marcados</span>
                </span>
              ) : null}
            </button>
          ) : null}

          <button
            type="button"
            className="sc-catalogo-barra__botao sc-catalogo-barra__botao--largo"
            popoverTarget={PAINEL_DA_ORDEM}
          >
            <IconeOrdenar aria-hidden="true" />
            {ordem === "relevancia" ? (
              "Ordenar"
            ) : (
              <>
                <span className="sc-so-leitor">Ordenar: </span>
                {ordemEmVigor?.nome}
              </>
            )}
          </button>

          <button
            type="button"
            className="sc-catalogo-barra__botao sc-catalogo-barra__botao--estreito"
            popoverTarget={PAINEL_DOS_AJUSTES}
          >
            <IconeFiltro aria-hidden="true" />
            <span className="sc-so-leitor">
              {temFiltro ? "Filtrar e ordenar" : "Ordenar"}
            </span>
            {ajustes > 0 ? (
              <span className="sc-catalogo-barra__selo">
                <span className="sc-so-leitor">, </span>
                {ajustes}
                <span className="sc-so-leitor"> em vigor</span>
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* O painel da busca: só o celular chega a ele, pela lupa. */}
      <div
        id={PAINEL_DA_BUSCA}
        className="sc-painel sc-painel--busca"
        popover="auto"
        role="dialog"
        aria-label="Buscar"
      >
        <div className="sc-painel__topo">
          <BuscaProduto
            acao={acao}
            termo={termo}
            rotuloDoCatalogo={rotuloDoCatalogo}
            ordem={ordem}
            atacado={atacadoLigado}
            id="busca-no-painel"
          />
          <button
            type="button"
            className="sc-painel__fechar"
            popoverTarget={PAINEL_DA_BUSCA}
            popoverTargetAction="hide"
            aria-label="Fechar a busca"
          >
            <IconeFechar aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* O painel da ordem: só o computador chega a ele. */}
      <div
        id={PAINEL_DA_ORDEM}
        className="sc-painel sc-painel--ordem"
        popover="auto"
        role="dialog"
        aria-label="Ordenar"
      >
        <p className="sc-painel__titulo">Ordenar por</p>
        <ListaDeOrdens ordens={ordens} />
      </div>

      {/*
        O painel dos ajustes: no computador, o painel do "Filtrar"; no celular,
        a gaveta de baixo com a ordem e o filtro juntos.
      */}
      <div
        id={PAINEL_DOS_AJUSTES}
        className="sc-painel sc-painel--ajustes"
        popover="auto"
        role="dialog"
        aria-labelledby="titulo-dos-ajustes"
      >
        <div className="sc-painel__topo">
          <p className="sc-painel__titulo" id="titulo-dos-ajustes">
            <span className="sc-painel__so-estreito">
              {temFiltro ? "Filtrar e ordenar" : "Ordenar"}
            </span>
            <span className="sc-painel__so-largo">Filtrar</span>
          </p>
          <button
            type="button"
            className="sc-painel__fechar"
            popoverTarget={PAINEL_DOS_AJUSTES}
            popoverTargetAction="hide"
            aria-label="Fechar"
          >
            <IconeFechar aria-hidden="true" />
          </button>
        </div>

        <section
          className="sc-painel__secao sc-painel__so-estreito"
          aria-label="Ordenar por"
        >
          <p className="sc-painel__subtitulo" aria-hidden="true">
            Ordenar por
          </p>
          <ListaDeOrdens ordens={ordens} />
        </section>

        {temFiltro ? (
          <section className="sc-painel__secao" aria-label="Filtrar">
            <p
              className="sc-painel__subtitulo sc-painel__so-estreito"
              aria-hidden="true"
            >
              Filtrar
            </p>
            <FiltroEspecificacao
              filtros={filtros}
              selecionados={selecionados}
              acao={acao}
              categoria={categoria}
              busca={busca}
              ordem={ordem}
              atacado={atacadoLigado}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

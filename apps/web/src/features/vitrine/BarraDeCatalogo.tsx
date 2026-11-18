/**
 * A barra do catálogo no layout Stitch (card #130): categorias em pílula,
 * "Ordenar", "Filtrar" e o chip de atacado.
 *
 * A BUSCA NÃO MORA AQUI: até o tablet ela fica no cabeçalho do catálogo e, no
 * computador, no cartão em cima da grade (`TelaDoCatalogo`).
 *
 * TUDO FUNCIONA SEM SCRIPT, como o resto da vitrine (AC-415):
 *   * as categorias e as ordens são LINKS — o endereço muda, se compartilha e o
 *     "voltar" desfaz;
 *   * o filtro é um formulário `GET` comum;
 *   * os painéis abrem pelo atributo `popover` do HTML: o próprio navegador
 *     abre, fecha no Esc e no toque fora, e devolve o foco ao botão.
 *
 * NO CELULAR E NO TABLET a faixa gruda no topo: as pílulas das categorias
 * rolam na horizontal e, embaixo, "Ordenar" e "Filtrar" abrem gavetas de
 * baixo. NO COMPUTADOR a barra vira o painel lateral "Filtros": categorias em
 * lista, com a contagem à direita, e o formulário do filtro já aberto.
 */
import {
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
import { FiltroEspecificacao } from "./FiltroEspecificacao.tsx";

type Filtro = {
  readonly chave: string;
  readonly nome: string;
  readonly valores: readonly string[];
};

/** Os `id` dos painéis. Uma barra por página. */
const PAINEL_DA_ORDEM = "painel-da-ordem";
const PAINEL_DOS_AJUSTES = "painel-dos-ajustes";

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
  /**
   * O chip "Atacado" (card #59). Só aparece quando há produto com atacado no
   * resultado — ou quando o filtro já está ligado, para poder desligá-lo.
   */
  readonly atacado?: FiltroDeAtacadoNaTela | undefined;
  /** Estoque e faixa de preço ligados (card #108); preços em centavos. */
  readonly estoque?: boolean | undefined;
  readonly precoMin?: number | null | undefined;
  readonly precoMax?: number | null | undefined;
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
  atacado,
  estoque = false,
  precoMin = null,
  precoMax = null,
}: BarraDeCatalogoProps) {
  const atacadoLigado = atacado?.ligado ?? false;
  const mostrarAtacado =
    atacado !== undefined && (atacado.ligado || atacado.produtos > 0);
  const ordemEmVigor = ordens.find((opcao) => opcao.emVigor);
  // O selo do "Filtrar" conta tudo o que o formulário está aplicando: cada
  // especificação marcada, o "Só em estoque" e a faixa de preço. A ordem tem
  // o botão dela, que já mostra o nome da ordem em vigor.
  const filtrosLigados =
    selecionados.length +
    (estoque ? 1 : 0) +
    (precoMin !== null || precoMax !== null ? 1 : 0);

  return (
    <div className="sc-catalogo-barra">
      <div className="sc-catalogo-barra__conteudo">
        {/* Só no computador, onde a barra vira o painel lateral. */}
        <p className="sc-catalogo-barra__cabeca" aria-hidden="true">
          <IconeFiltro />
          Filtros
        </p>

        {abas === null ? (
          <span className="sc-catalogo-barra__vao" />
        ) : (
          <AbasDeCategoria abas={abas} filtroEmVigor={filtroEmVigor} />
        )}

        <div className="sc-catalogo-barra__acoes">
          <button
            type="button"
            className="sc-catalogo-barra__botao sc-catalogo-barra__botao--ordem"
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
            className="sc-catalogo-barra__botao sc-catalogo-barra__botao--filtro"
            popoverTarget={PAINEL_DOS_AJUSTES}
          >
            <IconeFiltro aria-hidden="true" />
            Filtrar
            {filtrosLigados > 0 ? (
              <span className="sc-catalogo-barra__selo">
                <span className="sc-so-leitor">, </span>
                {filtrosLigados}
                <span className="sc-so-leitor"> em vigor</span>
              </span>
            ) : null}
          </button>

          {mostrarAtacado ? <ChipDeAtacado atacado={atacado} /> : null}
        </div>
      </div>

      {/*
        O painel da ordem: gaveta de baixo até o tablet; no computador, menu
        pendurado no "Ordenar" de cima da grade.
      */}
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
        O painel do filtro: gaveta de baixo no celular e no tablet; no
        computador, fica aberto dentro do painel lateral.
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
            Filtrar
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

        <FiltroEspecificacao
          filtros={filtros}
          selecionados={selecionados}
          acao={acao}
          categoria={categoria}
          busca={busca}
          ordem={ordem}
          atacado={atacadoLigado}
          gerais
          estoque={estoque}
          precoMin={precoMin}
          precoMax={precoMax}
        />
      </div>
    </div>
  );
}

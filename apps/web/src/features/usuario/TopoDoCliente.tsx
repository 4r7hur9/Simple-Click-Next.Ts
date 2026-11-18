"use client";

/**
 * O topo do cliente (card #105, desenho do Stitch no #128): marca,
 * localização, busca, sacola e menu da conta; no computador, a busca é um
 * campo de verdade no meio do topo e há uma segunda fileira com as abas
 * Explorar, Lojas, Favoritos e Pedidos em pílula. No celular a busca é o
 * ícone que leva ao campo do feed.
 *
 * Os dados do papel chegam entregues pelo servidor (a página já vem com o
 * nome certo, sem piscar). A localização e a sacola entram por `localizacao`
 * e `sacola`: o servidor decide se existem (a sacola só dentro de uma loja).
 *
 * As abas são LINKS com `aria-current="page"` (navegação entre páginas, não
 * painéis da mesma página). A busca e as abas leem a busca do endereço para
 * levar os filtros que valem nas duas listas; essa leitura fica dentro de um
 * `Suspense`, com os links sem filtro como reserva.
 *
 * Só `--cor-primaria*` e `--cor-foco` pintam o topo, que a loja já
 * sobrescreve; `--cor-marca*` não entra aqui.
 */
import "./navegacao.css";

import { IconeBuscar } from "@simpleclick/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type MouseEvent, type ReactNode } from "react";

import {
  caminhoSemBarra,
  type LojaNaBarra,
  type UsuarioDaBarra,
} from "../../lib/quem-esta-logado.ts";
import { conferirContaDoAparelho } from "./local-do-aparelho.ts";
import { MenuDaConta } from "./MenuDaConta.tsx";
import {
  abasDoTopo,
  type ItemDaNavegacao,
} from "./regras-da-navegacao.ts";

/** O campo de busca do feed (do #106): o topo só leva o foco até ele. */
export const ID_DO_CAMPO_DE_BUSCA = "sc-feed-busca";
const DESTINO_DA_BUSCA = `/explorar/produtos#${ID_DO_CAMPO_DE_BUSCA}`;

export interface TopoDoClienteProps {
  readonly usuario: UsuarioDaBarra;
  readonly loja?: LojaNaBarra | undefined;
  readonly sair: (caminho: string) => Promise<void>;
  /** O indicador de localização (o servidor já leu a cidade). */
  readonly localizacao?: ReactNode;
  /** A sacola da loja; só existe dentro de uma loja. */
  readonly sacola?: ReactNode;
}

function AbasDoTopo({
  usuario,
  busca,
}: {
  readonly usuario: UsuarioDaBarra;
  readonly busca?: URLSearchParams;
}) {
  const caminho = usePathname();
  const abas = abasDoTopo({ usuario, caminho, busca });
  return (
    <ul className="sc-topo-cliente__abas-lista">
      {abas.map((aba) => (
        <ItemDaAba key={aba.id} aba={aba} />
      ))}
    </ul>
  );
}

function ItemDaAba({ aba }: { readonly aba: ItemDaNavegacao }) {
  // No Stitch as abas do computador são só texto (os ícones ficam na barra
  // de baixo do celular).
  const conteudo = <span>{aba.rotulo}</span>;
  return (
    <li>
      {aba.atributos !== undefined ? (
        // Link comum: a janela de acesso escuta o clique no documento.
        <a
          href={aba.href}
          className="sc-topo-cliente__aba"
          data-navegacao={aba.id}
          {...aba.atributos}
        >
          {conteudo}
        </a>
      ) : (
        <Link
          href={aba.href}
          prefetch={false}
          className="sc-topo-cliente__aba"
          data-navegacao={aba.id}
          aria-current={aba.ativo ? "page" : undefined}
        >
          {conteudo}
        </Link>
      )}
    </li>
  );
}

function AbasComBusca({ usuario }: { readonly usuario: UsuarioDaBarra }) {
  const busca = useSearchParams();
  return <AbasDoTopo usuario={usuario} busca={busca} />;
}

/** Filtros do endereço que a busca do topo leva junto (a página volta à 1). */
const FILTROS_QUE_A_BUSCA_LEVA = ["tipo", "entrega", "atacado", "ordem", "lat", "lng", "lista"];

/**
 * A busca do computador: um formulário comum (funciona sem JavaScript) que
 * busca produtos, ou lojas quando a pessoa já está na lista de lojas, e leva
 * os filtros que estão valendo no feed.
 */
function BuscaDoTopo({ busca }: { readonly busca?: URLSearchParams }) {
  const caminho = usePathname() ?? "";
  const nasLojas = caminho.startsWith("/explorar/lojas");
  const noFeed = caminho.startsWith("/explorar");
  const filtros = noFeed
    ? FILTROS_QUE_A_BUSCA_LEVA.flatMap((nome) => {
        const valor = busca?.get(nome);
        return valor ? [[nome, valor] as const] : [];
      })
    : [];
  return (
    <form
      role="search"
      className="sc-topo-cliente__busca"
      action={nasLojas ? "/explorar/lojas" : "/explorar/produtos"}
    >
      <label className="sc-so-leitor" htmlFor="sc-topo-busca">
        {nasLojas ? "Buscar lojas" : "Buscar produtos e lojas"}
      </label>
      <IconeBuscar aria-hidden="true" className="sc-topo-cliente__busca-icone" />
      <input
        // A chave remonta o campo quando a busca do endereço muda.
        key={noFeed ? (busca?.get("busca") ?? "") : ""}
        id="sc-topo-busca"
        type="search"
        name="busca"
        maxLength={80}
        autoComplete="off"
        placeholder={nasLojas ? "Buscar lojas pelo nome ou bairro" : "Buscar lojas, produtos, lanches…"}
        defaultValue={noFeed ? (busca?.get("busca") ?? "") : ""}
      />
      {filtros.map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
    </form>
  );
}

function BuscaComEndereco() {
  return <BuscaDoTopo busca={useSearchParams()} />;
}

/** Leva o foco ao campo de busca do feed, se a página tiver um. */
function focarNaBusca(): boolean {
  const campo = document.getElementById(ID_DO_CAMPO_DE_BUSCA);
  if (campo === null) return false;
  campo.scrollIntoView?.({ block: "center" });
  campo.focus();
  return true;
}

export function TopoDoCliente({
  usuario,
  loja,
  sair,
  localizacao,
  sacola,
}: TopoDoClienteProps) {
  const caminho = usePathname();

  // Logado grava a marca; visitante num aparelho que teve conta (a conta saiu
  // por fora de um botão: excluir, sessão vencida, Sair do painel) limpa tudo.
  useEffect(() => {
    conferirContaDoAparelho(usuario.papel !== "visitante");
  }, [usuario.papel]);

  // Chegou pelo ícone de busca vindo de outra página: o campo ainda está
  // montando, então tenta por alguns quadros antes de desistir.
  useEffect(() => {
    if (window.location.hash !== `#${ID_DO_CAMPO_DE_BUSCA}`) return;
    let tentativas = 0;
    let quadro = 0;
    const tentar = () => {
      if (focarNaBusca() || tentativas++ >= 30) return;
      quadro = window.requestAnimationFrame(tentar);
    };
    tentar();
    return () => window.cancelAnimationFrame(quadro);
  }, [caminho]);

  if (caminhoSemBarra(caminho)) return null;

  function aoBuscar(evento: MouseEvent<HTMLAnchorElement>) {
    // Já está no feed: só move o foco, sem recarregar a página.
    if (focarNaBusca()) evento.preventDefault();
  }

  return (
    <header className="sc-topo-cliente">
      <div className="sc-topo-cliente__fileira">
        <Link
          href="/explorar"
          prefetch={false}
          className="sc-topo-cliente__marca"
          aria-label="SimpleClick, explorar"
        >
          <span className="sc-topo-cliente__nome" aria-hidden="true">
            Simple<span>Click</span>
          </span>
          <span className="sc-topo-cliente__ponto" aria-hidden="true" />
        </Link>

        <div className="sc-topo-cliente__local">{localizacao}</div>

        <Suspense fallback={<BuscaDoTopo />}>
          <BuscaComEndereco />
        </Suspense>

        <div className="sc-topo-cliente__acoes">
          <Link
            href={DESTINO_DA_BUSCA}
            prefetch={false}
            className="sc-topo-cliente__botao"
            aria-label="Buscar"
            data-navegacao="buscar"
            onClick={aoBuscar}
          >
            <IconeBuscar aria-hidden="true" />
          </Link>
          {sacola}
          <MenuDaConta usuario={usuario} loja={loja} sair={sair} />
        </div>
      </div>

      <nav className="sc-topo-cliente__abas" aria-label="Áreas do cliente">
        <Suspense fallback={<AbasDoTopo usuario={usuario} />}>
          <AbasComBusca usuario={usuario} />
        </Suspense>
      </nav>
    </header>
  );
}

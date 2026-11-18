/**
 * O cabeçalho do catálogo no layout Stitch (card #130): um cartão escuro com o
 * logo quadrado, o nome da loja, a situação em pílula e o rótulo do catálogo.
 *
 * Substitui o "topo curto" antigo (a capa com foto ao fundo e o nome no
 * marcador). A ordem é a das referências: voltar, logo, nome e situação, o "i"
 * do Sobre no canto e, do celular ao tablet, a busca logo abaixo — no
 * computador a busca mora em cima da grade (`.sc-catalogo__ferramentas`).
 *
 * DESENHADO NO SERVIDOR, sem script (AC-415): o voltar e o nome são links, a
 * busca é um formulário GET e o "i" leva ao Sobre (com script, abre a janela).
 *
 * Nada de dado inventado: sem nota, sem prazo de entrega, sem selo de
 * "distribuidor". Só o que o cadastro da loja informa.
 */
import { IconeInfo, IconeLoja, IconeVoltar } from "@simpleclick/ui";
import type { ReactNode } from "react";

import type { AberturaNaTela } from "../loja/ApresentacaoDaLoja.tsx";
import { FotoDaLoja } from "../loja/FotoDaLoja.tsx";

export interface CabecalhoDoCatalogoProps {
  readonly apelidoDaLoja: string;
  readonly nomeDaLoja: string;
  readonly logo: string | null;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo: string;
  readonly abertura: AberturaNaTela;
  /** Bairro e cidade da loja, quando cadastrados. */
  readonly lugar?: string | null | undefined;
  /** A busca do celular e do tablet (no computador ela fica sobre a grade). */
  readonly busca?: ReactNode;
}

export function CabecalhoDoCatalogo({
  apelidoDaLoja,
  nomeDaLoja,
  logo,
  rotuloDoCatalogo,
  abertura,
  lugar = null,
  busca = null,
}: CabecalhoDoCatalogoProps) {
  const enderecoDaLoja = `/loja/${apelidoDaLoja}`;
  return (
    <header className="sc-catalogo-topo">
      <div className="sc-catalogo-topo__linha">
        <a className="sc-catalogo-topo__voltar" href={enderecoDaLoja}>
          <IconeVoltar aria-hidden="true" />
          <span className="sc-catalogo-topo__voltar-texto">
            Voltar à vitrine
          </span>
        </a>

        <span className="sc-catalogo-topo__logo" aria-hidden="true">
          {logo ? (
            <FotoDaLoja className="sc-catalogo-topo__logo-foto" src={logo} />
          ) : (
            <IconeLoja />
          )}
        </span>

        <div className="sc-catalogo-topo__identidade">
          <div className="sc-catalogo-topo__nome-linha">
            <h1 className="sc-catalogo-topo__nome">
              <span className="sc-so-leitor">{rotuloDoCatalogo} de </span>
              <a className="sc-catalogo-topo__marca" href={enderecoDaLoja}>
                {nomeDaLoja}
              </a>
            </h1>
            <p
              className={`sc-catalogo-topo__situacao sc-catalogo-topo__situacao--${
                abertura.aberta ? "aberta" : "fechada"
              }`}
            >
              <span className="sc-catalogo-topo__ponto" aria-hidden="true" />
              {abertura.aberta ? "Aberta agora" : "Fechada"}
              {!abertura.aberta && abertura.proximaAbertura ? (
                <span className="sc-so-leitor">
                  , {abertura.proximaAbertura}
                </span>
              ) : null}
            </p>
          </div>
          <p className="sc-catalogo-topo__meta">
            <span className="sc-catalogo-topo__rotulo">{rotuloDoCatalogo}</span>
            {lugar ? <span>{lugar}</span> : null}
            {!abertura.aberta && abertura.proximaAbertura ? (
              <span aria-hidden="true">{abertura.proximaAbertura}</span>
            ) : null}
          </p>
        </div>

        {/* O "i" do Sobre: abre a janela por cima do catálogo. */}
        <a
          className="sc-catalogo-topo__sobre"
          href={`/loja/${apelidoDaLoja}/sobre`}
          data-abre-sobre=""
          aria-label={`Sobre ${nomeDaLoja}`}
        >
          <IconeInfo aria-hidden="true" />
        </a>
      </div>

      {busca ? <div className="sc-catalogo-topo__busca">{busca}</div> : null}
    </header>
  );
}

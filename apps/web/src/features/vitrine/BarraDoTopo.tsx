/**
 * A barra do topo da vitrine: a marca da loja, a busca e o carrinho.
 *
 * DESENHADA NO SERVIDOR. A marca é um link para a apresentação, a busca é o
 * mesmo formulário `GET` de sempre e o carrinho é um link para o fechamento —
 * as três coisas funcionam com o script desligado, que é o que o AC-415 exige.
 *
 * O ÚNICO SCRIPT é o que recolhe a barra quando a pessoa rola para baixo
 * (`RecolherAoRolar`). Ele não desenha nada: se nunca rodar, a barra só fica
 * no lugar, grudada no topo.
 */
import { IconeLoja, IconePedido } from "@simpleclick/ui";

import { BuscaProduto } from "./BuscaProduto.tsx";
import { RecolherAoRolar } from "./RecolherAoRolar.tsx";

/** O `id` que o script procura. Uma barra por página. */
const ID_DA_BARRA = "barra-do-topo";

export interface BarraDoTopoProps {
  readonly apelidoDaLoja: string;
  readonly nomeDaLoja: string;
  readonly logo?: string | null | undefined;
  /** Como a loja chama o catálogo: "cardápio" ou "catálogo". */
  readonly rotuloDoCatalogo: string;
  /** O que já está sendo buscado. */
  readonly termo?: string | null | undefined;
  /** Loja sem catálogo não tem o que buscar, e a busca sai da barra. */
  readonly comBusca?: boolean | undefined;
}

export function BarraDoTopo({
  apelidoDaLoja,
  nomeDaLoja,
  logo = null,
  rotuloDoCatalogo,
  termo = null,
  comBusca = true,
}: BarraDoTopoProps) {
  return (
    <header className="sc-barra" id={ID_DA_BARRA}>
      <div className="sc-barra__conteudo">
        {/*
          A marca é o caminho de volta para a apresentação, e é um link de
          verdade: quem chegou por um endereço compartilhado não tem "voltar".
        */}
        <a className="sc-barra__marca" href={`/l/${apelidoDaLoja}`}>
          {logo ? (
            <img
              className="sc-barra__logo"
              src={logo}
              alt=""
              width={36}
              height={36}
            />
          ) : (
            <span className="sc-barra__logo" aria-hidden="true">
              <IconeLoja />
            </span>
          )}
          <span className="sc-barra__nome">{nomeDaLoja}</span>
        </a>

        {comBusca ? (
          <BuscaProduto
            acao={`/l/${apelidoDaLoja}/catalogo`}
            termo={termo}
            rotuloDoCatalogo={rotuloDoCatalogo}
          />
        ) : (
          <span className="sc-barra__vao" />
        )}

        <a
          className="sc-botao sc-botao--secundaria sc-botao--pilula sc-barra__carrinho"
          href={`/l/${apelidoDaLoja}/checkout`}
        >
          <IconePedido />
          <span className="sc-barra__carrinho-texto">Carrinho</span>
        </a>
      </div>

      <RecolherAoRolar alvo={ID_DA_BARRA} />
    </header>
  );
}

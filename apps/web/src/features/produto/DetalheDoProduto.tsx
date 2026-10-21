/**
 * O detalhe de um produto, como a janela do cardápio o mostra: fotos, nome,
 * preço, descrição e o formulário de escolhas (AC-410, AC-411, AC-412, AC-413).
 *
 * SÓ DESENHA. Quem busca o produto e abre a janela é `JanelaDoProduto`; quem faz
 * a conta e leva o item ao carrinho é `EscolhasDoProduto`, o mesmo formulário de
 * sempre — a janela não tem regra de preço nem de estoque própria.
 *
 * AS FOTOS SÃO UMA TIRA que encaixa ao arrastar, sem script. A moldura tem
 * proporção fixa e a foto a preenche (`fill`), então a janela não pula quando a
 * imagem chega (AC-416).
 */
import Image from "next/image";

import type { ProdutoNaTela } from "../../lib/produto.ts";

import { EscolhasDoProduto } from "./EscolhasDoProduto.tsx";
import { SeloDePreco } from "./SeloDePreco.tsx";

export interface DetalheDoProdutoProps {
  readonly produto: ProdutoNaTela;
  readonly apelidoDaLoja: string;
  readonly rotulos: { readonly variacao: string };
  /** O tipo de negócio da loja: escolhe o exemplo da observação do item. */
  readonly ramo?: string | null | undefined;
  /** O id do nome do produto, que dá nome à janela. */
  readonly idDoTitulo: string;
  readonly aoAdicionado?: (() => void) | undefined;
}

export function DetalheDoProduto({
  produto,
  apelidoDaLoja,
  rotulos,
  ramo,
  idDoTitulo,
  aoAdicionado,
}: DetalheDoProdutoProps) {
  const fotos = produto.imagens;

  return (
    <div className="sc-detalhe">
      <div className="sc-detalhe__fotos">
        {fotos.length > 0 ? (
          <ul
            className="sc-detalhe__galeria"
            aria-label="Fotos do produto"
            tabIndex={fotos.length > 1 ? 0 : undefined}
          >
            {fotos.map((imagem, indice) => (
              <li className="sc-detalhe__figura" key={imagem.url}>
                <Image
                  className="sc-detalhe__foto"
                  src={imagem.url}
                  alt={imagem.texto ?? ""}
                  fill
                  priority={indice === 0}
                  sizes="(max-width: 768px) 100vw, 28rem"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="sc-detalhe__sem-foto" aria-hidden="true">
            {produto.nome.slice(0, 1).toUpperCase()}
          </div>
        )}
        {fotos.length > 1 ? (
          <p className="sc-detalhe__contagem-de-fotos" aria-hidden="true">
            {fotos.length} fotos · arraste para ver
          </p>
        ) : null}
      </div>

      <div className="sc-detalhe__decisao">
        <header className="sc-produto__cabecalho">
          {produto.nomeDaSecao ? (
            <p className="sc-produto__etiqueta">{produto.nomeDaSecao}</p>
          ) : null}
          <h2 className="sc-produto__nome" id={idDoTitulo}>
            {produto.nome}
          </h2>
          {produto.chamada ? (
            <p className="sc-produto__chamada">{produto.chamada}</p>
          ) : null}
          <SeloDePreco
            preco={produto.preco}
            precoAnterior={produto.precoAnterior}
          />
        </header>

        {produto.descricao ? (
          <section
            className="sc-produto__descricao"
            aria-labelledby={`${idDoTitulo}-sobre`}
          >
            <h3 className="sc-produto__secao-nome" id={`${idDoTitulo}-sobre`}>
              Sobre o item
            </h3>
            <p>{produto.descricao}</p>
          </section>
        ) : null}

        <EscolhasDoProduto
          // A chave refaz o formulário do zero a cada produto aberto: as
          // escolhas do pastel não vazam para o refrigerante.
          key={produto.id}
          produto={produto}
          apelidoDaLoja={apelidoDaLoja}
          rotulos={rotulos}
          ramo={ramo}
          aoAdicionado={aoAdicionado}
        />
      </div>
    </div>
  );
}

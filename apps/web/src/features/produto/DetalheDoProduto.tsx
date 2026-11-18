/**
 * O detalhe de um produto, como a janela do cardápio o mostra: galeria, nome,
 * preço, descrição e o formulário de escolhas (AC-410 a AC-413, AC-10901 a
 * AC-10907).
 *
 * SÓ MONTA. A galeria é `GaleriaDoProduto`; a ordem dos blocos vem do ramo
 * (`blocos-do-ramo.ts`); quem faz a conta, mostra o preço que acompanha a
 * variação e leva o item ao carrinho é `EscolhasDoProduto` — a janela não tem
 * regra de preço nem de estoque própria.
 *
 * Em 768 px ou mais a galeria fica à esquerda e a decisão à direita; abaixo
 * disso, a galeria vem primeiro e a decisão logo depois.
 */
import { midiasDaGaleria, type ProdutoNaTela } from "../../lib/produto.ts";

import { EscolhasDoProduto } from "./EscolhasDoProduto.tsx";
import { GaleriaDoProduto } from "./GaleriaDoProduto.tsx";

export interface DetalheDoProdutoProps {
  readonly produto: ProdutoNaTela;
  readonly apelidoDaLoja: string;
  readonly rotulos: { readonly variacao: string };
  /** O tipo de negócio da loja: escolhe o exemplo da observação do item. */
  readonly ramo?: string | null | undefined;
  /** `blocos.detalheProduto` do ramo: só ordena a tela (AC-10905). */
  readonly blocos?: readonly string[] | undefined;
  /** O id do nome do produto, que dá nome à janela. */
  readonly idDoTitulo: string;
  readonly aoAdicionado?: (() => void) | undefined;
}

export function DetalheDoProduto({
  produto,
  apelidoDaLoja,
  rotulos,
  ramo,
  blocos,
  idDoTitulo,
  aoAdicionado,
}: DetalheDoProdutoProps) {
  const especificacoes = produto.especificacoes ?? [];
  return (
    <div className="sc-detalhe">
      <div className="sc-detalhe__fotos">
        <GaleriaDoProduto
          midias={midiasDaGaleria(produto)}
          nome={produto.nome}
        />
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
        </header>

        <EscolhasDoProduto
          // A chave refaz o formulário do zero a cada produto aberto: as
          // escolhas do pastel não vazam para o refrigerante.
          key={produto.id}
          produto={produto}
          apelidoDaLoja={apelidoDaLoja}
          rotulos={rotulos}
          ramo={ramo}
          blocos={blocos}
          aoAdicionado={aoAdicionado}
          informacoes={
            produto.descricao || especificacoes.length > 0 ? (
              <>
                {produto.descricao ? (
                  <section
                    className="sc-produto__descricao"
                    aria-labelledby={`${idDoTitulo}-sobre`}
                  >
                    <h3
                      className="sc-produto__secao-nome"
                      id={`${idDoTitulo}-sobre`}
                    >
                      Sobre o item
                    </h3>
                    <p>{produto.descricao}</p>
                  </section>
                ) : null}
                {especificacoes.length > 0 ? (
                  <section
                    className="sc-produto__especificacoes"
                    aria-labelledby={`${idDoTitulo}-especificacoes`}
                  >
                    <h3
                      className="sc-produto__secao-nome"
                      id={`${idDoTitulo}-especificacoes`}
                    >
                      Especificações
                    </h3>
                    <dl className="sc-produto__especificacoes-lista">
                      {especificacoes.map((item) => (
                        <div key={item.chave}>
                          <dt>{item.nome}</dt>
                          <dd>{item.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}
              </>
            ) : null
          }
        />
      </div>
    </div>
  );
}

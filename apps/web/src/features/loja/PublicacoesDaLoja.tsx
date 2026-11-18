/**
 * As publicações da loja na vitrine, em GRADE COMPACTA (card #129, Stitch).
 *
 * Antes era o feed inteiro (um post gigante embaixo do outro), e a página
 * passava de oito mil pixels. Agora são no máximo seis cartões pequenos —
 * foto, nome e preço — e, se houver mais, um link "Ver todas as publicações"
 * que leva ao catálogo, onde estão todos os produtos à venda. Curtir e comentar
 * continuam no feed do /explorar.
 *
 * Componente de SERVIDOR e sem script: tudo está no HTML.
 */
import Image from "next/image";
import type { ProdutoDoFeed } from "@simpleclick/contracts";
import { IconeAvancar } from "@simpleclick/ui";

import { escreverDinheiro } from "../../lib/dinheiro.ts";

/** Quantas publicações a vitrine mostra; o resto fica no catálogo. */
export const PUBLICACOES_NA_VITRINE = 6;

export interface PublicacoesDaLojaProps {
  readonly apelido: string;
  readonly produtos: readonly ProdutoDoFeed[];
  /** Para onde leva o "Ver todas as publicações". */
  readonly linkDeTodas: string;
}

export function PublicacoesDaLoja({
  apelido,
  produtos,
  linkDeTodas,
}: PublicacoesDaLojaProps) {
  if (produtos.length === 0) return null;
  const visiveis = produtos.slice(0, PUBLICACOES_NA_VITRINE);

  return (
    <section
      className="sc-loja__publicacoes-secao"
      aria-labelledby="sc-loja-publicacoes"
    >
      <div className="sc-loja__secao-cabeca">
        <h2 id="sc-loja-publicacoes" className="sc-loja__secao-titulo">
          Publicações
        </h2>
        {produtos.length > PUBLICACOES_NA_VITRINE ? (
          <a className="sc-loja__ver-todas" href={linkDeTodas}>
            Ver todas as publicações
            <IconeAvancar aria-hidden="true" width={16} height={16} />
          </a>
        ) : null}
      </div>

      <ul className="sc-loja__publicacoes-grade">
        {visiveis.map((produto) => {
          const temDesconto =
            produto.precoOriginalCentavos !== null &&
            produto.precoCentavos !== null &&
            produto.precoOriginalCentavos > produto.precoCentavos;
          return (
            <li key={produto.id}>
              <a
                className="sc-loja__publicacao"
                href={`/loja/${apelido}/produto/${produto.id}`}
              >
                <span className="sc-loja__publicacao-foto">
                  {produto.imagem ? (
                    <Image
                      src={produto.imagem}
                      // Decoração: o nome do produto está logo abaixo, em texto.
                      alt=""
                      width={320}
                      height={320}
                      loading="lazy"
                      sizes="(max-width: 767px) 50vw, 240px"
                    />
                  ) : (
                    <span aria-hidden="true">
                      {produto.nome.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="sc-loja__publicacao-texto">
                  <span className="sc-loja__publicacao-nome">
                    {produto.nome}
                  </span>
                  <span className="sc-loja__publicacao-preco">
                    {produto.precoCentavos === null ? (
                      "Ver opções"
                    ) : (
                      <>
                        {temDesconto ? (
                          <s>
                            <span className="sc-so-leitor">De </span>
                            {escreverDinheiro(
                              produto.precoOriginalCentavos ?? 0,
                            )}
                          </s>
                        ) : null}
                        <span>
                          {temDesconto ? (
                            <span className="sc-so-leitor">por </span>
                          ) : null}
                          {escreverDinheiro(produto.precoCentavos)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

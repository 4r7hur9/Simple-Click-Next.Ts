/**
 * O cartão de um produto na vitrine (AC-404). Mora à parte da grade porque o
 * "Ver mais" (card #74) desenha no navegador os cartões das páginas seguintes,
 * e o cartão tem de ser o MESMO nos dois lados.
 *
 * Sem estado e sem efeito: serve ao servidor e ao cliente igual.
 */
import { IconeAdicionar } from "@simpleclick/ui";
import Image from "next/image";

import type { ProdutoNaTela } from "../../lib/catalogo.ts";

import { CartaoEsgotado } from "./CartaoEsgotado.tsx";

/**
 * A dimensão da imagem vai na marcação, e não só no estilo.
 *
 * Sem ela o navegador não sabe quanto espaço reservar, a página salta quando
 * cada foto chega, e o dedo que ia no cartão acerta o de baixo (AC-416).
 */
const LARGURA_DA_IMAGEM = 320;
const ALTURA_DA_IMAGEM = 240;

export interface CartaoDeProdutoProps {
  readonly produto: ProdutoNaTela;
  /**
   * O primeiro cartão da primeira seção carrega a imagem de imediato; o resto
   * espera a rolagem chegar perto. Sem isso, uma loja com sessenta produtos
   * baixa sessenta fotos antes de mostrar a primeira.
   */
  readonly prioridade?: boolean | undefined;
}

/**
 * Um produto na vitrine: imagem, nome, chamada e preço, e o "+".
 *
 * SÃO DOIS LINKS LADO A LADO, e não um botão dentro de um link (que é HTML
 * inválido e confunde o leitor de tela). O cartão leva ao produto; o "+" também
 * — sem script, os dois navegam para a página do produto e nada se perde. Com
 * script, `JanelaDoProduto` pega os dois cliques: o cartão abre o detalhe numa
 * janela sobre o cardápio, e o "+" adiciona direto quando o produto é simples.
 */
export function CartaoDeProduto({
  produto,
  prioridade = false,
}: CartaoDeProdutoProps) {
  return (
    <div
      className={`sc-vitrine__cartao${
        produto.disponivel ? "" : " sc-vitrine__cartao--esgotado"
      }`}
    >
      <a
        className="sc-vitrine__link"
        href={produto.link}
        data-abre-produto={produto.id}
      >
        <span className="sc-vitrine__moldura">
          {produto.imagem ? (
            <Image
              className="sc-vitrine__foto"
              src={produto.imagem}
              // A imagem é decoração: o nome do produto está ao lado, em texto, e
              // repeti-lo aqui faria o leitor de tela dizer tudo duas vezes.
              alt=""
              width={LARGURA_DA_IMAGEM}
              height={ALTURA_DA_IMAGEM}
              priority={prioridade}
              loading={prioridade ? undefined : "lazy"}
              sizes="(max-width: 540px) 50vw, 320px"
            />
          ) : (
            // Loja nova costuma não ter foto, e cartão sem moldura desalinha a
            // grade inteira. O espaço é o mesmo, com a inicial do produto dentro.
            <span className="sc-vitrine__sem-foto" aria-hidden="true">
              {produto.nome.slice(0, 1).toUpperCase()}
            </span>
          )}
          {produto.disponivel ? null : (
            <CartaoEsgotado motivo={produto.motivoIndisponivel} />
          )}
        </span>

        <span className="sc-vitrine__texto">
          <span className="sc-vitrine__nome">{produto.nome}</span>
          {produto.chamada ? (
            <span className="sc-vitrine__chamada">{produto.chamada}</span>
          ) : null}
          <span className="sc-vitrine__pe">
            <span className="sc-vitrine__precos">
              {produto.precoAnterior ? (
                <span className="sc-vitrine__preco-anterior">
                  {/*
                    O riscado sozinho é só estilo, e estilo não chega a quem ouve a
                    página. `De` e `por` contam a promoção em palavras.
                  */}
                  <span className="sc-so-leitor">De </span>
                  <s>{produto.precoAnterior}</s>
                </span>
              ) : null}
              {produto.preco ? (
                <span className="sc-vitrine__preco">
                  {produto.precoAnterior ? (
                    <span className="sc-so-leitor">por </span>
                  ) : null}
                  {produto.preco}
                </span>
              ) : (
                // Preço que depende de variação não vira "a partir de" inventado
                // aqui: o servidor mandou nulo porque não há um preço só.
                <span className="sc-vitrine__preco sc-vitrine__preco--variavel">
                  Ver opções
                </span>
              )}
              {/* Varejo e atacado juntos (card #56); sem faixa, nada muda. */}
              {produto.atacado ? (
                <span className="sc-vitrine__atacado">{produto.atacado}</span>
              ) : null}
            </span>
          </span>
        </span>
      </a>

      {/* Produto que não está à venda agora não ganha "+": não há o que adicionar. */}
      {produto.disponivel ? (
        <a
          className="sc-vitrine__mais"
          href={produto.link}
          data-adicionar-produto={produto.id}
          aria-label={`Adicionar ${produto.nome} à sacola`}
        >
          <IconeAdicionar aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

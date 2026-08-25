/**
 * A grade de produtos de uma seção, e o cartão que ela repete (AC-404, AC-407).
 *
 * DESENHADO NO SERVIDOR, sem nenhum script: é o que o AC-415 exige da vitrine e
 * o que faz o cardápio abrir na fila do ônibus com uma barra de sinal. Não há
 * estado, não há efeito, não há evento — o cartão é um link e a grade é uma
 * lista.
 *
 * A LISTA É UMA `ul` DE VERDADE porque quem usa leitor de tela recebe a
 * contagem ("lista com 12 itens") antes de percorrer, e é essa contagem que diz
 * se vale a pena ouvir tudo ou pular para a próxima seção.
 */
import { Vazio } from "@simpleclick/ui";

import type { ProdutoNaTela, SecaoNaTela } from "../../lib/catalogo.ts";

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

/** Um produto na vitrine: imagem, nome, chamada e preço, dentro de um link. */
export function CartaoDeProduto({
  produto,
  prioridade = false,
}: CartaoDeProdutoProps) {
  return (
    <a
      className={`sc-vitrine__cartao${
        produto.disponivel ? "" : " sc-vitrine__cartao--esgotado"
      }`}
      href={produto.link}
    >
      <span className="sc-vitrine__moldura">
        {produto.imagem ? (
          <img
            className="sc-vitrine__foto"
            src={produto.imagem}
            // A imagem é decoração: o nome do produto está ao lado, em texto, e
            // repeti-lo aqui faria o leitor de tela dizer tudo duas vezes.
            alt=""
            width={LARGURA_DA_IMAGEM}
            height={ALTURA_DA_IMAGEM}
            loading={prioridade ? "eager" : "lazy"}
          />
        ) : (
          // Loja nova costuma não ter foto, e cartão sem moldura desalinha a
          // grade inteira. O espaço é o mesmo, com a inicial do produto dentro.
          <span className="sc-vitrine__sem-foto" aria-hidden="true">
            {produto.nome.slice(0, 1).toUpperCase()}
          </span>
        )}
        {produto.disponivel ? null : <CartaoEsgotado />}
      </span>

      <span className="sc-vitrine__texto">
        <span className="sc-vitrine__nome">{produto.nome}</span>
        {produto.chamada ? (
          <span className="sc-vitrine__chamada">{produto.chamada}</span>
        ) : null}
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
        </span>
      </span>
    </a>
  );
}

export interface GradeDeProdutosProps {
  readonly secao: SecaoNaTela;
  /** Só a primeira seção da página adianta o carregamento da primeira foto. */
  readonly primeira?: boolean | undefined;
}

/** Uma seção do cardápio, com título e a grade dos produtos dela. */
export function GradeDeProdutos({
  secao,
  primeira = false,
}: GradeDeProdutosProps) {
  return (
    <section
      className="sc-vitrine__secao"
      aria-labelledby={`secao-${secao.id}`}
    >
      <h2 className="sc-vitrine__secao-nome" id={`secao-${secao.id}`}>
        {secao.nome}
      </h2>

      {secao.produtos.length === 0 ? (
        // Seção vazia acontece quando o dono criou a categoria e ainda não
        // publicou nada nela. Dizer isso é melhor que um título solto seguido
        // de branco, que lê como falha de carregamento.
        <Vazio
          titulo="Ainda não há nada aqui"
          descricao={`A seção ${secao.nome} está sendo montada.`}
        />
      ) : (
        <ul className="sc-vitrine__grade">
          {secao.produtos.map((produto, indice) => (
            <li className="sc-vitrine__item" key={produto.id}>
              <CartaoDeProduto
                produto={produto}
                prioridade={primeira && indice === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

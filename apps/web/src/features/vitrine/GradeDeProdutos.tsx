/**
 * A grade de produtos de uma seção, e o cartão que ela repete (AC-404, AC-407).
 *
 * DESENHADO NO SERVIDOR, sem nenhum script: é o que o AC-415 exige da vitrine e
 * o que faz o cardápio abrir na fila do ônibus com uma barra de sinal. Não há
 * estado, não há efeito, não há evento — o cartão é feito de links e a grade é
 * uma lista.
 *
 * A LISTA É UMA `ul` DE VERDADE porque quem usa leitor de tela recebe a
 * contagem ("lista com 12 itens") antes de percorrer, e é essa contagem que diz
 * se vale a pena ouvir tudo ou pular para a próxima seção.
 */
import { Vazio } from "@simpleclick/ui";

import type { PaginaNaTela, RecorteDaLista, SecaoNaTela } from "../../lib/catalogo.ts";

import { CartaoDeProduto, type FormatoDoCartao } from "./CartaoDeProduto.tsx";
import { MaisProdutos } from "./MaisProdutos.tsx";

export {
  CartaoDeProduto,
  type CartaoDeProdutoProps,
  type FormatoDoCartao,
} from "./CartaoDeProduto.tsx";

export interface GradeDeProdutosProps {
  readonly secao: SecaoNaTela;
  /** Só a primeira seção da página adianta o carregamento da primeira foto. */
  readonly primeira?: boolean | undefined;
  /**
   * Traz a página seguinte (card #74) — a ação de servidor da rota, já presa à
   * loja. Sem ela, o "Ver mais" é só o link.
   */
  readonly carregarMais?:
    | ((recorte: RecorteDaLista, cursor: string) => Promise<PaginaNaTela | null>)
    | undefined;
  /**
   * A lista carrega sozinha quando a rolagem chega ao fim. É para a lista
   * ÚNICA (categoria ou ordem); nas seções do cardápio, rolar até o fim de uma
   * seção é querer ver a seguinte, e o "Ver mais" espera o toque.
   */
  readonly automatico?: boolean | undefined;
  /** O cartão da lista (celular) e da grade (tablet e computador). */
  readonly formato?: FormatoDoCartao | undefined;
}

/** Uma seção do cardápio, com título e a grade dos produtos dela. */
export function GradeDeProdutos({
  secao,
  primeira = false,
  carregarMais,
  automatico = false,
  formato = "catalogo",
}: GradeDeProdutosProps) {
  const total = secao.total ?? secao.produtos.length;
  const itens = secao.produtos.map((produto, indice) => (
    <li className="sc-vitrine__item" key={produto.id}>
      <CartaoDeProduto
        produto={produto}
        prioridade={primeira && indice === 0}
        formato={formato}
      />
    </li>
  ));
  return (
    <section
      className="sc-vitrine__secao"
      aria-labelledby={`secao-${secao.id}`}
    >
      <div className="sc-vitrine__secao-topo">
        <h2 className="sc-vitrine__secao-nome" id={`secao-${secao.id}`}>
          {secao.nome}
        </h2>
        {/*
          A contagem fica FORA do título: dentro dele, o leitor de tela diria
          "Pastéis 4" a cada salto de seção. A lista já anuncia quantos são.
        */}
        {total > 0 ? (
          <span className="sc-vitrine__secao-contagem" aria-hidden="true">
            {total} {total === 1 ? "item" : "itens"}
          </span>
        ) : null}
      </div>

      {secao.produtos.length === 0 ? (
        // Seção vazia acontece quando o dono criou a categoria e ainda não
        // publicou nada nela. Dizer isso é melhor que um título solto seguido
        // de branco, que lê como falha de carregamento.
        <Vazio
          titulo="Ainda não há nada aqui"
          descricao={`A seção ${secao.nome} está sendo montada.`}
        />
      ) : secao.mais ? (
        // A lista não veio inteira: o resto chega pelo "Ver mais" (card #74).
        <MaisProdutos
          // Recorte novo (outra ordem, outro filtro) recomeça a lista: as
          // páginas já carregadas eram de outra pergunta.
          key={`${secao.mais.cursor}|${JSON.stringify(secao.mais.recorte)}`}
          mais={secao.mais}
          restantes={total - secao.produtos.length}
          nomeDaSecao={secao.nome}
          carregar={carregarMais}
          automatico={automatico}
          formato={formato}
          jaMostrados={secao.produtos.map((produto) => produto.id)}
        >
          {itens}
        </MaisProdutos>
      ) : (
        <ul className="sc-vitrine__grade">{itens}</ul>
      )}
    </section>
  );
}

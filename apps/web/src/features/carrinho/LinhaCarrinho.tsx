"use client";

/**
 * Uma linha do carrinho (AC-500, AC-501).
 *
 * Os controles de quantidade são BOTÕES, e não um campo numérico. A diferença
 * importa em celular, que é onde a maioria compra: campo numérico abre teclado,
 * exige apagar o que está lá e digitar outro número, e aceita "0" digitado sem
 * querer. Botão de mais e menos resolve com um toque.
 *
 * O botão de menos vira "remover" quando a quantidade é 1. É o mesmo gesto que
 * o cliente já ia fazer, e evita a pergunta "clico em menos ou em remover?".
 */
import { Botao, IconeAdicionar, IconeExcluir, IconeRemover } from "@simpleclick/ui";

import type { ItemNaTela } from "./useCarrinho.ts";

export interface LinhaCarrinhoProps {
  readonly item: ItemNaTela;
  readonly aoMudarQuantidade: (itemId: string, quantidade: number) => void;
  /** Enquanto o servidor responde, os controles ficam bloqueados. */
  readonly ocupado?: boolean | undefined;
}

export function LinhaCarrinho({
  item,
  aoMudarQuantidade,
  ocupado = false,
}: LinhaCarrinhoProps) {
  const vaiRemover = item.quantidade <= 1;
  const nomeCompleto = item.variacao
    ? `${item.nome} (${item.variacao})`
    : item.nome;

  return (
    <li className="sc-linha-carrinho">
      <div className="sc-linha-carrinho__descricao">
        <p className="sc-linha-carrinho__nome">{nomeCompleto}</p>

        {item.opcoes && item.opcoes.length > 0 ? (
          <ul className="sc-linha-carrinho__opcoes">
            {item.opcoes.map((opcao) => (
              <li key={`${opcao.grupoNome}:${opcao.opcaoNome}`}>
                {opcao.grupoNome}: {opcao.opcaoNome}
              </li>
            ))}
          </ul>
        ) : null}

        {item.observacao ? (
          <p className="sc-linha-carrinho__observacao">
            Obs.: {item.observacao}
          </p>
        ) : null}

        <p className="sc-linha-carrinho__preco">
          {item.quantidade} × {item.precoUnitario}
        </p>
      </div>

      <div className="sc-linha-carrinho__controles">
        <Botao
          variante="secundaria"
          forma="pilula"
          soIcone
          icone={vaiRemover ? <IconeExcluir /> : <IconeRemover />}
          desabilitado={ocupado}
          onClick={() => aoMudarQuantidade(item.id, item.quantidade - 1)}
          // O rótulo acessível diz DE QUAL item se trata: numa lista de cinco,
          // ouvir "diminuir" cinco vezes não diz nada a quem não enxerga.
          aria-label={
            vaiRemover
              ? `Remover ${nomeCompleto} do carrinho`
              : `Diminuir quantidade de ${nomeCompleto}`
          }
        >
          {vaiRemover ? "Remover" : "Diminuir"}
        </Botao>

        <span className="sc-linha-carrinho__quantidade" aria-live="polite">
          {item.quantidade}
        </span>

        <Botao
          variante="secundaria"
          forma="pilula"
          soIcone
          icone={<IconeAdicionar />}
          desabilitado={ocupado}
          onClick={() => aoMudarQuantidade(item.id, item.quantidade + 1)}
          aria-label={`Aumentar quantidade de ${nomeCompleto}`}
        >
          Aumentar
        </Botao>
      </div>

      <p className="sc-linha-carrinho__total">{item.totalDaLinha}</p>
    </li>
  );
}

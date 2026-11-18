"use client";

/**
 * Uma linha do carrinho (AC-500, AC-501).
 *
 * ESCANEÁVEL, SEM FOTO. O nome em destaque com o subtotal alinhado à direita;
 * embaixo, numa lista discreta com filete verde, o que foi escolhido — variação,
 * opções com o acréscimo de cada uma e a observação —; a descrição do produto
 * em cinza, em até duas linhas; e no pé, a quantidade, o preço de cada um e o
 * remover. As linhas se separam por divisória fina, e não por caixa.
 *
 * Os controles de quantidade são BOTÕES, e não um campo numérico: campo
 * numérico no celular abre teclado e aceita "0" digitado sem querer. Na
 * quantidade 1, o "menos" fica desligado e quem quer tirar o item usa o
 * "remover", que diz o que faz.
 */
import {
  Aviso,
  Botao,
  IconeAdicionar,
  IconeExcluir,
  IconeRemover,
} from "@simpleclick/ui";

import type { ItemNaTela, OpcaoNaTela } from "./useCarrinho.ts";

/** "2× Catupiry" quando repete; só o nome quando é uma vez. */
function nomeDaOpcao(opcao: OpcaoNaTela): string {
  return opcao.quantidade && opcao.quantidade > 1
    ? `${opcao.quantidade}× ${opcao.opcaoNome}`
    : opcao.opcaoNome;
}

/** As opções juntas por grupo, na ordem em que aparecem. */
function gruposDe(opcoes: readonly OpcaoNaTela[]) {
  const grupos = new Map<string, OpcaoNaTela[]>();
  for (const opcao of opcoes) {
    const lista = grupos.get(opcao.grupoNome) ?? [];
    lista.push(opcao);
    grupos.set(opcao.grupoNome, lista);
  }
  return [...grupos].map(([nome, lista]) => ({
    nome,
    opcoes: lista,
    comAcrescimo: lista.some((opcao) => Boolean(opcao.acrescimo)),
  }));
}

export interface LinhaCarrinhoProps {
  readonly item: ItemNaTela;
  readonly aoMudarQuantidade: (itemId: string, quantidade: number) => void;
  /** Enquanto o servidor responde, os controles ficam bloqueados. */
  readonly ocupado?: boolean | undefined;
  /**
   * A mudança de quantidade desta linha que o servidor recusou (AC-11009): a
   * linha segue com a quantidade de antes, diz que não deu e oferece tentar de
   * novo. Ausente, nada é mostrado.
   */
  readonly falha?: { readonly aoTentarDeNovo: () => void } | undefined;
}

export function LinhaCarrinho({
  item,
  aoMudarQuantidade,
  ocupado = false,
  falha,
}: LinhaCarrinhoProps) {
  const nomeCompleto = item.variacao
    ? `${item.nome} (${item.variacao})`
    : item.nome;
  const opcoes = item.opcoes ?? [];
  const temDetalhe =
    Boolean(item.variacao) || opcoes.length > 0 || Boolean(item.observacao);

  const foto = item.foto ?? null;

  return (
    <li
      className={`sc-carrinho-janela__item${
        foto ? " sc-carrinho-janela__item--com-foto" : ""
      }`}
    >
      {foto ? (
        // A foto é do produto; o nome já está ao lado, então o texto
        // alternativo só entra quando o cadastro trouxe um próprio.
        <img
          className="sc-carrinho-janela__foto"
          src={foto.url}
          alt={foto.texto ?? ""}
          width={foto.largura ?? 96}
          height={foto.altura ?? 96}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <div className="sc-carrinho-janela__cabeca">
        <p className="sc-carrinho-janela__nome">{item.nome}</p>
        <p className="sc-carrinho-janela__subtotal">{item.totalDaLinha}</p>
      </div>

      {item.descricao ? (
        <p className="sc-carrinho-janela__descricao">{item.descricao}</p>
      ) : null}

      {item.faixaDoAtacado || item.avisoDoAtacado ? (
        // O atacado se explica na própria linha: a faixa que já vale e quanto
        // falta para a próxima. Polido, para o leitor de tela ouvir quando a
        // quantidade muda e o desconto chega (card #57).
        <div className="sc-carrinho-janela__atacado" aria-live="polite">
          {item.faixaDoAtacado ? (
            <p className="sc-carrinho-janela__atacado-faixa">
              {item.faixaDoAtacado}
            </p>
          ) : null}
          {item.avisoDoAtacado ? (
            <p className="sc-carrinho-janela__atacado-falta">
              {item.avisoDoAtacado}
            </p>
          ) : null}
        </div>
      ) : null}

      {temDetalhe ? (
        <ul className="sc-carrinho-janela__detalhes">
          {item.variacao ? (
            <li>
              <span>{item.variacao}</span>
            </li>
          ) : null}
          {gruposDe(opcoes).map((grupo) =>
            grupo.comAcrescimo ? (
              // Com preço, cada opção na sua linha, o acréscimo à direita.
              grupo.opcoes.map((opcao) => (
                <li key={`${grupo.nome}:${opcao.opcaoNome}`}>
                  <span>
                    <span className="sc-carrinho-janela__grupo">
                      {grupo.nome}:
                    </span>{" "}
                    {nomeDaOpcao(opcao)}
                  </span>
                  {opcao.acrescimo ? (
                    <span className="sc-carrinho-janela__acrescimo">
                      {opcao.acrescimo}
                    </span>
                  ) : null}
                </li>
              ))
            ) : (
              // Sem preço, o grupo inteiro numa linha: "Ingredientes: Ovo, Cebola".
              <li key={grupo.nome}>
                <span>
                  <span className="sc-carrinho-janela__grupo">
                    {grupo.nome}:
                  </span>{" "}
                  {grupo.opcoes.map(nomeDaOpcao).join(", ")}
                </span>
              </li>
            ),
          )}
          {item.observacao ? (
            <li className="sc-carrinho-janela__observacao">
              <span>Obs.: {item.observacao}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {falha ? (
        <div className="sc-carrinho-janela__falha">
          <Aviso
            tom="erro"
            titulo="Não foi possível mudar a quantidade"
            acao={
              <Botao variante="secundaria" onClick={falha.aoTentarDeNovo}>
                Tentar de novo
              </Botao>
            }
          >
            A quantidade continua a de antes.
          </Aviso>
        </div>
      ) : null}

      <div className="sc-carrinho-janela__pe">
        <div
          className="sc-carrinho-janela__quantidade"
          role="group"
          aria-label={`Quantidade de ${nomeCompleto}`}
        >
          <button
            type="button"
            className="sc-carrinho-janela__passo"
            disabled={ocupado || item.quantidade <= 1}
            onClick={() => aoMudarQuantidade(item.id, item.quantidade - 1)}
            // O rótulo diz DE QUAL item se trata: numa lista de cinco, ouvir
            // "diminuir" cinco vezes não diz nada a quem não enxerga.
            aria-label={`Diminuir quantidade de ${nomeCompleto}`}
          >
            <IconeRemover aria-hidden="true" />
          </button>
          <span className="sc-carrinho-janela__contagem" aria-live="polite">
            {item.quantidade}
          </span>
          <button
            type="button"
            className="sc-carrinho-janela__passo"
            disabled={ocupado}
            onClick={() => aoMudarQuantidade(item.id, item.quantidade + 1)}
            aria-label={`Aumentar quantidade de ${nomeCompleto}`}
          >
            <IconeAdicionar aria-hidden="true" />
          </button>
        </div>

        <p className="sc-carrinho-janela__unitario">
          {item.precoDeVarejo ? (
            <>
              <s className="sc-carrinho-janela__varejo">
                <span className="sc-so-leitor">De </span>
                {item.precoDeVarejo}
              </s>{" "}
              <span className="sc-so-leitor">por </span>
            </>
          ) : null}
          {item.precoUnitario} <span>cada</span>
        </p>

        <button
          type="button"
          className="sc-carrinho-janela__remover"
          disabled={ocupado}
          onClick={() => aoMudarQuantidade(item.id, 0)}
          aria-label={`Remover ${nomeCompleto} do carrinho`}
        >
          <IconeExcluir aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

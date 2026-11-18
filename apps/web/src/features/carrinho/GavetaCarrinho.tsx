"use client";

/**
 * A janela do carrinho (AC-500, AC-501, AC-502).
 *
 * TRÊS FAIXAS: o cabeçalho verde no alto (título, quantos itens e o fechar), a
 * lista no meio — a ÚNICA parte que rola, com a barra de rolagem longe do
 * cabeçalho — e o rodapé com o resumo e o "Fechar pedido". Cabeçalho e rodapé
 * ficam sempre à vista: com dez itens, a pessoa não rola até o fim para fechar.
 *
 * Cobre os quatro estados que P-011 exige, e o vazio é o que mais importa aqui:
 * carrinho sem itens não é um erro nem uma tela em branco — é o momento em que
 * a loja tem de convidar a pessoa a voltar à vitrine (AC-501).
 *
 * O estado de erro NÃO diz "seu carrinho está vazio". Um carrinho que não
 * carregou não é um carrinho vazio, e mandar a pessoa "voltar à vitrine" faria
 * ela achar que perdeu o que montou.
 */
import { useEffect, useRef } from "react";
import { Aviso, Botao, IconeAvancar, IconeFechar } from "@simpleclick/ui";

import { LinhaCarrinho } from "./LinhaCarrinho.tsx";
import type { UsoDoCarrinho } from "./useCarrinho.ts";

/** O id do título, que dá nome à janela (`aria-labelledby`). */
export const ID_DO_TITULO_DO_CARRINHO = "titulo-do-carrinho";

export interface GavetaCarrinhoProps {
  readonly carrinho: UsoDoCarrinho;
  /** Para onde volta quem ainda não escolheu nada. */
  readonly linkDaVitrine: string;
  /** "Fechar pedido": segue para o fechamento. */
  readonly aoFechar?: (() => void) | undefined;
  /** O X do cabeçalho: fecha a janela. Sem ele, o X não aparece. */
  readonly aoFecharJanela?: (() => void) | undefined;
  /** "Cardápio", "Catálogo" — a palavra do ramo. */
  readonly rotuloDoCatalogo?: string | undefined;
}

/**
 * A sacola desenhada ao fundo da janela, como marca-d'água: traço fino, bem
 * translúcida, atrás dos itens. Desenho próprio, no traço dos ícones.
 */
function SacolaDeFundo({ className }: { readonly className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22 38h76l-6 66a8 8 0 0 1-8 7H36a8 8 0 0 1-8-7z" />
      <path d="M42 46V32a18 18 0 0 1 36 0v14" />
      <path d="M40 64c6 8 14 12 20 12s14-4 20-12" />
    </svg>
  );
}

export function GavetaCarrinho({
  carrinho,
  linkDaVitrine,
  aoFechar,
  aoFecharJanela,
  rotuloDoCatalogo = "Cardápio",
}: GavetaCarrinhoProps) {
  const {
    carrinho: dados,
    erro,
    falhaAoMudar,
    mudarQuantidade,
    tentarDeNovo,
    recarregar,
  } = carrinho;
  // Mudança de quantidade que falhou NÃO apaga a lista: a linha mostra a
  // quantidade de antes e o aviso (AC-11009). Só carregar que falha é erro.
  const comFalhaNaLinha =
    falhaAoMudar != null &&
    tentarDeNovo !== undefined &&
    (dados?.itens.length ?? 0) > 0;
  const situacao = comFalhaNaLinha ? "pronto" : carrinho.situacao;
  const catalogo = rotuloDoCatalogo.toLowerCase();
  const titulo = useRef<HTMLHeadingElement>(null);

  // Na janela, o foco começa no TÍTULO, e não no X: o leitor de tela anuncia
  // "Carrinho, 3 itens", e o X não nasce com anel de foco para quem clicou.
  useEffect(() => {
    if (aoFecharJanela) titulo.current?.focus();
  }, [aoFecharJanela]);
  const quantos = situacao === "pronto" ? (dados?.totalDeItens ?? 0) : 0;

  return (
    <div
      className={`sc-carrinho-janela__quadro sc-carrinho-janela--${situacao}`}
    >
      <SacolaDeFundo className="sc-carrinho-janela__marca" />

      <header className="sc-carrinho-janela__topo">
        <h2
          ref={titulo}
          className="sc-carrinho-janela__titulo"
          id={ID_DO_TITULO_DO_CARRINHO}
          tabIndex={-1}
        >
          Sua sacola
          {quantos > 0 ? (
            <span className="sc-so-leitor">
              , {quantos} {quantos === 1 ? "item" : "itens"}
            </span>
          ) : null}
        </h2>
        {quantos > 0 ? (
          // A contagem é a soma das quantidades, e não o número de linhas:
          // duas coxinhas são dois itens.
          <span className="sc-carrinho-janela__selo" aria-hidden="true">
            <strong>{quantos}</strong> {quantos === 1 ? "item" : "itens"}
          </span>
        ) : null}
        {aoFecharJanela ? (
          <button
            type="button"
            className="sc-carrinho-janela__fechar"
            onClick={aoFecharJanela}
            aria-label="Fechar o carrinho"
          >
            <IconeFechar aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="sc-carrinho-janela__corpo">
        {situacao === "carregando" ? (
          <div className="sc-carrinho-janela__estado" role="status">
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <p>Carregando seu carrinho…</p>
          </div>
        ) : situacao === "erro" ? (
          <div className="sc-carrinho-janela__estado">
            <Aviso
              tom="erro"
              titulo="Não deu para abrir o carrinho"
              acao={
                <Botao variante="secundaria" onClick={() => void recarregar()}>
                  Tentar de novo
                </Botao>
              }
            >
              {erro}
            </Aviso>
          </div>
        ) : situacao === "vazio" ? (
          <div className="sc-carrinho-janela__estado sc-carrinho-janela__vazio">
            <SacolaDeFundo className="sc-carrinho-janela__vazio-sacola" />
            <p className="sc-carrinho__vazio">
              Sua sacola está vazia. Escolha um produto para começar.
            </p>
            <a className="sc-carrinho-janela__acao" href={linkDaVitrine}>
              Ver o {catalogo}
              <IconeAvancar aria-hidden="true" />
            </a>
          </div>
        ) : (
          <ul className="sc-carrinho-janela__itens">
            {dados?.itens.map((item) => (
              <LinhaCarrinho
                key={item.id}
                item={item}
                aoMudarQuantidade={(itemId, quantidade) =>
                  void mudarQuantidade(itemId, quantidade)
                }
                falha={
                  comFalhaNaLinha && falhaAoMudar?.itemId === item.id
                    ? { aoTentarDeNovo: () => void tentarDeNovo?.() }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {situacao === "pronto" ? (
        <footer className="sc-carrinho-janela__rodape">
          <dl className="sc-carrinho-janela__resumo">
            <div>
              <dt>Subtotal</dt>
              <dd>{dados?.total}</dd>
            </div>
            <div className="sc-carrinho-janela__resumo-entrega">
              <dt>Entrega</dt>
              {/* A taxa depende do endereço, que só existe no fechamento. */}
              <dd>calculada no fechamento</dd>
            </div>
            <div className="sc-carrinho-janela__resumo-total">
              <dt>Total</dt>
              <dd>{dados?.total}</dd>
            </div>
          </dl>
          {aoFechar ? (
            <button
              type="button"
              className="sc-carrinho-janela__acao sc-carrinho-janela__acao--larga"
              onClick={aoFechar}
            >
              Fechar pedido
              <IconeAvancar aria-hidden="true" />
            </button>
          ) : null}
          {aoFecharJanela ? (
            <button
              type="button"
              className="sc-carrinho-janela__continuar"
              onClick={aoFecharJanela}
            >
              Continuar no {catalogo}
            </button>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

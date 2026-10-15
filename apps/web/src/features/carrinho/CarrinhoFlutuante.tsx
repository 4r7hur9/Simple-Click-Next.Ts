"use client";

/**
 * O carrinho flutuante da vitrine (AC-500, AC-501).
 *
 * UMA BARRA NO POLEGAR, QUE SÓ APARECE QUANDO HÁ O QUE MOSTRAR. Carrinho vazio
 * flutuando sobre o cardápio é ruído; com um item dentro, ele vira o próximo
 * passo — e fica embaixo, onde o dedo já está, com a contagem e o total. Um
 * toque abre a gaveta por cima do cardápio, para conferir e ajustar sem sair da
 * página; "Fechar pedido" é um link de verdade para o fechamento.
 *
 * O SERVIDOR NÃO O DESENHA. O carrinho mora num cookie da API que só o
 * navegador carrega, então esta ilha nasce vazia e pergunta. Se o script nunca
 * rodar, a vitrine continua inteira e o carrinho continua no link da barra do
 * topo — a barra flutuante é melhoria, e não requisito.
 *
 * ESCUTA o aviso de "carrinho mudou" (o formulário do produto dispara) e a
 * volta pelo histórico (`pageshow`), que devolve a página guardada com o
 * carrinho velho.
 */
import { useEffect, useMemo, useState } from "react";
import { IconeFechar, IconePedido } from "@simpleclick/ui";

import { EVENTO_CARRINHO_MUDOU } from "../../lib/carrinho-do-navegador.ts";

import { GavetaCarrinho } from "./GavetaCarrinho.tsx";
import { servicoDoCarrinhoNoNavegador } from "./servico-do-carrinho.ts";
import { useCarrinho, type ServicoDoCarrinho } from "./useCarrinho.ts";

/** O `id` da gaveta, que o botão da barra aponta enquanto ela está aberta. */
const ID_DA_GAVETA = "carrinho-flutuante";

export interface CarrinhoFlutuanteProps {
  readonly apelidoDaLoja: string;
  /** Para onde vai quem quer fechar o pedido. */
  readonly linkDoFechamento: string;
  /** Para onde volta quem esvaziou o carrinho com a gaveta aberta. */
  readonly linkDaVitrine: string;
  /** Quem fala com o servidor. Trocável para a prova responder sem rede. */
  readonly servico?: ServicoDoCarrinho | undefined;
}

export function CarrinhoFlutuante({
  apelidoDaLoja,
  linkDoFechamento,
  linkDaVitrine,
  servico,
}: CarrinhoFlutuanteProps) {
  const servicoEmUso = useMemo(
    () => servico ?? servicoDoCarrinhoNoNavegador(apelidoDaLoja),
    [servico, apelidoDaLoja],
  );
  const carrinho = useCarrinho(servicoEmUso);
  const { recarregar } = carrinho;
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const atualizar = () => void recarregar();
    window.addEventListener(EVENTO_CARRINHO_MUDOU, atualizar);
    window.addEventListener("pageshow", atualizar);
    return () => {
      window.removeEventListener(EVENTO_CARRINHO_MUDOU, atualizar);
      window.removeEventListener("pageshow", atualizar);
    };
  }, [recarregar]);

  // Esc fecha a gaveta, como fecha qualquer coisa que abriu por cima.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const dados = carrinho.carrinho;
  const quantos = dados?.totalDeItens ?? 0;
  const temItens = carrinho.situacao === "pronto" && quantos > 0;

  // Sem item e sem gaveta aberta, não existe barra. Com a gaveta aberta e o
  // último item removido, a gaveta fica — é ela que diz "vazio" e oferece a
  // volta à vitrine, em vez de sumir debaixo do dedo.
  if (!temItens && !aberto) return null;

  const rotulo = quantos === 1 ? "1 item" : `${quantos} itens`;

  return (
    <div className={`sc-flutuante${aberto ? " sc-flutuante--aberto" : ""}`}>
      {aberto ? (
        <>
          {/* O fundo escurecido também fecha: é o gesto de "sair daqui". */}
          <button
            type="button"
            className="sc-flutuante__fundo"
            aria-label="Fechar o carrinho"
            onClick={() => setAberto(false)}
          />
          <section
            className="sc-flutuante__gaveta"
            id={ID_DA_GAVETA}
            aria-label="Seu carrinho"
          >
            <div className="sc-flutuante__alca" aria-hidden="true" />
            <button
              type="button"
              className="sc-flutuante__fechar"
              aria-label="Fechar o carrinho"
              onClick={() => setAberto(false)}
            >
              <IconeFechar />
            </button>

            <GavetaCarrinho carrinho={carrinho} linkDaVitrine={linkDaVitrine} />

            {temItens ? (
              <a
                className="sc-botao sc-botao--primaria sc-botao--grande sc-botao--pilula sc-flutuante__ir"
                href={linkDoFechamento}
              >
                Fechar pedido
                <span className="sc-flutuante__ir-total">{dados?.total}</span>
              </a>
            ) : null}
          </section>
        </>
      ) : null}

      {temItens ? (
        <div className="sc-flutuante__barra">
          <button
            type="button"
            className="sc-flutuante__ver"
            aria-expanded={aberto}
            {...(aberto ? { "aria-controls": ID_DA_GAVETA } : {})}
            onClick={() => setAberto((estava) => !estava)}
          >
            <span className="sc-flutuante__icone" aria-hidden="true">
              <IconePedido />
              <span className="sc-flutuante__contagem">{quantos}</span>
            </span>
            <span className="sc-flutuante__texto">
              <span className="sc-flutuante__rotulo">{rotulo}</span>
              <span className="sc-flutuante__total">{dados?.total}</span>
            </span>
          </button>
          <a className="sc-flutuante__fechar-pedido" href={linkDoFechamento}>
            Fechar pedido
          </a>
        </div>
      ) : null}
    </div>
  );
}

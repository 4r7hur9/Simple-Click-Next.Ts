"use client";

/**
 * O ícone da sacola no topo (card #105): só dentro de uma loja, mostra
 * quantos itens a sacola tem e abre a MESMA sacola da loja.
 *
 * - A contagem é lida no NAVEGADOR (`contarItensDaSacola`) e atualizada a
 *   cada aviso de mudança do carrinho; nunca é desenhada nem guardada em
 *   cache no servidor (cada leitura regrava o cookie do carrinho). O HTML do
 *   servidor sai sem número.
 * - O nome do botão é "Sacola, N itens" (ou "Sacola, vazia"); a mudança é
 *   anunciada por uma região `status`, sem mover o foco.
 * - Abrir: dispara `sc:abrir-sacola`. Quem tem a sacola montada (o
 *   `CarrinhoFlutuante`, nas telas do catálogo) abre e marca `atendido`; nas
 *   demais páginas da loja o botão leva a `/loja/<apelido>/carrinho`. O
 *   endereço vem só da propriedade `apelido` (do servidor), nunca do evento.
 */
import { IconePedido } from "@simpleclick/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AVISO_DE_CARRINHO_MUDOU,
  EVENTO_ABRIR_SACOLA,
  type PedidoDeAbrirASacola,
} from "../../lib/carrinho-do-navegador.ts";
import { contarItensDaSacola } from "../../lib/contagem-da-sacola.ts";

export function textoDaSacola(itens: number | null): string {
  // Sem leitura (a API não respondeu), o nome não afirma que está vazia.
  if (itens === null) return "Sacola";
  if (itens <= 0) return "Sacola, vazia";
  return `Sacola, ${itens} ${itens === 1 ? "item" : "itens"}`;
}

export function SacolaDoTopo({ apelido }: { readonly apelido: string }) {
  const roteador = useRouter();
  const [itens, setItens] = useState(0);
  // A primeira leitura falhou: a contagem é desconhecida, e não zero.
  const [semLeitura, setSemLeitura] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const jaLeu = useRef(false);

  useEffect(() => {
    let vivo = true;
    async function ler(mudou: boolean) {
      const quantos = await contarItensDaSacola(apelido);
      if (!vivo) return;
      if (quantos === null) {
        // Falha depois de uma leitura boa mantém o último número conhecido.
        if (!jaLeu.current) setSemLeitura(true);
        return;
      }
      setSemLeitura(false);
      setItens(quantos);
      // Só anuncia o que MUDOU: a leitura da chegada já vai no nome do botão.
      if (mudou && jaLeu.current) setAnuncio(textoDaSacola(quantos));
      jaLeu.current = true;
    }
    void ler(false);
    const aoMudar = () => void ler(true);
    window.addEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
    return () => {
      vivo = false;
      window.removeEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
    };
  }, [apelido]);

  function abrir() {
    const pedido: PedidoDeAbrirASacola = { atendido: false };
    window.dispatchEvent(
      new CustomEvent<PedidoDeAbrirASacola>(EVENTO_ABRIR_SACOLA, {
        detail: pedido,
      }),
    );
    if (!pedido.atendido) {
      roteador.push(`/loja/${encodeURIComponent(apelido)}/carrinho`);
    }
  }

  return (
    <>
      <button
        type="button"
        className="sc-topo-cliente__botao sc-sacola-topo"
        data-navegacao="sacola"
        aria-label={textoDaSacola(semLeitura ? null : itens)}
        onClick={abrir}
      >
        <IconePedido aria-hidden="true" />
        {itens > 0 && (
          <span className="sc-sacola-topo__contagem" aria-hidden="true">
            {itens > 99 ? "99+" : itens}
          </span>
        )}
      </button>
      <span role="status" className="sc-so-leitor">
        {anuncio}
      </span>
    </>
  );
}

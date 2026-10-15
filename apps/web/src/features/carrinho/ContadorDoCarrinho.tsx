"use client";

/**
 * A contagem de itens ao lado do ícone do carrinho.
 *
 * NÃO DESENHA NADA ATÉ SABER. O servidor não conhece o carrinho (ele mora num
 * cookie da API), então a contagem só existe depois de perguntar — e enquanto
 * não existe, o link do carrinho continua inteiro e funcional. Carrinho vazio
 * também não ganha número: um "0" ao lado do ícone é ruído.
 *
 * Escuta o aviso de "carrinho mudou" da página e a volta pelo histórico do
 * navegador (`pageshow`), que devolve a página guardada com a contagem velha.
 */
import { useEffect, useState } from "react";

import {
  EVENTO_CARRINHO_MUDOU,
  verCarrinho,
} from "../../lib/carrinho-do-navegador.ts";

export interface ContadorDoCarrinhoProps {
  readonly apelidoDaLoja: string;
  /** Trocável para a prova responder sem rede. */
  readonly buscar?: typeof fetch | undefined;
}

export function ContadorDoCarrinho({
  apelidoDaLoja,
  buscar,
}: ContadorDoCarrinhoProps) {
  const [quantos, setQuantos] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;

    async function contar() {
      const resultado = await verCarrinho(apelidoDaLoja, buscar);
      if (!vivo) return;
      // Falha de rede não zera a contagem: o número que estava lá continua
      // valendo mais que nenhum número.
      if (resultado.estado === "visto") {
        setQuantos(resultado.carrinho.totalDeItens);
      }
    }

    void contar();
    const recontar = () => void contar();
    window.addEventListener(EVENTO_CARRINHO_MUDOU, recontar);
    window.addEventListener("pageshow", recontar);

    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_CARRINHO_MUDOU, recontar);
      window.removeEventListener("pageshow", recontar);
    };
  }, [apelidoDaLoja, buscar]);

  if (quantos === null || quantos === 0) return null;

  return (
    <span className="sc-contador" aria-live="polite">
      {quantos}
      <span className="sc-so-leitor">
        {quantos === 1 ? " item no carrinho" : " itens no carrinho"}
      </span>
    </span>
  );
}

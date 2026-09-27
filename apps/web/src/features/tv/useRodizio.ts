"use client";

/**
 * O rodízio: qual tela está no ar, avançando sozinha (AC-925).
 *
 * NÃO HÁ NADA QUE ESPERE TOQUE. Ninguém vai até a parede operar a televisão,
 * então o único gatilho é o relógio: a cada intervalo, a próxima tela; depois
 * da última, a primeira.
 *
 * O ÍNDICE É DEVOLVIDO JÁ DENTRO DO LIMITE. Quando o catálogo muda e o número
 * de telas encolhe, o índice guardado pode passar do fim; o resto da divisão
 * resolve isso sem um segundo estado nem um efeito para "corrigir" o primeiro.
 */
import { useEffect, useState } from "react";

/**
 * Quantos segundos cada tela fica no ar.
 *
 * Doze: o suficiente para ler dez itens com preço, e curto o bastante para a
 * fila ver o cardápio inteiro antes de chegar ao balcão. É a resposta prática
 * à Q-034; o endereço aceita outro valor para a loja ajustar.
 */
export const SEGUNDOS_POR_TELA = 12;

/**
 * Devolve o índice da tela no ar, entre 0 e `quantidade - 1`.
 *
 * Com uma tela só (ou nenhuma) não há relógio: não há para onde avançar.
 */
export function useRodizio(quantidade: number, intervaloEmMs: number): number {
  const [passo, setPasso] = useState(0);

  useEffect(() => {
    if (quantidade <= 1 || intervaloEmMs <= 0) return undefined;
    const relogio = setInterval(() => {
      setPasso((atual) => atual + 1);
    }, intervaloEmMs);
    return () => clearInterval(relogio);
  }, [quantidade, intervaloEmMs]);

  return quantidade <= 0 ? 0 : passo % quantidade;
}

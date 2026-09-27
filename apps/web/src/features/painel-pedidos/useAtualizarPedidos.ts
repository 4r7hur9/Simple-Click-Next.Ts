"use client";

/**
 * A fila que se atualiza sozinha (AC-600, AC-602).
 *
 * A tela pergunta a fila inteira em intervalo curto e compara a leitura nova
 * com a anterior pela regra de `packages/core` — a mesma que a API usa. É a
 * consulta periódica prevista na ASM-602 como caminho de retorno; a conexão
 * contínua, se vier, troca só a forma de acordar a leitura, não a comparação.
 *
 * A PRÓXIMA LEITURA SÓ É AGENDADA QUANDO A ANTERIOR TERMINA. Com um intervalo
 * fixo, uma rede lenta empilharia pedidos de leitura, e a resposta velha podia
 * chegar depois da nova e desfazer a fila na tela.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  atualizarFila,
  buscarFilaDoPainel,
  type BuscarFila,
  type PedidoDaFila,
} from "../../lib/fila-de-pedidos.ts";

/** "Em poucos segundos", como o AC-600 pede. */
export const INTERVALO_DA_FILA_MS = 5_000;

export interface EstadoDaFila {
  readonly pedidos: readonly PedidoDaFila[];
  /**
   * Pedidos que chegaram com a tela aberta e o dono ainda não marcou como
   * vistos. É isso que mantém o alerta VISUAL de pé depois do som (AC-603).
   */
  readonly naoVistos: ReadonlySet<string>;
  readonly carregando: boolean;
  readonly conectado: boolean;
  /** A leitura atual é a primeira depois de uma queda. */
  readonly reconectada: boolean;
  readonly erro: string | null;
}

export interface UsoDaFila extends EstadoDaFila {
  readonly marcarComoVistos: () => void;
}

export interface OpcoesDaAtualizacao {
  readonly buscar?: BuscarFila | undefined;
  readonly intervaloMs?: number | undefined;
  /** Chamado a cada leitura que traz pedido que não estava na anterior. */
  readonly aoChegarPedidoNovo?:
    ((novos: readonly PedidoDaFila[]) => void) | undefined;
}

const ESTADO_INICIAL: EstadoDaFila = {
  pedidos: [],
  naoVistos: new Set(),
  carregando: true,
  conectado: false,
  reconectada: false,
  erro: null,
};

const MENSAGEM_DE_QUEDA =
  "A conexão caiu. Tentando recuperar a fila sozinho — não é preciso recarregar.";

export function useAtualizarPedidos(
  opcoes: OpcoesDaAtualizacao = {},
): UsoDaFila {
  const buscar = opcoes.buscar ?? buscarFilaDoPainel;
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_DA_FILA_MS;
  const [estado, setEstado] = useState<EstadoDaFila>(ESTADO_INICIAL);

  // O aviso de chegada muda a cada renderização de quem usa o gancho; guardado
  // em referência, ele não reinicia a consulta periódica.
  const aoChegar = useRef(opcoes.aoChegarPedidoNovo);
  aoChegar.current = opcoes.aoChegarPedidoNovo;

  useEffect(() => {
    let ativo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let inicializada = false;
    let anteriores: readonly PedidoDaFila[] = [];
    let caiu = false;

    async function ler(): Promise<void> {
      const leitura = await buscar();
      if (!ativo) return;

      if (leitura.estado === "erro") {
        caiu = true;
        setEstado((atual) => ({
          ...atual,
          carregando: false,
          conectado: false,
          reconectada: false,
          erro: MENSAGEM_DE_QUEDA,
        }));
      } else {
        const { pedidos, novos } = atualizarFila(
          anteriores,
          leitura.pedidos,
          inicializada,
        );
        anteriores = pedidos;
        inicializada = true;
        const reconectada = caiu;
        caiu = false;

        setEstado((atual) => {
          const abertos = new Set(pedidos.map((pedido) => pedido.id));
          const naoVistos = new Set(
            [...atual.naoVistos].filter((id) => abertos.has(id)),
          );
          for (const novo of novos) naoVistos.add(novo.id);
          return {
            pedidos,
            naoVistos,
            carregando: false,
            conectado: true,
            reconectada,
            erro: null,
          };
        });
        if (novos.length > 0) aoChegar.current?.(novos);
      }

      if (ativo) espera = setTimeout(() => void ler(), intervaloMs);
    }

    void ler();
    return () => {
      ativo = false;
      if (espera !== undefined) clearTimeout(espera);
    };
  }, [buscar, intervaloMs]);

  const marcarComoVistos = useCallback(() => {
    setEstado((atual) => ({ ...atual, naoVistos: new Set() }));
  }, []);

  return { ...estado, marcarComoVistos };
}

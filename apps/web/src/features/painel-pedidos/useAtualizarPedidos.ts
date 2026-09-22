"use client";

import { useEffect, useState } from "react";

export interface PedidoNaFila {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly canal: string;
  readonly entrega: string;
  readonly cliente: string;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
}

interface RespostaDaFila {
  readonly pedidos: readonly PedidoNaFila[];
}

export interface EstadoDaFila {
  readonly pedidos: readonly PedidoNaFila[];
  readonly novos: readonly PedidoNaFila[];
  readonly carregando: boolean;
  readonly conectado: boolean;
  readonly reconectada: boolean;
  readonly erro: string | null;
}

const ESTADO_INICIAL: EstadoDaFila = {
  pedidos: [],
  novos: [],
  carregando: true,
  conectado: false,
  reconectada: false,
  erro: null,
};

function pedidosNovos(
  anteriores: readonly PedidoNaFila[],
  atuais: readonly PedidoNaFila[],
  inicializada: boolean,
): readonly PedidoNaFila[] {
  if (!inicializada) return [];
  const ids = new Set(anteriores.map((pedido) => pedido.id));
  return atuais.filter((pedido) => !ids.has(pedido.id));
}

export function useAtualizarPedidos(
  endereco = "/api/painel/pedidos",
): EstadoDaFila {
  const [estado, setEstado] = useState<EstadoDaFila>(ESTADO_INICIAL);

  useEffect(() => {
    let ativo = true;
    let inicializada = false;
    let pedidosAnteriores: readonly PedidoNaFila[] = [];
    let estavaDesconectada = false;

    async function buscar(): Promise<void> {
      try {
        const resposta = await fetch(endereco, { cache: "no-store" });
        if (!resposta.ok) throw new Error("fila indisponível");
        const dados = (await resposta.json()) as RespostaDaFila;
        if (!ativo) return;

        const novos = pedidosNovos(
          pedidosAnteriores,
          dados.pedidos,
          inicializada,
        );
        pedidosAnteriores = dados.pedidos;
        inicializada = true;
        const reconectada = estavaDesconectada;
        estavaDesconectada = false;
        setEstado({
          pedidos: dados.pedidos,
          novos,
          carregando: false,
          conectado: true,
          reconectada,
          erro: null,
        });
      } catch {
        if (!ativo) return;
        estavaDesconectada = true;
        setEstado((anterior) => ({
          ...anterior,
          carregando: false,
          conectado: false,
          reconectada: false,
          erro: "A conexão caiu. Tentando recuperar os pedidos…",
        }));
      }
    }

    void buscar();
    const intervalo = window.setInterval(() => void buscar(), 5_000);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, [endereco]);

  return estado;
}

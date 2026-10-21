"use client";

/**
 * O quadro que se atualiza sozinho.
 *
 * Mesma ideia da fila antiga (`useAtualizarPedidos`): a tela pergunta o dia
 * inteiro em intervalo curto e compara com a leitura anterior pela regra de
 * `packages/core`. A PRÓXIMA LEITURA SÓ É AGENDADA QUANDO A ANTERIOR TERMINA,
 * para uma rede lenta não empilhar pedidos e a resposta velha não desfazer o
 * quadro.
 *
 * Só o DIA DE HOJE avisa: olhar o dia de ontem não é pedido novo. E o aviso é
 * só para pedido que chegou aguardando confirmação (`PENDING`) — pedido que
 * mudou de coluna já foi visto por quem o moveu.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { atualizarFila } from "../../lib/fila-de-pedidos.ts";
import {
  buscarQuadroDoDia,
  type BuscarQuadro,
  type PedidoDoQuadro,
  type QuadroDoDia,
} from "../../lib/quadro-de-pedidos.ts";

/** "Em poucos segundos". */
export const INTERVALO_DO_QUADRO_MS = 5_000;

const MENSAGEM_DE_QUEDA =
  "A conexão caiu. Tentando recuperar o quadro sozinho — não é preciso recarregar.";

export interface EstadoDoQuadro {
  readonly quadro: QuadroDoDia | null;
  readonly naoVistos: ReadonlySet<string>;
  readonly carregando: boolean;
  readonly conectado: boolean;
  readonly reconectada: boolean;
  readonly erro: string | null;
}

export interface UsoDoQuadro extends EstadoDoQuadro {
  readonly marcarComoVistos: () => void;
  /** Lê de novo agora (depois de mover um pedido, por exemplo). */
  readonly recarregar: () => void;
}

export interface OpcoesDoQuadro {
  /** `hoje` ou `aaaa-mm-dd`. */
  readonly dia: string;
  readonly buscar?: BuscarQuadro | undefined;
  readonly intervaloMs?: number | undefined;
  readonly aoChegarPedidoNovo?:
    ((novos: readonly PedidoDoQuadro[]) => void) | undefined;
}

const ESTADO_INICIAL: EstadoDoQuadro = {
  quadro: null,
  naoVistos: new Set(),
  carregando: true,
  conectado: false,
  reconectada: false,
  erro: null,
};

export function useQuadroDoDia(opcoes: OpcoesDoQuadro): UsoDoQuadro {
  const { dia } = opcoes;
  const buscar = opcoes.buscar ?? buscarQuadroDoDia;
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_DO_QUADRO_MS;
  const [estado, setEstado] = useState<EstadoDoQuadro>(ESTADO_INICIAL);
  const [rodada, setRodada] = useState(0);

  const aoChegar = useRef(opcoes.aoChegarPedidoNovo);
  aoChegar.current = opcoes.aoChegarPedidoNovo;

  // A memória da leitura anterior vive fora do efeito: reler o MESMO dia
  // (depois de mover um pedido) não pode esquecer o que já tinha sido visto.
  const memoria = useRef<{
    dia: string | null;
    inicializada: boolean;
    anteriores: readonly PedidoDoQuadro[];
    caiu: boolean;
  }>({ dia: null, inicializada: false, anteriores: [], caiu: false });

  useEffect(() => {
    let ativo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const lembrado = memoria.current;

    // Outro dia, outro quadro: nada do dia anterior pode ficar na tela.
    if (lembrado.dia !== dia) {
      memoria.current = {
        dia,
        inicializada: false,
        anteriores: [],
        caiu: false,
      };
      setEstado(ESTADO_INICIAL);
    }

    async function ler(): Promise<void> {
      const leitura = await buscar(dia);
      if (!ativo) return;

      const lembranca = memoria.current;
      if (leitura.estado === "erro") {
        lembranca.caiu = true;
        setEstado((atual) => ({
          ...atual,
          carregando: false,
          conectado: false,
          reconectada: false,
          erro: MENSAGEM_DE_QUEDA,
        }));
      } else {
        const { quadro } = leitura;
        const { pedidos, novos } = atualizarFila(
          lembranca.anteriores,
          quadro.pedidos,
          lembranca.inicializada,
        );
        lembranca.anteriores = pedidos;
        lembranca.inicializada = true;
        const reconectada = lembranca.caiu;
        lembranca.caiu = false;
        const avisaveis =
          quadro.dia === quadro.hoje
            ? novos.filter((pedido) => pedido.status === "PENDING")
            : [];

        setEstado((atual) => {
          const presentes = new Set(pedidos.map((pedido) => pedido.id));
          const naoVistos = new Set(
            [...atual.naoVistos].filter((id) => presentes.has(id)),
          );
          for (const novo of avisaveis) naoVistos.add(novo.id);
          return {
            quadro,
            naoVistos,
            carregando: false,
            conectado: true,
            reconectada,
            erro: null,
          };
        });
        if (avisaveis.length > 0) aoChegar.current?.(avisaveis);
      }

      if (ativo) espera = setTimeout(() => void ler(), intervaloMs);
    }

    void ler();
    return () => {
      ativo = false;
      if (espera !== undefined) clearTimeout(espera);
    };
  }, [buscar, dia, intervaloMs, rodada]);

  const marcarComoVistos = useCallback(() => {
    setEstado((atual) => ({ ...atual, naoVistos: new Set() }));
  }, []);

  const recarregar = useCallback(() => setRodada((n) => n + 1), []);

  return { ...estado, marcarComoVistos, recarregar };
}

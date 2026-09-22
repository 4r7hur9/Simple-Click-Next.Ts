"use client";

import { useMemo } from "react";
import Link from "next/link";

import { AvisoSonoro } from "./AvisoSonoro.tsx";
import { SeloAguardando } from "./SeloAguardando.tsx";
import {
  useAtualizarPedidos,
  type PedidoNaFila,
} from "./useAtualizarPedidos.ts";

function dinheiro(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function tempoDeEspera(criadoEm: string): string {
  const minutos = Math.max(
    0,
    Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60_000),
  );
  if (minutos === 0) return "agora";
  return minutos === 1 ? "há 1 min" : `há ${minutos} min`;
}

function rotuloDoCanal(pedido: PedidoNaFila): string {
  return pedido.entrega === "PICKUP" ? "Retirada" : "Entrega";
}

function CartaoDoPedido({ pedido }: { readonly pedido: PedidoNaFila }) {
  return (
    <article className="rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5 shadow-[var(--sombra-baixa)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--cor-primaria)]">
            Pedido #{pedido.numero}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{pedido.cliente}</h3>
        </div>
        <strong>{dinheiro(pedido.totalCentavos)}</strong>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-[var(--cor-tinta-suave)]">
        <div>
          <dt>Canal</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">
            {rotuloDoCanal(pedido)}
          </dd>
        </div>
        <div>
          <dt>Esperando</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">
            {tempoDeEspera(pedido.criadoEm)}
          </dd>
        </div>
      </dl>
      {pedido.aguardandoConfirmacaoWhatsapp ? (
        <div className="mt-4">
          <SeloAguardando />
        </div>
      ) : null}
      <Link
        className="mt-4 inline-flex text-sm font-medium text-[var(--cor-primaria)]"
        href={`/painel/pedidos/${pedido.id}`}
      >
        Abrir pedido →
      </Link>
    </article>
  );
}

function Coluna({
  titulo,
  pedidos,
}: {
  readonly titulo: string;
  readonly pedidos: readonly PedidoNaFila[];
}) {
  return (
    <section aria-labelledby={`fila-${titulo}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`fila-${titulo}`} className="text-xl font-semibold">
          {titulo}
        </h2>
        <span className="rounded-full bg-[var(--cor-papel)] px-2.5 py-1 text-sm">
          {pedidos.length}
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {pedidos.length === 0 ? (
          <p className="rounded-[var(--raio-grande)] border border-dashed border-[var(--cor-borda)] p-5 text-sm text-[var(--cor-tinta-suave)]">
            Nenhum pedido nesta etapa.
          </p>
        ) : (
          pedidos.map((pedido) => (
            <CartaoDoPedido key={pedido.id} pedido={pedido} />
          ))
        )}
      </div>
    </section>
  );
}

export function QuadroDePedidos() {
  const estado = useAtualizarPedidos();
  const grupos = useMemo(() => {
    const aguardandoAcao: PedidoNaFila[] = [];
    const aguardandoWhatsapp: PedidoNaFila[] = [];
    const emPreparo: PedidoNaFila[] = [];
    const emEntrega: PedidoNaFila[] = [];
    for (const pedido of estado.pedidos) {
      if (pedido.aguardandoConfirmacaoWhatsapp) aguardandoWhatsapp.push(pedido);
      else if (pedido.status === "PENDING") aguardandoAcao.push(pedido);
      else if (pedido.status === "OUT_FOR_DELIVERY") emEntrega.push(pedido);
      else emPreparo.push(pedido);
    }
    return { aguardandoAcao, aguardandoWhatsapp, emPreparo, emEntrega };
  }, [estado.pedidos]);

  if (estado.carregando) {
    return <p role="status">Carregando pedidos…</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvisoSonoro quantidadeDeNovos={estado.novos.length} />
        <p className="text-sm text-[var(--cor-tinta-suave)]" role="status">
          {estado.erro ??
            (estado.reconectada
              ? "Conexão recuperada. Fila atualizada."
              : estado.conectado
                ? "Atualizando a cada 5 segundos."
                : "Aguardando conexão…")}
        </p>
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-4">
        <Coluna
          titulo="Aguardando WhatsApp"
          pedidos={grupos.aguardandoWhatsapp}
        />
        <Coluna titulo="Aguardando ação" pedidos={grupos.aguardandoAcao} />
        <Coluna titulo="Em preparo" pedidos={grupos.emPreparo} />
        <Coluna titulo="Em entrega" pedidos={grupos.emEntrega} />
      </div>
    </>
  );
}

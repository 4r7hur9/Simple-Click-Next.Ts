"use client";

/**
 * A impressão automática vista da fila de pedidos (T-608 — AC-624, AC-626).
 *
 * Fica ACIMA da fila, e fala pouco: com o automático desligado e nada
 * esperando, não mostra nada — a impressão por clique é o padrão e não
 * precisa de anúncio. Fala quando importa:
 *
 * - o agente está fora do ar (ou nunca foi pareado): avisa que a impressão
 *   automática está indisponível e lembra que o botão de cada pedido continua
 *   imprimindo (AC-624);
 * - há cupom que não saiu pelo agente — na fila, falhando, ou deixado para
 *   trás quando o dono desligou o automático: lista cada um com o atalho para
 *   imprimir por clique (AC-626). O atalho é `<a>` comum, e não `Link`: abrir
 *   a página do cupom emite uma via, e pré-carregamento contaria via que nunca
 *   saiu no papel. Imprimir assim cancela o trabalho da fila — o cupom não sai
 *   duas vezes.
 *
 * Com a impressão térmica desligada pela administração (AC-212), a área não
 * existe para a loja: a tela não mostra nada e para de perguntar.
 *
 * Rota própria (`/api/painel/impressao/...`): o formato da fila de pedidos não
 * muda por causa da impressão. A próxima leitura só é agendada quando a
 * anterior termina, como na fila.
 */
import { useEffect, useState } from "react";
import { Aviso, Carregando } from "@simpleclick/ui";

import {
  buscarImpressaoAutomatica,
  escreverHorarioDaImpressao,
  rotuloDoPendente,
  type BuscarImpressaoAutomatica,
  type LeituraDaImpressaoAutomatica,
  type TrabalhoPendente,
} from "../../lib/impressao-automatica.ts";

/** De quanto em quanto tempo a tela confere o agente. */
export const INTERVALO_DO_ESTADO_DO_AGENTE_MS = 10_000;

export interface EstadoDoAgenteProps {
  /** Leitor do estado. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarImpressaoAutomatica | undefined;
  readonly intervaloMs?: number | undefined;
}

function ListaDePendentes({
  pendentes,
  automatico,
}: {
  readonly pendentes: readonly TrabalhoPendente[];
  readonly automatico: boolean;
}) {
  return (
    <section
      aria-labelledby="titulo-cupons-pendentes"
      className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-4 sm:p-5"
    >
      <h2 id="titulo-cupons-pendentes" className="text-lg font-semibold">
        Cupons que ainda não saíram ({pendentes.length})
      </h2>
      <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
        {automatico
          ? "Eles saem sozinhos quando o agente imprimir. Se precisar agora, imprima por clique — o cupom não sai duas vezes."
          : "A impressão automática está desligada. Estes cupons ficaram na fila e continuam disponíveis para imprimir por clique."}
      </p>
      <ul className="mt-3 divide-y divide-[var(--cor-borda)]">
        {pendentes.map((pendente) => (
          <li
            key={pendente.id}
            data-pendente={pendente.pedido.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium">Pedido {pendente.pedido.codigo}</p>
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                {rotuloDoPendente(pendente.estado)}
                {pendente.ultimoErro !== null
                  ? ` — ${pendente.ultimoErro}`
                  : ""}
              </p>
            </div>
            <a
              className="sc-botao sc-botao--secundaria sc-botao--pequeno"
              href={`/imprimir/${encodeURIComponent(pendente.pedido.id)}`}
              target="_blank"
              rel="noopener"
            >
              Imprimir pedido {pendente.pedido.codigo}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AvisoDoAgente({
  leitura,
}: {
  readonly leitura: Extract<LeituraDaImpressaoAutomatica, { estado: "ok" }>;
}) {
  const { impressao } = leitura;
  if (impressao.situacao === "conectada") {
    return (
      <p
        className="text-sm text-[var(--cor-tinta-suave)]"
        data-impressao="conectada"
      >
        Impressão automática ligada: o agente está conectado e os cupons saem
        sozinhos.
      </p>
    );
  }
  if (impressao.situacao === "desconectada") {
    return (
      <Aviso tom="atencao" titulo="Impressão automática indisponível">
        {impressao.ultimoContatoEm === null
          ? "O agente de impressão ainda não se conectou. "
          : `O agente de impressão não responde desde ${escreverHorarioDaImpressao(impressao.ultimoContatoEm)}. `}
        Os cupons ficam aguardando e saem quando ele voltar. Se precisar agora,
        use o botão de imprimir de cada pedido.
      </Aviso>
    );
  }
  if (impressao.situacao === "sem_agente") {
    return (
      <Aviso
        tom="atencao"
        titulo="Impressão automática indisponível"
        acao={
          <a
            className="mt-2 inline-flex text-sm font-medium text-[var(--cor-primaria-texto)]"
            href="/painel/config/impressao"
          >
            Parear o agente de impressão
          </a>
        }
      >
        Nenhum agente de impressão está pareado com a loja. Enquanto isso, use o
        botão de imprimir de cada pedido.
      </Aviso>
    );
  }
  return null;
}

export function EstadoDoAgente({
  buscar = buscarImpressaoAutomatica,
  intervaloMs = INTERVALO_DO_ESTADO_DO_AGENTE_MS,
}: EstadoDoAgenteProps = {}) {
  const [leitura, setLeitura] = useState<LeituraDaImpressaoAutomatica | null>(
    null,
  );

  useEffect(() => {
    let ativo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const ler = async () => {
      const nova = await buscar();
      if (!ativo) return;
      setLeitura(nova);
      if (nova.estado === "indisponivel") return;
      espera = setTimeout(() => void ler(), intervaloMs);
    };
    void ler();
    return () => {
      ativo = false;
      if (espera !== undefined) clearTimeout(espera);
    };
  }, [buscar, intervaloMs]);

  if (leitura === null) {
    return (
      <Carregando
        rotulo="Conferindo a impressão automática…"
        apenasParaLeitor
      />
    );
  }

  if (leitura.estado === "indisponivel") return null;

  if (leitura.estado === "erro") {
    return (
      <Aviso tom="atencao" aoVivo={false}>
        Não foi possível conferir a impressão automática agora. O botão de
        imprimir de cada pedido continua funcionando.
      </Aviso>
    );
  }

  const { impressao, pendentes } = leitura;
  if (impressao.situacao === "desligada" && pendentes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4" data-estado-do-agente={impressao.situacao}>
      <AvisoDoAgente leitura={leitura} />
      {pendentes.length > 0 ? (
        <ListaDePendentes
          pendentes={pendentes}
          automatico={impressao.automatico}
        />
      ) : null}
    </div>
  );
}

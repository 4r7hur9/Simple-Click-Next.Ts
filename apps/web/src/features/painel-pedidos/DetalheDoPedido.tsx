"use client";

/**
 * O pedido aberto pelo dono: itens, cliente, linha do tempo e a próxima ação
 * (AC-604..AC-608).
 *
 * A linha do tempo mostra cada passo com o horário EXATO e quem o deu (AC-608).
 * Ela é só leitura: corrigir um passo errado é dar o passo seguinte, e o banco
 * nem concede alteração no histórico.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Carregando, Erro } from "@simpleclick/ui";

import { AcoesDeStatus, type OpcaoDeStatusNaTela } from "./AcoesDeStatus.tsx";

export interface PedidoDetalhado {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly canal: string;
  readonly entrega: string;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly observacao: string | null;
  readonly motivoCancelamento: string | null;
  readonly contato: {
    readonly nome: string;
    readonly telefone: string;
    readonly endereco: Record<string, string | null>;
  } | null;
  readonly itens: readonly {
    readonly id: string;
    readonly nome: string;
    readonly variacao: string | null;
    readonly quantidade: number;
    readonly totalCentavos: number;
    readonly observacao: string | null;
    readonly opcoes: readonly {
      readonly grupo: string;
      readonly nome: string;
      readonly quantidade: number;
    }[];
  }[];
  readonly historico: readonly {
    readonly id: string;
    readonly de: string | null;
    readonly para: string;
    readonly papel: string | null;
    readonly motivo: string | null;
    readonly ocorridoEm: string;
  }[];
  readonly proximosStatus: readonly OpcaoDeStatusNaTela[];
}

function dinheiro(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

const ROTULOS_DE_STATUS: Readonly<Record<string, string>> = {
  PENDING: "Aguardando confirmação",
  ACCEPTED: "Aceito",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export function rotuloDoStatus(status: string): string {
  return ROTULOS_DE_STATUS[status] ?? status;
}

const AUTORES: Readonly<Record<string, string>> = {
  OWNER: "Dono da loja",
  STAFF: "Equipe da loja",
  CUSTOMER: "Cliente",
  PUBLIC: "Cliente",
};

/** Quem deu o passo, em linguagem de balcão. Sem papel, foi o sistema. */
export function autorDoPasso(papel: string | null): string {
  if (papel === null) return "Sistema";
  return AUTORES[papel] ?? papel;
}

const HORARIO_EXATO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Dia e hora com segundos: é a linha do tempo de um pedido, não um resumo. */
export function horarioExato(iso: string): string {
  return HORARIO_EXATO.format(new Date(iso));
}

function enderecoEmUmaLinha(endereco: Record<string, string | null>): string {
  return [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", "),
    endereco.complemento,
    endereco.bairro,
    [endereco.cidade, endereco.uf].filter(Boolean).join("/"),
    endereco.cep,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DetalheDoPedido({
  pedidoId,
  buscar = fetch,
}: {
  readonly pedidoId: string;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: typeof fetch | undefined;
}) {
  const [pedido, setPedido] = useState<PedidoDetalhado | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resposta = await buscar(`/api/painel/pedidos/${pedidoId}`, {
        cache: "no-store",
      });
      if (!resposta.ok)
        throw new Error(`o pedido respondeu ${resposta.status}`);
      const dados = (await resposta.json()) as { pedido: PedidoDetalhado };
      setPedido(dados.pedido);
      setFalhou(false);
    } catch {
      setFalhou(true);
    }
  }, [buscar, pedidoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (pedido === null) {
    return falhou ? (
      <Erro
        titulo="Não foi possível abrir este pedido"
        mensagem="Confira a conexão e tente de novo. Se o pedido for de outra loja, ele não aparece aqui."
        acao={
          <button
            className="sc-botao sc-botao--secundario"
            type="button"
            onClick={() => void carregar()}
          >
            Tentar de novo
          </button>
        }
      />
    ) : (
      <Carregando rotulo="Carregando pedido…" />
    );
  }

  return (
    <>
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/painel/pedidos"
      >
        ← Voltar para a fila
      </Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
            Pedido {pedido.codigo}
          </p>
          <h1 className="mt-2 text-4xl font-semibold">#{pedido.numero}</h1>
        </div>
        <span
          className="rounded-full bg-[var(--cor-papel)] px-3 py-2 font-medium"
          data-status-atual={pedido.status}
        >
          {rotuloDoStatus(pedido.status)}
        </span>
      </div>

      {falhou ? (
        <Aviso className="mt-4" tom="atencao">
          Não foi possível atualizar agora. O que aparece é a última versão
          carregada.
        </Aviso>
      ) : null}

      {pedido.status === "CANCELLED" && pedido.motivoCancelamento ? (
        <Aviso className="mt-4" tom="erro" titulo="Pedido cancelado">
          Motivo informado ao cliente: {pedido.motivoCancelamento}
        </Aviso>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        <section aria-labelledby="itens-do-pedido">
          <h2 id="itens-do-pedido" className="text-xl font-semibold">
            Itens
          </h2>
          <ul className="mt-4 divide-y divide-[var(--cor-borda)] rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)]">
            {pedido.itens.map((item) => (
              <li className="p-5" key={item.id}>
                <div className="flex justify-between gap-4">
                  <p className="font-medium">
                    {item.quantidade}× {item.nome}
                    {item.variacao ? ` (${item.variacao})` : ""}
                  </p>
                  <strong>{dinheiro(item.totalCentavos)}</strong>
                </div>
                {item.opcoes.length > 0 ? (
                  <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
                    {item.opcoes
                      .map((opcao) => `${opcao.grupo}: ${opcao.nome}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {item.observacao ? (
                  <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
                    Obs.: {item.observacao}
                  </p>
                ) : null}
              </li>
            ))}
            <li className="flex justify-between p-5 text-lg font-semibold">
              <span>Total</span>
              <span>{dinheiro(pedido.totalCentavos)}</span>
            </li>
          </ul>
          {pedido.observacao ? (
            <p className="mt-4 rounded-[var(--raio-grande)] border border-[var(--cor-borda)] p-4">
              <strong>Observação do cliente:</strong> {pedido.observacao}
            </p>
          ) : null}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="dados-do-cliente">
            <h2 id="dados-do-cliente" className="text-xl font-semibold">
              Cliente
            </h2>
            <div className="mt-4 rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5 leading-7">
              <p className="font-medium">
                {pedido.contato?.nome ?? "Sem nome"}
              </p>
              <p>{pedido.contato?.telefone ?? "Sem telefone"}</p>
              {pedido.contato?.endereco && pedido.entrega === "DELIVERY" ? (
                <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
                  {enderecoEmUmaLinha(pedido.contato.endereco)}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="historico-do-pedido">
            <h2 id="historico-do-pedido" className="text-xl font-semibold">
              Linha do tempo
            </h2>
            <ol className="mt-4 space-y-3" data-linha-do-tempo>
              {pedido.historico.map((entrada) => (
                <li
                  className="border-l-2 border-[var(--cor-primaria)] pl-4"
                  key={entrada.id}
                  data-passo={entrada.para}
                >
                  <p className="font-medium">{rotuloDoStatus(entrada.para)}</p>
                  <p className="text-sm text-[var(--cor-tinta-suave)]">
                    <time dateTime={entrada.ocorridoEm}>
                      {horarioExato(entrada.ocorridoEm)}
                    </time>
                    {" · "}
                    {autorDoPasso(entrada.papel)}
                    {entrada.motivo ? ` · ${entrada.motivo}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <AcoesDeStatus
        pedidoId={pedido.id}
        opcoes={pedido.proximosStatus}
        aoAtualizar={() => void carregar()}
        buscar={buscar}
      />
    </>
  );
}

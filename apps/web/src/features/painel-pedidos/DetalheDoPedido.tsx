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
import { Aviso, Carregando, Erro, Info, Selo } from "@simpleclick/ui";

import { AcoesDeStatus, type OpcaoDeStatusNaTela } from "./AcoesDeStatus.tsx";
import { SeloDeStatus, rotuloDoStatus } from "./SeloDeStatus.tsx";
import { rotuloDaEntrega, rotuloDoCanal } from "../../lib/fila-de-pedidos.ts";
import { rotuloDoPagamento } from "../../lib/quadro-de-pedidos.ts";
import { codigoDoPedido } from "@simpleclick/contracts";

export interface PedidoDetalhado {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly canal: string;
  readonly entrega: string;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  /** Como o cliente vai pagar (`PIX`, `CASH`, `CARD_ON_DELIVERY`). */
  readonly pagamento?: string | null | undefined;
  readonly trocoParaCentavos?: number | null | undefined;
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
    /** Preço de uma unidade, congelado na compra (antes das opções). */
    readonly precoUnitarioCentavos?: number;
    /** A faixa de atacado que valeu; nula ou ausente no varejo (card #58). */
    readonly atacado?: {
      readonly quantidadeMinima: number;
      readonly rotulo: string | null;
      readonly varejoUnitarioCentavos: number | null;
    } | null;
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

export { rotuloDoStatus } from "./SeloDeStatus.tsx";

const AUTORES: Readonly<Record<string, string>> = {
  OWNER: "Dono da loja",
  STAFF: "Equipe da loja",
  CUSTOMER: "Cliente",
  PUBLIC: "Cliente",
  ADMIN: "Administração do SimpleClick",
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
  embutido = false,
  aoMudar,
}: {
  readonly pedidoId: string;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: typeof fetch | undefined;
  /**
   * Dentro da janela do quadro: sem o "voltar" nem o título grande, e em
   * coluna única — a janela é estreita e já tem o próprio cabeçalho.
   */
  readonly embutido?: boolean | undefined;
  /** O pedido mudou de status aqui dentro: o quadro precisa reler. */
  readonly aoMudar?: (() => void) | undefined;
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
            className="sc-botao sc-botao--secundaria"
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
    <div
      className={`sc-detalhe-pedido${embutido ? "" : " sc-detalhe-pedido--larga"}`}
    >
      {embutido ? null : (
        <Link
          className="sc-botao sc-botao--discreta sc-botao--pequeno justify-self-start"
          href="/painel/pedidos"
        >
          ← Voltar para o quadro
        </Link>
      )}
      <div className="sc-detalhe-pedido__cabeca">
        <div>
          <p className="sc-detalhe-pedido__codigo">Pedido</p>
          <p className="sc-detalhe-pedido__numero">
            {codigoDoPedido(pedido.numero)}
          </p>
        </div>
        <span data-status-atual={pedido.status}>
          <SeloDeStatus status={pedido.status} grande />
        </span>
      </div>

      <dl className="sc-detalhe-pedido__chips" data-resumo-do-pedido>
        <div>
          <dt>Como recebe</dt>
          <dd>{rotuloDaEntrega(pedido.entrega)}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>
            {rotuloDoPagamento(pedido.pagamento ?? null)}
            {pedido.trocoParaCentavos
              ? ` · troco para ${dinheiro(pedido.trocoParaCentavos)}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="inline-flex items-center gap-1">
            Origem do pedido
            <Info
              rotulo="a origem do pedido"
              conteudo={{
                texto:
                  "Balcão: você ou a equipe lançou o pedido aqui no painel (telefone, WhatsApp, loja física). Site da loja: o cliente fez o pedido sozinho pela sua vitrine.",
              }}
            />
          </dt>
          <dd>
            {pedido.canal === "MANUAL"
              ? "Balcão (lançado no painel)"
              : pedido.canal === "ONLINE"
                ? "Site da loja"
                : rotuloDoCanal(pedido.canal)}
          </dd>
        </div>
        <div>
          <dt>Feito em</dt>
          <dd>{horarioExato(pedido.criadoEm)}</dd>
        </div>
      </dl>

      {falhou ? (
        <Aviso tom="atencao">
          Não foi possível atualizar agora. O que aparece é a última versão
          carregada.
        </Aviso>
      ) : null}

      {pedido.status === "CANCELLED" && pedido.motivoCancelamento ? (
        <Aviso tom="erro" titulo="Pedido cancelado">
          Motivo informado ao cliente: {pedido.motivoCancelamento}
        </Aviso>
      ) : null}

      {/* A próxima ação vem antes dos detalhes: com a cozinha cheia, o dono
          abre o pedido para fazê-lo andar. */}
      <AcoesDeStatus
        pedidoId={pedido.id}
        opcoes={pedido.proximosStatus}
        aoAtualizar={() => {
          void carregar();
          aoMudar?.();
        }}
        buscar={buscar}
      />

      <div className="sc-detalhe-pedido__grade">
        <section aria-labelledby="itens-do-pedido">
          <h2 id="itens-do-pedido" className="sc-detalhe-pedido__secao-titulo">
            Itens
          </h2>
          <ul className="sc-detalhe-pedido__lista">
            {pedido.itens.map((item) => (
              <li key={item.id}>
                <div className="sc-detalhe-pedido__linha">
                  <p className="font-medium">
                    {item.quantidade}× {item.nome}
                    {item.variacao ? ` (${item.variacao})` : ""}
                  </p>
                  <strong>{dinheiro(item.totalCentavos)}</strong>
                </div>
                {item.atacado && item.precoUnitarioCentavos !== undefined ? (
                  <p className="sc-detalhe-pedido__apoio">
                    <Selo tom="info" semBolinha>
                      Atacado
                    </Selo>{" "}
                    {dinheiro(item.precoUnitarioCentavos)} por unidade, a partir
                    de {item.atacado.quantidadeMinima} un.
                    {item.atacado.varejoUnitarioCentavos !== null
                      ? ` (varejo: ${dinheiro(item.atacado.varejoUnitarioCentavos)})`
                      : ""}
                    {item.atacado.rotulo ? ` · ${item.atacado.rotulo}` : ""}
                  </p>
                ) : null}
                {item.opcoes.length > 0 ? (
                  <p className="sc-detalhe-pedido__apoio">
                    {item.opcoes
                      .map((opcao) => `${opcao.grupo}: ${opcao.nome}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {item.observacao ? (
                  <p className="sc-detalhe-pedido__apoio">
                    Obs.: {item.observacao}
                  </p>
                ) : null}
              </li>
            ))}
            <li className="sc-detalhe-pedido__linha text-lg font-semibold">
              <span>Total</span>
              <span>{dinheiro(pedido.totalCentavos)}</span>
            </li>
          </ul>
          {pedido.observacao ? (
            <p className="sc-detalhe-pedido__caixa sc-detalhe-pedido__caixa--aviso mt-4">
              <strong>Observação do cliente:</strong> {pedido.observacao}
            </p>
          ) : null}
        </section>

        <aside className="grid content-start gap-5">
          <section aria-labelledby="dados-do-cliente">
            <h2
              id="dados-do-cliente"
              className="sc-detalhe-pedido__secao-titulo"
            >
              Cliente
            </h2>
            <div className="sc-detalhe-pedido__caixa">
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
            <h2
              id="historico-do-pedido"
              className="sc-detalhe-pedido__secao-titulo"
            >
              Linha do tempo
            </h2>
            <ol className="sc-linha-do-tempo" data-linha-do-tempo>
              {pedido.historico.map((entrada) => (
                <li key={entrada.id} data-passo={entrada.para}>
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
    </div>
  );
}

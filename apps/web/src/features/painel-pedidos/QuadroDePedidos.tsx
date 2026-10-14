"use client";

/**
 * A fila de pedidos do dono (AC-600..AC-603, AC-609).
 *
 * A ORDEM DA TELA É A ORDEM DO TRABALHO. Primeiro, em destaque, o que só o dono
 * pode destravar: o pedido aguardando confirmação. Logo abaixo, separado, o que
 * pode ser pedido fantasma — abriu o WhatsApp e não confirmou. Depois, lado a
 * lado, o que já anda: em preparo, pronto para retirada, em entrega.
 *
 * Tudo que é regra (onde cada pedido cai, o que é novo, quando o som toca) vem
 * de `packages/core` pela `lib`; aqui mora só o desenho.
 */
import { useCallback, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Aviso, Carregando, Erro, Selo, Vazio } from "@simpleclick/ui";

import {
  agruparPedidosDaFila,
  descreverEspera,
  deveTocarAlerta,
  escreverDinheiroDaFila,
  escreverHorarioDaFila,
  minutosDeEspera,
  resumirVendas,
  rotuloDaEntrega,
  rotuloDoCanal,
  type BuscarFila,
  type PedidoDaFila,
} from "../../lib/fila-de-pedidos.ts";
import { AvisoSonoro, tocarBipe, useSomSilenciado } from "./AvisoSonoro.tsx";
import { SeloAguardando } from "./SeloAguardando.tsx";
import { SeloDeStatus } from "./SeloDeStatus.tsx";
import { useAtualizarPedidos } from "./useAtualizarPedidos.ts";

export interface QuadroDePedidosProps {
  /** Leitor da fila. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarFila | undefined;
  readonly intervaloMs?: number | undefined;
  /** O som do alerta. A prova troca por um que só conta quantas vezes tocou. */
  readonly tocar?: (() => void) | undefined;
  /** O relógio que mede a espera. */
  readonly agora?: (() => Date) | undefined;
}

function CartaoDoPedido({
  pedido,
  novo,
  agora,
}: {
  readonly pedido: PedidoDaFila;
  readonly novo: boolean;
  readonly agora: Date;
}) {
  const espera = descreverEspera(minutosDeEspera(pedido.criadoEm, agora));

  return (
    <article
      aria-label={`Pedido número ${pedido.numero}${novo ? ", novo" : ""}`}
      data-pedido={pedido.id}
      className={[
        "flex flex-col gap-4 rounded-[var(--raio-cartao)] border bg-[var(--cor-superficie-alta)] p-5 shadow-[var(--sombra-larga)]",
        novo
          ? "border-[var(--cor-tinta)] ring-2 ring-[var(--cor-primaria)]"
          : "border-[var(--cor-borda)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--cor-tinta-suave)]">
            <span>Pedido #{pedido.numero}</span>
            {novo ? <Selo tom="info">Novo</Selo> : null}
          </p>
          <h4 className="mt-1 truncate text-xl font-semibold">
            {pedido.cliente}
          </h4>
        </div>
        <strong className="text-lg tabular-nums">
          {escreverDinheiroDaFila(pedido.totalCentavos)}
        </strong>
      </div>
      <div className="flex flex-wrap gap-2">
        <SeloDeStatus status={pedido.status} />
        {pedido.aguardandoConfirmacaoWhatsapp ? <SeloAguardando /> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm text-[var(--cor-tinta-suave)]">
        <div>
          <dt>Horário</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">
            <time dateTime={pedido.criadoEm}>
              {escreverHorarioDaFila(pedido.criadoEm)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Esperando</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">{espera}</dd>
        </div>
        <div>
          <dt>Canal</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">
            {rotuloDoCanal(pedido.canal)}
          </dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd className="font-medium text-[var(--cor-tinta)]">
            {rotuloDaEntrega(pedido.entrega)}
          </dd>
        </div>
      </dl>
      {/* O alvo grande da fila: com a cozinha cheia, o dono abre o pedido
          com o polegar, sem mirar num link pequeno. */}
      <Link
        className={[
          "sc-botao sc-botao--grande w-full",
          pedido.status === "PENDING"
            ? "sc-botao--primaria"
            : "sc-botao--secundaria",
        ].join(" ")}
        href={`/painel/pedidos/${pedido.id}`}
      >
        Abrir pedido #{pedido.numero}
      </Link>
    </article>
  );
}

function Grupo({
  id,
  titulo,
  descricao,
  pedidos,
  naoVistos,
  agora,
  destaque = false,
  vazio,
  selo,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly descricao?: string;
  readonly pedidos: readonly PedidoDaFila[];
  readonly naoVistos: ReadonlySet<string>;
  readonly agora: Date;
  readonly destaque?: boolean;
  readonly vazio: string;
  readonly selo?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-grupo={id}
      className={
        destaque
          ? "rounded-[var(--raio-janela)] border-2 border-[var(--cor-primaria)] bg-[var(--cor-primaria-suave)] p-5"
          : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id} className="text-xl font-semibold">
          {titulo}
        </h3>
        <Selo semBolinha className="text-sm">
          <span data-contador={id}>{pedidos.length}</span>
          <span className="sc-so-leitor">
            {pedidos.length === 1 ? " pedido" : " pedidos"}
          </span>
        </Selo>
      </div>
      {descricao ? (
        <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
          {descricao}
        </p>
      ) : null}
      {selo ? <div className="mt-3">{selo}</div> : null}
      <div className="mt-4 space-y-4">
        {pedidos.length === 0 ? (
          <p className="rounded-[var(--raio-cartao)] border border-dashed border-[var(--cor-borda-forte)] p-5 text-sm text-[var(--cor-tinta-suave)]">
            {vazio}
          </p>
        ) : (
          pedidos.map((pedido) => (
            <CartaoDoPedido
              key={pedido.id}
              pedido={pedido}
              novo={naoVistos.has(pedido.id)}
              agora={agora}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function QuadroDePedidos({
  buscar,
  intervaloMs,
  tocar = tocarBipe,
  agora = () => new Date(),
}: QuadroDePedidosProps = {}) {
  const { silenciado, alternar } = useSomSilenciado();

  // Lidos na hora da chegada, e não na montagem: silenciar no meio do turno
  // precisa valer para o PRÓXIMO pedido, sem reiniciar a consulta.
  const silenciadoAgora = useRef(silenciado);
  silenciadoAgora.current = silenciado;
  const tocarAgora = useRef(tocar);
  tocarAgora.current = tocar;

  const aoChegarPedidoNovo = useCallback((novos: readonly PedidoDaFila[]) => {
    if (deveTocarAlerta(novos, silenciadoAgora.current)) tocarAgora.current();
  }, []);

  const estado = useAtualizarPedidos({
    buscar,
    intervaloMs,
    aoChegarPedidoNovo,
  });
  const grupos = useMemo(
    () => agruparPedidosDaFila(estado.pedidos),
    [estado.pedidos],
  );
  const instante = agora();

  if (estado.carregando) {
    return <Carregando rotulo="Carregando pedidos…" />;
  }

  if (estado.erro !== null && estado.pedidos.length === 0) {
    return (
      <Erro
        titulo="Não foi possível carregar a fila"
        mensagem="A conexão com a loja falhou. A tela continua tentando sozinha e mostra os pedidos assim que a conexão voltar."
      />
    );
  }

  const aguardando = grupos.aguardandoConfirmacao.length;
  // A mesma régua do painel de métricas (AC-611): o que só abriu o WhatsApp
  // não é venda, e aparece contado à parte.
  const { naoConfirmados } = resumirVendas(estado.pedidos);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvisoSonoro
          quantidadeDeNovos={estado.naoVistos.size}
          silenciado={silenciado}
          aoAlternarSom={alternar}
          aoMarcarComoVistos={estado.marcarComoVistos}
        />
        <p className="text-sm text-[var(--cor-tinta-suave)]" role="status">
          {estado.reconectada
            ? "Conexão recuperada. A fila foi atualizada com o que entrou durante a queda."
            : estado.conectado
              ? "Atualizando sozinha a cada poucos segundos."
              : "Aguardando conexão…"}
        </p>
      </div>

      {estado.erro !== null ? (
        <Aviso className="mt-4" tom="atencao">
          {estado.erro}
        </Aviso>
      ) : null}

      {estado.pedidos.length === 0 ? (
        <Vazio
          className="mt-8"
          titulo="Nenhum pedido em aberto agora"
          descricao="Os pedidos novos aparecem aqui sozinhos, com aviso sonoro, sem precisar recarregar a página."
        />
      ) : (
        <div className="mt-8 space-y-8">
          <h2 className="sc-so-leitor">
            Pedidos em aberto: {aguardando} aguardando sua confirmação
          </h2>
          <Grupo
            id="fila-aguardando-confirmacao"
            titulo="Aguardando sua confirmação"
            descricao="Aceite ou recuse. O mais antigo aparece primeiro."
            pedidos={grupos.aguardandoConfirmacao}
            naoVistos={estado.naoVistos}
            agora={instante}
            destaque
            vazio="Nenhum pedido esperando por você."
          />
          <Grupo
            id="fila-aguardando-whatsapp"
            titulo="Aguardando confirmação no WhatsApp"
            descricao="O cliente abriu o WhatsApp, mas ainda não confirmou o envio da mensagem. Cobre o cliente ou descarte o pedido."
            pedidos={grupos.aguardandoWhatsapp}
            naoVistos={estado.naoVistos}
            agora={instante}
            vazio="Nenhum pedido sem confirmação."
            selo={
              naoConfirmados.quantidade > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <SeloAguardando quantidade={naoConfirmados.quantidade} />
                  <span
                    className="text-sm text-[var(--cor-tinta-suave)]"
                    data-fora-do-faturamento
                  >
                    {escreverDinheiroDaFila(naoConfirmados.totalCentavos)} fora
                    do faturamento até o dono aceitar
                  </span>
                </div>
              ) : undefined
            }
          />
          <div className="grid gap-8 lg:grid-cols-3">
            <Grupo
              id="fila-em-preparo"
              titulo="Em preparo"
              pedidos={grupos.emPreparo}
              naoVistos={estado.naoVistos}
              agora={instante}
              vazio="Nenhum pedido nesta etapa."
            />
            <Grupo
              id="fila-pronto-para-retirada"
              titulo="Pronto para retirada"
              pedidos={grupos.prontoParaRetirada}
              naoVistos={estado.naoVistos}
              agora={instante}
              vazio="Nenhum pedido nesta etapa."
            />
            <Grupo
              id="fila-em-entrega"
              titulo="Em entrega"
              pedidos={grupos.emEntrega}
              naoVistos={estado.naoVistos}
              agora={instante}
              vazio="Nenhum pedido nesta etapa."
            />
          </div>
        </div>
      )}
    </>
  );
}

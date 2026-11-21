"use client";

/**
 * O quadro de pedidos do dia (kanban): seis colunas, na ordem do trabalho —
 * Pedido gerado, Confirmado, Em preparo, Retirada, Saiu para entrega,
 * Concluída. Cancelado fica fora do quadro, na visão "Cancelados".
 *
 * COMO O PEDIDO ANDA. Por botão rápido no cartão ou arrastando para a coluna
 * seguinte. Só vale o passo seguinte do caminho do pedido: retirada não passa
 * por "Saiu para entrega" e entrega não passa por "Retirada". A recusa aparece
 * na própria coluna enquanto se arrasta, e, se o dono soltar mesmo assim, no
 * aviso do topo. Quem decide de verdade é a API; a tela só avisa antes.
 *
 * A tela mexe no cartão na hora (o pedido já aparece na coluna nova) e relê o
 * dia em seguida; se a API recusar, o cartão volta e a explicação aparece.
 *
 * Só o quadro rola de lado, nunca a página: colunas de mesma largura
 * (340–380 px), cada uma com uns três cartões de altura, rolagem própria e
 * carregamento infinito (`ColunaDoKanban`, `quadro.css`).
 *
 * Atualiza sozinho a cada poucos segundos, com o aviso sonoro de sempre
 * (`AvisoSonoro`) para pedido novo. As regras de etapa vêm de
 * `@simpleclick/contracts` pela `lib`.
 */
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Aviso, Botao, Carregando, Erro, Info, Vazio } from "@simpleclick/ui";

import {
  deveTocarAlerta,
  escreverDinheiroDaFila,
} from "../../lib/fila-de-pedidos.ts";
import {
  DIA_DE_HOJE,
  ETAPAS_DO_PEDIDO,
  avaliarMovimento,
  descreverDia,
  proximaEtapa,
  mudarStatusDoPedido,
  SEM_FILTROS_DO_QUADRO,
  filtrarPedidos,
  filtrosLigados,
  pedidosCancelados,
  pedidosDaColuna,
  rotuloDoPagamento,
  type BuscarQuadro,
  type PedidoDoQuadro,
  type ResultadoDaMudanca,
} from "../../lib/quadro-de-pedidos.ts";
import { useConsultaNaUrl } from "../painel-estoque/lista-paginada.tsx";
import { BarraDeFiltros } from "../painel-filtros/BarraDeFiltros.tsx";
import { AvisoSonoro, tocarBipe, useSomSilenciado } from "./AvisoSonoro.tsx";
import { CartaoDoKanban } from "./CartaoDoKanban.tsx";
import { ListaDaColuna } from "./ColunaDoKanban.tsx";
import { JanelaDoPedido } from "./JanelaDoPedido.tsx";
import { JanelaModal } from "./JanelaModal.tsx";
import { SeletorDoDia } from "./SeletorDoDia.tsx";
import { useQuadroDoDia } from "./useQuadroDoDia.ts";
import "./quadro.css";
import { codigoDoPedidoNaTela } from "@simpleclick/contracts";

export interface QuadroKanbanProps {
  /** Leitor do quadro. A prova troca por um que responde sem rede. */
  readonly buscar?: BuscarQuadro | undefined;
  readonly intervaloMs?: number | undefined;
  /** O som do alerta. A prova troca por um que só conta quantas vezes tocou. */
  readonly tocar?: (() => void) | undefined;
  /** O relógio que mede a espera. */
  readonly agora?: (() => Date) | undefined;
  /** O dia aberto ao entrar (`aaaa-mm-dd`); sem ele, hoje. */
  readonly diaInicial?: string | undefined;
  /** A mudança de status. A prova troca por uma que responde sem rede. */
  readonly mudar?:
    | ((
        pedidoId: string,
        status: string,
        motivo: string | null,
      ) => Promise<ResultadoDaMudanca>)
    | undefined;
  /** A rede do detalhe do pedido aberto em janela. */
  readonly buscarDetalhe?: typeof fetch | undefined;
}

type Visao = "quadro" | "cancelados";

/**
 * O que cada etapa quer dizer, no "i" do cabeçalho da coluna (card #69). Fica
 * fora da lista que rola, e o balão abre para cima: não cobre os cartões.
 */
const EXPLICACAO_DA_ETAPA: Readonly<
  Record<string, { readonly texto: string; readonly exemplo?: string }>
> = {
  PENDING: {
    texto:
      "O pedido acabou de chegar e ainda não foi aceito. Aceite para confirmar ao cliente, ou recuse dizendo o motivo.",
    exemplo: "pedido do site às 19h12 esperando você aceitar.",
  },
  ACCEPTED: {
    texto:
      "Você aceitou o pedido e o cliente já vê isso na página do pedido. O próximo passo é começar a preparar.",
  },
  PREPARING: {
    texto:
      "O pedido está sendo feito ou separado. Quando ficar pronto, vai para Retirada (o cliente busca) ou Saiu para entrega.",
  },
  READY_FOR_PICKUP: {
    texto:
      "Pronto e esperando o cliente buscar na loja. Só pedidos de retirada passam por aqui.",
  },
  OUT_FOR_DELIVERY: {
    texto:
      "O entregador já levou o pedido. Só pedidos de entrega passam por aqui.",
  },
  COMPLETED: {
    texto:
      "O cliente recebeu o pedido. É o fim do caminho: ele fica no histórico do cliente.",
  },
};

const EXPLICACAO_DO_MOTIVO = {
  texto:
    "Explique em uma frase por que o pedido não vai sair. O cliente lê este texto na página de acompanhamento do pedido.",
  exemplo: "acabou o queijo do pastel de queijo.",
};

interface Alvo {
  readonly status: string;
  readonly recusa: string | null;
}

/** Tempo que o cartão fica na coluna nova esperando a releitura confirmar. */
const ESPERA_DA_CONFIRMACAO_MS = 15_000;

function semProvisorio(
  atuais: Readonly<Record<string, string>>,
  id: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(atuais).filter(([chave]) => chave !== id),
  );
}

export function QuadroKanban({
  buscar,
  intervaloMs,
  tocar = tocarBipe,
  agora = () => new Date(),
  diaInicial,
  mudar = (id, status, motivo) => mudarStatusDoPedido(id, status, motivo),
  buscarDetalhe,
}: QuadroKanbanProps = {}) {
  const [dia, setDia] = useState<string>(diaInicial ?? DIA_DE_HOJE);
  const [visao, setVisao] = useState<Visao>("quadro");
  const [colunaAtiva, setColunaAtiva] = useState<string>(
    ETAPAS_DO_PEDIDO[0].status,
  );
  const [aberto, setAberto] = useState<PedidoDoQuadro | null>(null);
  const [cancelando, setCancelando] = useState<PedidoDoQuadro | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobrescritas, setSobrescritas] = useState<
    Readonly<Record<string, string>>
  >({});
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [arrastando, setArrastando] = useState<PedidoDoQuadro | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const soltou = useRef(false);

  const { silenciado, alternar } = useSomSilenciado();
  const silenciadoAgora = useRef(silenciado);
  silenciadoAgora.current = silenciado;
  const tocarAgora = useRef(tocar);
  tocarAgora.current = tocar;

  const aoChegarPedidoNovo = useCallback((novos: readonly PedidoDoQuadro[]) => {
    if (deveTocarAlerta(novos, silenciadoAgora.current)) {
      tocarAgora.current();
    }
  }, []);

  const estado = useQuadroDoDia({
    dia,
    buscar,
    intervaloMs,
    aoChegarPedidoNovo,
  });
  const quadro = estado.quadro;
  // O "hoje" da loja vem da primeira leitura e fica: trocar de dia não pode
  // fazer o seletor sumir enquanto o quadro novo carrega.
  const [relogioDaLoja, setRelogioDaLoja] = useState<{
    readonly hoje: string;
    readonly fuso: string;
  } | null>(null);
  useEffect(() => {
    if (quadro !== null)
      setRelogioDaLoja({ hoje: quadro.hoje, fuso: quadro.fuso });
  }, [quadro]);
  const hoje = quadro?.hoje ?? relogioDaLoja?.hoje ?? null;
  const diaMostrado = quadro?.dia ?? (dia === DIA_DE_HOJE ? hoje : dia);

  // O endereço acompanha o dia, para recarregar ou mandar o link ao sócio.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (dia === DIA_DE_HOJE) url.searchParams.delete("dia");
    else url.searchParams.set("dia", dia);
    window.history.replaceState(window.history.state, "", url);
  }, [dia]);

  // O cartão na coluna nova sai do "provisório" quando a leitura confirma.
  useEffect(() => {
    if (quadro === null) return;
    setSobrescritas((atuais) => {
      const restantes: Record<string, string> = {};
      for (const [id, status] of Object.entries(atuais)) {
        const lido = quadro.pedidos.find((pedido) => pedido.id === id);
        if (lido !== undefined && lido.status !== status)
          restantes[id] = status;
      }
      return Object.keys(restantes).length === Object.keys(atuais).length
        ? atuais
        : restantes;
    });
  }, [quadro]);

  const pedidos = useMemo<readonly PedidoDoQuadro[]>(
    () =>
      (quadro?.pedidos ?? []).map((pedido) => {
        const provisorio = sobrescritas[pedido.id];
        return provisorio === undefined
          ? pedido
          : { ...pedido, status: provisorio };
      }),
    [quadro, sobrescritas],
  );

  const cancelados = useMemo(() => pedidosCancelados(pedidos), [pedidos]);

  // Busca e filtros (card #77): moram no endereço, junto do `dia`. O quadro de
  // UM dia é pequeno (dezenas de cartões) e já está na tela, então filtra aqui.
  const [consultaDosFiltros, mudarFiltros] =
    useConsultaNaUrl(SEM_FILTROS_DO_QUADRO);
  const filtros = consultaDosFiltros ?? SEM_FILTROS_DO_QUADRO;
  const visiveis = useMemo(
    () => filtrarPedidos(pedidos, filtros),
    [pedidos, filtros],
  );
  const canceladosVisiveis = useMemo(
    () => pedidosCancelados(visiveis),
    [visiveis],
  );
  const filtroLigado = filtrosLigados(filtros);
  const filtrado = filtroLigado > 0 || filtros.busca !== "";
  // Escolher "Cancelados" (ou uma etapa) na barra decide a visão sozinho.
  const visaoMostrada: Visao =
    filtros.etapa === "CANCELLED"
      ? "cancelados"
      : filtros.etapa !== ""
        ? "quadro"
        : visao;
  const doQuadro = pedidos.length - cancelados.length;
  const vendidoNoDia = useMemo(
    () =>
      pedidos
        .filter((pedido) => pedido.status !== "CANCELLED")
        .reduce((soma, pedido) => soma + pedido.totalCentavos, 0),
    [pedidos],
  );

  async function aplicar(
    pedido: PedidoDoQuadro,
    status: string,
    motivoDoCancelamento: string | null = null,
  ): Promise<boolean> {
    setAviso(null);
    setOcupados((atuais) => new Set(atuais).add(pedido.id));
    setSobrescritas((atuais) => ({ ...atuais, [pedido.id]: status }));
    const resultado = await mudar(pedido.id, status, motivoDoCancelamento);
    setOcupados((atuais) => {
      const restantes = new Set(atuais);
      restantes.delete(pedido.id);
      return restantes;
    });
    if (!resultado.ok) {
      setSobrescritas((atuais) => semProvisorio(atuais, pedido.id));
      setAviso(resultado.explicacao);
    } else {
      // Se a leitura não confirmar a tempo (outro aparelho mexeu no pedido),
      // o provisório sai sozinho e vale o que o servidor diz.
      setTimeout(() => {
        setSobrescritas((atuais) => semProvisorio(atuais, pedido.id));
      }, ESPERA_DA_CONFIRMACAO_MS);
    }
    estado.recarregar();
    return resultado.ok;
  }

  function avancar(pedido: PedidoDoQuadro) {
    const proxima = proximaEtapa(pedido);
    if (proxima !== null) void aplicar(pedido, proxima.status);
  }

  async function confirmarCancelamento() {
    if (cancelando === null) return;
    const pedido = cancelando;
    setCancelando(null);
    const texto = motivo.trim();
    setMotivo("");
    await aplicar(pedido, "CANCELLED", texto);
  }

  // --- arrastar ---------------------------------------------------------

  function sobreAColuna(evento: DragEvent<HTMLElement>, status: string) {
    if (arrastando === null) return;
    // Sem `preventDefault` o navegador nem avisa que se soltou: o aviso de
    // recusa depende de a coluna aceitar o evento e responder "não".
    evento.preventDefault();
    const movimento = avaliarMovimento(arrastando, status);
    evento.dataTransfer.dropEffect = movimento.ok ? "move" : "none";
    const recusa = movimento.ok ? null : movimento.recusa;
    setAlvo((atual) =>
      atual?.status === status && atual.recusa === recusa
        ? atual
        : { status, recusa },
    );
  }

  function soltarNaColuna(evento: DragEvent<HTMLElement>, status: string) {
    evento.preventDefault();
    const pedido = arrastando;
    soltou.current = true;
    setAlvo(null);
    setArrastando(null);
    if (pedido === null) return;
    const movimento = avaliarMovimento(pedido, status);
    if (!movimento.ok) {
      setAviso(movimento.recusa);
      return;
    }
    void aplicar(pedido, status);
  }

  function terminarArrastar() {
    // Soltou fora de uma coluna que aceita: se passou por uma que recusou, o
    // dono merece saber por quê, e não só ver o cartão voltar.
    if (!soltou.current && alvo?.recusa) setAviso(alvo.recusa);
    soltou.current = false;
    setAlvo(null);
    setArrastando(null);
  }

  // --- desenho ----------------------------------------------------------

  const instante = agora();

  function cartao(pedido: PedidoDoQuadro) {
    return (
      <CartaoDoKanban
        key={pedido.id}
        pedido={pedido}
        agora={instante}
        novo={estado.naoVistos.has(pedido.id)}
        ocupado={ocupados.has(pedido.id)}
        arrastando={arrastando?.id === pedido.id}
        aoAbrir={setAberto}
        aoAvancar={avancar}
        aoCancelar={(alvoDoCancelamento) => {
          setMotivo("");
          setCancelando(alvoDoCancelamento);
        }}
        aoComecarArrastar={(arrastado) => {
          soltou.current = false;
          setAberto(null);
          setArrastando(arrastado);
        }}
        aoTerminarArrastar={terminarArrastar}
      />
    );
  }

  const cabecalho = (
    <header className="sc-pedidos__topo">
      <div>
        <p className="sc-pedidos__sobretitulo">Operação da loja</p>
        <h1 className="sc-pedidos__titulo">Pedidos</h1>
        {diaMostrado !== null ? (
          <p className="sc-kanban__nota" data-resumo-do-dia>
            {descreverDia(diaMostrado)}
            {" · "}
            {doQuadro === 1 ? "1 pedido" : `${doQuadro} pedidos`}
            {" · "}
            {escreverDinheiroDaFila(vendidoNoDia)}
            {cancelados.length > 0
              ? ` (fora ${cancelados.length} cancelado${cancelados.length === 1 ? "" : "s"})`
              : ""}
          </p>
        ) : null}
      </div>
      <div className="sc-pedidos__acoes">
        {diaMostrado !== null && hoje !== null ? (
          <Info
            rotulo="Dia dos pedidos"
            conteudo={{
              texto:
                "Mostra os pedidos feitos neste dia, no horário da loja. Pedido de um dia anterior que ainda está em aberto também aparece, marcado com a data dele.",
            }}
          />
        ) : null}
        {diaMostrado !== null && hoje !== null ? (
          <SeletorDoDia
            dia={diaMostrado}
            hoje={hoje}
            fuso={quadro?.fuso ?? relogioDaLoja?.fuso}
            aoMudar={(novo) => {
              setAviso(null);
              setDia(novo === hoje ? DIA_DE_HOJE : novo);
            }}
          />
        ) : null}
        <Link
          className="sc-botao sc-botao--primaria"
          href="/painel/pedidos/novo"
        >
          Novo pedido
        </Link>
      </div>
    </header>
  );

  if (estado.carregando) {
    return (
      <div className="sc-pedidos">
        {cabecalho}
        <Carregando rotulo="Carregando pedidos…" />
      </div>
    );
  }

  if (estado.erro !== null && quadro === null) {
    return (
      <div className="sc-pedidos">
        {cabecalho}
        <Erro
          titulo="Não foi possível carregar os pedidos"
          mensagem="A conexão com a loja falhou. A tela continua tentando sozinha e mostra os pedidos assim que a conexão voltar."
        />
      </div>
    );
  }

  return (
    <div className="sc-pedidos">
      {cabecalho}

      <BarraDeFiltros
        rotuloDaBusca="Buscar pedidos"
        placeholder="Buscar por número, cliente ou telefone"
        busca={filtros.busca}
        aoBuscar={(busca) => mudarFiltros({ busca })}
        filtros={[
          {
            tipo: "selecao",
            id: "tipo",
            rotulo: "Tipo",
            valor: filtros.tipo,
            opcoes: [
              { valor: "", rotulo: "Entrega e retirada" },
              { valor: "DELIVERY", rotulo: "Entrega" },
              { valor: "PICKUP", rotulo: "Retirada" },
            ],
            aoMudar: (tipo) => mudarFiltros({ tipo }),
          },
          {
            tipo: "selecao",
            id: "pagamento",
            rotulo: "Pagamento",
            valor: filtros.pagamento,
            opcoes: [
              { valor: "", rotulo: "Todos" },
              ...["PIX", "CASH", "CARD_ON_DELIVERY", "OTHER"].map((forma) => ({
                valor: forma,
                rotulo: rotuloDoPagamento(forma),
              })),
              { valor: "a-combinar", rotulo: "Sem forma definida" },
            ],
            aoMudar: (pagamento) => mudarFiltros({ pagamento }),
          },
          {
            tipo: "selecao",
            id: "etapa",
            rotulo: "Etapa",
            valor: filtros.etapa,
            opcoes: [
              { valor: "", rotulo: "Todas" },
              ...ETAPAS_DO_PEDIDO.map((etapa) => ({
                valor: etapa.status,
                rotulo: etapa.rotulo,
              })),
              { valor: "CANCELLED", rotulo: "Cancelados" },
            ],
            aoMudar: (etapa) => mudarFiltros({ etapa }),
          },
          {
            tipo: "faixa",
            id: "valor",
            rotulo: "Valor (R$)",
            minimo: filtros.valorMin,
            maximo: filtros.valorMax,
            aoMudar: (valorMin, valorMax) => mudarFiltros({ valorMin, valorMax }),
          },
        ]}
        ligados={filtroLigado}
        filtrado={filtrado}
        aoLimpar={() => mudarFiltros(SEM_FILTROS_DO_QUADRO)}
        contagem={
          filtrado
            ? `${visiveis.length} de ${pedidos.length} pedido(s) do dia`
            : `${pedidos.length} pedido(s) do dia`
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvisoSonoro
          quantidadeDeNovos={estado.naoVistos.size}
          silenciado={silenciado}
          aoAlternarSom={alternar}
          aoMarcarComoVistos={estado.marcarComoVistos}
        />
        <div
          className="sc-kanban__visoes"
          role="group"
          aria-label="O que mostrar"
        >
          <button
            type="button"
            className="sc-kanban__visao"
            aria-pressed={visaoMostrada === "quadro"}
            onClick={() => {
              setVisao("quadro");
              if (filtros.etapa === "CANCELLED") mudarFiltros({ etapa: "" });
            }}
          >
            Quadro
          </button>
          <button
            type="button"
            className="sc-kanban__visao"
            aria-pressed={visaoMostrada === "cancelados"}
            data-visao="cancelados"
            onClick={() => {
              setVisao("cancelados");
              if (filtros.etapa !== "" && filtros.etapa !== "CANCELLED")
                mudarFiltros({ etapa: "" });
            }}
          >
            Cancelados ({cancelados.length})
          </button>
          <Info
            rotulo="O que mostrar"
            conteudo={{
              texto:
                "Quadro: os pedidos do dia por etapa, do que chegou ao que foi entregue. Cancelados: os pedidos recusados ou cancelados, com o motivo que o cliente leu.",
            }}
          />
        </div>
      </div>

      <p className="sc-kanban__nota" role="status">
        {estado.reconectada
          ? "Conexão recuperada. O quadro foi atualizado com o que entrou durante a queda."
          : estado.conectado
            ? "Atualizando sozinho a cada poucos segundos."
            : "Aguardando conexão…"}
      </p>

      {estado.erro !== null ? <Aviso tom="atencao">{estado.erro}</Aviso> : null}
      {aviso !== null ? (
        <Aviso tom="erro" titulo="Não foi possível mover o pedido">
          {aviso}
        </Aviso>
      ) : null}

      {pedidos.length > 0 && visiveis.length === 0 && filtrado ? (
        <Vazio
          titulo="Nada encontrado"
          descricao="Nenhum pedido deste dia combina com a busca e os filtros escolhidos. Mude a busca, outro dia no calendário ou limpe os filtros."
          acao={
            <Botao
              variante="secundaria"
              onClick={() => mudarFiltros(SEM_FILTROS_DO_QUADRO)}
            >
              Limpar filtros
            </Botao>
          }
        />
      ) : visaoMostrada === "cancelados" ? (
        canceladosVisiveis.length === 0 ? (
          <Vazio
            titulo="Nenhum pedido cancelado neste dia"
            descricao="Os pedidos recusados ou cancelados aparecem aqui, com o motivo informado ao cliente."
          />
        ) : (
          <div className="sc-kanban__cancelados" data-cancelados>
            {canceladosVisiveis.map(cartao)}
          </div>
        )
      ) : pedidos.length === 0 ? (
        <Vazio
          titulo={
            dia === DIA_DE_HOJE || diaMostrado === hoje
              ? "Nenhum pedido hoje ainda"
              : "Nenhum pedido neste dia"
          }
          descricao={
            dia === DIA_DE_HOJE || diaMostrado === hoje
              ? "Os pedidos novos aparecem aqui sozinhos, com aviso sonoro, sem precisar recarregar a página. Pedido de balcão? Use “Novo pedido”."
              : "Escolha outro dia no calendário para ver os pedidos dele."
          }
        />
      ) : (
        <Fragment>
          <div
            className="sc-kanban__abas"
            role="tablist"
            aria-label="Etapas do pedido"
          >
            {ETAPAS_DO_PEDIDO.map((etapa) => (
              <button
                key={etapa.status}
                type="button"
                role="tab"
                id={`aba-${etapa.etapa}`}
                className="sc-kanban__aba"
                aria-selected={colunaAtiva === etapa.status}
                aria-controls={`coluna-${etapa.etapa}`}
                onClick={() => setColunaAtiva(etapa.status)}
              >
                {etapa.rotulo}
                <span className="sc-kanban__contador">
                  {pedidosDaColuna(visiveis, etapa.status).length}
                </span>
              </button>
            ))}
          </div>

          <div className="sc-kanban__area">
            <div className="sc-kanban__colunas" data-quadro>
              {ETAPAS_DO_PEDIDO.map((etapa) => {
                const doGrupo = pedidosDaColuna(visiveis, etapa.status);
                const soUmaForma = etapa.formas.length === 1;
                const estaSobre = alvo?.status === etapa.status;
                return (
                  <section
                    key={etapa.status}
                    id={`coluna-${etapa.etapa}`}
                    aria-label={etapa.rotulo}
                    data-coluna={etapa.status}
                    data-ativa={colunaAtiva === etapa.status}
                    data-alvo={
                      estaSobre
                        ? alvo?.recusa
                          ? "recusado"
                          : "valido"
                        : undefined
                    }
                    className="sc-kanban__coluna"
                    onDragOver={(evento) => sobreAColuna(evento, etapa.status)}
                    onDragLeave={(evento) => {
                      if (
                        !evento.currentTarget.contains(
                          evento.relatedTarget as Node | null,
                        )
                      ) {
                        setAlvo((atual) =>
                          atual?.status === etapa.status ? null : atual,
                        );
                      }
                    }}
                    onDrop={(evento) => soltarNaColuna(evento, etapa.status)}
                  >
                    <div className="sc-kanban__cabecalho">
                      <span className="inline-flex items-center gap-1">
                        <h2 className="sc-kanban__nome">{etapa.rotulo}</h2>
                        <Info
                          id={`etapa-${etapa.etapa}`}
                          rotulo={`a etapa ${etapa.rotulo}`}
                          conteudo={EXPLICACAO_DA_ETAPA[etapa.status] ?? ""}
                        />
                      </span>
                      <span
                        className="sc-kanban__contador"
                        data-contador={etapa.status}
                      >
                        {doGrupo.length}
                        <span className="sc-so-leitor">
                          {doGrupo.length === 1 ? " pedido" : " pedidos"}
                        </span>
                      </span>
                    </div>
                    {/* No celular o cabeçalho some (a aba diz a etapa): o
                        "i" vem nesta linha, acima da lista. */}
                    <p className="sc-kanban__nota inline-flex items-center gap-1 md:hidden">
                      O que é “{etapa.rotulo}”?
                      <Info
                        rotulo={`a etapa ${etapa.rotulo}`}
                        conteudo={EXPLICACAO_DA_ETAPA[etapa.status] ?? ""}
                      />
                    </p>
                    {soUmaForma ? (
                      <p className="sc-kanban__nota">
                        {etapa.formas[0] === "PICKUP"
                          ? "Só pedidos de retirada"
                          : "Só pedidos de entrega"}
                      </p>
                    ) : null}
                    {estaSobre && alvo?.recusa ? (
                      <p className="sc-kanban__recusa-na-coluna" role="alert">
                        {alvo.recusa}
                      </p>
                    ) : null}
                    {doGrupo.length === 0 ? (
                      <p className="sc-kanban__vazio">
                        Nenhum pedido nesta etapa.
                      </p>
                    ) : (
                      <ListaDaColuna
                        itens={doGrupo}
                        desenhar={cartao}
                        destacar={(pedido) => estado.naoVistos.has(pedido.id)}
                        rotulo={etapa.rotulo}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </Fragment>
      )}

      <JanelaDoPedido
        pedidoId={aberto?.id ?? null}
        codigo={aberto === null ? undefined : codigoDoPedidoNaTela(aberto)}
        aoFechar={() => setAberto(null)}
        aoMudar={estado.recarregar}
        buscar={buscarDetalhe}
      />

      <JanelaModal
        aberta={cancelando !== null}
        aoFechar={() => setCancelando(null)}
        titulo={
          cancelando?.status === "PENDING"
            ? "Recusar pedido"
            : "Cancelar pedido"
        }
        tamanho="estreita"
      >
        {cancelando === null ? null : (
          <form
            className="grid gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void confirmarCancelamento();
            }}
          >
            <p>
              Pedido {codigoDoPedidoNaTela(cancelando)} de {cancelando.cliente}. O cliente lê
              o motivo na página de acompanhamento.
            </p>
            <div className="grid gap-2">
              <span className="inline-flex items-center gap-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="motivo-do-cancelamento"
                >
                  Motivo{" "}
                  {cancelando.status === "PENDING"
                    ? "da recusa"
                    : "do cancelamento"}{" "}
                  (obrigatório, o cliente vê)
                </label>
                <Info
                  id="motivo-do-cancelamento"
                  rotulo="o motivo"
                  conteudo={EXPLICACAO_DO_MOTIVO}
                />
              </span>
              <textarea
                id="motivo-do-cancelamento"
                className="sc-campo__controle min-h-24 w-full"
                aria-describedby="motivo-do-cancelamento-dica motivo-do-cancelamento-info"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                maxLength={500}
                placeholder="Ex.: acabou o queijo; não entregamos no seu bairro"
                autoFocus
              />
              <span
                id="motivo-do-cancelamento-dica"
                className="text-sm text-[var(--cor-tinta-suave)]"
              >
                De 3 a 500 letras. Aparece na página de acompanhamento do
                pedido.
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="sc-botao sc-botao--secundaria"
                onClick={() => setCancelando(null)}
              >
                Voltar
              </button>
              <button
                type="submit"
                className="sc-botao sc-botao--perigo"
                disabled={motivo.trim().length < 3}
              >
                {cancelando.status === "PENDING"
                  ? "Recusar pedido"
                  : "Cancelar pedido"}
              </button>
            </div>
          </form>
        )}
      </JanelaModal>
    </div>
  );
}

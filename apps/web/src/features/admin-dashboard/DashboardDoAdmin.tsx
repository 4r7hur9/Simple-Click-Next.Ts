"use client";

/**
 * A home da administração: o painel de crescimento do SimpleClick.
 *
 * `DashboardDoAdmin` guarda o período e fala com a rede; `CorpoDoPainel` só
 * desenha o que recebe e é ele que os testes conferem nos estados. Os números
 * chegam prontos da API (`GET /v1/admin/metricas`): nenhuma conta de negócio
 * mora aqui, só formatação e o comparativo com o período anterior.
 */
import {
  ROTULOS_DAS_SITUACOES,
  type MetricasDoAdminNoContrato,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";
import {
  Aviso,
  Botao,
  Cartao,
  Erro,
  IconeAlerta,
  IconeCarregando,
  IconeClientes,
  IconeDinheiro,
  IconeEquipe,
  IconeLoja,
  IconeMetricas,
  IconePedido,
  IconeTrocar,
  IconeUsuario,
  Selo,
  SeletorDePeriodo,
  Vazio,
  descreverPeriodo,
  hojeNoFuso,
  periodoDoAtalho,
  type ConteudoDoInfo,
  type PeriodoIso,
} from "@simpleclick/ui";
import Link from "next/link";
import { useMemo, useState } from "react";

import { INFO_DO_DASHBOARD } from "../admin/explicacoes.ts";
import { CartaoDeNumero, EsqueletoDoCartao } from "./CartaoDeNumero.tsx";
import {
  compararComAnterior,
  diaCompleto,
  diaCurto,
  escreverDinheiro,
  escreverInteiro,
  escreverPercentual,
} from "./formatar.ts";
import {
  BarrasHorizontais,
  GraficoDeColunas,
  GraficoDeLinha,
  type PontoDeSerie,
} from "./graficos.tsx";
import {
  useMetricasDoAdmin,
  type EstadoDoPainel,
} from "./useMetricasDoAdmin.ts";

export const ENDERECO_DAS_PENDENTES = "/admin/aprovacoes";

const TOM_DA_SITUACAO: Readonly<
  Record<SituacaoDaLoja, "sucesso" | "atencao" | "erro" | "neutro">
> = {
  ACTIVE: "sucesso",
  PENDING_APPROVAL: "atencao",
  REJECTED: "erro",
  INACTIVE: "erro",
  DELETED: "neutro",
};

const plural = (n: number, um: string, varios: string) =>
  `${escreverInteiro(n)} ${n === 1 ? um : varios}`;

/** Posições do eixo que recebem rótulo, sem amontoar. */
export function marcasDoEixo(quantidade: number, maximo = 6): number[] {
  if (quantidade <= 0) return [];
  if (quantidade <= maximo) return Array.from({ length: quantidade }, (_, i) => i);
  const passo = (quantidade - 1) / (maximo - 1);
  return Array.from({ length: maximo }, (_, i) => Math.round(i * passo));
}

/* ─────────────────────────── seções de cartões ─────────────────────────── */

function Secao({
  titulo,
  children,
  colunas = "min-[1100px]:grid-cols-4",
}: {
  readonly titulo: string;
  readonly children: React.ReactNode;
  readonly colunas?: string;
}) {
  return (
    <section aria-label={titulo} className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-tinta-suave uppercase">{titulo}</h2>
      <dl className={`m-0 grid grid-cols-2 gap-4 min-[768px]:grid-cols-3 ${colunas}`}>
        {children}
      </dl>
    </section>
  );
}

export function CartoesDoPainel({
  m,
  comparar,
}: {
  readonly m: MetricasDoAdminNoContrato;
  readonly comparar: boolean;
}) {
  const c = m.cartoes;
  const contagem = (
    nome: string,
    rotulo: string,
    par: { atual: number; anterior: number | null },
    {
      icone,
      detalhe,
      info,
    }: { icone: typeof IconeLoja; detalhe: string; info?: ConteudoDoInfo },
  ) => (
    <CartaoDeNumero
      nome={nome}
      rotulo={rotulo}
      info={info}
      valor={escreverInteiro(par.atual)}
      icone={icone}
      detalhe={detalhe}
      variacao={comparar ? compararComAnterior(par.atual, par.anterior) : null}
      anteriorTexto={par.anterior === null ? "" : escreverInteiro(par.anterior)}
    />
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Secao titulo="Lojas" colunas="min-[1100px]:grid-cols-3">
        {contagem("lojas-ativas", "Lojas ativas", c.lojasAtivas, { icone: IconeLoja, detalhe: "Na vitrine ao fim do período", info: INFO_DO_DASHBOARD.lojasAtivas })}
        {contagem("novas-lojas", "Novas lojas", c.novasLojas, { icone: IconeLoja, detalhe: "Cadastradas no período", info: INFO_DO_DASHBOARD.novasLojas })}
        <CartaoDeNumero
          nome="lojas-pendentes"
          rotulo="Aguardando aprovação"
          info={INFO_DO_DASHBOARD.pendentes}
          valor={escreverInteiro(c.lojasPendentes.atual)}
          icone={IconeAlerta}
          destaque={c.lojasPendentes.atual > 0}
          detalhe={c.lojasPendentes.atual === 0 ? "Nenhuma na fila agora" : "Na fila agora, de qualquer data"}
          atalho={
            c.lojasPendentes.atual > 0
              ? { href: ENDERECO_DAS_PENDENTES, texto: "Ver pendentes" }
              : undefined
          }
        />
      </Secao>

      <Secao titulo="Vendas">
        {contagem("pedidos", "Pedidos", c.pedidos, { icone: IconePedido, detalhe: "Feitos no período, sem os cancelados", info: INFO_DO_DASHBOARD.pedidos })}
        <CartaoDeNumero
          nome="faturamento"
          rotulo="Faturamento (R$)"
          info={INFO_DO_DASHBOARD.faturamento}
          valor={escreverDinheiro(c.faturamentoCentavos.atual)}
          icone={IconeDinheiro}
          detalhe="Soma dos pedidos vendidos pelas lojas"
          variacao={comparar ? compararComAnterior(c.faturamentoCentavos.atual, c.faturamentoCentavos.anterior) : null}
          anteriorTexto={c.faturamentoCentavos.anterior === null ? "" : escreverDinheiro(c.faturamentoCentavos.anterior)}
        />
        <CartaoDeNumero
          nome="ticket-medio"
          rotulo="Ticket médio (R$)"
          info={INFO_DO_DASHBOARD.ticketMedio}
          valor={escreverDinheiro(c.ticketMedioCentavos.atual)}
          icone={IconeMetricas}
          detalhe="Faturamento ÷ pedidos"
          variacao={comparar ? compararComAnterior(c.ticketMedioCentavos.atual, c.ticketMedioCentavos.anterior) : null}
          anteriorTexto={c.ticketMedioCentavos.anterior === null ? "" : escreverDinheiro(c.ticketMedioCentavos.anterior)}
        />
        <CartaoDeNumero
          nome="conversao"
          rotulo="Conversão (%)"
          info={INFO_DO_DASHBOARD.conversao}
          valor={c.conversaoPercentual.atual === null ? "—" : escreverPercentual(c.conversaoPercentual.atual)}
          icone={IconeTrocar}
          detalhe={c.conversaoPercentual.atual === null ? "Nenhum carrinho no período" : "Carrinhos que viraram pedido no período"}
          variacao={
            comparar && c.conversaoPercentual.atual !== null
              ? compararComAnterior(c.conversaoPercentual.atual, c.conversaoPercentual.anterior)
              : null
          }
          anteriorTexto={c.conversaoPercentual.anterior === null ? "" : escreverPercentual(c.conversaoPercentual.anterior)}
        />
      </Secao>

      <Secao titulo="Pessoas">
        {contagem("clientes", "Clientes cadastrados", c.clientes, { icone: IconeClientes, detalhe: "Contas de cliente ao fim do período", info: INFO_DO_DASHBOARD.clientes })}
        {contagem("novos-clientes", "Novos clientes", c.novosClientes, { icone: IconeUsuario, detalhe: "Cadastrados no período" })}
        {contagem("donos", "Donos de loja", c.donos, { icone: IconeLoja, detalhe: "Contas de dono com acesso ativo", info: INFO_DO_DASHBOARD.donos })}
        {contagem("staff", "Pessoas na equipe", c.staff, { icone: IconeEquipe, detalhe: "Contas de equipe com acesso ativo", info: INFO_DO_DASHBOARD.equipe })}
      </Secao>
    </div>
  );
}

/* ───────────────────────────── gráficos ───────────────────────────── */

function SemDados({ titulo, descricao }: { readonly titulo: string; readonly descricao: string }) {
  return <Vazio titulo={titulo} descricao={descricao} />;
}

function seriesDiarias(m: MetricasDoAdminNoContrato) {
  const pedidos: PontoDeSerie[] = m.porDia.map((d) => ({
    chave: d.dia,
    rotulo: diaCurto(d.dia),
    valor: d.pedidos,
    texto: plural(d.pedidos, "pedido", "pedidos"),
  }));
  const faturamento: PontoDeSerie[] = m.porDia.map((d) => ({
    chave: d.dia,
    rotulo: diaCurto(d.dia),
    valor: d.faturamentoCentavos,
    texto: escreverDinheiro(d.faturamentoCentavos),
  }));
  return { pedidos, faturamento };
}

export function GraficosDoPainel({ m }: { readonly m: MetricasDoAdminNoContrato }) {
  const { pedidos, faturamento } = seriesDiarias(m);
  const semVendas = m.cartoes.pedidos.atual === 0;
  const marcas = marcasDoEixo(m.porDia.length);

  const semanas = (lista: { semana: string; quantidade: number }[], nome: string): PontoDeSerie[] =>
    lista.map((s) => ({
      chave: s.semana,
      rotulo: diaCurto(s.semana),
      valor: s.quantidade,
      texto: `${plural(s.quantidade, nome, `${nome}s`)} na semana de ${diaCurto(s.semana)}`,
    }));
  const lojasSemana = semanas(m.lojasNovasPorSemana, "loja");
  const clientesSemana = semanas(m.clientesNovosPorSemana, "cliente");
  const totalLojasSemana = lojasSemana.reduce((s, p) => s + p.valor, 0);
  const totalClientesSemana = clientesSemana.reduce((s, p) => s + p.valor, 0);

  const horas: PontoDeSerie[] = m.porHora.map((h) => ({
    chave: String(h.hora),
    rotulo: `${h.hora}h`,
    valor: h.pedidos,
    texto: `${plural(h.pedidos, "pedido", "pedidos")} às ${h.hora}h`,
  }));

  const totalDeLojas = m.porTipoDeNegocio.reduce((s, t) => s + t.lojas, 0);
  const tipos = m.porTipoDeNegocio.map((t) => ({
    chave: t.codigo,
    rotulo: t.nome,
    valor: t.lojas,
    texto: plural(t.lojas, "loja", "lojas"),
    secundario: `${plural(t.pedidos, "pedido", "pedidos")} no período${totalDeLojas > 0 && t.lojas > 0 ? ` · ${escreverPercentual((t.lojas / totalDeLojas) * 100)} das lojas` : ""}`,
  }));

  const ranking = (lista: MetricasDoAdminNoContrato["rankingPorFaturamento"], por: "faturamento" | "pedidos") =>
    lista.map((l) => ({
      chave: l.id,
      rotulo: l.nome,
      valor: por === "faturamento" ? l.faturamentoCentavos : l.pedidos,
      texto: por === "faturamento" ? escreverDinheiro(l.faturamentoCentavos) : plural(l.pedidos, "pedido", "pedidos"),
      secundario: por === "faturamento" ? plural(l.pedidos, "pedido", "pedidos") : escreverDinheiro(l.faturamentoCentavos),
      href: `/admin/lojas/${l.id}`,
    }));
  const comLink = (l: { rotulo: string; href?: string | undefined }) =>
    l.href ? (
      <Link href={l.href} className="underline-offset-2 hover:underline">
        {l.rotulo}
      </Link>
    ) : (
      l.rotulo
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-2">
        <Cartao titulo="Pedidos por dia" nivelDoTitulo={2} descricao={`${diaCompleto(m.periodo.inicio)} a ${diaCompleto(m.periodo.fim)}`}>
          {semVendas ? (
            <SemDados titulo="Nenhum pedido neste período" descricao="Escolha outro período ou aguarde as primeiras vendas." />
          ) : (
            <GraficoDeLinha pontos={pedidos} marcas={marcas} descricao="Pedidos por dia" textoDoPico="Evolução diária de pedidos" />
          )}
        </Cartao>
        <Cartao titulo="Faturamento por dia" nivelDoTitulo={2} descricao="Valor vendido, sem pedidos cancelados">
          {semVendas ? (
            <SemDados titulo="Nenhum faturamento neste período" descricao="Quando houver vendas, a evolução aparece aqui." />
          ) : (
            <GraficoDeLinha pontos={faturamento} marcas={marcas} descricao="Faturamento por dia" textoDoPico="Evolução diária do faturamento" />
          )}
        </Cartao>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-2">
        <Cartao titulo="Novas lojas por semana" nivelDoTitulo={2} descricao="Semanas começam na segunda-feira">
          {totalLojasSemana === 0 ? (
            <SemDados titulo="Nenhuma loja nova" descricao="Nenhum cadastro de loja neste período." />
          ) : (
            <GraficoDeColunas pontos={lojasSemana} descricao="Novas lojas por semana" />
          )}
        </Cartao>
        <Cartao titulo="Novos clientes por semana" nivelDoTitulo={2} descricao="Contas de cliente criadas">
          {totalClientesSemana === 0 ? (
            <SemDados titulo="Nenhum cliente novo" descricao="Nenhuma conta de cliente criada neste período." />
          ) : (
            <GraficoDeColunas pontos={clientesSemana} descricao="Novos clientes por semana" />
          )}
        </Cartao>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-2">
        <Cartao titulo="Lojas por tipo de negócio" nivelDoTitulo={2} descricao="Lojas ativas hoje">
          {tipos.length === 0 ? (
            <SemDados titulo="Sem lojas ativas" descricao="Quando houver lojas ativas, a distribuição aparece aqui." />
          ) : (
            <BarrasHorizontais linhas={tipos} descricao="Lojas por tipo de negócio" />
          )}
        </Cartao>
        <Cartao titulo="Pedidos por hora do dia" nivelDoTitulo={2} descricao="Horário de Fortaleza">
          {semVendas ? (
            <SemDados titulo="Sem pedidos para mostrar" descricao="Os horários de pico aparecem com as primeiras vendas." />
          ) : (
            <GraficoDeColunas pontos={horas} descricao="Pedidos por hora do dia" mostrarTodosOsRotulos={false} alturaDasColunas="h-32" />
          )}
        </Cartao>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-2">
        <Cartao titulo="Lojas por faturamento" nivelDoTitulo={2} descricao="As cinco que mais venderam no período">
          {m.rankingPorFaturamento.length === 0 ? (
            <SemDados titulo="Nenhuma venda" descricao="O ranking aparece quando uma loja vender no período." />
          ) : (
            <BarrasHorizontais linhas={ranking(m.rankingPorFaturamento, "faturamento")} descricao="Ranking de lojas por faturamento" renderizarRotulo={comLink} />
          )}
        </Cartao>
        <Cartao titulo="Lojas por pedidos" nivelDoTitulo={2} descricao="As cinco com mais pedidos no período">
          {m.rankingPorPedidos.length === 0 ? (
            <SemDados titulo="Nenhum pedido" descricao="O ranking aparece quando uma loja receber pedidos no período." />
          ) : (
            <BarrasHorizontais linhas={ranking(m.rankingPorPedidos, "pedidos")} descricao="Ranking de lojas por pedidos" renderizarRotulo={comLink} />
          )}
        </Cartao>
      </div>

      <Cartao titulo="Lojas mais novas" nivelDoTitulo={2} descricao="Os últimos cadastros da plataforma, de qualquer período">
        {m.lojasMaisNovas.length === 0 ? (
          <SemDados titulo="Nenhuma loja cadastrada" descricao="Cadastre a primeira loja para ela aparecer aqui." />
        ) : (
          <ul className="m-0 grid grid-cols-[minmax(0,1fr)] list-none gap-2 p-0">
            {m.lojasMaisNovas.map((l) => {
              const situacao = l.status as SituacaoDaLoja;
              return (
                <li
                  key={l.id}
                  data-loja={l.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[var(--raio-botao)] border border-borda bg-superficie px-4 py-3"
                >
                  <span className="min-w-0">
                    <Link href={`/admin/lojas/${l.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {l.nome}
                    </Link>
                    <span className="block text-xs text-tinta-suave">
                      {l.tipoDeNegocio} · cadastrada em {diaCompleto(new Date(l.criadaEm).toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" }))}
                    </span>
                  </span>
                  <Selo tom={TOM_DA_SITUACAO[situacao] ?? "neutro"}>
                    {ROTULOS_DAS_SITUACOES[situacao] ?? l.status}
                  </Selo>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}

/* ───────────────────────────── estados ───────────────────────────── */

export function EsqueletoDoPainel() {
  return (
    <div role="status" aria-live="polite" data-estado="carregando" className="grid gap-6">
      <span className="sc-so-leitor">Carregando os números da plataforma…</span>
      {[3, 4, 4].map((qtd, i) => (
        <div key={i} className="grid grid-cols-2 gap-4 min-[768px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {Array.from({ length: qtd }, (_, j) => (
            <EsqueletoDoCartao key={j} />
          ))}
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} aria-hidden="true" className="sc-cartao min-h-60">
            <span className="sc-esqueleto__linha !h-4 !w-1/3" />
            <span className="sc-esqueleto__linha !h-36 !w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CorpoDoPainel({
  estado,
  comparar,
  aoTentarDeNovo,
}: {
  readonly estado: EstadoDoPainel;
  readonly comparar: boolean;
  readonly aoTentarDeNovo: () => void;
}) {
  if (estado.fase === "erro") {
    return (
      <div data-estado="erro">
        <Erro
          titulo="Os números não carregaram"
          mensagem={estado.mensagem}
          acao={
            <Botao variante="secundaria" onClick={aoTentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        />
      </div>
    );
  }
  if (estado.fase === "carregando" && estado.anterior === null) {
    return <EsqueletoDoPainel />;
  }
  const m = estado.fase === "pronto" ? estado.metricas : estado.anterior;
  if (m === null) return <EsqueletoDoPainel />;
  const atualizando = estado.fase === "carregando";
  return (
    <div
      data-estado={atualizando ? "atualizando" : "pronto"}
      aria-busy={atualizando || undefined}
      className={`grid grid-cols-[minmax(0,1fr)] gap-8 transition-opacity ${atualizando ? "opacity-60" : ""}`}
    >
      {atualizando ? (
        <p role="status" className="flex items-center gap-2 text-sm text-tinta-suave">
          <IconeCarregando className="size-4 animate-spin" />
          Atualizando os números…
        </p>
      ) : null}
      {m.cartoes.lojasPendentes.atual > 0 ? (
        <Aviso
          tom="atencao"
          titulo={`${plural(m.cartoes.lojasPendentes.atual, "loja aguarda", "lojas aguardam")} aprovação`}
          acao={
            <Link className="sc-botao sc-botao--secundaria" href={ENDERECO_DAS_PENDENTES}>
              Ver pendentes
            </Link>
          }
        >
          Elas só entram na vitrine depois que a administração aprovar.
        </Aviso>
      ) : null}
      <CartoesDoPainel m={m} comparar={comparar} />
      <GraficosDoPainel m={m} />
    </div>
  );
}

/* ───────────────────────────── a tela ───────────────────────────── */

export function DashboardDoAdmin() {
  const hoje = useMemo(() => hojeNoFuso(), []);
  const [periodo, setPeriodo] = useState<PeriodoIso>(() => periodoDoAtalho("ultimos-30", hoje));
  const [comparacao, setComparacao] = useState<PeriodoIso | null>(null);
  const [comparar, setComparar] = useState(true);
  const { estado, tentarDeNovo } = useMetricasDoAdmin(periodo);

  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-7xl gap-8 px-4 pt-8 pb-12 sm:px-8 lg:pt-10 lg:pb-16">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] min-[540px]:text-4xl">
            Crescimento do SimpleClick
          </h1>
          <p className="mt-3 text-base leading-7 text-tinta-suave">
            {comparar
              ? `Comparando ${descreverPeriodo(periodo, hoje)} com o período anterior de mesmo tamanho.`
              : `Números de ${descreverPeriodo(periodo, hoje)}.`}
          </p>
        </div>
        <SeletorDePeriodo
          value={periodo}
          max={hoje}
          hoje={hoje}
          permitirComparacao
          comparacao={comparar ? (comparacao ?? { inicio: periodo.inicio, fim: periodo.fim }) : null}
          onChange={(novo, comp) => {
            setPeriodo(novo);
            setComparacao(comp);
            setComparar(comp !== null);
          }}
          rotulo="Período do painel"
        />
      </header>
      <CorpoDoPainel estado={estado} comparar={comparar} aoTentarDeNovo={tentarDeNovo} />
    </div>
  );
}

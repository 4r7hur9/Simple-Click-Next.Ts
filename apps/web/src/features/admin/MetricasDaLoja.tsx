"use client";

/**
 * Os números de uma loja na ficha (card #29): faturamento total e do período,
 * pedidos, clientes, produtos, categorias, ticket médio, último pedido e a
 * data do cadastro. Só contagens e somas: a administração vê o tamanho da
 * loja, não os clientes dela.
 */

import {
  esquemaDasMetricasDaLoja,
  PERIODOS_DA_FICHA_EM_DIAS,
  type MetricasDaLojaNoContrato,
} from "@simpleclick/contracts";
import {
  Botao,
  Cartao,
  Erro,
  Info,
  type ConteudoDoInfo,
} from "@simpleclick/ui";
import { useEffect, useState, type ReactNode } from "react";

import {
  dataCurta,
  dataEHora,
  inteiro,
  lerDaApi,
  reais,
  type LeituraDaApi,
} from "./apresentacao.ts";
import { INFO_DOS_NUMEROS_DA_LOJA } from "./explicacoes.ts";
import { PilulasDeFiltro } from "./PilulasDeFiltro.tsx";

function Indicador({
  titulo,
  valor,
  detalhe,
  destaque = false,
  info,
}: {
  readonly titulo: string;
  readonly valor: ReactNode;
  readonly detalhe?: ReactNode;
  readonly destaque?: boolean;
  readonly info?: ConteudoDoInfo;
}) {
  return (
    <div className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5">
      <p className="flex items-center gap-1 text-sm text-[var(--cor-tinta-suave)]">
        {titulo}
        {info !== undefined && <Info rotulo={titulo} conteudo={info} />}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums ${destaque ? "text-[var(--cor-primaria-texto)]" : ""}`}
      >
        {valor}
      </p>
      {detalhe !== undefined && (
        <p className="mt-1 text-xs text-[var(--cor-tinta-suave)]">{detalhe}</p>
      )}
    </div>
  );
}

const ROTULO_DO_PERIODO: Readonly<Record<number, string>> = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
  365: "1 ano",
};

/** Só desenha: recebe os números e o período escolhido. */
export function NumerosDaLoja({
  metricas,
}: {
  readonly metricas: MetricasDaLojaNoContrato;
}) {
  const periodo = ROTULO_DO_PERIODO[metricas.dias] ?? `${metricas.dias} dias`;
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Indicador
        destaque
        titulo="Faturamento total"
        info={INFO_DOS_NUMEROS_DA_LOJA.faturamentoTotal}
        valor={reais(metricas.faturamento.totalCentavos)}
        detalhe={`${inteiro(metricas.vendas.total)} vendas desde o cadastro`}
      />
      <Indicador
        titulo={`Faturamento (${periodo})`}
        valor={reais(metricas.faturamento.periodoCentavos)}
        detalhe={`${inteiro(metricas.vendas.periodo)} vendas no período`}
      />
      <Indicador
        titulo="Pedidos (total)"
        info={INFO_DOS_NUMEROS_DA_LOJA.pedidos}
        valor={inteiro(metricas.pedidos.total)}
        detalhe={`${inteiro(metricas.pedidos.periodo)} em ${periodo}`}
      />
      <Indicador
        titulo="Ticket médio"
        valor={
          metricas.ticketMedioCentavos === null
            ? "—"
            : reais(metricas.ticketMedioCentavos)
        }
        detalhe={
          metricas.ticketMedioCentavos === null
            ? "Ainda sem vendas"
            : "Faturamento dividido pelas vendas"
        }
      />
      <Indicador
        titulo="Clientes cadastrados"
        valor={inteiro(metricas.clientes)}
        info={INFO_DOS_NUMEROS_DA_LOJA.clientes}
      />
      <Indicador titulo="Produtos cadastrados" valor={inteiro(metricas.produtos)} />
      <Indicador titulo="Categorias cadastradas" valor={inteiro(metricas.categorias)} />
      <Indicador
        titulo="Último pedido"
        valor={
          metricas.ultimoPedidoEm === null
            ? "Nenhum"
            : dataCurta(metricas.ultimoPedidoEm)
        }
        detalhe={
          metricas.ultimoPedidoEm === null
            ? undefined
            : dataEHora(metricas.ultimoPedidoEm)
        }
      />
    </dl>
  );
}

export function MetricasDaLoja({ lojaId }: { readonly lojaId: string }) {
  const [dias, setDias] = useState<number>(30);
  const [leitura, setLeitura] = useState<
    LeituraDaApi<MetricasDaLojaNoContrato> | { readonly fase: "carregando" }
  >({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLeitura({ fase: "carregando" });
    void lerDaApi(
      `/api/admin/lojas/${encodeURIComponent(lojaId)}/metricas?dias=${dias}`,
      (corpo) => esquemaDasMetricasDaLoja.parse(corpo),
      "Não foi possível carregar os números da loja.",
    ).then((lida) => {
      if (vivo) setLeitura(lida);
    });
    return () => {
      vivo = false;
    };
  }, [lojaId, dias, tentativa]);

  return (
    <section aria-labelledby="numeros-da-loja" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2
          id="numeros-da-loja"
          className="text-2xl font-semibold tracking-[-0.02em]"
        >
          Números da loja
        </h2>
        <PilulasDeFiltro
          rotulo="Período do faturamento e dos pedidos"
          pilulas={PERIODOS_DA_FICHA_EM_DIAS.map((valor) => ({
            valor: String(valor),
            rotulo: ROTULO_DO_PERIODO[valor] ?? `${valor} dias`,
          }))}
          valor={String(dias)}
          aoEscolher={(valor) => setDias(Number(valor))}
        />
      </div>

      {leitura.fase === "carregando" && (
        <Cartao
          estado="carregando"
          esperaComEsqueleto
          rotuloDeEspera="Carregando os números da loja…"
        />
      )}
      {(leitura.fase === "erro" || leitura.fase === "nao-encontrada") && (
        <Erro
          titulo="Os números não carregaram"
          mensagem={
            leitura.fase === "erro"
              ? leitura.mensagem
              : "A loja não foi encontrada."
          }
          acao={
            <Botao
              variante="secundaria"
              onClick={() => setTentativa((n) => n + 1)}
            >
              Tentar de novo
            </Botao>
          }
        />
      )}
      {leitura.fase === "pronta" && (
        <>
          <NumerosDaLoja metricas={leitura.dados} />
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Cadastrada em {dataCurta(leitura.dados.cadastradaEm)}. Faturamento
            conta só pedidos aceitos pela loja; cancelados ficam de fora.
          </p>
        </>
      )}
    </section>
  );
}

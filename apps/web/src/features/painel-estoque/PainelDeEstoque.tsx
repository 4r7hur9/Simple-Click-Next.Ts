"use client";

/**
 * A página Estoque do catálogo (card #52): todas as variações de todos os
 * produtos numa lista só, com busca, filtro por categoria e situação, ordem,
 * os números do topo e o ajuste rápido na própria linha. O histórico de cada
 * produto continua na página do produto (`/painel/produtos/[id]/estoque`).
 *
 * PAGINADA NO SERVIDOR (card #76): a tela pede uma página de 50 linhas; a
 * busca, os filtros, a ordem, o total e os números do topo vêm prontos da API,
 * e a consulta fica no endereço (`?busca=&categoria=&situacao=&ordem=&pagina=`).
 */
import {
  Botao,
  Carregando,
  Erro,
  Seletor,
  Selo,
  Tabela,
  Vazio,
  type ColunaDaTabela,
  type TomDeSelo,
} from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { EXPLICACOES } from "../painel-catalogo/explicacoes.ts";
import {
  RotuloComInfo,
  descritoDoInfo,
} from "../painel-catalogo/RotuloComInfo.tsx";
import { Indicadores } from "./Indicadores.tsx";
import {
  CampoDeBusca,
  Paginacao,
  parametrosDaConsulta,
  useConsultaNaUrl,
  useLeituraMaisRecente,
} from "./lista-paginada.tsx";
import {
  estaAcabando,
  indicadoresDoEstoque,
  lerPaginaDaVisao,
  linhasDaPagina,
  linhasDeEstoque,
  minimoDoProduto,
  ORDENS_DO_ESTOQUE,
  ROTULO_DA_SITUACAO,
  type IndicadoresDoEstoque,
  type LinhaDaPagina,
  type LinhaDeEstoque,
  type OpcaoDeCategoria,
  type ProdutoNaVisao,
  type SituacaoDoEstoque,
} from "./visao-do-catalogo.ts";

const TOM_DA_SITUACAO: Readonly<Record<SituacaoDoEstoque, TomDeSelo>> = {
  falta: "erro",
  baixo: "atencao",
  normal: "sucesso",
  "sem-controle": "neutro",
};

/** O motivo que vai para o histórico quando a pessoa não escreve um. */
const MOTIVO_PADRAO = "Ajuste rápido na página de estoque";

interface PaginaCarregada {
  readonly produtos: readonly ProdutoNaVisao[];
  readonly linhas: readonly LinhaDaPagina[];
  readonly categorias: readonly OpcaoDeCategoria[];
  readonly indicadores: IndicadoresDoEstoque;
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly totalDePaginas: number;
  readonly totalDaLoja: number;
}

type Estado =
  | { readonly tipo: "carregando"; readonly anterior?: PaginaCarregada }
  | { readonly tipo: "erro" }
  | ({ readonly tipo: "ok" } & PaginaCarregada);

const CONSULTA_PADRAO = {
  busca: "",
  categoria: "",
  situacao: "",
  ordem: "situacao",
  pagina: "1",
} as const;

/**
 * Os números do topo depois de uma mudança na tela: tira a conta do produto
 * como estava e põe a de agora, sem reler a loja inteira.
 */
function ajustarIndicadores(
  numeros: IndicadoresDoEstoque,
  antes: ProdutoNaVisao,
  depois: ProdutoNaVisao,
): IndicadoresDoEstoque {
  const velho = indicadoresDoEstoque(linhasDeEstoque([antes]));
  const novo = indicadoresDoEstoque(linhasDeEstoque([depois]));
  return {
    emFalta: numeros.emFalta - velho.emFalta + novo.emFalta,
    estoqueBaixo: numeros.estoqueBaixo - velho.estoqueBaixo + novo.estoqueBaixo,
    totalDeItens: numeros.totalDeItens - velho.totalDeItens + novo.totalDeItens,
    valorEstimadoCentavos:
      numeros.valorEstimadoCentavos -
      velho.valorEstimadoCentavos +
      novo.valorEstimadoCentavos,
  };
}

/** Troca uma variação (ou todas de um produto) sem reler a lista inteira. */
function trocarVariacoes(
  produtos: readonly ProdutoNaVisao[],
  produtoId: string,
  mudar: (
    variacao: ProdutoNaVisao["variacoes"][number],
  ) => ProdutoNaVisao["variacoes"][number],
): ProdutoNaVisao[] {
  return produtos.map((produto) =>
    produto.id === produtoId
      ? { ...produto, variacoes: produto.variacoes.map(mudar) }
      : produto,
  );
}

function AjusteRapido({
  linha,
  aoAjustar,
}: {
  readonly linha: LinhaDeEstoque;
  readonly aoAjustar: (quantidade: number) => void;
}) {
  const salva = linha.variacao.quantidade;
  const [valor, setValor] = useState(salva === null ? "" : String(salva));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    setValor(salva === null ? "" : String(salva));
  }, [salva]);

  if (salva === null) {
    return (
      <span className="text-sm text-[var(--cor-tinta-suave)]">
        Não conta unidades
      </span>
    );
  }

  const nome = linha.unica
    ? linha.produto.nome
    : `${linha.produto.nome}, ${linha.variacao.nome}`;
  const numero = Number(valor);
  const valido = valor !== "" && Number.isInteger(numero) && numero >= 0;
  const mudou = valido && numero !== salva;

  function somar(delta: number) {
    const base = valido ? numero : (salva ?? 0);
    setValor(String(Math.max(base + delta, 0)));
    setFalha(null);
  }

  async function salvar() {
    if (!mudou) return;
    setSalvando(true);
    setFalha(null);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${linha.produto.id}/variacoes/${linha.variacao.id}/estoque`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quantidadeAlvo: numero,
            motivo: motivo.trim() === "" ? MOTIVO_PADRAO : motivo.trim(),
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setMotivo("");
      aoAjustar(numero);
    } catch {
      setFalha("Não salvou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      className="flex flex-col items-end gap-2"
      aria-label={`Ajustar o estoque de ${nome}`}
      onSubmit={(evento) => {
        evento.preventDefault();
        void salvar();
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="sc-botao sc-botao--secundaria sc-botao--pequeno min-w-10"
          aria-label={`Tirar 1 de ${nome}`}
          onClick={() => somar(-1)}
          disabled={salvando || (valido ? numero : salva) <= 0}
        >
          −
        </button>
        <input
          className="sc-campo__controle w-20! text-center"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          aria-label={`Quantidade de ${nome}`}
          value={valor}
          onChange={(evento) => {
            setValor(evento.target.value);
            setFalha(null);
          }}
        />
        <button
          type="button"
          className="sc-botao sc-botao--secundaria sc-botao--pequeno min-w-10"
          aria-label={`Pôr mais 1 em ${nome}`}
          onClick={() => somar(1)}
          disabled={salvando}
        >
          +
        </button>
      </div>
      {mudou ? (
        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className="grid gap-1 text-start text-xs font-medium">
            Motivo do ajuste (opcional)
            <input
              className="sc-campo__controle w-48!"
              aria-label={`Motivo do ajuste de ${nome} (opcional)`}
              placeholder="Ex.: chegou mercadoria"
              maxLength={500}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
          </label>
          <button
            type="submit"
            className="sc-botao sc-botao--primaria sc-botao--pequeno"
            disabled={salvando}
          >
            {salvando
              ? "Salvando…"
              : `Salvar ${numero - salva > 0 ? "+" : ""}${numero - salva}`}
          </button>
          <button
            type="button"
            className="sc-botao sc-botao--discreta sc-botao--pequeno"
            onClick={() => {
              setValor(String(salva));
              setMotivo("");
            }}
            disabled={salvando}
          >
            Desfazer
          </button>
        </div>
      ) : null}
      {falha !== null ? (
        <p role="alert" className="text-sm text-[var(--cor-erro)]">
          {falha}
        </p>
      ) : null}
    </form>
  );
}

function AvisoDoProduto({
  produto,
  aoGravar,
}: {
  readonly produto: ProdutoNaVisao;
  readonly aoGravar: (minimo: number | null) => void;
}) {
  const idDoAviso = useId();
  const atual = minimoDoProduto(produto);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(atual === null ? "" : String(atual));
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState(false);
  const controla = produto.variacoes.some((v) => v.quantidade !== null);
  const variasVariacoes = produto.variacoes.length > 1;

  if (!controla) {
    return <span className="text-sm text-[var(--cor-tinta-suave)]">—</span>;
  }

  async function gravar(minimo: number | null) {
    setSalvando(true);
    setFalha(false);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produto.id}/estoque/alerta`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ minimoAlerta: minimo }),
        },
      );
      if (!resposta.ok) throw new Error();
      aoGravar(minimo);
      setEditando(false);
    } catch {
      setFalha(true);
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm">
          {atual === null
            ? produto.variacoes.some((v) => v.minimoAlerta !== null)
              ? "Varia por variação"
              : "Sem aviso"
            : `Com ${atual} ou menos`}
        </span>
        <button
          type="button"
          className="sc-botao sc-botao--discreta sc-botao--pequeno"
          aria-label={`Mudar o aviso de estoque baixo de ${produto.nome}`}
          onClick={() => {
            setValor(atual === null ? "" : String(atual));
            setEditando(true);
          }}
        >
          Mudar
        </button>
      </span>
    );
  }

  const numero = Number(valor);
  const valido = valor !== "" && Number.isInteger(numero) && numero >= 0;
  return (
    <form
      className="flex flex-col items-end gap-2"
      aria-label={`Alerta de estoque mínimo de ${produto.nome}`}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (valido) void gravar(numero);
      }}
    >
      <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <RotuloComInfo
          htmlFor={`${idDoAviso}-minimo`}
          nome="Alerta de estoque mínimo"
          info={EXPLICACOES.alertaDoProduto}
        >
          Mínimo (unidades)
        </RotuloComInfo>
        <input
          id={`${idDoAviso}-minimo`}
          aria-describedby={descritoDoInfo(
            `${idDoAviso}-minimo`,
            EXPLICACOES.alertaDoProduto,
          )}
          className="sc-campo__controle w-20! text-center"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          autoFocus
        />
      </span>
      {variasVariacoes ? (
        <p className="text-xs text-[var(--cor-tinta-suave)]">
          Vale para todas as variações do produto.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          className="sc-botao sc-botao--primaria sc-botao--pequeno"
          disabled={!valido || salvando}
        >
          Salvar
        </button>
        {atual !== null ||
        produto.variacoes.some((v) => v.minimoAlerta !== null) ? (
          <button
            type="button"
            className="sc-botao sc-botao--secundaria sc-botao--pequeno"
            onClick={() => void gravar(null)}
            disabled={salvando}
          >
            Tirar aviso
          </button>
        ) : null}
        <button
          type="button"
          className="sc-botao sc-botao--discreta sc-botao--pequeno"
          onClick={() => setEditando(false)}
          disabled={salvando}
        >
          Cancelar
        </button>
      </div>
      {falha ? (
        <p role="alert" className="text-sm text-[var(--cor-erro)]">
          Não salvou. Tente de novo.
        </p>
      ) : null}
    </form>
  );
}

export function PainelDeEstoque() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [consulta, mudar] = useConsultaNaUrl(CONSULTA_PADRAO);
  const [aviso, setAviso] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const lerMaisRecente = useLeituraMaisRecente();

  const carregar = useCallback(async () => {
    if (consulta === null) return;
    setEstado((anterior) => ({
      tipo: "carregando",
      ...(anterior.tipo === "ok"
        ? { anterior: anterior }
        : anterior.tipo === "carregando" && anterior.anterior
          ? { anterior: anterior.anterior }
          : {}),
    }));
    try {
      const { resultado, valeu } = await lerMaisRecente(() =>
        lerPaginaDaVisao(
          "estoque",
          parametrosDaConsulta(consulta, CONSULTA_PADRAO),
        ),
      );
      if (!valeu) return;
      setEstado({
        tipo: "ok",
        produtos: resultado.produtos,
        linhas: resultado.linhas ?? [],
        categorias: resultado.categorias,
        indicadores: resultado.indicadores as unknown as IndicadoresDoEstoque,
        pagina: resultado.pagina,
        porPagina: resultado.porPagina,
        total: resultado.total,
        totalDePaginas: resultado.totalDePaginas,
        totalDaLoja: resultado.totalDaLoja ?? resultado.total,
      });
    } catch {
      setEstado({ tipo: "erro" });
    }
  }, [consulta, lerMaisRecente]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  // Mostra a página anterior enquanto a próxima chega: a tabela não pisca.
  const pagina: PaginaCarregada | null =
    estado.tipo === "ok"
      ? estado
      : estado.tipo === "carregando"
        ? (estado.anterior ?? null)
        : null;
  const linhas = pagina === null ? [] : linhasDaPagina(pagina.linhas, pagina.produtos);

  function mudarProduto(
    produtoId: string,
    trocar: (
      variacao: ProdutoNaVisao["variacoes"][number],
    ) => ProdutoNaVisao["variacoes"][number],
  ) {
    setEstado((anterior) => {
      if (anterior.tipo !== "ok") return anterior;
      const antes = anterior.produtos.find((p) => p.id === produtoId);
      if (antes === undefined) return anterior;
      const produtos = trocarVariacoes(anterior.produtos, produtoId, trocar);
      const depois = produtos.find((p) => p.id === produtoId)!;
      return {
        ...anterior,
        produtos,
        indicadores: ajustarIndicadores(anterior.indicadores, antes, depois),
      };
    });
  }

  function ajustou(linha: LinhaDeEstoque, quantidade: number) {
    mudarProduto(linha.produto.id, (variacao) =>
      variacao.id === linha.variacao.id
        ? {
            ...variacao,
            quantidade,
            estoqueBaixo: estaAcabando(quantidade, variacao.minimoAlerta),
          }
        : variacao,
    );
    setAviso(
      `Estoque de ${linha.unica ? linha.produto.nome : `${linha.produto.nome}, ${linha.variacao.nome}`} ajustado para ${quantidade}. O movimento ficou no histórico.`,
    );
  }

  function gravouAviso(produto: ProdutoNaVisao, minimo: number | null) {
    mudarProduto(produto.id, (variacao) =>
      variacao.quantidade === null
        ? variacao
        : {
            ...variacao,
            minimoAlerta: minimo,
            estoqueBaixo: estaAcabando(variacao.quantidade, minimo),
          },
    );
    setAviso(
      minimo === null
        ? `${produto.nome} não avisa mais de estoque baixo.`
        : `${produto.nome} avisa quando chegar a ${minimo} unidade(s) ou menos.`,
    );
  }

  function filtrar(mudanca: Partial<Record<keyof typeof CONSULTA_PADRAO, string>>) {
    setAviso("");
    mudar(mudanca);
  }

  const colunas: readonly ColunaDaTabela<LinhaDeEstoque>[] = [
    {
      chave: "produto",
      titulo: "Produto",
      celula: (linha) => (
        <div className="min-w-0 max-w-sm text-start">
          <Link
            className="font-semibold text-[var(--cor-tinta)] no-underline hover:underline"
            href={`/painel/produtos/${linha.produto.id}`}
          >
            {linha.produto.nome}
          </Link>
          {!linha.unica ? (
            <p className="mt-0.5 text-[var(--cor-tinta)]">
              {linha.variacao.nome}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm text-[var(--cor-tinta-suave)]">
            {linha.variacao.sku ? `SKU ${linha.variacao.sku} · ` : ""}
            {linha.variacao.precoCentavos === null
              ? "Sem preço"
              : escreverDinheiro(linha.variacao.precoCentavos)}
            {" · "}
            <Link
              className="font-semibold"
              href={`/painel/produtos/${linha.produto.id}/estoque`}
            >
              Histórico
            </Link>
          </p>
        </div>
      ),
    },
    {
      chave: "categoria",
      titulo: "Categoria",
      celula: (linha) => linha.produto.categoriaNome ?? "Sem categoria",
    },
    {
      chave: "situacao",
      titulo: "Situação",
      celula: (linha) => (
        <Selo tom={TOM_DA_SITUACAO[linha.situacao]}>
          {ROTULO_DA_SITUACAO[linha.situacao]}
        </Selo>
      ),
    },
    {
      chave: "estoque",
      titulo: "Estoque (unidades)",
      alinhamento: "fim",
      celula: (linha) => (
        <AjusteRapido
          linha={linha}
          aoAjustar={(quantidade) => ajustou(linha, quantidade)}
        />
      ),
    },
    {
      chave: "aviso",
      titulo: "Alerta de estoque mínimo",
      alinhamento: "fim",
      celula: (linha) => (
        <AvisoDoProduto
          key={`${linha.produto.id}:${minimoDoProduto(linha.produto) ?? "x"}`}
          produto={linha.produto}
          aoGravar={(minimo) => gravouAviso(linha.produto, minimo)}
        />
      ),
    },
  ];

  if (pagina === null && estado.tipo !== "erro") {
    return (
      <div className="mt-8" aria-busy="true">
        <Carregando rotulo="Carregando o estoque…" />
      </div>
    );
  }

  if (estado.tipo === "erro" || pagina === null || consulta === null) {
    return (
      <div className="mt-8">
        <Erro
          titulo="Não foi possível carregar o estoque"
          mensagem="Confira a conexão e tente de novo. Nada foi alterado."
          acao={
            <Botao
              variante="secundaria"
              onClick={() => setTentativa((anterior) => anterior + 1)}
            >
              Tentar de novo
            </Botao>
          }
        />
      </div>
    );
  }

  if (pagina.totalDaLoja === 0) {
    return (
      <div className="mt-8">
        <Vazio
          titulo="Nenhum produto ainda"
          descricao="Cadastre um produto para começar a contar o estoque."
          acao={
            <Link
              className="sc-botao sc-botao--primaria"
              href="/painel/produtos/novo"
            >
              Cadastrar produto
            </Link>
          }
        />
      </div>
    );
  }

  const numeros = pagina.indicadores;
  const atualizando = estado.tipo === "carregando";

  return (
    <>
      <Indicadores
        rotulo="Resumo do estoque"
        itens={[
          {
            rotulo: "Itens em falta",
            valor: numeros.emFalta.toLocaleString("pt-BR"),
            detalhe: "com zero unidade",
            ...(numeros.emFalta > 0 ? { tom: "erro" as const } : {}),
          },
          {
            rotulo: "Estoque baixo",
            valor: numeros.estoqueBaixo.toLocaleString("pt-BR"),
            detalhe: "no aviso ou abaixo dele",
            ...(numeros.estoqueBaixo > 0 ? { tom: "atencao" as const } : {}),
          },
          {
            rotulo: "Total de itens",
            valor: numeros.totalDeItens.toLocaleString("pt-BR"),
            detalhe: "unidades contadas",
          },
          {
            rotulo: "Valor estimado em estoque",
            valor: escreverDinheiro(numeros.valorEstimadoCentavos),
            detalhe: "pelo preço de venda de hoje",
          },
        ]}
      />

      <section aria-labelledby="lista-do-estoque" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="lista-do-estoque" className="text-2xl font-semibold">
            Produtos e variações
          </h2>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {aviso === ""
              ? `${pagina.total.toLocaleString("pt-BR")} de ${pagina.totalDaLoja.toLocaleString("pt-BR")} item(ns)`
              : aviso}
          </p>
        </div>

        <div
          role="search"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
          <CampoDeBusca
            valor={consulta.busca}
            placeholder="Nome, variação ou SKU"
            aoBuscar={(busca) => filtrar({ busca })}
          />
          <label className="grid gap-1">
            <span className="text-sm font-medium">Categoria</span>
            <Seletor
              className="min-h-12"
              value={consulta.categoria}
              onChange={(categoria) => filtrar({ categoria })}
              opcoes={[{ valor: "", rotulo: "Todas" }, ...pagina.categorias]}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Situação</span>
            <Seletor
              className="min-h-12"
              value={consulta.situacao}
              onChange={(situacao) => filtrar({ situacao })}
              opcoes={[
                { valor: "", rotulo: "Todas" },
                ...(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoEstoque[]).map(
                  (valor) => ({ valor, rotulo: ROTULO_DA_SITUACAO[valor] }),
                ),
              ]}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Ordenar por</span>
            <Seletor
              className="min-h-12"
              value={consulta.ordem}
              onChange={(ordem) => filtrar({ ordem })}
              opcoes={ORDENS_DO_ESTOQUE.map(([valor, rotulo]) => ({
                valor,
                rotulo,
              }))}
            />
          </label>
        </div>

        <div className="mt-6" aria-busy={atualizando || undefined}>
          {linhas.length === 0 && !atualizando ? (
            <Vazio
              titulo="Nada com esse filtro"
              descricao="Mude a busca, a categoria ou a situação."
              acao={
                <Botao
                  variante="secundaria"
                  onClick={() =>
                    filtrar({ busca: "", categoria: "", situacao: "" })
                  }
                >
                  Limpar filtros
                </Botao>
              }
            />
          ) : (
            <div className={atualizando ? "opacity-60 transition-opacity" : ""}>
              <Tabela
                legenda="Estoque de produtos e variações"
                legendaEscondida
                colunas={colunas}
                linhas={linhas}
                chaveDaLinha={(linha) => linha.chave}
                noCelular="cartoes"
              />
            </div>
          )}
          <Paginacao
            paginacao={pagina}
            item="itens"
            aoIr={(numero) => {
              mudar({ pagina: String(numero) });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      </section>
    </>
  );
}

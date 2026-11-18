"use client";

/**
 * A lista de produtos do painel.
 *
 * PAGINADA NO SERVIDOR (card #76): loja com dez mil produtos não cabe numa
 * tabela só. A tela pede uma página de 50 (`/api/catalogo/produtos?pagina=`),
 * e a busca, os filtros (categoria, situação, marca), a ordem, o total e os
 * atalhos ("acabando", "com atacado") vêm prontos do banco. A consulta fica no
 * endereço, para voltar, recarregar ou mandar o link sem perder o filtro.
 */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Botao,
  Carregando,
  IconeAdicionar,
  IconeEditar,
  IconeExcluir,
  IconeMostrar,
  IconeOcultar,
  MenuSuspenso,
  Selo,
  Tabela,
  Vazio,
  type ColunaDaTabela,
} from "@simpleclick/ui";

import { lerReais } from "../../lib/filtros-do-painel.ts";
import {
  Atalho,
  BarraDeFiltros,
  type Filtro,
} from "../painel-filtros/BarraDeFiltros.tsx";
import {
  Paginacao,
  parametrosDaConsulta,
  useConsultaNaUrl,
  useLeituraMaisRecente,
  type PaginacaoDaLista,
} from "../painel-estoque/lista-paginada.tsx";

/**
 * CARTÕES NO CELULAR, TABELA NO COMPUTADOR (card 112, AC-11218; card 133). A tabela de
 * seis colunas não cabe em 344px, e virar `display: block` por CSS ainda deixa
 * uma `<table>` para o leitor de tela anunciar linhas e colunas que não existem
 * mais na tela. Abaixo de 48rem (a mesma quebra da barra de baixo do painel) a
 * lista é desenhada como cartões empilhados; acima, continua a tabela.
 *
 * A consulta pergunta "é celular?": sem `matchMedia`, ou quando ela não casa
 * (servidor, jsdom), vale a tabela. Os produtos chegam depois da hidratação,
 * quando a largura de verdade já é conhecida.
 */
const CONSULTA_DO_CELULAR = "(max-width: 47.99rem)";

function assinarLargura(avisar: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const consulta = window.matchMedia(CONSULTA_DO_CELULAR);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

function estaNoCelular(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(CONSULTA_DO_CELULAR).matches
  );
}

function useNoCelular(): boolean {
  return useSyncExternalStore(assinarLargura, estaNoCelular, () => false);
}

interface Produto {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
  readonly descricao: string | null;
  readonly categoriaId: string | null;
  readonly categoriaNome: string | null;
  readonly precoCentavos: number | null;
  readonly status: "DRAFT" | "PUBLISHED" | string;
  readonly disponivel: boolean;
  /**
   * Pedido mínimo de atacado (a menor faixa ativa); nulo ou ausente = só
   * varejo. Vem da API de cadastro das faixas (card #54).
   */
  readonly pedidoMinimoDeAtacado?: number | null;
  /** Alguma variação chegou ao aviso de estoque mínimo (AC-336). */
  readonly estoqueBaixo?: boolean;
  /** Soma do estoque das variações que controlam; nulo = nenhuma controla. */
  readonly estoqueTotal?: number | null;
  readonly temVideo?: boolean;
  readonly publicarNoFeed?: boolean;
  readonly variacoesAcabando?: readonly {
    readonly id: string;
    readonly nome: string;
    readonly quantidade: number;
    readonly minimoAlerta: number;
  }[];
}

interface PaginaDeProdutos extends PaginacaoDaLista {
  readonly produtos: readonly Produto[];
  /** Contagens da loja toda, para os atalhos. */
  readonly resumo: {
    readonly todos: number;
    readonly estoqueBaixo: number;
    readonly comAtacado: number;
  };
  readonly categorias: readonly { readonly valor: string; readonly rotulo: string }[];
  /** As marcas que aparecem nos produtos (vazio: o filtro some). */
  readonly marcas: readonly string[];
}

const CONSULTA_PADRAO = {
  busca: "",
  categoria: "",
  situacao: "",
  estoque: "",
  video: "",
  feed: "",
  precoMin: "",
  precoMax: "",
  marca: "",
  ordem: "manual",
  pagina: "1",
} as const;

const OPCOES_DE_SITUACAO = [
  { valor: "", rotulo: "Todos" },
  { valor: "publicado", rotulo: "Ativos (na vitrine)" },
  { valor: "indisponivel", rotulo: "Inativos (pausados)" },
  { valor: "rascunho", rotulo: "Rascunhos" },
  { valor: "atacado", rotulo: "Com preço de atacado" },
] as const;

const OPCOES_DE_ESTOQUE = [
  { valor: "", rotulo: "Todos" },
  { valor: "em-estoque", rotulo: "Em estoque" },
  { valor: "baixo", rotulo: "Estoque baixo" },
  { valor: "esgotado", rotulo: "Esgotados" },
] as const;

const OPCOES_DE_VIDEO = [
  { valor: "", rotulo: "Tanto faz" },
  { valor: "com", rotulo: "Com vídeo" },
  { valor: "sem", rotulo: "Sem vídeo" },
] as const;

const OPCOES_DE_FEED = [
  { valor: "", rotulo: "Tanto faz" },
  { valor: "sim", rotulo: "Publicados no feed" },
  { valor: "nao", rotulo: "Fora do feed" },
] as const;

const OPCOES_DE_ORDEM = [
  { valor: "manual", rotulo: "Ordem do cardápio" },
  { valor: "nome", rotulo: "Nome (A a Z)" },
  { valor: "nome-desc", rotulo: "Nome (Z a A)" },
  { valor: "preco", rotulo: "Menor preço" },
  { valor: "preco-desc", rotulo: "Maior preço" },
  { valor: "estoque", rotulo: "Menor estoque" },
  { valor: "estoque-desc", rotulo: "Maior estoque" },
  { valor: "vendidos", rotulo: "Mais vendidos" },
  { valor: "recentes", rotulo: "Mais recentes" },
] as const;

const LIMPO = {
  busca: "",
  categoria: "",
  situacao: "",
  estoque: "",
  video: "",
  feed: "",
  precoMin: "",
  precoMax: "",
  marca: "",
} as const;

type ConsultaDaLista = Record<keyof typeof CONSULTA_PADRAO, string>;

/** Quantos filtros estão ligados (a busca e a ordem não contam). */
function ligados(consulta: ConsultaDaLista): number {
  return [
    consulta.categoria,
    consulta.situacao,
    consulta.estoque,
    consulta.video,
    consulta.feed,
    consulta.marca,
    consulta.precoMin !== "" || consulta.precoMax !== "" ? "faixa" : "",
  ].filter((valor) => valor !== "").length;
}

function filtros(
  consulta: ConsultaDaLista,
  pagina: PaginaDeProdutos,
  mudar: (mudanca: Partial<ConsultaDaLista>) => void,
): readonly Filtro[] {
  return [
    {
      tipo: "selecao",
      id: "categoria",
      rotulo: "Categoria",
      valor: consulta.categoria,
      opcoes: [{ valor: "", rotulo: "Todas" }, ...pagina.categorias],
      aoMudar: (categoria) => mudar({ categoria }),
    },
    {
      tipo: "selecao",
      id: "situacao",
      rotulo: "Situação",
      valor: consulta.situacao,
      opcoes: OPCOES_DE_SITUACAO,
      aoMudar: (situacao) => mudar({ situacao }),
    },
    {
      tipo: "selecao",
      id: "estoque",
      rotulo: "Estoque",
      valor: consulta.estoque,
      opcoes: OPCOES_DE_ESTOQUE,
      aoMudar: (estoque) => mudar({ estoque }),
    },
    {
      tipo: "selecao",
      id: "video",
      rotulo: "Vídeo",
      valor: consulta.video,
      opcoes: OPCOES_DE_VIDEO,
      aoMudar: (video) => mudar({ video }),
    },
    {
      tipo: "selecao",
      id: "feed",
      rotulo: "Feed",
      valor: consulta.feed,
      opcoes: OPCOES_DE_FEED,
      aoMudar: (feed) => mudar({ feed }),
    },
    {
      tipo: "faixa",
      id: "preco",
      rotulo: "Preço (R$)",
      minimo: consulta.precoMin,
      maximo: consulta.precoMax,
      aoMudar: (precoMin, precoMax) => mudar({ precoMin, precoMax }),
    },
    ...(pagina.marcas.length > 0
      ? [
          {
            tipo: "selecao" as const,
            id: "marca",
            rotulo: "Marca",
            valor: consulta.marca,
            opcoes: [
              { valor: "", rotulo: "Todas" },
              ...pagina.marcas.map((marca) => ({ valor: marca, rotulo: marca })),
            ],
            aoMudar: (marca: string) => mudar({ marca }),
          },
        ]
      : []),
  ];
}

function dinheiro(centavos: number | null): string {
  if (centavos === null) return "Sem preço";
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ListaProdutos() {
  const [consulta, mudar] = useConsultaNaUrl(CONSULTA_PADRAO);
  const [pagina, setPagina] = useState<PaginaDeProdutos | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Só o retorno das ações (publicar, duplicar…); a contagem fica na barra.
  const [mensagem, setMensagem] = useState("");
  // Erro de leitura não pode se disfarçar de "nenhum produto" (P-011): o dono
  // cadastraria de novo o que já existe.
  const [falhou, setFalhou] = useState(false);
  // Remover pede confirmação na própria linha, e não em caixa do navegador.
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const lerMaisRecente = useLeituraMaisRecente();
  const produtos = pagina?.produtos ?? [];
  // A visão do que está acabando e a de quem tem atacado (#59) são recortes
  // desta mesma lista (AC-336), agora contados e filtrados no servidor.
  const soAcabando = consulta?.estoque === "baixo";
  const soAtacado = consulta?.situacao === "atacado";

  const carregar = useCallback(async () => {
    if (consulta === null) return;
    setCarregando(true);
    setFalhou(false);
    try {
      const parametros = parametrosDaConsulta(consulta, CONSULTA_PADRAO);
      // Com `pagina` a API pagina; sem ela, devolveria a loja inteira.
      parametros.set("pagina", consulta.pagina);
      // A faixa de preço é digitada em reais e vai para a API em centavos.
      parametros.delete("precoMin");
      parametros.delete("precoMax");
      const minimo = lerReais(consulta.precoMin);
      const maximo = lerReais(consulta.precoMax);
      if (minimo !== null) parametros.set("precoMin", String(minimo));
      if (maximo !== null) parametros.set("precoMax", String(maximo));
      const { resultado, valeu } = await lerMaisRecente(async () => {
        const resposta = await fetch(
          `/api/catalogo/produtos?${parametros.toString()}`,
          { cache: "no-store" },
        );
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as PaginaDeProdutos;
      });
      if (!valeu) return;
      setPagina(resultado);
      setMensagem("");
      setCarregando(false);
    } catch {
      setFalhou(true);
      setMensagem("Não foi possível carregar os produtos.");
      setCarregando(false);
    }
  }, [consulta, lerMaisRecente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Links antigos (`?situacao=esgotado|estoque-baixo`) viraram o filtro de estoque.
  useEffect(() => {
    if (consulta?.situacao === "esgotado") {
      mudar({ situacao: "", estoque: "esgotado" });
    } else if (consulta?.situacao === "estoque-baixo") {
      mudar({ situacao: "", estoque: "baixo" });
    }
  }, [consulta?.situacao, mudar]);

  async function alternarPublicacao(produto: Produto) {
    const publicado = produto.status === "PUBLISHED";
    const resposta = await fetch(`/api/catalogo/produtos/${produto.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: publicado ? "DRAFT" : "PUBLISHED",
        disponivel: produto.disponivel,
      }),
    });
    if (!resposta.ok) {
      setMensagem("Não foi possível alterar a publicação.");
      return;
    }
    setPagina((anterior) =>
      anterior === null
        ? anterior
        : {
            ...anterior,
            produtos: anterior.produtos.map((item) =>
              item.id === produto.id
                ? { ...item, status: publicado ? "DRAFT" : "PUBLISHED" }
                : item,
            ),
          },
    );
    setMensagem(
      publicado
        ? "Produto voltou para rascunho."
        : "Produto publicado na vitrine.",
    );
  }

  async function duplicar(produto: Produto) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produto.id}/duplicar`,
      { method: "POST" },
    );
    if (!resposta.ok) {
      setMensagem("Não foi possível duplicar o produto.");
      return;
    }
    await carregar();
    setMensagem("Duplicata criada como rascunho.");
  }

  async function remover(produto: Produto) {
    const resposta = await fetch(`/api/catalogo/produtos/${produto.id}`, {
      method: "DELETE",
    });
    setRemovendoId(null);
    if (!resposta.ok) {
      setMensagem("Não foi possível remover o produto.");
      return;
    }
    // Relê a página: o próximo produto sobe para ocupar o lugar.
    await carregar();
    setMensagem("Produto removido. Pedidos antigos continuam preservados.");
  }

  const noCelular = useNoCelular();

  const colunas: readonly ColunaDaTabela<Produto>[] = [
    {
      chave: "produto",
      titulo: "Produto",
      celula: (produto) => (
        <div className="min-w-0 max-w-md text-start">
          <Link
            className="font-semibold text-[var(--cor-tinta)] no-underline hover:underline"
            href={`/painel/produtos/${produto.id}`}
          >
            {produto.nome}
          </Link>
          <p className="mt-0.5 line-clamp-1 text-[var(--cor-tinta-suave)]">
            {produto.descricao ?? "Sem descrição"}
          </p>
          {produto.estoqueBaixo && produto.variacoesAcabando ? (
            <p className="mt-1">
              Acabando:{" "}
              {produto.variacoesAcabando
                .map(
                  (v) =>
                    `${v.nome} com ${v.quantidade} un. (aviso em ${v.minimoAlerta})`,
                )
                .join(" · ")}{" "}
              <Link
                className="font-semibold"
                href={`/painel/produtos/${produto.id}/estoque`}
              >
                Repor estoque
              </Link>
            </p>
          ) : null}
          {removendoId === produto.id ? (
            <div
              role="group"
              aria-label={`Confirmar a remoção de ${produto.nome}`}
              className="mt-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] bg-[var(--cor-erro-suave)] p-3"
            >
              <p>
                {produto.nome} sai do catálogo e da vitrine. Pedidos que já o
                incluíram continuam como foram feitos.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="sc-botao sc-botao--perigo sc-botao--pequeno"
                  type="button"
                  onClick={() => void remover(produto)}
                >
                  Confirmar remoção
                </button>
                <button
                  className="sc-botao sc-botao--secundaria sc-botao--pequeno"
                  type="button"
                  onClick={() => setRemovendoId(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      chave: "categoria",
      titulo: "Categoria",
      celula: (produto) => produto.categoriaNome ?? "Sem categoria",
    },
    {
      chave: "preco",
      titulo: "Preço",
      alinhamento: "fim",
      celula: (produto) => dinheiro(produto.precoCentavos),
    },
    {
      chave: "estoque",
      titulo: "Estoque",
      alinhamento: "fim",
      celula: (produto) =>
        produto.estoqueTotal === undefined || produto.estoqueTotal === null
          ? "—"
          : produto.estoqueTotal.toLocaleString("pt-BR"),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      celula: (produto) => (
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          {produto.status === "PUBLISHED" ? (
            <Selo tom="sucesso">Publicado</Selo>
          ) : (
            <Selo>Rascunho</Selo>
          )}
          {!produto.disponivel ? <Selo tom="atencao">Pausado</Selo> : null}
          {produto.estoqueBaixo ? (
            <Selo tom="atencao">Estoque baixo</Selo>
          ) : null}
          {produto.temVideo ? <Selo>Vídeo</Selo> : null}
          {produto.publicarNoFeed ? <Selo>No feed</Selo> : null}
        </span>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      alinhamento: "fim",
      celula: (produto) => {
        const publicado = produto.status === "PUBLISHED";
        return (
          <MenuSuspenso
            id={`acoes-do-produto-${produto.id}`}
            rotulo="Ações"
            titulo={produto.nome}
            variante="discreta"
            alinhamento="fim"
            itens={[
              {
                id: "editar",
                rotulo: "Editar",
                icone: <IconeEditar />,
                href: `/painel/produtos/${produto.id}`,
              },
              {
                id: "publicacao",
                rotulo: publicado ? "Tirar da vitrine" : "Publicar",
                icone: publicado ? <IconeOcultar /> : <IconeMostrar />,
                aoEscolher: () => void alternarPublicacao(produto),
              },
              {
                id: "duplicar",
                rotulo: "Duplicar",
                icone: <IconeAdicionar />,
                aoEscolher: () => void duplicar(produto),
              },
              {
                id: "remover",
                rotulo: "Remover",
                icone: <IconeExcluir />,
                perigo: true,
                aoEscolher: () => setRemovendoId(produto.id),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <section aria-labelledby="lista-de-produtos" className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="lista-de-produtos" className="text-2xl font-semibold">
            Seus produtos
          </h2>
          <p className="mt-2 text-[var(--cor-tinta-suave)]">
            Rascunhos ficam só no painel até você publicar.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      {consulta !== null && pagina !== null && pagina.resumo.todos > 0 ? (
        <BarraDeFiltros
          rotuloDaBusca="Buscar produtos"
          placeholder="Buscar por nome, código ou descrição"
          busca={consulta.busca}
          aoBuscar={(busca) => mudar({ busca })}
          filtros={filtros(consulta, pagina, mudar)}
          ordem={{
            valor: consulta.ordem,
            opcoes: OPCOES_DE_ORDEM,
            aoMudar: (ordem) => mudar({ ordem }),
          }}
          ligados={ligados(consulta)}
          filtrado={ligados(consulta) > 0 || consulta.busca !== ""}
          aoLimpar={() => mudar(LIMPO)}
          contagem={
            pagina.total === pagina.resumo.todos
              ? `${pagina.total.toLocaleString("pt-BR")} produto(s)`
              : `${pagina.total.toLocaleString("pt-BR")} de ${pagina.resumo.todos.toLocaleString("pt-BR")} produto(s)`
          }
          atalhos={
            <>
              {pagina.resumo.estoqueBaixo > 0 || soAcabando ? (
                <Atalho
                  ativo={soAcabando}
                  aoAlternar={() => mudar({ estoque: soAcabando ? "" : "baixo" })}
                >
                  Acabando ({pagina.resumo.estoqueBaixo.toLocaleString("pt-BR")})
                </Atalho>
              ) : null}
              {pagina.resumo.comAtacado > 0 || soAtacado ? (
                <Atalho
                  ativo={soAtacado}
                  aoAlternar={() => mudar({ situacao: soAtacado ? "" : "atacado" })}
                >
                  Com atacado ({pagina.resumo.comAtacado.toLocaleString("pt-BR")})
                </Atalho>
              ) : null}
            </>
          }
        />
      ) : null}

      <div className="mt-6">
        {carregando && pagina === null ? (
          <div aria-busy="true">
            <Carregando rotulo="Carregando produtos…" />
          </div>
        ) : falhou ? (
          <div role="alert" className="sc-cartao">
            <p>Não conseguimos ler seus produtos agora. Nada foi alterado.</p>
            <div>
              <button
                className="sc-botao sc-botao--secundaria"
                type="button"
                onClick={() => void carregar()}
              >
                Tentar de novo
              </button>
            </div>
          </div>
        ) : pagina === null || pagina.resumo.todos === 0 ? (
          <Vazio
            titulo="Nenhum produto ainda"
            descricao="Cadastre o primeiro produto para preencher sua vitrine."
            acao={
              <Link
                className="sc-botao sc-botao--primaria"
                href="/painel/produtos/novo"
              >
                Cadastrar produto
              </Link>
            }
          />
        ) : produtos.length === 0 && !carregando ? (
          <Vazio
            titulo="Nada encontrado"
            descricao="Nenhum produto combina com a busca e os filtros escolhidos. Mude a busca ou limpe os filtros."
            acao={
              <Botao
                variante="secundaria"
                onClick={() => mudar(LIMPO)}
              >
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <div
            aria-busy={carregando || undefined}
            className={carregando ? "opacity-60 transition-opacity" : ""}
          >
            {noCelular ? (
              <CartoesDeProduto colunas={colunas} produtos={produtos} />
            ) : (
              <Tabela
                legenda="Produtos do catálogo"
                legendaEscondida
                colunas={colunas}
                linhas={produtos}
                chaveDaLinha={(produto) => produto.id}
                noCelular="cartoes"
              />
            )}
          </div>
        )}
        {pagina !== null && !falhou ? (
          <Paginacao
            paginacao={pagina}
            item="produtos"
            aoIr={(numero) => {
              setRemovendoId(null);
              mudar({ pagina: String(numero) });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * A lista de produtos no celular: um cartão por produto, com as MESMAS células
 * da tabela (nome, remoção, situação e ações não se repetem em outro lugar).
 * Categoria, preço e estoque viram pares rótulo-valor (`<dl>`), que é o que o
 * cabeçalho da coluna dizia na tabela.
 */
function CartoesDeProduto({
  colunas,
  produtos,
}: {
  readonly colunas: readonly ColunaDaTabela<Produto>[];
  readonly produtos: readonly Produto[];
}) {
  const celula = (chave: string, produto: Produto): ReactNode =>
    colunas.find((coluna) => coluna.chave === chave)?.celula(produto) ?? null;
  const dados = colunas.filter((coluna) =>
    ["categoria", "preco", "estoque"].includes(coluna.chave),
  );

  return (
    <ul
      role="list"
      aria-label="Produtos do catálogo"
      className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0"
    >
      {produtos.map((produto) => (
        <li
          key={produto.id}
          className="sc-cartao grid min-w-0 gap-3 p-4"
          data-produto={produto.id}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">{celula("produto", produto)}</div>
            <div className="shrink-0">{celula("acoes", produto)}</div>
          </div>
          <dl className="m-0 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {dados.map((coluna) => (
              <div key={coluna.chave} className="min-w-0">
                <dt className="text-xs text-[var(--cor-tinta-suave)]">
                  {coluna.titulo}
                </dt>
                <dd className="m-0 font-medium tabular-nums">
                  {coluna.celula(produto)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="min-w-0">{celula("situacao", produto)}</div>
        </li>
      ))}
    </ul>
  );
}

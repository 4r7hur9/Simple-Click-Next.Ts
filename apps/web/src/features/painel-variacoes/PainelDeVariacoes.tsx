"use client";

/**
 * A página Variações do catálogo (card #52): todos os produtos com grade
 * (tamanho, cor, sabor, número), quantas variações cada um tem, o preço e o
 * estoque de cada uma. Criar, editar e desativar abre a mesma grade da página
 * do produto (`GradeDeVariacoes`), aqui mesmo, sem sair da lista. Produto sem
 * grade ganha o atalho "Adicionar variações".
 *
 * PAGINADA NO SERVIDOR (card #76): 50 produtos por página, com busca, filtro,
 * total e números do topo vindos da API; a consulta fica no endereço.
 */
import { Botao, Carregando, Erro, Seletor, Selo, Vazio } from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { GradeDeVariacoes } from "../painel-catalogo/GradeDeVariacoes.tsx";
import { Indicadores } from "../painel-estoque/Indicadores.tsx";
import {
  CampoDeBusca,
  Paginacao,
  parametrosDaConsulta,
  useConsultaNaUrl,
  useLeituraMaisRecente,
} from "../painel-estoque/lista-paginada.tsx";
import {
  lerPaginaDaVisao,
  ROTULO_DA_SITUACAO,
  situacaoDoEstoque,
  temVariacoes,
  type PaginaDaVisao,
  type ProdutoNaVisao,
} from "../painel-estoque/visao-do-catalogo.ts";

type Mostrar = "com" | "sem" | "todos";

const OPCOES_DE_MOSTRAR: readonly { valor: Mostrar; rotulo: string }[] = [
  { valor: "com", rotulo: "Com variações" },
  { valor: "sem", rotulo: "Sem variações" },
  { valor: "todos", rotulo: "Todos os produtos" },
];

type Estado =
  | { readonly tipo: "carregando"; readonly anterior?: PaginaDaVisao }
  | { readonly tipo: "erro" }
  | { readonly tipo: "ok"; readonly pagina: PaginaDaVisao };

const CONSULTA_PADRAO = {
  busca: "",
  categoria: "",
  mostrar: "com",
  pagina: "1",
} as const;

function faixaDePreco(produto: ProdutoNaVisao): string {
  const precos = produto.variacoes
    .map((variacao) => variacao.precoCentavos)
    .filter((preco): preco is number => preco !== null);
  if (precos.length === 0) return "Sem preço";
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  return menor === maior
    ? escreverDinheiro(menor)
    : `${escreverDinheiro(menor)} a ${escreverDinheiro(maior)}`;
}

function CartaoDoProduto({
  produto,
  aberto,
  alternar,
}: {
  readonly produto: ProdutoNaVisao;
  readonly aberto: boolean;
  readonly alternar: () => void;
}) {
  const comGrade = temVariacoes(produto);
  const quantas = produto.variacoes.length;
  const eixos = produto.grupos
    .filter((grupo) => grupo.eixoDeVariacao)
    .map((grupo) => grupo.nome);
  return (
    <li className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">
            <Link
              className="text-[var(--cor-tinta)] no-underline hover:underline"
              href={`/painel/produtos/${produto.id}`}
            >
              {produto.nome}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
            {produto.categoriaNome ?? "Sem categoria"} · {faixaDePreco(produto)}
            {eixos.length > 0 ? ` · por ${eixos.join(" e ")}` : ""}
          </p>
        </div>
        <span className="inline-flex flex-wrap items-center gap-2">
          {comGrade ? (
            <Selo tom="info">
              {quantas === 1 ? "1 variação" : `${quantas} variações`}
            </Selo>
          ) : (
            <Selo>Sem variações</Selo>
          )}
          <Botao
            variante={comGrade ? "secundaria" : "primaria"}
            aria-expanded={aberto}
            onClick={alternar}
          >
            {aberto
              ? "Fechar"
              : comGrade
                ? "Editar variações"
                : "Adicionar variações"}
          </Botao>
        </span>
      </div>

      {comGrade && !aberto ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {produto.variacoes.map((variacao) => {
            const situacao = situacaoDoEstoque(variacao);
            return (
              <li
                key={variacao.id}
                className="flex items-center justify-between gap-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <strong className="block truncate">{variacao.nome}</strong>
                  <span className="text-[var(--cor-tinta-suave)]">
                    {variacao.precoCentavos === null
                      ? "Sem preço"
                      : escreverDinheiro(variacao.precoCentavos)}
                    {variacao.sku ? ` · SKU ${variacao.sku}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold">
                    {variacao.quantidade === null
                      ? "—"
                      : `${variacao.quantidade} un.`}
                  </span>
                  {!variacao.disponivel ? (
                    <Selo>Desativada</Selo>
                  ) : situacao === "falta" || situacao === "baixo" ? (
                    <Selo tom={situacao === "falta" ? "erro" : "atencao"}>
                      {ROTULO_DA_SITUACAO[situacao]}
                    </Selo>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!comGrade && !aberto ? (
        <p className="mt-4 text-sm text-[var(--cor-tinta-suave)]">
          Vende numa versão só. Adicione variações se ele tiver tamanho, cor,
          sabor ou número.
        </p>
      ) : null}

      {aberto ? <GradeDeVariacoes produtoId={produto.id} /> : null}
    </li>
  );
}

export function PainelDeVariacoes() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [consulta, mudar] = useConsultaNaUrl(CONSULTA_PADRAO);
  const [tentativa, setTentativa] = useState(0);
  // Uma grade aberta por vez: ela usa ids fixos na página.
  const [aberto, setAberto] = useState<string | null>(null);
  const lerMaisRecente = useLeituraMaisRecente();

  const carregar = useCallback(
    async (silencioso = false) => {
      if (consulta === null) return;
      if (!silencioso) {
        setEstado((anterior) => ({
          tipo: "carregando",
          ...(anterior.tipo === "ok" ? { anterior: anterior.pagina } : {}),
        }));
      }
      try {
        const { resultado, valeu } = await lerMaisRecente(() =>
          lerPaginaDaVisao(
            "variacoes",
            parametrosDaConsulta(consulta, CONSULTA_PADRAO),
          ),
        );
        if (valeu) setEstado({ tipo: "ok", pagina: resultado });
      } catch {
        if (!silencioso) setEstado({ tipo: "erro" });
      }
    },
    [consulta, lerMaisRecente],
  );

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  function alternar(produtoId: string) {
    // Fechar a grade relê a página: o que mudou lá dentro aparece aqui.
    if (aberto !== null) void carregar(true);
    setAberto((atual) => (atual === produtoId ? null : produtoId));
  }

  const pagina =
    estado.tipo === "ok"
      ? estado.pagina
      : estado.tipo === "carregando"
        ? (estado.anterior ?? null)
        : null;

  if (pagina === null && estado.tipo !== "erro") {
    return (
      <div className="mt-8" aria-busy="true">
        <Carregando rotulo="Carregando as variações…" />
      </div>
    );
  }

  if (estado.tipo === "erro" || pagina === null || consulta === null) {
    return (
      <div className="mt-8">
        <Erro
          titulo="Não foi possível carregar as variações"
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

  const numeros = pagina.indicadores;
  const comGrade = numeros.produtosComVariacoes ?? 0;
  const todos = pagina.totalDaLoja ?? comGrade + (numeros.produtosSemVariacoes ?? 0);
  const emFalta = numeros.variacoesEmFalta ?? 0;
  const atualizando = estado.tipo === "carregando";
  const mostrar = consulta.mostrar as Mostrar;
  const numero = (n: number | undefined) => (n ?? 0).toLocaleString("pt-BR");

  return (
    <>
      <Indicadores
        rotulo="Resumo das variações"
        itens={[
          { rotulo: "Produtos com variações", valor: numero(comGrade) },
          {
            rotulo: "Variações cadastradas",
            valor: numero(numeros.variacoesCadastradas),
          },
          {
            rotulo: "Variações em falta",
            valor: numero(emFalta),
            ...(emFalta > 0 ? { tom: "erro" as const } : {}),
          },
          {
            rotulo: "Produtos sem variações",
            valor: numero(numeros.produtosSemVariacoes),
          },
        ]}
      />

      <section aria-labelledby="lista-de-variacoes" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="lista-de-variacoes" className="text-2xl font-semibold">
            Produtos
          </h2>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {numero(pagina.total)} produto(s)
          </p>
        </div>

        <div
          role="search"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
        >
          <CampoDeBusca
            valor={consulta.busca}
            placeholder="Produto, variação ou SKU"
            aoBuscar={(busca) => mudar({ busca })}
          />
          <label className="grid gap-1">
            <span className="text-sm font-medium">Mostrar</span>
            <Seletor
              className="min-h-12"
              value={mostrar}
              onChange={(valor) => mudar({ mostrar: valor })}
              opcoes={OPCOES_DE_MOSTRAR}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Categoria</span>
            <Seletor
              className="min-h-12"
              value={consulta.categoria}
              onChange={(categoria) => mudar({ categoria })}
              opcoes={[{ valor: "", rotulo: "Todas" }, ...pagina.categorias]}
            />
          </label>
        </div>

        {pagina.produtos.length === 0 && !atualizando ? (
          <div className="mt-6">
            <Vazio
              titulo={
                todos === 0
                  ? "Nenhum produto ainda"
                  : mostrar === "com" && comGrade === 0
                    ? "Nenhum produto com variações"
                    : "Nada com esse filtro"
              }
              descricao={
                todos === 0
                  ? "Cadastre um produto e depois monte a grade dele aqui."
                  : mostrar === "com" && comGrade === 0
                    ? 'Veja os produtos sem variações e use "Adicionar variações".'
                    : "Mude a busca ou a categoria."
              }
              acao={
                todos === 0 ? (
                  <Link
                    className="sc-botao sc-botao--primaria"
                    href="/painel/produtos/novo"
                  >
                    Cadastrar produto
                  </Link>
                ) : (
                  <Botao
                    variante="secundaria"
                    onClick={() =>
                      mudar({
                        busca: "",
                        categoria: "",
                        mostrar: mostrar === "com" ? "sem" : "todos",
                      })
                    }
                  >
                    {mostrar === "com"
                      ? "Ver produtos sem variações"
                      : "Ver todos"}
                  </Botao>
                )
              }
            />
          </div>
        ) : (
          <ul
            className={`mt-6 grid gap-6 ${atualizando ? "opacity-60 transition-opacity" : ""}`}
            aria-busy={atualizando || undefined}
          >
            {pagina.produtos.map((produto) => (
              <CartaoDoProduto
                key={produto.id}
                produto={produto}
                aberto={aberto === produto.id}
                alternar={() => alternar(produto.id)}
              />
            ))}
          </ul>
        )}
        <Paginacao
          paginacao={pagina}
          item="produtos"
          aoIr={(n) => {
            setAberto(null);
            mudar({ pagina: String(n) });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </section>
    </>
  );
}

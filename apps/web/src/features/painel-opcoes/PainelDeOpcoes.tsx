"use client";

/**
 * A página Opções e adicionais do catálogo (card #52): os grupos de escolha
 * de cada produto (borda recheada, ponto da carne, adicionais), com a regra
 * de cada grupo e as opções com acréscimo. Editar abre o mesmo editor da
 * página do produto (`EditorGrupoOpcao`), aqui mesmo. O eixo de uma variação
 * (Tamanho, Cor) mora na página Variações e só é citado aqui.
 *
 * PAGINADA NO SERVIDOR (card #76): 50 produtos por página, com busca, filtros,
 * total e números do topo vindos da API; a consulta fica no endereço.
 */
import { Botao, Carregando, Erro, Seletor, Selo, Vazio } from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { EditorGrupoOpcao } from "../painel-catalogo/EditorGrupoOpcao.tsx";
import { Indicadores } from "../painel-estoque/Indicadores.tsx";
import {
  CampoDeBusca,
  Paginacao,
  parametrosDaConsulta,
  useConsultaNaUrl,
  useLeituraMaisRecente,
} from "../painel-estoque/lista-paginada.tsx";
import {
  gruposDeOpcoes,
  lerPaginaDaVisao,
  regraDoGrupo,
  ROTULO_DO_TIPO_DE_GRUPO,
  type GrupoNaVisao,
  type PaginaDaVisao,
  type ProdutoNaVisao,
} from "../painel-estoque/visao-do-catalogo.ts";

type Mostrar = "com" | "sem" | "todos";

const OPCOES_DE_MOSTRAR: readonly { valor: Mostrar; rotulo: string }[] = [
  { valor: "com", rotulo: "Com opções" },
  { valor: "sem", rotulo: "Sem opções" },
  { valor: "todos", rotulo: "Todos os produtos" },
];

const OPCOES_DE_TIPO = [
  { valor: "", rotulo: "Todos os tipos" },
  { valor: "ADDON", rotulo: "Adicionais" },
  { valor: "INGREDIENT", rotulo: "Ingredientes" },
  { valor: "VARIATION", rotulo: "Variações" },
] as const;

type Estado =
  | { readonly tipo: "carregando"; readonly anterior?: PaginaDaVisao }
  | { readonly tipo: "erro" }
  | { readonly tipo: "ok"; readonly pagina: PaginaDaVisao };

const CONSULTA_PADRAO = {
  busca: "",
  categoria: "",
  tipo: "",
  mostrar: "com",
  pagina: "1",
} as const;

function textoDaOpcao(opcao: GrupoNaVisao["opcoes"][number]): string {
  if (opcao.acrescimoCentavos === 0) return opcao.nome;
  const sinal = opcao.acrescimoCentavos > 0 ? "+" : "−";
  return `${opcao.nome} ${sinal}${escreverDinheiro(Math.abs(opcao.acrescimoCentavos))}`;
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
  const grupos = gruposDeOpcoes(produto);
  const eixos = produto.grupos.filter((grupo) => grupo.eixoDeVariacao);
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
            {produto.categoriaNome ?? "Sem categoria"}
            {eixos.length > 0
              ? ` · ${eixos.map((grupo) => grupo.nome).join(" e ")} nas variações`
              : ""}
          </p>
        </div>
        <span className="inline-flex flex-wrap items-center gap-2">
          {grupos.length > 0 ? (
            <Selo tom="info">
              {grupos.length === 1 ? "1 grupo" : `${grupos.length} grupos`}
            </Selo>
          ) : (
            <Selo>Sem opções</Selo>
          )}
          <Botao
            variante={grupos.length > 0 ? "secundaria" : "primaria"}
            aria-expanded={aberto}
            onClick={alternar}
          >
            {aberto
              ? "Fechar"
              : grupos.length > 0
                ? "Editar opções"
                : "Adicionar opções"}
          </Botao>
        </span>
      </div>

      {grupos.length > 0 && !aberto ? (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{grupo.nome}</strong>
                <span className="inline-flex flex-wrap gap-1.5">
                  <Selo>{ROTULO_DO_TIPO_DE_GRUPO[grupo.tipo] ?? "Grupo"}</Selo>
                  {!grupo.ativo ? <Selo tom="atencao">Desligado</Selo> : null}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                {regraDoGrupo(grupo)}
              </p>
              <p className="mt-2 text-sm">
                {grupo.opcoes.length === 0
                  ? "Nenhuma opção ainda."
                  : grupo.opcoes.map(textoDaOpcao).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {grupos.length === 0 && !aberto ? (
        <p className="mt-4 text-sm text-[var(--cor-tinta-suave)]">
          Sem escolhas para o cliente. Adicione um grupo como “Borda recheada”
          ou “Ponto da carne”.
        </p>
      ) : null}

      {aberto ? <EditorGrupoOpcao produtoId={produto.id} /> : null}
    </li>
  );
}

export function PainelDeOpcoes() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [consulta, mudar] = useConsultaNaUrl(CONSULTA_PADRAO);
  const [tentativa, setTentativa] = useState(0);
  // Um editor aberto por vez: ele usa ids fixos na página.
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
            "opcoes",
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
    // Fechar o editor relê a página: o que mudou lá dentro aparece aqui.
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
        <Carregando rotulo="Carregando as opções…" />
      </div>
    );
  }

  if (estado.tipo === "erro" || pagina === null || consulta === null) {
    return (
      <div className="mt-8">
        <Erro
          titulo="Não foi possível carregar as opções"
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
  const comOpcoes = numeros.produtosComOpcoes ?? 0;
  const lojaVazia = (pagina.totalDaLoja ?? pagina.total) === 0;
  const atualizando = estado.tipo === "carregando";
  const mostrar = consulta.mostrar as Mostrar;
  const numero = (n: number | undefined) => (n ?? 0).toLocaleString("pt-BR");

  return (
    <>
      <Indicadores
        rotulo="Resumo das opções"
        itens={[
          { rotulo: "Produtos com opções", valor: numero(comOpcoes) },
          { rotulo: "Grupos de opções", valor: numero(numeros.gruposDeOpcoes) },
          {
            rotulo: "Grupos obrigatórios",
            valor: numero(numeros.gruposObrigatorios),
            detalhe: "o cliente precisa escolher",
          },
          {
            rotulo: "Opções cadastradas",
            valor: numero(numeros.opcoesCadastradas),
          },
        ]}
      />

      <section aria-labelledby="lista-de-opcoes" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="lista-de-opcoes" className="text-2xl font-semibold">
            Produtos
          </h2>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {numero(pagina.total)} produto(s)
          </p>
        </div>

        <div
          role="search"
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
          <CampoDeBusca
            valor={consulta.busca}
            placeholder="Produto, grupo ou opção"
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
            <span className="text-sm font-medium">Tipo de grupo</span>
            <Seletor
              className="min-h-12"
              value={consulta.tipo}
              onChange={(tipo) => mudar({ tipo })}
              opcoes={OPCOES_DE_TIPO}
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
                lojaVazia
                  ? "Nenhum produto ainda"
                  : mostrar === "com" && comOpcoes === 0
                    ? "Nenhum produto com opções"
                    : "Nada com esse filtro"
              }
              descricao={
                lojaVazia
                  ? "Cadastre um produto e depois monte as opções dele aqui."
                  : mostrar === "com" && comOpcoes === 0
                    ? 'Veja os produtos sem opções e use "Adicionar opções".'
                    : "Mude a busca, o tipo ou a categoria."
              }
              acao={
                lojaVazia ? (
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
                        tipo: "",
                        mostrar: mostrar === "com" ? "sem" : "todos",
                      })
                    }
                  >
                    {mostrar === "com"
                      ? "Ver produtos sem opções"
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

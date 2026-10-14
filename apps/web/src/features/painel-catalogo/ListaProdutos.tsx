"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
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
  /** Alguma variação chegou ao aviso de estoque mínimo (AC-336). */
  readonly estoqueBaixo?: boolean;
  readonly variacoesAcabando?: readonly {
    readonly id: string;
    readonly nome: string;
    readonly quantidade: number;
    readonly minimoAlerta: number;
  }[];
}

function dinheiro(centavos: number | null): string {
  if (centavos === null) return "Sem preço";
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ListaProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("Carregando produtos…");
  // Erro de leitura não pode se disfarçar de "nenhum produto" (P-011): o dono
  // cadastraria de novo o que já existe.
  const [falhou, setFalhou] = useState(false);
  // Remover pede confirmação na própria linha, e não em caixa do navegador.
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  // A visão do que está acabando é um recorte desta mesma lista (AC-336): o
  // dono repõe a partir dela, sem uma segunda tela para manter em dia.
  const [soAcabando, setSoAcabando] = useState(false);
  const acabando = produtos.filter((produto) => produto.estoqueBaixo === true);
  const visiveis = soAcabando ? acabando : produtos;

  async function carregar() {
    setCarregando(true);
    setFalhou(false);
    try {
      const resposta = await fetch("/api/catalogo/produtos", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { produtos: Produto[] };
      setProdutos(dados.produtos);
      setMensagem(
        dados.produtos.length === 0
          ? "Ainda não há produtos cadastrados."
          : `${dados.produtos.length} produto(s) cadastrado(s).`,
      );
    } catch {
      setFalhou(true);
      setMensagem("Não foi possível carregar os produtos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

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
    setProdutos((anteriores) =>
      anteriores.map((item) =>
        item.id === produto.id
          ? { ...item, status: publicado ? "DRAFT" : "PUBLISHED" }
          : item,
      ),
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
    setProdutos((anteriores) =>
      anteriores.filter((item) => item.id !== produto.id),
    );
    setMensagem("Produto removido. Pedidos antigos continuam preservados.");
  }

  const colunas: readonly ColunaDaTabela<Produto>[] = [
    {
      chave: "produto",
      titulo: "Produto",
      valorParaOrdenar: (produto) => produto.nome,
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
      valorParaOrdenar: (produto) => produto.categoriaNome,
      celula: (produto) => produto.categoriaNome ?? "Sem categoria",
    },
    {
      chave: "preco",
      titulo: "Preço",
      alinhamento: "fim",
      valorParaOrdenar: (produto) => produto.precoCentavos,
      celula: (produto) => dinheiro(produto.precoCentavos),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      valorParaOrdenar: (produto) => produto.status,
      celula: (produto) => (
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          {produto.status === "PUBLISHED" ? (
            <Selo tom="sucesso">Publicado</Selo>
          ) : (
            <Selo>Rascunho</Selo>
          )}
          {produto.estoqueBaixo ? (
            <Selo tom="atencao">Estoque baixo</Selo>
          ) : null}
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

      {acabando.length > 0 || soAcabando ? (
        <button
          className="sc-botao sc-botao--secundaria mt-4"
          type="button"
          aria-pressed={soAcabando}
          onClick={() => setSoAcabando((anterior) => !anterior)}
        >
          {soAcabando
            ? "Mostrar todos os produtos"
            : `Ver o que está acabando (${acabando.length})`}
        </button>
      ) : null}

      <div className="mt-6">
        {carregando ? (
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
        ) : produtos.length === 0 ? (
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
        ) : (
          <Tabela
            legenda="Produtos do catálogo"
            legendaEscondida
            colunas={colunas}
            linhas={visiveis}
            chaveDaLinha={(produto) => produto.id}
            noCelular="cartoes"
          />
        )}
      </div>
    </section>
  );
}

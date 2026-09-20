"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  async function carregar() {
    setCarregando(true);
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
    if (!window.confirm(`Remover “${produto.nome}” do catálogo?`)) return;
    const resposta = await fetch(`/api/catalogo/produtos/${produto.id}`, {
      method: "DELETE",
    });
    if (!resposta.ok) {
      setMensagem("Não foi possível remover o produto.");
      return;
    }
    setProdutos((anteriores) =>
      anteriores.filter((item) => item.id !== produto.id),
    );
    setMensagem("Produto removido. Pedidos antigos continuam preservados.");
  }

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

      {carregando ? (
        <p className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6">
          Carregando produtos…
        </p>
      ) : produtos.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--cor-borda)] p-8">
          <p>Cadastre o primeiro produto para preencher sua vitrine.</p>
          <Link
            className="sc-botao sc-botao--primario mt-5"
            href="/painel/produtos/novo"
          >
            Cadastrar produto
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {produtos.map((produto) => {
            const publicado = produto.status === "PUBLISHED";
            return (
              <li
                key={produto.id}
                className="rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold">
                      {produto.nome}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                      {produto.categoriaNome ?? "Sem categoria"} ·{" "}
                      {dinheiro(produto.precoCentavos)}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--cor-borda)] px-3 py-1 text-xs font-semibold">
                    {publicado ? "Publicado" : "Rascunho"}
                  </span>
                </div>
                <p className="mt-4 min-h-10 text-sm leading-6 text-[var(--cor-tinta-suave)]">
                  {produto.descricao ?? "Sem descrição"}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    className="sc-botao sc-botao--fantasma"
                    href={`/painel/produtos/${produto.id}`}
                  >
                    Editar
                  </Link>
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void alternarPublicacao(produto)}
                  >
                    {publicado ? "Tirar da vitrine" : "Publicar"}
                  </button>
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void duplicar(produto)}
                  >
                    Duplicar
                  </button>
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void remover(produto)}
                  >
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

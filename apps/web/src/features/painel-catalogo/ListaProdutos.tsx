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
          className="sc-botao sc-botao--fantasma mt-4"
          type="button"
          aria-pressed={soAcabando}
          onClick={() => setSoAcabando((anterior) => !anterior)}
        >
          {soAcabando
            ? "Mostrar todos os produtos"
            : `Ver o que está acabando (${acabando.length})`}
        </button>
      ) : null}

      {carregando ? (
        <p
          className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6"
          aria-busy="true"
        >
          Carregando produtos…
        </p>
      ) : falhou ? (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6"
        >
          <p>Não conseguimos ler seus produtos agora. Nada foi alterado.</p>
          <button
            className="sc-botao sc-botao--fantasma mt-4"
            type="button"
            onClick={() => void carregar()}
          >
            Tentar de novo
          </button>
        </div>
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
          {visiveis.map((produto) => {
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
                  <span className="flex flex-col items-end gap-2">
                    <span className="rounded-full border border-[var(--cor-borda)] px-3 py-1 text-xs font-semibold">
                      {publicado ? "Publicado" : "Rascunho"}
                    </span>
                    {produto.estoqueBaixo ? (
                      <span className="rounded-full bg-[var(--cor-atencao-suave)] px-3 py-1 text-xs font-semibold text-[var(--cor-atencao)]">
                        Estoque baixo
                      </span>
                    ) : null}
                  </span>
                </div>
                {produto.estoqueBaixo && produto.variacoesAcabando ? (
                  <p className="mt-3 text-sm">
                    Acabando:{" "}
                    {produto.variacoesAcabando
                      .map(
                        (v) =>
                          `${v.nome} com ${v.quantidade} un. (aviso em ${v.minimoAlerta})`,
                      )
                      .join(" · ")}{" "}
                    <Link
                      className="font-semibold text-[var(--cor-primaria)]"
                      href={`/painel/produtos/${produto.id}/estoque`}
                    >
                      Repor estoque
                    </Link>
                  </p>
                ) : null}
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
                    onClick={() => setRemovendoId(produto.id)}
                    aria-label={`Remover ${produto.nome}`}
                  >
                    Remover
                  </button>
                </div>
                {removendoId === produto.id ? (
                  <div
                    role="group"
                    aria-label={`Confirmar a remoção de ${produto.nome}`}
                    className="mt-4 border-t border-[var(--cor-borda)] pt-4 text-sm"
                  >
                    <p>
                      {produto.nome} sai do catálogo e da vitrine. Pedidos que
                      já o incluíram continuam como foram feitos.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="sc-botao sc-botao--primario"
                        type="button"
                        onClick={() => void remover(produto)}
                      >
                        Confirmar remoção
                      </button>
                      <button
                        className="sc-botao sc-botao--fantasma"
                        type="button"
                        onClick={() => setRemovendoId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

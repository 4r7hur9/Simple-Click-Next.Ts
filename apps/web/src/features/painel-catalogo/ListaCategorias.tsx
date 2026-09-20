"use client";

import { useEffect, useState } from "react";

interface Categoria {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
  readonly descricao: string | null;
  readonly visivel: boolean;
  readonly ordem: number;
}

const VAZIA = { nome: "", descricao: "", visivel: true };

export function ListaCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando categorias…");
  const [formulario, setFormulario] = useState(VAZIA);

  async function carregar() {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/catalogo/categorias", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as {
        readonly categorias: Categoria[];
      };
      setCategorias(dados.categorias);
      setMensagem(
        dados.categorias.length === 0
          ? "Ainda não há categorias cadastradas."
          : `${dados.categorias.length} categoria(s) cadastrada(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar as categorias.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setMensagem("Salvando categoria…");
    try {
      const resposta = await fetch("/api/catalogo/categorias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: formulario.nome,
          descricao: formulario.descricao.trim() || null,
          visivel: formulario.visivel,
        }),
      });
      if (!resposta.ok) throw new Error();
      const categoria = (await resposta.json()) as Categoria;
      setCategorias((anteriores) => [...anteriores, categoria]);
      setFormulario(VAZIA);
      setMensagem("Categoria criada e pronta para receber produtos.");
    } catch {
      setMensagem("Não foi possível criar. Confira o nome informado.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarVisibilidade(categoria: Categoria) {
    const visivel = !categoria.visivel;
    setCategorias((anteriores) =>
      anteriores.map((item) =>
        item.id === categoria.id ? { ...item, visivel } : item,
      ),
    );
    const resposta = await fetch(`/api/catalogo/categorias/${categoria.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visivel }),
    });
    if (!resposta.ok) {
      setCategorias((anteriores) =>
        anteriores.map((item) =>
          item.id === categoria.id
            ? { ...item, visivel: categoria.visivel }
            : item,
        ),
      );
      setMensagem("Não foi possível alterar a visibilidade.");
      return;
    }
    setMensagem(
      visivel
        ? `${categoria.nome} voltou para a vitrine.`
        : `${categoria.nome} está oculta, sem apagar seus produtos.`,
    );
  }

  async function mover(categoria: Categoria, deslocamento: -1 | 1) {
    const indice = categorias.findIndex((item) => item.id === categoria.id);
    const destino = indice + deslocamento;
    if (indice < 0 || destino < 0 || destino >= categorias.length) return;
    const anterior = categorias;
    const proxima = [...categorias];
    const categoriaAtual = proxima[indice];
    const categoriaDestino = proxima[destino];
    if (categoriaAtual === undefined || categoriaDestino === undefined) return;
    proxima[indice] = categoriaDestino;
    proxima[destino] = categoriaAtual;
    setCategorias(proxima);
    const resposta = await fetch("/api/catalogo/categorias", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: proxima.map((item) => item.id) }),
    });
    if (!resposta.ok) {
      setCategorias(anterior);
      setMensagem("Não foi possível salvar a nova ordem.");
      return;
    }
    setMensagem("Ordem atualizada na vitrine.");
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="lista-de-categorias">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="lista-de-categorias" className="text-2xl font-semibold">
              Suas categorias
            </h2>
            <p className="mt-2 text-[var(--cor-tinta-suave)]">
              A ordem daqui é a mesma que o cliente verá na vitrine.
            </p>
          </div>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {mensagem}
          </p>
        </div>

        {carregando ? (
          <p className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6">
            Carregando categorias…
          </p>
        ) : categorias.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-[var(--cor-borda)] p-6">
            Crie a primeira categoria ao lado para começar seu catálogo.
          </p>
        ) : (
          <ol className="mt-6 space-y-3">
            {categorias.map((categoria, indice) => (
              <li
                key={categoria.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5"
              >
                <span className="w-8 text-center text-sm font-semibold text-[var(--cor-primaria)]">
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{categoria.nome}</h3>
                  <p className="text-sm text-[var(--cor-tinta-suave)]">
                    {categoria.descricao ?? "Sem descrição"} ·{" "}
                    {categoria.visivel ? "Visível" : "Oculta"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void mover(categoria, -1)}
                    disabled={indice === 0}
                    aria-label={`Mover ${categoria.nome} para cima`}
                  >
                    ↑
                  </button>
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void mover(categoria, 1)}
                    disabled={indice === categorias.length - 1}
                    aria-label={`Mover ${categoria.nome} para baixo`}
                  >
                    ↓
                  </button>
                  <button
                    className="sc-botao sc-botao--fantasma"
                    type="button"
                    onClick={() => void alternarVisibilidade(categoria)}
                  >
                    {categoria.visivel ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <form
        onSubmit={(evento) => void criar(evento)}
        className="h-fit rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6"
      >
        <h2 className="text-xl font-semibold">Nova categoria</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
          Comece com uma seção simples. Você poderá ocultá-la sem apagar os
          produtos.
        </p>
        <label className="mt-5 block">
          <span className="text-sm font-medium">Nome</span>
          <input
            className="sc-campo mt-2 w-full"
            value={formulario.nome}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                nome: evento.target.value,
              }))
            }
            placeholder="Ex.: Lanches"
            required
            maxLength={100}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Descrição (opcional)</span>
          <textarea
            className="sc-campo mt-2 min-h-24 w-full"
            value={formulario.descricao}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                descricao: evento.target.value,
              }))
            }
            maxLength={500}
          />
        </label>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            className="h-5 w-5"
            type="checkbox"
            checked={formulario.visivel}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                visivel: evento.target.checked,
              }))
            }
          />
          Mostrar na vitrine agora
        </label>
        <button
          className="sc-botao sc-botao--primario mt-6 w-full"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Criar categoria"}
        </button>
      </form>
    </div>
  );
}

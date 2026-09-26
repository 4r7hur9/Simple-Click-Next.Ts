"use client";

import { useEffect, useState } from "react";

/**
 * As categorias do dono (T-300).
 *
 * QUATRO ESTADOS, cada um com cara própria (P-011): carregando, erro com como
 * tentar de novo, vazio com o que fazer a seguir, e a lista. Erro e vazio NÃO
 * podem se parecer: "não consegui ler suas categorias" e "você ainda não tem
 * categoria" levam o dono a atitudes opostas.
 *
 * APAGAR PERGUNTA O DESTINO DOS PRODUTOS (AC-303). Categoria vazia sai com uma
 * confirmação simples; com produto dentro, o dono escolhe entre mover para
 * outra categoria ou ocultar a categoria com eles. A tela não oferece o
 * caminho que deixaria produto sem categoria — e a API recusa se alguém tentar.
 */

interface Categoria {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
  readonly descricao: string | null;
  readonly visivel: boolean;
  readonly ordem: number;
  readonly produtos: number;
}

type Estado = "carregando" | "erro" | "pronto";

type EscolhaDoDestino = "mover" | "ocultar";

interface RemocaoEmAndamento {
  readonly categoria: Categoria;
  readonly escolha: EscolhaDoDestino;
  readonly destinoId: string;
}

const VAZIA = { nome: "", descricao: "", visivel: true };

function rotuloDeProdutos(quantidade: number): string {
  return quantidade === 1 ? "1 produto" : `${quantidade} produtos`;
}

export function ListaCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando categorias…");
  const [formulario, setFormulario] = useState(VAZIA);
  const [remocao, setRemocao] = useState<RemocaoEmAndamento | null>(null);

  async function carregar() {
    setEstado("carregando");
    setMensagem("Carregando categorias…");
    try {
      const resposta = await fetch("/api/catalogo/categorias", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as {
        readonly categorias: Categoria[];
      };
      setCategorias(dados.categorias);
      setEstado("pronto");
      setMensagem(
        dados.categorias.length === 0
          ? "Ainda não há categorias cadastradas."
          : `${dados.categorias.length} categoria(s) cadastrada(s).`,
      );
    } catch {
      setEstado("erro");
      setMensagem("Não foi possível carregar as categorias.");
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
      setCategorias((anteriores) => [
        ...anteriores,
        { ...categoria, produtos: categoria.produtos ?? 0 },
      ]);
      setEstado("pronto");
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

  function pedirRemocao(categoria: Categoria) {
    const outra = categorias.find((item) => item.id !== categoria.id);
    setRemocao({
      categoria,
      escolha: outra === undefined ? "ocultar" : "mover",
      destinoId: outra?.id ?? "",
    });
  }

  async function confirmarRemocao() {
    if (remocao === null) return;
    const { categoria, escolha, destinoId } = remocao;
    const comProdutos = categoria.produtos > 0;
    if (comProdutos && escolha === "mover" && destinoId === "") {
      setMensagem("Escolha para qual categoria os produtos vão.");
      return;
    }
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/catalogo/categorias/${categoria.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          comProdutos
            ? {
                destino:
                  escolha === "mover"
                    ? { acao: "mover", categoriaId: destinoId }
                    : { acao: "ocultar" },
              }
            : {},
        ),
      });
      if (resposta.status === 409) {
        // Alguém pôs produto na categoria depois que a lista foi lida: a tela
        // passa a mostrar a contagem nova e pergunta o destino.
        const corpo = (await resposta.json()) as { produtos?: number };
        const atualizada = { ...categoria, produtos: corpo.produtos ?? 1 };
        setCategorias((anteriores) =>
          anteriores.map((item) =>
            item.id === categoria.id ? atualizada : item,
          ),
        );
        setRemocao({ ...remocao, categoria: atualizada });
        setMensagem(
          `${categoria.nome} tem ${rotuloDeProdutos(atualizada.produtos)}. Escolha o destino deles.`,
        );
        return;
      }
      if (!resposta.ok) throw new Error();
      setRemocao(null);
      await carregar();
      setMensagem(
        comProdutos && escolha === "ocultar"
          ? `${categoria.nome} foi ocultada com seus produtos; nada foi apagado.`
          : comProdutos
            ? `Produtos movidos e ${categoria.nome} apagada.`
            : `${categoria.nome} foi apagada.`,
      );
    } catch {
      setMensagem("Não foi possível apagar a categoria.");
    } finally {
      setSalvando(false);
    }
  }

  const destinosPossiveis =
    remocao === null
      ? []
      : categorias.filter((item) => item.id !== remocao.categoria.id);

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

        {estado === "carregando" ? (
          <p
            className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6"
            aria-busy="true"
          >
            Carregando categorias…
          </p>
        ) : estado === "erro" ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-[var(--cor-borda)] p-6"
          >
            <p>Não conseguimos ler suas categorias agora. Nada foi alterado.</p>
            <button
              className="sc-botao sc-botao--fantasma mt-4"
              type="button"
              onClick={() => void carregar()}
            >
              Tentar de novo
            </button>
          </div>
        ) : categorias.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-[var(--cor-borda)] p-6">
            Crie a primeira categoria ao lado para começar seu catálogo.
          </p>
        ) : (
          <ol
            className="mt-6 space-y-3"
            aria-label="Categorias na ordem da vitrine"
          >
            {categorias.map((categoria, indice) => (
              <li
                key={categoria.id}
                className="rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <span className="w-8 text-center text-sm font-semibold text-[var(--cor-primaria)]">
                    {String(indice + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{categoria.nome}</h3>
                    <p className="text-sm text-[var(--cor-tinta-suave)]">
                      {categoria.descricao ?? "Sem descrição"} ·{" "}
                      {categoria.visivel ? "Visível" : "Oculta"} ·{" "}
                      {rotuloDeProdutos(categoria.produtos)}
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
                    <button
                      className="sc-botao sc-botao--fantasma"
                      type="button"
                      onClick={() => pedirRemocao(categoria)}
                      aria-label={`Apagar ${categoria.nome}`}
                    >
                      Apagar
                    </button>
                  </div>
                </div>

                {remocao?.categoria.id === categoria.id ? (
                  <div
                    role="group"
                    aria-label={`Confirmar a remoção de ${categoria.nome}`}
                    className="mt-4 border-t border-[var(--cor-borda)] pt-4"
                  >
                    {remocao.categoria.produtos === 0 ? (
                      <p className="text-sm">
                        {categoria.nome} não tem produtos. Apagar mesmo assim?
                      </p>
                    ) : (
                      <fieldset>
                        <legend className="text-sm">
                          {categoria.nome} tem{" "}
                          {rotuloDeProdutos(remocao.categoria.produtos)}. Para
                          nenhum produto ficar sem categoria, escolha o destino
                          deles:
                        </legend>
                        <label className="mt-3 flex items-center gap-3 text-sm">
                          <input
                            type="radio"
                            name={`destino-${categoria.id}`}
                            value="mover"
                            checked={remocao.escolha === "mover"}
                            disabled={destinosPossiveis.length === 0}
                            onChange={() =>
                              setRemocao({
                                ...remocao,
                                escolha: "mover",
                                destinoId:
                                  remocao.destinoId ||
                                  destinosPossiveis[0]?.id ||
                                  "",
                              })
                            }
                          />
                          Mover os produtos e apagar a categoria
                        </label>
                        {remocao.escolha === "mover" ? (
                          <label className="mt-2 block text-sm">
                            <span>Categoria de destino</span>
                            <select
                              className="sc-campo mt-1 w-full"
                              value={remocao.destinoId}
                              onChange={(evento) =>
                                setRemocao({
                                  ...remocao,
                                  destinoId: evento.target.value,
                                })
                              }
                            >
                              {destinosPossiveis.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="mt-3 flex items-center gap-3 text-sm">
                          <input
                            type="radio"
                            name={`destino-${categoria.id}`}
                            value="ocultar"
                            checked={remocao.escolha === "ocultar"}
                            onChange={() =>
                              setRemocao({ ...remocao, escolha: "ocultar" })
                            }
                          />
                          Ocultar a categoria com os produtos (nada é apagado)
                        </label>
                      </fieldset>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="sc-botao sc-botao--primario"
                        type="button"
                        disabled={salvando}
                        onClick={() => void confirmarRemocao()}
                      >
                        Confirmar
                      </button>
                      <button
                        className="sc-botao sc-botao--fantasma"
                        type="button"
                        onClick={() => setRemocao(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
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

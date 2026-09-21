"use client";

import { useEffect, useState, type FormEvent } from "react";

type TipoDeValor = "texto" | "numero" | "lista" | "booleano";

interface Especificacao {
  readonly id: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly tipo: TipoDeValor;
  readonly unidade: string | null;
  readonly obrigatoria: boolean;
  readonly filtravel: boolean;
  readonly opcoes: readonly string[];
  readonly ordem: number;
  readonly versao: number;
  readonly removidaEm: string | null;
}

interface Props {
  readonly categoriaId: string;
}

interface Formulario {
  readonly nome: string;
  readonly tipo: TipoDeValor;
  readonly unidade: string;
  readonly opcoes: string;
  readonly obrigatoria: boolean;
  readonly filtravel: boolean;
}

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  tipo: "texto",
  unidade: "",
  opcoes: "",
  obrigatoria: false,
  filtravel: false,
};

const ROTULOS_DOS_TIPOS: Record<TipoDeValor, string> = {
  texto: "Texto",
  numero: "Número",
  lista: "Lista de opções",
  booleano: "Verdadeiro ou falso",
};

function mensagemDeErro(resposta: Response, padrao: string): string {
  return resposta.status === 409
    ? "A alteração precisa de confirmação porque há produtos afetados."
    : padrao;
}

export function EditorEspecificacoes({ categoriaId }: Props) {
  const [especificacoes, setEspecificacoes] = useState<Especificacao[]>([]);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [novaOpcao, setNovaOpcao] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const endereco = `/api/catalogo/categorias/${encodeURIComponent(categoriaId)}/especificacoes`;

  async function carregar(): Promise<void> {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(endereco, { cache: "no-store" });
      if (!resposta.ok)
        throw new Error("Não foi possível carregar as especificações.");
      const dados = (await resposta.json()) as {
        especificacoes?: Especificacao[];
      };
      setEspecificacoes(dados.especificacoes ?? []);
      setMensagem("");
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar as especificações.",
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [endereco]);

  async function criar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const opcoes =
      formulario.tipo === "lista"
        ? formulario.opcoes
            .split(/[\n,]/)
            .map((opcao) => opcao.trim())
            .filter((opcao) => opcao !== "")
        : [];
    if (formulario.tipo === "lista" && opcoes.length === 0) {
      setMensagem("Informe ao menos uma opção para criar uma lista.");
      return;
    }

    setSalvando(true);
    setErro(null);
    setMensagem("Salvando especificação…");
    try {
      const resposta = await fetch(endereco, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: formulario.nome,
          tipo: formulario.tipo,
          unidade: formulario.unidade.trim() || null,
          opcoes,
          obrigatoria: formulario.obrigatoria,
          filtravel: formulario.filtravel,
          ordem: especificacoes.length,
        }),
      });
      if (!resposta.ok)
        throw new Error(
          mensagemDeErro(resposta, "Não foi possível salvar a especificação."),
        );
      setFormulario(FORMULARIO_VAZIO);
      await carregar();
      setMensagem("Especificação criada.");
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível salvar a especificação.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function renomear(
    evento: FormEvent<HTMLFormElement>,
    especificacao: Especificacao,
  ): Promise<void> {
    evento.preventDefault();
    const nome = nomeEditado.trim();
    if (nome === "") return;
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nome }),
        },
      );
      if (!resposta.ok)
        throw new Error(
          mensagemDeErro(
            resposta,
            "Não foi possível renomear a especificação.",
          ),
        );
      setEditandoId(null);
      await carregar();
      setMensagem("Nome atualizado; o histórico anterior foi preservado.");
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível renomear a especificação.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarOpcao(especificacao: Especificacao): Promise<void> {
    const valor = (novaOpcao[especificacao.id] ?? "").trim();
    if (valor === "") return;
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}/opcoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ valor }),
        },
      );
      if (!resposta.ok)
        throw new Error("Não foi possível acrescentar a opção.");
      setNovaOpcao((anterior) => ({ ...anterior, [especificacao.id]: "" }));
      await carregar();
      setMensagem(`Opção ${valor} acrescentada à lista.`);
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível acrescentar a opção.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function remover(especificacao: Especificacao): Promise<void> {
    setSalvando(true);
    setErro(null);
    try {
      const primeira = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmado: false }),
        },
      );
      if (primeira.status === 409) {
        const impacto = (await primeira.json()) as { aviso?: string };
        if (
          !window.confirm(
            impacto.aviso ?? "A remoção afetará produtos. Continuar?",
          )
        ) {
          return;
        }
        const confirmada = await fetch(
          `${endereco}/${encodeURIComponent(especificacao.id)}`,
          {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmado: true }),
          },
        );
        if (!confirmada.ok)
          throw new Error("Não foi possível remover a especificação.");
      } else if (!primeira.ok) {
        throw new Error("Não foi possível remover a especificação.");
      }
      await carregar();
      setMensagem("Especificação removida sem apagar os valores históricos.");
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível remover a especificação.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section
      className="mt-8 max-w-5xl rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 sm:p-8"
      aria-labelledby="titulo-especificacoes"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-especificacoes" className="text-2xl font-semibold">
            Campos dos produtos
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Os produtos desta categoria herdarão estes campos na ordem abaixo.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      {carregando ? (
        <p className="mt-6 rounded-xl bg-[var(--cor-papel)] p-4" role="status">
          Carregando especificações…
        </p>
      ) : erro !== null ? (
        <p
          className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"
          role="alert"
        >
          {erro}
        </p>
      ) : (
        <>
          {especificacoes.length === 0 ? (
            <p className="mt-6 rounded-xl bg-[var(--cor-papel)] p-4 text-sm leading-6">
              Nenhuma especificação criada ainda. Comece pelo primeiro campo
              próprio desta categoria.
            </p>
          ) : (
            <ol
              className="mt-6 grid gap-3"
              aria-label="Especificações cadastradas"
            >
              {especificacoes.map((especificacao, indice) => (
                <li
                  key={especificacao.id}
                  className="rounded-xl border border-[var(--cor-borda)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--cor-tinta-suave)]">
                        {indice + 1}
                      </p>
                      <h3 className="text-lg font-semibold">
                        {especificacao.nome}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                        {ROTULOS_DOS_TIPOS[especificacao.tipo]}
                        {especificacao.unidade
                          ? ` · ${especificacao.unidade}`
                          : ""}
                        {especificacao.obrigatoria
                          ? " · obrigatória"
                          : " · opcional"}
                        {especificacao.filtravel ? " · filtro da vitrine" : ""}
                      </p>
                      {especificacao.tipo === "lista" ? (
                        <p className="mt-2 text-sm">
                          Opções: {especificacao.opcoes.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="sc-botao sc-botao--fantasma"
                        onClick={() => {
                          setEditandoId(especificacao.id);
                          setNomeEditado(especificacao.nome);
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="sc-botao sc-botao--fantasma"
                        onClick={() => void remover(especificacao)}
                        disabled={salvando}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  {editandoId === especificacao.id ? (
                    <form
                      className="mt-4 flex flex-wrap gap-2 border-t border-[var(--cor-borda)] pt-4"
                      onSubmit={(evento) =>
                        void renomear(evento, especificacao)
                      }
                    >
                      <label className="min-w-56 flex-1">
                        <span className="sr-only">Novo nome</span>
                        <input
                          className="sc-campo w-full"
                          value={nomeEditado}
                          onChange={(evento) =>
                            setNomeEditado(evento.target.value)
                          }
                          maxLength={120}
                          required
                        />
                      </label>
                      <button
                        className="sc-botao sc-botao--primario"
                        type="submit"
                        disabled={salvando}
                      >
                        Salvar nome
                      </button>
                    </form>
                  ) : null}

                  {especificacao.tipo === "lista" ? (
                    <form
                      className="mt-4 flex flex-wrap gap-2 border-t border-[var(--cor-borda)] pt-4"
                      onSubmit={(evento) => {
                        evento.preventDefault();
                        void adicionarOpcao(especificacao);
                      }}
                    >
                      <label className="min-w-56 flex-1">
                        <span className="sr-only">
                          Nova opção para {especificacao.nome}
                        </span>
                        <input
                          className="sc-campo w-full"
                          value={novaOpcao[especificacao.id] ?? ""}
                          onChange={(evento) =>
                            setNovaOpcao((anterior) => ({
                              ...anterior,
                              [especificacao.id]: evento.target.value,
                            }))
                          }
                          placeholder="Acrescentar valor"
                        />
                      </label>
                      <button
                        className="sc-botao sc-botao--fantasma"
                        type="submit"
                        disabled={salvando}
                      >
                        Acrescentar opção
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          <form
            className="mt-8 border-t border-[var(--cor-borda)] pt-8"
            onSubmit={(evento) => void criar(evento)}
          >
            <h3 className="text-xl font-semibold">Criar especificação</h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label>
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
                  maxLength={120}
                  required
                  placeholder="Ex.: Aro"
                />
              </label>
              <label>
                <span className="text-sm font-medium">Tipo de valor</span>
                <select
                  className="sc-campo mt-2 w-full"
                  value={formulario.tipo}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      tipo: evento.target.value as TipoDeValor,
                      opcoes:
                        evento.target.value === "lista" ? anterior.opcoes : "",
                    }))
                  }
                >
                  {Object.entries(ROTULOS_DOS_TIPOS).map(([tipo, rotulo]) => (
                    <option key={tipo} value={tipo}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-sm font-medium">Unidade (opcional)</span>
                <input
                  className="sc-campo mt-2 w-full"
                  value={formulario.unidade}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      unidade: evento.target.value,
                    }))
                  }
                  maxLength={30}
                  placeholder="Ex.: mm, kg, pol"
                />
              </label>
              {formulario.tipo === "lista" ? (
                <label className="sm:col-span-2">
                  <span className="text-sm font-medium">Opções da lista</span>
                  <textarea
                    className="sc-campo mt-2 min-h-24 w-full"
                    value={formulario.opcoes}
                    onChange={(evento) =>
                      setFormulario((anterior) => ({
                        ...anterior,
                        opcoes: evento.target.value,
                      }))
                    }
                    placeholder="Uma por linha ou separadas por vírgula: 13, 14, 15"
                    required
                  />
                </label>
              ) : null}
              <label className="flex items-center gap-3 text-sm">
                <input
                  className="h-5 w-5"
                  type="checkbox"
                  checked={formulario.obrigatoria}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      obrigatoria: evento.target.checked,
                    }))
                  }
                />
                Obrigatória no cadastro do produto
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  className="h-5 w-5"
                  type="checkbox"
                  checked={formulario.filtravel}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      filtravel: evento.target.checked,
                    }))
                  }
                />
                Usar como filtro na vitrine
              </label>
            </div>
            <button
              className="sc-botao sc-botao--primario mt-6"
              type="submit"
              disabled={salvando}
            >
              {salvando ? "Salvando…" : "Criar especificação"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";

/**
 * O criador de especificações da categoria (T-301).
 *
 * O dono cria, dentro da categoria, os campos que os produtos dela preenchem:
 * nome, tipo de valor, unidade, se é obrigatória e se vira filtro na vitrine
 * (AC-325). A ordem daqui é a ordem do formulário do produto (AC-326).
 *
 * AVISAR ANTES DE MEXER NO QUE JÁ FOI PREENCHIDO (AC-330). Renomear ou remover
 * uma especificação usada por produtos não acontece no primeiro clique: a API
 * devolve quantos produtos serão afetados, a tela mostra o aviso e o dono
 * confirma — ou desiste, e nada mudou.
 */

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
  readonly produtos?: number;
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

/** Uma alteração que a API pediu para confirmar, com o aviso dela. */
interface Pendencia {
  readonly especificacaoId: string;
  readonly acao: "renomear" | "remover";
  readonly aviso: string;
  readonly novoNome?: string;
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

async function avisoDaResposta(resposta: Response): Promise<string> {
  const corpo = (await resposta.json().catch(() => ({}))) as {
    aviso?: string;
  };
  return corpo.aviso ?? "Há produtos afetados por esta alteração.";
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
  const [pendencia, setPendencia] = useState<Pendencia | null>(null);

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
        }),
      });
      if (!resposta.ok) throw new Error();
      setFormulario(FORMULARIO_VAZIO);
      await carregar();
      setMensagem("Especificação criada.");
    } catch {
      setMensagem("Não foi possível salvar a especificação.");
    } finally {
      setSalvando(false);
    }
  }

  async function reordenar(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    const atual = especificacoes[indice];
    const vizinha = especificacoes[destino];
    if (atual === undefined || vizinha === undefined) return;
    const proxima = [...especificacoes];
    proxima[indice] = vizinha;
    proxima[destino] = atual;
    const anterior = especificacoes;
    setEspecificacoes(proxima);
    const resposta = await fetch(endereco, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: proxima.map((item) => item.id) }),
    });
    if (!resposta.ok) {
      setEspecificacoes(anterior);
      setMensagem("Não foi possível salvar a nova ordem.");
      return;
    }
    setMensagem("Ordem salva: o formulário do produto segue esta sequência.");
  }

  async function renomear(
    especificacao: Especificacao,
    nome: string,
    confirmado: boolean,
  ): Promise<void> {
    setSalvando(true);
    try {
      const resposta = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            confirmado ? { nome, confirmado: true } : { nome },
          ),
        },
      );
      if (resposta.status === 409) {
        setPendencia({
          especificacaoId: especificacao.id,
          acao: "renomear",
          aviso: await avisoDaResposta(resposta),
          novoNome: nome,
        });
        return;
      }
      if (!resposta.ok) throw new Error();
      setEditandoId(null);
      setPendencia(null);
      await carregar();
      setMensagem("Nome atualizado; o nome anterior ficou no histórico.");
    } catch {
      setMensagem("Não foi possível renomear a especificação.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarOpcao(especificacao: Especificacao): Promise<void> {
    const valor = (novaOpcao[especificacao.id] ?? "").trim();
    if (valor === "") return;
    setSalvando(true);
    try {
      const resposta = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}/opcoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ valor }),
        },
      );
      if (!resposta.ok) throw new Error();
      setNovaOpcao((anterior) => ({ ...anterior, [especificacao.id]: "" }));
      await carregar();
      setMensagem(`Opção ${valor} acrescentada à lista.`);
    } catch {
      setMensagem("Não foi possível acrescentar a opção.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(
    especificacao: Especificacao,
    confirmado: boolean,
  ): Promise<void> {
    setSalvando(true);
    try {
      const resposta = await fetch(
        `${endereco}/${encodeURIComponent(especificacao.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(confirmado ? { confirmado: true } : {}),
        },
      );
      if (resposta.status === 409) {
        setPendencia({
          especificacaoId: especificacao.id,
          acao: "remover",
          aviso: await avisoDaResposta(resposta),
        });
        return;
      }
      if (!resposta.ok) throw new Error();
      setPendencia(null);
      await carregar();
      setMensagem(
        "Especificação removida; os valores preenchidos ficam guardados.",
      );
    } catch {
      setMensagem("Não foi possível remover a especificação.");
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
        <p
          className="mt-6 rounded-xl bg-[var(--cor-papel)] p-4"
          aria-busy="true"
        >
          Carregando especificações…
        </p>
      ) : erro !== null ? (
        <div
          className="mt-6 rounded-xl border border-[var(--cor-borda)] p-4"
          role="alert"
        >
          <p>{erro}</p>
          <button
            type="button"
            className="sc-botao sc-botao--fantasma mt-3"
            onClick={() => void carregar()}
          >
            Tentar de novo
          </button>
        </div>
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
                        {` · preenchida em ${especificacao.produtos ?? 0} produto(s)`}
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
                        onClick={() => void reordenar(indice, -1)}
                        disabled={indice === 0 || salvando}
                        aria-label={`Subir ${especificacao.nome}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="sc-botao sc-botao--fantasma"
                        onClick={() => void reordenar(indice, 1)}
                        disabled={
                          indice === especificacoes.length - 1 || salvando
                        }
                        aria-label={`Descer ${especificacao.nome}`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="sc-botao sc-botao--fantasma"
                        onClick={() => {
                          setEditandoId(especificacao.id);
                          setNomeEditado(especificacao.nome);
                          setPendencia(null);
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        className="sc-botao sc-botao--fantasma"
                        onClick={() => void remover(especificacao, false)}
                        disabled={salvando}
                        aria-label={`Remover ${especificacao.nome}`}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  {pendencia?.especificacaoId === especificacao.id ? (
                    <div
                      role="alertdialog"
                      aria-label={`Confirmar alteração de ${especificacao.nome}`}
                      className="mt-4 border-t border-[var(--cor-borda)] pt-4"
                    >
                      <p className="text-sm">{pendencia.aviso}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="sc-botao sc-botao--primario"
                          disabled={salvando}
                          onClick={() =>
                            void (pendencia.acao === "remover"
                              ? remover(especificacao, true)
                              : renomear(
                                  especificacao,
                                  pendencia.novoNome ?? especificacao.nome,
                                  true,
                                ))
                          }
                        >
                          {pendencia.acao === "remover"
                            ? "Confirmar remoção"
                            : "Confirmar novo nome"}
                        </button>
                        <button
                          type="button"
                          className="sc-botao sc-botao--fantasma"
                          onClick={() => setPendencia(null)}
                        >
                          Desistir
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {editandoId === especificacao.id ? (
                    <form
                      className="mt-4 flex flex-wrap gap-2 border-t border-[var(--cor-borda)] pt-4"
                      onSubmit={(evento) => {
                        evento.preventDefault();
                        const nome = nomeEditado.trim();
                        if (nome !== "")
                          void renomear(especificacao, nome, false);
                      }}
                    >
                      <label className="min-w-56 flex-1">
                        <span className="sr-only">
                          Novo nome de {especificacao.nome}
                        </span>
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

"use client";

import { useEffect, useState } from "react";

import { centavosDoTexto } from "../../lib/dinheiro.ts";

interface Opcao {
  readonly id: string;
  readonly nome: string;
  readonly acrescimoCentavos: number;
  readonly disponivel: boolean;
  readonly padrao: boolean;
}

interface Grupo {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly tipo: string;
  readonly minimo: number;
  readonly maximo: number | null;
  readonly permiteRepetir: boolean;
  readonly eixoDeVariacao: boolean;
  readonly ativo: boolean;
  readonly opcoes: Opcao[];
}

interface Props {
  readonly produtoId: string;
}

const GRUPO_VAZIO = {
  nome: "",
  descricao: "",
  tipo: "ADDON",
  minimo: "0",
  maximo: "",
  permiteRepetir: false,
  eixoDeVariacao: false,
  ativo: true,
};
const OPCAO_VAZIA = {
  nome: "",
  acrescimo: "0",
  disponivel: true,
  padrao: false,
};

function dinheiro(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function EditorGrupoOpcao({ produtoId }: Props) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupo, setGrupo] = useState(GRUPO_VAZIO);
  const [opcoes, setOpcoes] = useState<Record<string, typeof OPCAO_VAZIA>>({});
  const [mensagem, setMensagem] = useState("Carregando grupos…");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { grupos: Grupo[] };
      setGrupos(dados.grupos);
      setMensagem(
        dados.grupos.length === 0
          ? "Crie o primeiro grupo de escolhas."
          : `${dados.grupos.length} grupo(s) cadastrado(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar os grupos.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  async function criarGrupo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    const minimo = Number(grupo.minimo);
    const maximo = grupo.maximo === "" ? null : Number(grupo.maximo);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: grupo.nome,
            descricao: grupo.descricao.trim() || null,
            tipo:
              grupo.tipo === "INGREDIENT"
                ? "INGREDIENT"
                : grupo.eixoDeVariacao
                  ? "VARIATION"
                  : "ADDON",
            minimo,
            maximo,
            permiteRepetir: grupo.permiteRepetir,
            eixoDeVariacao: grupo.eixoDeVariacao || grupo.tipo === "VARIATION",
            ativo: grupo.ativo,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setGrupo(GRUPO_VAZIO);
      await carregar();
    } catch {
      setMensagem("Não foi possível criar. Confira mínimo e máximo.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarOpcao(
    evento: React.FormEvent<HTMLFormElement>,
    grupoId: string,
  ) {
    evento.preventDefault();
    const formulario = opcoes[grupoId] ?? OPCAO_VAZIA;
    // Centavos lidos como texto (AC-311): "2.50" é R$ 2,50, e não R$ 250.
    const acrescimoCentavos = centavosDoTexto(formulario.acrescimo);
    if (acrescimoCentavos === null) {
      setMensagem("Acréscimo inválido. Escreva em reais, como 2,50.");
      return;
    }
    setSalvando(true);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: formulario.nome,
            acrescimoCentavos,
            disponivel: formulario.disponivel,
            padrao: formulario.padrao,
            codigoExterno: null,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setOpcoes((anteriores) => ({ ...anteriores, [grupoId]: OPCAO_VAZIA }));
      await carregar();
    } catch {
      setMensagem("Não foi possível adicionar a opção.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarOpcao(grupoId: string, opcao: Opcao) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens/${opcao.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disponivel: !opcao.disponivel }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível alterar a disponibilidade.");
  }

  async function removerOpcao(grupoId: string, opcao: Opcao) {
    if (!window.confirm(`Remover ${opcao.nome}?`)) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens/${opcao.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a opção.");
  }

  return (
    <section
      className="mt-8 max-w-4xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="grupos-de-escolha"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="grupos-de-escolha" className="text-2xl font-semibold">
            Escolhas e adicionais
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            O mínimo define se o grupo é obrigatório. Opções indisponíveis
            continuam visíveis sem bloquear o produto.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>
      <div className="mt-6 space-y-5">
        {grupos.map((item) => {
          const formulario = opcoes[item.id] ?? OPCAO_VAZIA;
          return (
            <article
              key={item.id}
              className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{item.nome}</h3>
                  <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                    {item.minimo > 0
                      ? `Obrigatório: ${item.minimo}`
                      : "Opcional"}{" "}
                    · máximo {item.maximo ?? "livre"} ·{" "}
                    {item.permiteRepetir ? "permite repetir" : "não repete"}
                    {item.eixoDeVariacao ? " · eixo de variação" : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--cor-primaria-texto)]">
                  {item.tipo}
                </span>
              </div>
              <ul className="mt-4 space-y-2">
                {item.opcoes.map((opcao) => (
                  <li
                    key={opcao.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--cor-papel)] p-3"
                  >
                    <span className="flex-1 font-medium">
                      {opcao.nome}{" "}
                      <span className="text-sm text-[var(--cor-tinta-suave)]">
                        {opcao.acrescimoCentavos === 0
                          ? ""
                          : `· ${dinheiro(opcao.acrescimoCentavos)}`}{" "}
                        · {opcao.disponivel ? "disponível" : "esgotada"}
                      </span>
                    </span>
                    <button
                      className="sc-botao sc-botao--secundaria text-xs"
                      type="button"
                      onClick={() => void alternarOpcao(item.id, opcao)}
                    >
                      {opcao.disponivel ? "Esgotar" : "Reativar"}
                    </button>
                    <button
                      className="sc-botao sc-botao--secundaria text-xs"
                      type="button"
                      onClick={() => void removerOpcao(item.id, opcao)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(evento) => void criarOpcao(evento, item.id)}
                className="mt-4 grid gap-3 border-t border-[var(--cor-borda)] pt-4 sm:grid-cols-[1fr_10rem_auto]"
              >
                <input
                  className="sc-campo__controle"
                  value={formulario.nome}
                  onChange={(evento) =>
                    setOpcoes((anteriores) => ({
                      ...anteriores,
                      [item.id]: { ...formulario, nome: evento.target.value },
                    }))
                  }
                  placeholder="Nova opção"
                  required
                />
                <input
                  className="sc-campo__controle"
                  inputMode="decimal"
                  value={formulario.acrescimo}
                  onChange={(evento) =>
                    setOpcoes((anteriores) => ({
                      ...anteriores,
                      [item.id]: {
                        ...formulario,
                        acrescimo: evento.target.value,
                      },
                    }))
                  }
                  placeholder="Acréscimo R$"
                />
                <button
                  className="sc-botao sc-botao--secundaria"
                  type="submit"
                  disabled={salvando}
                >
                  Adicionar
                </button>
              </form>
            </article>
          );
        })}
      </div>
      <form
        onSubmit={(evento) => void criarGrupo(evento)}
        className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-2"
      >
        <h3 className="sm:col-span-2 text-xl font-semibold">Novo grupo</h3>
        <label>
          <span className="text-sm font-medium">Nome</span>
          <input
            className="sc-campo__controle mt-2 w-full"
            value={grupo.nome}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                nome: evento.target.value,
              }))
            }
            placeholder="Ex.: Adicionais"
            required
          />
        </label>
        <label>
          <span className="text-sm font-medium">Tipo</span>
          <select
            className="sc-campo__controle mt-2 w-full"
            value={grupo.tipo}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                tipo: evento.target.value,
                eixoDeVariacao:
                  evento.target.value === "VARIATION" ||
                  anterior.eixoDeVariacao,
              }))
            }
          >
            <option value="ADDON">Adicional</option>
            <option value="INGREDIENT">Ingrediente</option>
            <option value="VARIATION">Eixo de variação</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium">Mínimo</span>
          <input
            className="sc-campo__controle mt-2 w-full"
            type="number"
            min={0}
            value={grupo.minimo}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                minimo: evento.target.value,
              }))
            }
          />
        </label>
        <label>
          <span className="text-sm font-medium">Máximo (opcional)</span>
          <input
            className="sc-campo__controle mt-2 w-full"
            type="number"
            min={1}
            value={grupo.maximo}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                maximo: evento.target.value,
              }))
            }
          />
        </label>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            className="h-5 w-5"
            type="checkbox"
            checked={grupo.permiteRepetir}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                permiteRepetir: evento.target.checked,
              }))
            }
          />
          Permitir repetir a mesma opção
        </label>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            className="h-5 w-5"
            type="checkbox"
            checked={grupo.eixoDeVariacao}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                eixoDeVariacao: evento.target.checked,
                tipo: evento.target.checked ? "VARIATION" : "ADDON",
              }))
            }
          />
          Usar este grupo como eixo da grade de variações
        </label>
        <button
          className="sc-botao sc-botao--primaria w-fit"
          type="submit"
          disabled={salvando}
        >
          Criar grupo
        </button>
      </form>
    </section>
  );
}

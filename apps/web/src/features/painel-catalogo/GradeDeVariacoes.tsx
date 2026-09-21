"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Opcao {
  readonly id: string;
  readonly nome: string;
  readonly disponivel: boolean;
}

interface Grupo {
  readonly id: string;
  readonly nome: string;
  readonly tipo: string;
  readonly eixoDeVariacao: boolean;
  readonly opcoes: readonly Opcao[];
}

interface Variacao {
  readonly id: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly precoCentavos: number | null;
  readonly estoque: number | null;
  readonly padrao: boolean;
  readonly disponivel: boolean;
  readonly combinacoes: readonly { grupoId: string; opcaoId: string }[];
}

interface Props {
  readonly produtoId: string;
}

const VARIACAO_VAZIA = {
  nome: "",
  sku: "",
  preco: "",
  estoque: "",
  padrao: false,
  disponivel: true,
  escolhas: {} as Record<string, string>,
};

function dinheiro(centavos: number | null) {
  if (centavos === null) return "Sem preço";
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function GradeDeVariacoes({ produtoId }: Props) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [formulario, setFormulario] = useState(VARIACAO_VAZIA);
  const [mensagem, setMensagem] = useState("Carregando grade…");
  const [salvando, setSalvando] = useState(false);

  const eixos = useMemo(
    () => grupos.filter((grupo) => grupo.eixoDeVariacao),
    [grupos],
  );

  async function carregar() {
    try {
      const [respostaDeGrupos, respostaDeVariacoes] = await Promise.all([
        fetch(`/api/catalogo/produtos/${produtoId}/opcoes`, {
          cache: "no-store",
        }),
        fetch(`/api/catalogo/produtos/${produtoId}/variacoes`, {
          cache: "no-store",
        }),
      ]);
      if (!respostaDeGrupos.ok || !respostaDeVariacoes.ok) throw new Error();
      const dadosDosGrupos = (await respostaDeGrupos.json()) as {
        grupos: Grupo[];
      };
      const dadosDasVariacoes = (await respostaDeVariacoes.json()) as {
        variacoes: Variacao[];
      };
      setGrupos(dadosDosGrupos.grupos);
      setVariacoes(dadosDasVariacoes.variacoes);
      setMensagem(
        `${dadosDasVariacoes.variacoes.length} variação(ões) cadastrada(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar a grade.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  function escolhaDaVariacao(variacao: Variacao, grupoId: string): string {
    return (
      variacao.combinacoes.find((combinacao) => combinacao.grupoId === grupoId)
        ?.opcaoId ?? ""
    );
  }

  function nomeDaCombinacao(variacao: Variacao): string {
    const nomes = eixos.flatMap((grupo) => {
      const opcaoId = escolhaDaVariacao(variacao, grupo.id);
      return grupo.opcoes
        .filter((opcao) => opcao.id === opcaoId)
        .map((opcao) => `${grupo.nome}: ${opcao.nome}`);
    });
    return nomes.length === 0 ? "Sem eixo" : nomes.join(" · ");
  }

  async function criarVariacao(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    const preco = formulario.preco.trim();
    const estoque = formulario.estoque.trim();
    const combinacoes = eixos.flatMap((grupo) => {
      const opcaoId = formulario.escolhas[grupo.id];
      return opcaoId === undefined || opcaoId === ""
        ? []
        : [{ grupoId: grupo.id, opcaoId }];
    });
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/variacoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: formulario.nome,
            sku: formulario.sku.trim() || null,
            codigoDeBarras: null,
            precoCentavos:
              preco === ""
                ? null
                : Math.round(
                    Number(preco.replace(".", "").replace(",", ".")) * 100,
                  ),
            estoque: estoque === "" ? null : Number(estoque),
            estoqueMinimo: null,
            pesoGramas: null,
            padrao: formulario.padrao,
            disponivel: formulario.disponivel,
            combinacoes,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setFormulario(VARIACAO_VAZIA);
      await carregar();
    } catch {
      setMensagem("Não foi possível salvar. Revise SKU e eixos escolhidos.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarDisponibilidade(variacao: Variacao) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/variacoes/${variacao.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disponivel: !variacao.disponivel }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível alterar a disponibilidade.");
  }

  async function remover(variacao: Variacao) {
    if (!window.confirm(`Remover a variação ${variacao.nome}?`)) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/variacoes/${variacao.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a variação.");
  }

  return (
    <section
      className="mt-8 max-w-5xl rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 sm:p-8"
      aria-labelledby="grade-de-variacoes"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="grade-de-variacoes" className="text-2xl font-semibold">
            Grade de variações
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Cada linha pode ter preço, SKU e estoque próprios. A combinação dos
            eixos identifica a unidade que o cliente compra.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      {eixos.length === 0 ? (
        <p className="mt-6 rounded-xl bg-[var(--cor-papel)] p-4 text-sm leading-6">
          Crie um grupo marcado como eixo de variação antes de cadastrar a
          grade.{" "}
          <Link href={`/painel/produtos/${produtoId}/opcoes`}>
            Abrir escolhas e adicionais
          </Link>
          .
        </p>
      ) : null}

      <ul className="mt-6 space-y-2">
        {variacoes.map((variacao) => (
          <li
            key={variacao.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--cor-borda)] p-4"
          >
            <span className="min-w-48 flex-1">
              <strong>{variacao.nome}</strong>
              <span className="mt-1 block text-sm text-[var(--cor-tinta-suave)]">
                {nomeDaCombinacao(variacao)} ·{" "}
                {dinheiro(variacao.precoCentavos)}
                {variacao.sku ? ` · SKU ${variacao.sku}` : ""}
                {variacao.estoque === null
                  ? " · estoque não controlado"
                  : ` · ${variacao.estoque} un.`}
                {variacao.padrao ? " · padrão" : ""}
              </span>
            </span>
            <span className="text-xs font-semibold">
              {variacao.disponivel ? "Disponível" : "Esgotada"}
            </span>
            <button
              className="sc-botao sc-botao--fantasma text-xs"
              type="button"
              onClick={() => void alternarDisponibilidade(variacao)}
            >
              {variacao.disponivel ? "Esgotar" : "Reativar"}
            </button>
            <button
              className="sc-botao sc-botao--fantasma text-xs"
              type="button"
              onClick={() => void remover(variacao)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>

      {eixos.length > 0 ? (
        <form
          onSubmit={(evento) => void criarVariacao(evento)}
          className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-2"
        >
          <h3 className="text-xl font-semibold sm:col-span-2">Nova variação</h3>
          <label>
            <span className="text-sm font-medium">Nome interno</span>
            <input
              className="sc-campo mt-2 w-full"
              value={formulario.nome}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  nome: evento.target.value,
                }))
              }
              placeholder="Ex.: Camiseta azul M"
              required
            />
          </label>
          <label>
            <span className="text-sm font-medium">SKU</span>
            <input
              className="sc-campo mt-2 w-full"
              value={formulario.sku}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  sku: evento.target.value,
                }))
              }
              placeholder="Opcional"
            />
          </label>
          {eixos.map((grupo) => (
            <label key={grupo.id}>
              <span className="text-sm font-medium">{grupo.nome}</span>
              <select
                className="sc-campo mt-2 w-full"
                value={formulario.escolhas[grupo.id] ?? ""}
                onChange={(evento) =>
                  setFormulario((anterior) => ({
                    ...anterior,
                    escolhas: {
                      ...anterior.escolhas,
                      [grupo.id]: evento.target.value,
                    },
                  }))
                }
              >
                <option value="">Selecione…</option>
                {grupo.opcoes.map((opcao) => (
                  <option
                    key={opcao.id}
                    value={opcao.id}
                    disabled={!opcao.disponivel}
                  >
                    {opcao.nome}
                    {opcao.disponivel ? "" : " (indisponível)"}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <span className="text-sm font-medium">Preço (R$)</span>
            <input
              className="sc-campo mt-2 w-full"
              inputMode="decimal"
              value={formulario.preco}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  preco: evento.target.value,
                }))
              }
              placeholder="Ex.: 89,90"
              required
            />
          </label>
          <label>
            <span className="text-sm font-medium">Estoque</span>
            <input
              className="sc-campo mt-2 w-full"
              type="number"
              min={0}
              value={formulario.estoque}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  estoque: evento.target.value,
                }))
              }
              placeholder="Vazio = não controla"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              className="h-5 w-5"
              type="checkbox"
              checked={formulario.padrao}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  padrao: evento.target.checked,
                }))
              }
            />
            Abrir como padrão
          </label>
          <button
            className="sc-botao sc-botao--primario w-fit"
            type="submit"
            disabled={salvando}
          >
            Criar variação
          </button>
        </form>
      ) : null}
    </section>
  );
}

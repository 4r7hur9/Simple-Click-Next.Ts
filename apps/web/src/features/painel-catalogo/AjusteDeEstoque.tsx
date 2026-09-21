"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Movimento {
  readonly id: string;
  readonly quantidadeAntes: number;
  readonly delta: number;
  readonly quantidadeDepois: number;
  readonly motivo: string;
  readonly origem: string;
  readonly criadoEm: string;
}

interface Variacao {
  readonly id: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly quantidade: number | null;
  readonly reservado: number | null;
  readonly minimoAlerta: number | null;
  readonly disponivel: boolean;
  readonly estoqueBaixo: boolean;
  readonly movimentos: readonly Movimento[];
}

interface Props {
  readonly produtoId: string;
}

function dataHora(valor: string) {
  return new Date(valor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AjusteDeEstoque({ produtoId }: Props) {
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [selecionadaId, setSelecionadaId] = useState("");
  const [quantidadeAlvo, setQuantidadeAlvo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mensagem, setMensagem] = useState("Carregando estoque…");
  const [salvando, setSalvando] = useState(false);

  const selecionada = useMemo(
    () => variacoes.find((variacao) => variacao.id === selecionadaId) ?? null,
    [selecionadaId, variacoes],
  );

  async function carregar() {
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/estoque`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { variacoes: Variacao[] };
      setVariacoes(dados.variacoes);
      setSelecionadaId((anterior) => {
        const aindaExiste = dados.variacoes.some(
          (variacao) => variacao.id === anterior,
        );
        return aindaExiste ? anterior : (dados.variacoes[0]?.id ?? "");
      });
      setMensagem(
        dados.variacoes.length === 0
          ? "Cadastre uma variação antes de ajustar estoque."
          : `${dados.variacoes.length} variação(ões) no estoque.`,
      );
    } catch {
      setMensagem("Não foi possível carregar o estoque.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  useEffect(() => {
    if (selecionada?.quantidade !== null && selecionada !== null) {
      setQuantidadeAlvo(String(selecionada.quantidade));
    } else {
      setQuantidadeAlvo("");
    }
  }, [selecionada]);

  async function ajustar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (selecionada === null || selecionada.quantidade === null) return;
    setSalvando(true);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/variacoes/${selecionada.id}/estoque`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quantidadeAlvo: Number(quantidadeAlvo),
            motivo,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setMotivo("");
      await carregar();
      setMensagem("Estoque ajustado e movimento registrado.");
    } catch {
      setMensagem("Não foi possível ajustar. Informe uma quantidade e motivo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section
      className="mt-8 max-w-5xl rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 sm:p-8"
      aria-labelledby="estoque-do-produto"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="estoque-do-produto" className="text-2xl font-semibold">
            Estoque por variação
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Ajuste a contagem física. O sistema guarda o saldo anterior, a
            diferença, o motivo e quem fez a alteração.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      {variacoes.length === 0 ? (
        <p className="mt-6 rounded-xl bg-[var(--cor-papel)] p-4 text-sm leading-6">
          <Link href={`/painel/produtos/${produtoId}/variacoes`}>
            Cadastre uma variação
          </Link>{" "}
          para começar a controlar unidades.
        </p>
      ) : (
        <>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {variacoes.map((variacao) => (
              <li key={variacao.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selecionadaId === variacao.id
                      ? "border-[var(--cor-primaria)] bg-[var(--cor-papel)]"
                      : "border-[var(--cor-borda)]"
                  }`}
                  onClick={() => setSelecionadaId(variacao.id)}
                >
                  <span className="flex items-center justify-between gap-3">
                    <strong>{variacao.nome}</strong>
                    <span className="text-2xl font-semibold">
                      {variacao.quantidade === null ? "—" : variacao.quantidade}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-[var(--cor-tinta-suave)]">
                    {variacao.sku ? `SKU ${variacao.sku} · ` : ""}
                    {variacao.quantidade === null
                      ? "não controla estoque"
                      : variacao.estoqueBaixo
                        ? "estoque baixo"
                        : "unidades disponíveis"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selecionada?.quantidade !== null && selecionada !== null ? (
            <form
              onSubmit={(evento) => void ajustar(evento)}
              className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
            >
              <label>
                <span className="text-sm font-medium">Nova quantidade</span>
                <input
                  className="sc-campo mt-2 w-full"
                  type="number"
                  min={0}
                  value={quantidadeAlvo}
                  onChange={(evento) => setQuantidadeAlvo(evento.target.value)}
                  required
                />
              </label>
              <label>
                <span className="text-sm font-medium">Motivo</span>
                <input
                  className="sc-campo mt-2 w-full"
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Ex.: contagem física"
                  required
                />
              </label>
              <button
                className="sc-botao sc-botao--primario"
                type="submit"
                disabled={salvando}
              >
                Ajustar estoque
              </button>
            </form>
          ) : null}

          {selecionada !== null ? (
            <div className="mt-8 border-t border-[var(--cor-borda)] pt-6">
              <h3 className="text-lg font-semibold">
                Histórico de {selecionada.nome}
              </h3>
              {selecionada.movimentos.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--cor-tinta-suave)]">
                  Nenhum movimento registrado.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--cor-borda)]">
                  {selecionada.movimentos.map((movimento) => (
                    <li
                      key={movimento.id}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span>
                        <strong>
                          {movimento.delta > 0 ? "+" : ""}
                          {movimento.delta} unidades
                        </strong>{" "}
                        · {movimento.motivo}
                      </span>
                      <span className="text-[var(--cor-tinta-suave)]">
                        {movimento.quantidadeAntes} →{" "}
                        {movimento.quantidadeDepois} ·{" "}
                        {dataHora(movimento.criadoEm)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

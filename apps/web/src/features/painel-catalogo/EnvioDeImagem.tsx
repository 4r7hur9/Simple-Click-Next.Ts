"use client";

import { useEffect, useState } from "react";

interface Imagem {
  readonly id: string;
  readonly url: string;
  readonly altText: string | null;
  readonly principal: boolean;
  readonly ordem: number;
}

interface Props {
  readonly produtoId: string;
}

export function EnvioDeImagem({ produtoId }: Props) {
  const [imagens, setImagens] = useState<Imagem[]>([]);
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [principal, setPrincipal] = useState(true);
  const [mensagem, setMensagem] = useState("Carregando imagens…");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/imagens`,
        {
          cache: "no-store",
        },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { imagens: Imagem[] };
      setImagens(dados.imagens);
      setMensagem(
        dados.imagens.length === 0
          ? "Adicione uma imagem hospedada em HTTPS."
          : `${dados.imagens.length}/5 imagem(ns) cadastrada(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar as imagens.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  async function adicionar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setMensagem("Salvando imagem…");
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/imagens`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url,
            altText: altText.trim() || null,
            principal,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setUrl("");
      setAltText("");
      await carregar();
    } catch {
      setMensagem("Informe uma URL HTTPS válida e tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function tornarPrincipal(imagem: Imagem) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/imagens/${imagem.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ principal: true }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível trocar a imagem principal.");
  }

  async function remover(imagem: Imagem) {
    if (!window.confirm("Remover esta imagem do produto?")) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/imagens/${imagem.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a imagem.");
  }

  return (
    <section
      className="mt-8 max-w-3xl rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 sm:p-8"
      aria-labelledby="imagens-do-produto"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="imagens-do-produto" className="text-2xl font-semibold">
            Imagens do produto
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Use uma URL HTTPS do Cloudinary. A imagem principal aparece no
            cartão da vitrine.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {imagens.map((imagem) => (
          <li
            key={imagem.id}
            className="overflow-hidden rounded-xl border border-[var(--cor-borda)]"
          >
            <div className="aspect-[4/3] bg-[var(--cor-papel)]">
              <img
                className="h-full w-full object-cover"
                src={imagem.url}
                alt={imagem.altText ?? "Imagem do produto"}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              {imagem.principal ? (
                <span className="text-xs font-semibold text-[var(--cor-primaria)]">
                  Principal
                </span>
              ) : (
                <button
                  className="sc-botao sc-botao--fantasma text-xs"
                  type="button"
                  onClick={() => void tornarPrincipal(imagem)}
                >
                  Usar como principal
                </button>
              )}
              <button
                className="sc-botao sc-botao--fantasma text-xs"
                type="button"
                onClick={() => void remover(imagem)}
              >
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>

      {imagens.length < 5 ? (
        <form
          onSubmit={(evento) => void adicionar(evento)}
          className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6"
        >
          <label>
            <span className="text-sm font-medium">URL HTTPS da imagem</span>
            <input
              className="sc-campo mt-2 w-full"
              type="url"
              value={url}
              onChange={(evento) => setUrl(evento.target.value)}
              placeholder="https://res.cloudinary.com/..."
              required
            />
          </label>
          <label>
            <span className="text-sm font-medium">Texto alternativo</span>
            <input
              className="sc-campo mt-2 w-full"
              value={altText}
              onChange={(evento) => setAltText(evento.target.value)}
              maxLength={160}
              placeholder="Ex.: Pastel de queijo"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              className="h-5 w-5"
              type="checkbox"
              checked={principal}
              onChange={(evento) => setPrincipal(evento.target.checked)}
            />
            Definir como imagem principal
          </label>
          <button
            className="sc-botao sc-botao--primario w-fit"
            type="submit"
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Adicionar imagem"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

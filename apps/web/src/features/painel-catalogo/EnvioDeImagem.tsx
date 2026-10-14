"use client";

import { useEffect, useState } from "react";

import {
  conferirArquivoDeImagem,
  type ResultadoDaConferenciaDaImagem,
} from "../../lib/imagem.ts";

/**
 * As fotos do produto (T-303).
 *
 * ATÉ CINCO FOTOS, UMA PRINCIPAL (AC-305): a principal vai para o cartão da
 * vitrine, e a página do produto mostra todas. O dono troca a principal a
 * qualquer momento.
 *
 * O ARQUIVO É CONFERIDO DUAS VEZES (AC-306). Aqui, pelos bytes, para o dono
 * saber na hora que escolheu um arquivo que não é foto — sem esperar o envio.
 * E na API, que é quem decide: a conferência daqui é cortesia, a de lá é a
 * garantia. Quem ainda não tem a foto no computador pode informar a URL de uma
 * foto já hospedada.
 */

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

const LIMITE_DE_FOTOS = 5;

export function EnvioDeImagem({ produtoId }: Props) {
  const [imagens, setImagens] = useState<Imagem[]>([]);
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [principal, setPrincipal] = useState(true);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conferencia, setConferencia] =
    useState<ResultadoDaConferenciaDaImagem | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [conferindoArquivo, setConferindoArquivo] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando imagens…");
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const base = `/api/catalogo/produtos/${produtoId}/imagens`;

  async function carregar() {
    try {
      const resposta = await fetch(base, { cache: "no-store" });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { imagens: Imagem[] };
      setImagens(dados.imagens);
      setMensagem(
        dados.imagens.length === 0
          ? "Envie a primeira foto do produto."
          : `${dados.imagens.length}/${LIMITE_DE_FOTOS} imagem(ns) cadastrada(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar as imagens.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  async function adicionarPorUrl(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setMensagem("Salvando imagem…");
    try {
      const resposta = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          altText: altText.trim() || null,
          principal,
        }),
      });
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

  async function conferirArquivo(escolhido: File | undefined) {
    setConferencia(null);
    setErroDoArquivo(null);
    setArquivo(null);
    if (escolhido === undefined) return;
    setConferindoArquivo(true);
    try {
      setConferencia(await conferirArquivoDeImagem(escolhido));
      setArquivo(escolhido);
    } catch (erro) {
      setErroDoArquivo(
        erro instanceof Error
          ? erro.message
          : "Não foi possível conferir o conteúdo da imagem.",
      );
    } finally {
      setConferindoArquivo(false);
    }
  }

  async function enviarArquivo() {
    if (arquivo === null || conferencia === null) return;
    setSalvando(true);
    setMensagem("Enviando a foto…");
    try {
      const consulta = new URLSearchParams({ principal: String(principal) });
      if (altText.trim() !== "") consulta.set("texto", altText.trim());
      const resposta = await fetch(`${base}/arquivo?${consulta.toString()}`, {
        method: "POST",
        headers: { "content-type": `image/${conferencia.formato}` },
        body: arquivo,
      });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as {
          mensagem?: string;
        };
        setMensagem(
          resposta.status === 503
            ? "O envio de arquivos ainda não está disponível nesta loja. Use a URL de uma foto já hospedada."
            : (corpo.mensagem ?? "Não foi possível enviar a foto."),
        );
        return;
      }
      setArquivo(null);
      setConferencia(null);
      setAltText("");
      await carregar();
      setMensagem("Foto enviada.");
    } catch {
      setMensagem("Não foi possível enviar a foto.");
    } finally {
      setSalvando(false);
    }
  }

  async function tornarPrincipal(imagem: Imagem) {
    const resposta = await fetch(`${base}/${imagem.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principal: true }),
    });
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível trocar a imagem principal.");
  }

  async function remover(imagem: Imagem) {
    setRemovendoId(null);
    const resposta = await fetch(`${base}/${imagem.id}`, { method: "DELETE" });
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a imagem.");
  }

  return (
    <section
      className="mt-8 max-w-3xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="imagens-do-produto"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="imagens-do-produto" className="text-2xl font-semibold">
            Imagens do produto
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Até {LIMITE_DE_FOTOS} fotos. A principal aparece no cartão da
            vitrine; a página do produto mostra todas.
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
            className="overflow-hidden rounded-[var(--raio-botao)] border border-[var(--cor-borda)]"
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
                <span className="text-xs font-semibold text-[var(--cor-primaria-texto)]">
                  Principal
                </span>
              ) : (
                <button
                  className="sc-botao sc-botao--secundaria text-xs"
                  type="button"
                  onClick={() => void tornarPrincipal(imagem)}
                >
                  Usar como principal
                </button>
              )}
              {removendoId === imagem.id ? (
                <>
                  <button
                    className="sc-botao sc-botao--primaria text-xs"
                    type="button"
                    onClick={() => void remover(imagem)}
                  >
                    Confirmar remoção
                  </button>
                  <button
                    className="sc-botao sc-botao--secundaria text-xs"
                    type="button"
                    onClick={() => setRemovendoId(null)}
                  >
                    Manter
                  </button>
                </>
              ) : (
                <button
                  className="sc-botao sc-botao--secundaria text-xs"
                  type="button"
                  onClick={() => setRemovendoId(imagem.id)}
                >
                  Remover
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {imagens.length < LIMITE_DE_FOTOS ? (
        <div className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6">
          <label>
            <span className="text-sm font-medium">Foto do produto</span>
            <input
              className="sc-campo__controle mt-2 w-full"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(evento) =>
                void conferirArquivo(evento.target.files?.[0])
              }
            />
            <span className="mt-2 block text-xs text-[var(--cor-tinta-suave)]">
              JPEG, PNG, GIF ou WebP de até 10 MB. A conferência olha o conteúdo
              do arquivo, e não o nome.
            </span>
            {conferindoArquivo ? (
              <span className="mt-2 block text-sm" role="status">
                Conferindo conteúdo…
              </span>
            ) : null}
            {conferencia ? (
              <span
                className="mt-2 block text-sm text-[var(--cor-primaria-texto)]"
                role="status"
              >
                Arquivo válido ({conferencia.formato},{" "}
                {conferencia.tamanhoBytes} bytes).
              </span>
            ) : null}
            {erroDoArquivo ? (
              <span className="mt-2 block text-sm" role="alert">
                {erroDoArquivo}
              </span>
            ) : null}
          </label>
          <label>
            <span className="text-sm font-medium">Texto alternativo</span>
            <input
              className="sc-campo__controle mt-2 w-full"
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
            className="sc-botao sc-botao--primaria w-fit"
            type="button"
            disabled={salvando || arquivo === null}
            onClick={() => void enviarArquivo()}
          >
            {salvando ? "Enviando…" : "Enviar foto"}
          </button>

          <form
            onSubmit={(evento) => void adicionarPorUrl(evento)}
            className="mt-2 grid gap-3 border-t border-[var(--cor-borda)] pt-4"
          >
            <label>
              <span className="text-sm font-medium">
                Ou informe a URL HTTPS de uma foto já hospedada
              </span>
              <input
                className="sc-campo__controle mt-2 w-full"
                type="url"
                value={url}
                onChange={(evento) => setUrl(evento.target.value)}
                placeholder="https://res.cloudinary.com/..."
                required
              />
            </label>
            <button
              className="sc-botao sc-botao--secundaria w-fit"
              type="submit"
              disabled={salvando}
            >
              Adicionar pela URL
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

"use client";

/**
 * As configurações do feed da loja (só o dono): aparecer ou não em Explorar,
 * o que publicar sozinho (produtos novos já nascem marcados "publicar no
 * feed") e a prévia de como a loja aparece para os clientes.
 *
 * Lê e grava por `/api/loja/feed` (proxy de `/v1/lojas/:apelido/feed`). A
 * prévia acompanha o formulário ao vivo, antes de salvar; os produtos dela
 * são os do catálogo marcados para o feed, publicados e disponíveis — a
 * mesma regra que a API usa para montar Explorar.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  PreviaNoFeed,
  type LojaDaPrevia,
  type ProdutoDaPrevia,
} from "./PreviaNoFeed.tsx";
import { InfoDoPainel } from "../config/RotuloComInfo.tsx";

interface ConfiguracaoDoFeed {
  readonly aparecerNoFeed: boolean;
  readonly publicarProdutosNovos: boolean;
}

interface ProdutoDoCatalogo extends ProdutoDaPrevia {
  readonly status: string;
  readonly disponivel: boolean;
  readonly publicarNoFeed?: boolean | undefined;
}

/** Os produtos que a API levaria para o feed. */
export function produtosQueVaoParaOFeed(
  produtos: readonly ProdutoDoCatalogo[],
): ProdutoDoCatalogo[] {
  return produtos.filter(
    (produto) =>
      produto.publicarNoFeed === true &&
      produto.status === "PUBLISHED" &&
      produto.disponivel,
  );
}

/** Por que a loja não aparece no feed, ou `null` quando aparece. */
export function motivoForaDoFeed(
  aparecerNoFeed: boolean,
  lojaAtiva: boolean,
): string | null {
  if (!aparecerNoFeed)
    return "Com “Aparecer no feed” desligado, a loja e os produtos dela ficam fora de Explorar. A vitrine continua funcionando pelo endereço da loja.";
  if (!lojaAtiva)
    return "A loja só entra no feed depois de aprovada e ativa. A configuração fica guardada até lá.";
  return null;
}

export function FormularioDoFeed({
  loja,
  lojaAtiva,
}: {
  readonly loja: LojaDaPrevia;
  /** A loja está ATIVA (aprovada e no ar): só assim entra no feed. */
  readonly lojaAtiva: boolean;
}) {
  const [gravada, setGravada] = useState<ConfiguracaoDoFeed | null>(null);
  const [aparecerNoFeed, setAparecerNoFeed] = useState(true);
  const [publicarProdutosNovos, setPublicarProdutosNovos] = useState(false);
  const [produtos, setProdutos] = useState<readonly ProdutoDoCatalogo[]>([]);
  const [estado, setEstado] = useState<
    "carregando" | "pronto" | "erro" | "salvando"
  >("carregando");
  const [mensagem, setMensagem] = useState("Carregando a configuração…");

  useEffect(() => {
    let ativo = true;
    void fetch("/api/loja/feed", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        const dados = (await resposta.json()) as ConfiguracaoDoFeed;
        if (!ativo) return;
        setGravada(dados);
        setAparecerNoFeed(dados.aparecerNoFeed);
        setPublicarProdutosNovos(dados.publicarProdutosNovos);
        setEstado("pronto");
        setMensagem("");
      })
      .catch(() => {
        if (!ativo) return;
        setEstado("erro");
        setMensagem(
          "Não foi possível carregar a configuração do feed. Recarregue a página.",
        );
      });
    // A prévia sem os produtos ainda vale: a falha aqui não trava a tela.
    void fetch("/api/catalogo/produtos", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as {
          produtos: ProdutoDoCatalogo[];
        };
        if (ativo) setProdutos(dados.produtos);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  const mudou =
    gravada !== null &&
    (gravada.aparecerNoFeed !== aparecerNoFeed ||
      gravada.publicarProdutosNovos !== publicarProdutosNovos);

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (gravada === null || !mudou) return;
    setEstado("salvando");
    setMensagem("Salvando…");
    try {
      const resposta = await fetch("/api/loja/feed", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // Só o que mudou: o PUT é parcial.
        body: JSON.stringify({
          ...(gravada.aparecerNoFeed === aparecerNoFeed
            ? {}
            : { aparecerNoFeed }),
          ...(gravada.publicarProdutosNovos === publicarProdutosNovos
            ? {}
            : { publicarProdutosNovos }),
        }),
      });
      if (!resposta.ok) throw new Error();
      const salva = (await resposta.json()) as ConfiguracaoDoFeed;
      setGravada(salva);
      setAparecerNoFeed(salva.aparecerNoFeed);
      setPublicarProdutosNovos(salva.publicarProdutosNovos);
      setEstado("pronto");
      setMensagem("Configuração do feed salva.");
    } catch {
      setEstado("pronto");
      setMensagem("Não foi possível salvar. Tente de novo.");
    }
  }

  const noFeed = produtosQueVaoParaOFeed(produtos);
  const motivo = motivoForaDoFeed(aparecerNoFeed, lojaAtiva);
  const bloqueado = estado === "carregando" || estado === "erro";

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        onSubmit={(evento) => void salvar(evento)}
        aria-label="Configurações do feed"
        className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-6 shadow-[var(--sombra-larga)] sm:p-8"
      >
        <fieldset disabled={bloqueado} className="grid gap-6">
          <legend className="sr-only">Configurações do feed</legend>

          <div className="flex items-start gap-3">
            <input
              id="feed-aparecerNoFeed"
              className="mt-0.5 h-5 w-5"
              type="checkbox"
              name="aparecerNoFeed"
              checked={aparecerNoFeed}
              onChange={(evento) => setAparecerNoFeed(evento.target.checked)}
              aria-describedby="feed-aparecerNoFeed-descricao feed-aparecerNoFeed-info"
            />
            <div>
              <span className="flex items-center gap-1.5">
                <label className="font-medium" htmlFor="feed-aparecerNoFeed">
                  Aparecer no feed
                </label>
                <InfoDoPainel
                  explicacao="aparecerNoFeed"
                  nome="Aparecer no feed"
                  id="feed-aparecerNoFeed"
                />
              </span>
              <p
                id="feed-aparecerNoFeed-descricao"
                className="text-sm text-[var(--cor-tinta-suave)]"
              >
                A loja e os produtos marcados entram em Explorar, onde clientes
                de toda a plataforma descobrem lojas novas.
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--cor-borda)] pt-6">
            <h2 className="font-medium">O que publicar automaticamente</h2>
            <div className="mt-3 flex items-start gap-3">
              <input
                id="feed-publicarProdutosNovos"
                className="mt-0.5 h-5 w-5"
                type="checkbox"
                name="publicarProdutosNovos"
                checked={publicarProdutosNovos}
                onChange={(evento) =>
                  setPublicarProdutosNovos(evento.target.checked)
                }
                aria-describedby="feed-publicarProdutosNovos-descricao feed-publicarProdutosNovos-info"
              />
              <div>
                <span className="flex items-center gap-1.5">
                  <label
                    className="font-medium"
                    htmlFor="feed-publicarProdutosNovos"
                  >
                    Produtos novos
                  </label>
                  <InfoDoPainel
                    explicacao="publicarProdutosNovos"
                    nome="Publicar produtos novos"
                    id="feed-publicarProdutosNovos"
                  />
                </span>
                <p
                  id="feed-publicarProdutosNovos-descricao"
                  className="text-sm text-[var(--cor-tinta-suave)]"
                >
                  Todo produto cadastrado daqui em diante já nasce com “Publicar
                  no feed” marcado. Você pode desmarcar no cadastro de cada um.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--cor-tinta-suave)]">
              {noFeed.length === 0
                ? "Nenhum produto publicado está marcado para o feed ainda."
                : noFeed.length === 1
                  ? "1 produto publicado está marcado para o feed."
                  : `${noFeed.length} produtos publicados estão marcados para o feed.`}{" "}
              <Link
                className="font-semibold text-[var(--cor-primaria-texto)] underline"
                href="/painel/produtos"
              >
                Escolher nos produtos
              </Link>
            </p>
          </div>
        </fieldset>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primaria"
            type="submit"
            disabled={bloqueado || estado === "salvando" || !mudou}
          >
            {estado === "salvando" ? "Salvando…" : "Salvar"}
          </button>
          <p
            role={estado === "erro" ? "alert" : "status"}
            className="text-sm text-[var(--cor-tinta-suave)]"
          >
            {mensagem}
          </p>
        </div>
      </form>

      <PreviaNoFeed
        loja={loja}
        produtos={noFeed.slice(0, 3)}
        totalNoFeed={noFeed.length}
        noFeed={motivo === null}
        motivoFora={motivo}
      />
    </div>
  );
}

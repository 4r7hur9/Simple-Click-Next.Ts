"use client";

import type { LimitesDeMidia, StoryDaLoja } from "@simpleclick/contracts";
import { IconeCamera } from "@simpleclick/ui";
import { useEffect, useState } from "react";

import {
  buscarLimitesDeMidia,
  formatarDuracao,
  LIMITES_DE_MIDIA_INICIAIS,
} from "../../lib/envio-de-midia.ts";
import { EditorDeStory } from "../stories/EditorDeStory.tsx";
import {
  fracaoPassada,
  tempoQueFalta,
  textoDasVisualizacoes,
} from "./tempo.ts";

/**
 * Stories da loja no painel (card #48), sobre o contrato do card #46.
 *
 * O STORY É DA LOJA: uma foto ou um vídeo vertical, com legenda, que fica no
 * ar 24 horas e some sozinho — não fica guardado em lugar nenhum. Não há
 * produto vinculado; o link opcional leva para a própria vitrine (ou, com um
 * produto marcado no editor, para a página dele).
 *
 * Criar o story é com o EDITOR em tela cheia (card #84, `features/stories`):
 * câmera ou galeria, desenho, texto, adesivos e pinça, e só então publicar.
 *
 * A foto de perfil (a bolinha) é a logo da loja, trocada em Aparência.
 */

export interface PerfilDaTela {
  readonly apelido: string;
  readonly nome: string;
  readonly fotoDePerfil: string | null;
  readonly iniciais: string;
  readonly corDestaque: string;
  /** Pode trocar a logo (permissão `personalizacao`). */
  readonly podeTrocarFoto: boolean;
}

interface Limite {
  readonly limite: number;
  readonly uso: number;
  readonly restante: number;
}

export function FotoDePerfil({
  perfil,
  tamanho = "grande",
}: {
  readonly perfil: Pick<
    PerfilDaTela,
    "fotoDePerfil" | "iniciais" | "corDestaque" | "nome"
  >;
  readonly tamanho?: "grande" | "pequena";
}) {
  const medida = tamanho === "grande" ? "h-16 w-16 text-xl" : "h-9 w-9 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 rounded-full bg-[var(--cor-primaria)] p-[3px] ${medida}`}
      aria-hidden="true"
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-[var(--cor-fundo)] font-semibold">
        {perfil.fotoDePerfil === null ? (
          <span
            className="flex h-full w-full items-center justify-center"
            style={{
              backgroundColor: perfil.corDestaque,
              color: "var(--cor-tinta-extrema-escura)",
            }}
          >
            {perfil.iniciais}
          </span>
        ) : (
          <img
            className="h-full w-full object-cover"
            src={perfil.fotoDePerfil}
            alt=""
          />
        )}
      </span>
    </span>
  );
}

export function TelaDeStories({ perfil }: { readonly perfil: PerfilDaTela }) {
  const [stories, setStories] = useState<StoryDaLoja[]>([]);
  const [limite, setLimite] = useState<Limite | null>(null);
  const [limites, setLimites] = useState<LimitesDeMidia>(
    LIMITES_DE_MIDIA_INICIAIS,
  );
  const [carregado, setCarregado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  async function carregar() {
    try {
      const resposta = await fetch("/api/loja/midia/stories", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as {
        stories: StoryDaLoja[];
        limite: Limite;
      };
      setStories(dados.stories);
      setLimite(dados.limite);
    } catch {
      setMensagem("Não foi possível carregar os stories agora.");
    } finally {
      setCarregado(true);
      setAgora(Date.now());
    }
  }

  useEffect(() => {
    void carregar();
    void buscarLimitesDeMidia().then(setLimites);
    // A contagem regressiva anda sozinha; o que venceu sai da lista.
    const relogio = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(relogio);
  }, []);

  const noAr = stories.filter(
    (story) => new Date(story.expiraEm).getTime() > agora,
  );
  const cheio = limite !== null && limite.restante <= 0;

  async function aoPublicar() {
    setMensagem("Story no ar. Ele some sozinho em 24 horas.");
    await carregar();
  }

  async function apagar(story: StoryDaLoja) {
    setApagandoId(null);
    const resposta = await fetch(`/api/loja/midia/stories/${story.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (resposta?.ok) {
      await carregar();
      setMensagem("Story apagado. Ele saiu do ar na hora.");
    } else {
      setMensagem("Não foi possível apagar o story.");
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section
        aria-labelledby="postar-story"
        className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <FotoDePerfil perfil={perfil} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{perfil.nome}</p>
            {perfil.podeTrocarFoto ? (
              <a
                className="text-sm font-semibold text-[var(--cor-primaria-texto)]"
                href="/painel/aparencia#foto-de-perfil"
              >
                {perfil.fotoDePerfil === null
                  ? "Enviar foto de perfil"
                  : "Trocar foto de perfil"}
              </a>
            ) : (
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                A foto de perfil é a logo da loja.
              </p>
            )}
          </div>
        </div>

        <h2 id="postar-story" className="mt-6 text-xl font-semibold">
          Postar story
        </h2>
        <div className="sc-aviso sc-aviso--info mt-3" role="note">
          <div>
            <p className="sc-aviso__titulo">Some sozinho em 24 horas</p>
            <p className="text-sm">
              O story não fica guardado: depois de 24 horas ele sai do ar e o
              arquivo é apagado. Guarde uma cópia se quiser usar de novo.
            </p>
          </div>
        </div>

        {limite !== null ? (
          <p className="mt-3 text-sm text-[var(--cor-tinta-suave)]">
            {limite.uso} de {limite.limite} stories no ar
            {cheio ? " — apague um para postar outro." : "."}
          </p>
        ) : null}

        <p className="mt-5 text-sm text-[var(--cor-tinta-suave)]">
          Abre a câmera ou a galeria. Antes de publicar dá para desenhar,
          escrever, colocar adesivos e ajustar a foto com os dedos.
        </p>
        <button
          className="sc-botao sc-botao--primaria mt-3 inline-flex items-center gap-2"
          type="button"
          disabled={cheio}
          onClick={() => {
            setMensagem(null);
            setCriando(true);
          }}
        >
          <IconeCamera aria-hidden="true" />
          Criar story
        </button>

        {mensagem !== null ? (
          <p className="mt-4 text-sm" role="status">
            {mensagem}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="stories-no-ar">
        <h2 id="stories-no-ar" className="text-xl font-semibold">
          No ar agora
        </h2>
        {!carregado ? (
          <p className="mt-3 text-sm text-[var(--cor-tinta-suave)]">
            Carregando…
          </p>
        ) : noAr.length === 0 ? (
          <div className="mt-3 rounded-[var(--raio-cartao)] border border-dashed border-[var(--cor-borda)] p-8 text-center">
            <p className="font-medium">Nenhum story no ar.</p>
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              Poste uma foto ou um vídeo: os clientes veem na bolinha da sua
              loja, no topo de Explorar e na vitrine.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {noAr.map((story) => (
              <li
                key={story.id}
                className="overflow-hidden rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)]"
              >
                <div className="relative aspect-[9/16] bg-black">
                  {story.tipo === "video" ? (
                    <video
                      className="h-full w-full object-cover"
                      src={`${story.url}#t=0.1`}
                      poster={story.capa ?? undefined}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      className="h-full w-full object-cover"
                      src={story.url}
                      alt={story.legenda ?? "Story da loja"}
                    />
                  )}
                  <div className="absolute inset-x-2 top-2 h-1 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full bg-white"
                      style={{
                        width: `${Math.round(fracaoPassada(story.criadoEm, story.expiraEm, agora) * 100)}%`,
                      }}
                    />
                  </div>
                  {story.tipo === "video" ? (
                    <span className="sc-selo sc-selo--info absolute left-2 top-5">
                      Vídeo
                      {story.duracaoSegundos === null
                        ? ""
                        : ` · ${formatarDuracao(story.duracaoSegundos)}`}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1 p-3 text-sm">
                  <p className="font-semibold" data-tempo>
                    Some em {tempoQueFalta(story.expiraEm, agora)}
                  </p>
                  <p className="text-[var(--cor-tinta-suave)]">
                    {textoDasVisualizacoes(story.visualizacoes)}
                  </p>
                  {story.legenda !== null ? (
                    <p className="line-clamp-2">{story.legenda}</p>
                  ) : null}
                  {apagandoId === story.id ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        className="sc-botao sc-botao--perigo sc-botao--pequeno"
                        type="button"
                        onClick={() => void apagar(story)}
                      >
                        Apagar agora
                      </button>
                      <button
                        className="sc-botao sc-botao--discreta sc-botao--pequeno"
                        type="button"
                        onClick={() => setApagandoId(null)}
                      >
                        Manter
                      </button>
                    </div>
                  ) : (
                    <button
                      className="sc-botao sc-botao--secundaria sc-botao--pequeno mt-1 w-fit"
                      type="button"
                      onClick={() => setApagandoId(story.id)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {criando ? (
        <EditorDeStory
          perfil={{
            apelido: perfil.apelido,
            nome: perfil.nome,
            corDestaque: perfil.corDestaque,
          }}
          limites={limites}
          aoPublicado={() => void aoPublicar()}
          aoFechar={() => setCriando(false)}
        />
      ) : null}
    </div>
  );
}

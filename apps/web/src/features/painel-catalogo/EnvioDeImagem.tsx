"use client";

import type { LimitesDeMidia, MidiaDoProduto } from "@simpleclick/contracts";
import { useEffect, useId, useMemo, useState } from "react";

import {
  buscarLimitesDeMidia,
  enviarComProgresso,
  explicarRecusaDoEnvio,
  formatarDuracao,
  formatarTamanho,
  LIMITES_DE_MIDIA_INICIAIS,
  lerDadosDoVideo,
} from "../../lib/envio-de-midia.ts";
import {
  conferirArquivoDeImagem,
  TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES,
} from "../../lib/imagem.ts";
import { textoRecomendado } from "../../lib/espacos-de-imagem.ts";
import {
  FORMATOS_DO_INPUT_DE_FOTO,
  useRecorteDeImagem,
} from "../recorte/RecorteDeImagem.tsx";
import { EXPLICACOES } from "./explicacoes.ts";
import { CampoComRotulo, descritoDoInfo } from "./RotuloComInfo.tsx";

/**
 * As fotos E os vídeos do produto (T-303, card #48).
 *
 * UMA GALERIA SÓ: fotos e vídeos dividem a mesma ordem, que o dono escolhe
 * (setas ou arrastar). A CAPA do produto é a foto principal: vai para o cartão
 * da vitrine e do feed. O vídeo tem a sua própria capa (o quadro que aparece
 * antes do play), que o dono pode trocar por uma foto.
 *
 * O ARQUIVO É CONFERIDO DUAS VEZES (AC-306). Aqui, para o dono saber na hora
 * que escolheu algo que não serve — foto pelos bytes, vídeo pelo tamanho e
 * pela duração lida do navegador. E na API, que é quem decide.
 *
 * Contrato do card #46: galeria em `GET .../midias`, ordem em
 * `PUT .../midias/ordem`, vídeo em `POST .../videos` (arquivo cru). As fotos
 * seguem nas rotas de `/imagens` de sempre.
 */

interface Props {
  readonly produtoId: string;
}

const LIMITE_DE_FOTOS = 5;

/** O que foi escolhido para enviar, já conferido. */
type Escolhido =
  | {
      readonly tipo: "imagem";
      readonly arquivo: File;
      readonly formato: string;
      readonly previa: string;
    }
  | {
      readonly tipo: "video";
      readonly arquivo: File;
      readonly duracaoSegundos: number | null;
      readonly previa: string;
    };

function ehVideo(arquivo: File): boolean {
  return (
    arquivo.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(arquivo.name)
  );
}

function criarPrevia(arquivo: File): string {
  return typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(arquivo)
    : "";
}

function soltarPrevia(endereco: string) {
  if (endereco !== "" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(endereco);
  }
}

export function EnvioDeImagem({ produtoId }: Props) {
  const idDoEnvio = useId();
  const [midias, setMidias] = useState<MidiaDoProduto[]>([]);
  const [limites, setLimites] = useState<LimitesDeMidia>(
    LIMITES_DE_MIDIA_INICIAIS,
  );
  const [carregado, setCarregado] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando fotos e vídeos…");
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [altText, setAltText] = useState("");
  const [comoCapa, setComoCapa] = useState(true);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  // A foto escolhida para trocar aparece no cartão na hora, antes de o envio acabar.
  const [previaDaTroca, setPreviaDaTroca] = useState<{
    readonly id: string;
    readonly url: string;
  } | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [campoDoArquivo, setCampoDoArquivo] = useState(0);
  // A foto do produto que vai ser trocada, ou o vídeo cuja capa vai mudar:
  // cada uma passa pela janela de recorte antes de seguir.
  const [alvoDoRecorte, setAlvoDoRecorte] = useState<{
    readonly tipo: "troca" | "capa-do-video";
    readonly midia: MidiaDoProduto;
  } | null>(null);

  const baseDasFotos = `/api/catalogo/produtos/${produtoId}/imagens`;
  const baseDaMidia = `/api/loja/midia/catalogo/produtos/${produtoId}`;

  const fotos = useMemo(
    () => midias.filter((midia) => midia.tipo === "imagem"),
    [midias],
  );
  const videos = useMemo(
    () => midias.filter((midia) => midia.tipo === "video"),
    [midias],
  );
  const cabeFoto = fotos.length < LIMITE_DE_FOTOS;
  const cabeVideo = videos.length < limites.videosPorProduto;

  // Fotos novas: cada uma passa pela janela de recorte (quadrada, 1200 × 1200)
  // e PARA na conferência (descrição, capa); só depois de enviada abre a próxima.
  const recorteDaGaleria = useRecorteDeImagem({
    espaco: "produto",
    pausarDepoisDeCadaFoto: true,
    aoRecortar: receberFotoRecortada,
    aoRecusar: setErroDoArquivo,
  });
  // Trocar uma foto que já está no produto, ou a capa de um vídeo.
  const recorteDoAlvo = useRecorteDeImagem({
    espaco: "produto",
    aoRecortar: (arquivo) => {
      if (alvoDoRecorte === null) return undefined;
      return alvoDoRecorte.tipo === "troca"
        ? trocarFoto(alvoDoRecorte.midia, arquivo)
        : trocarCapaDoVideo(alvoDoRecorte.midia, arquivo);
    },
    aoRecusar: (motivo) => {
      if (motivo !== null) setMensagem(motivo);
    },
  });

  function resumo(lista: readonly MidiaDoProduto[]): string {
    const quantasFotos = lista.filter((m) => m.tipo === "imagem").length;
    const quantosVideos = lista.length - quantasFotos;
    if (lista.length === 0) return "Envie a primeira foto do produto.";
    return `${quantasFotos}/${LIMITE_DE_FOTOS} fotos · ${quantosVideos}/${limites.videosPorProduto} vídeos`;
  }

  async function carregar(aviso?: string) {
    try {
      const resposta = await fetch(`${baseDaMidia}/midias`, {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { midias: MidiaDoProduto[] };
      setMidias(dados.midias);
      setMensagem(aviso ?? resumo(dados.midias));
    } catch {
      setMensagem("Não foi possível carregar as fotos e os vídeos.");
    } finally {
      setCarregado(true);
    }
  }

  useEffect(() => {
    void carregar();
    void buscarLimitesDeMidia().then(setLimites);
  }, [produtoId]);

  useEffect(() => {
    return () => {
      if (escolhido !== null) soltarPrevia(escolhido.previa);
    };
  }, [escolhido]);

  function limparEscolha() {
    setEscolhido(null);
    setErroDoArquivo(null);
    setAltText("");
    setCampoDoArquivo((valor) => valor + 1);
  }

  /** Confere um vídeo escolhido (as fotos seguem pela janela de recorte). */
  async function conferir(arquivo: File | undefined) {
    setEscolhido(null);
    setErroDoArquivo(null);
    if (arquivo === undefined) return;
    setConferindo(true);
    try {
      if (ehVideo(arquivo)) {
        if (!cabeVideo) {
          setErroDoArquivo(
            `O produto já tem ${limites.videosPorProduto} vídeos. Remova um para enviar outro.`,
          );
          return;
        }
        if (arquivo.size > limites.videoTamanhoMaximoBytes) {
          setErroDoArquivo(
            `Este vídeo tem ${formatarTamanho(arquivo.size)}. O máximo é ${formatarTamanho(limites.videoTamanhoMaximoBytes)}.`,
          );
          return;
        }
        const dados = await lerDadosDoVideo(arquivo);
        if (
          dados.duracaoSegundos !== null &&
          dados.duracaoSegundos > limites.videoDuracaoMaximaSegundos + 0.5
        ) {
          setErroDoArquivo(
            `Este vídeo tem ${formatarDuracao(dados.duracaoSegundos)}. O máximo é ${formatarDuracao(limites.videoDuracaoMaximaSegundos)}.`,
          );
          return;
        }
        setEscolhido({
          tipo: "video",
          arquivo,
          duracaoSegundos: dados.duracaoSegundos,
          previa: criarPrevia(arquivo),
        });
        return;
      }
      setErroDoArquivo("Escolha um vídeo MP4 ou WebM.");
    } catch (erro) {
      setErroDoArquivo(
        erro instanceof Error
          ? erro.message
          : "Não foi possível conferir o arquivo.",
      );
    } finally {
      setConferindo(false);
    }
  }

  /** Um ou mais arquivos escolhidos (ou soltos) no campo de adicionar. */
  function escolherArquivos(arquivos: FileList | readonly File[] | null | undefined) {
    const lista = arquivos === null || arquivos === undefined ? [] : Array.from(arquivos);
    const primeiro = lista[0];
    if (primeiro === undefined) return;
    if (ehVideo(primeiro)) {
      void conferir(primeiro);
      return;
    }
    setEscolhido(null);
    if (!cabeFoto) {
      setErroDoArquivo(
        `O produto já tem ${LIMITE_DE_FOTOS} fotos. Remova uma para enviar outra.`,
      );
      return;
    }
    const vagas = LIMITE_DE_FOTOS - fotos.length;
    const imagens = lista.filter((arquivo) => !ehVideo(arquivo));
    recorteDaGaleria.escolher(imagens.slice(0, vagas));
    if (imagens.length > vagas) {
      setMensagem(
        `Cabem só mais ${String(vagas)} foto${vagas === 1 ? "" : "s"} neste produto; vou usar ${vagas === 1 ? "a primeira" : `as ${String(vagas)} primeiras`}.`,
      );
    }
  }

  /** A foto já recortada (WebP, 1200 × 1200) vai para a conferência, antes do envio. */
  async function receberFotoRecortada(arquivo: File): Promise<string | undefined> {
    try {
      const conferencia = await conferirArquivoDeImagem(arquivo);
      setComoCapa(fotos.length === 0);
      setEscolhido({
        tipo: "imagem",
        arquivo,
        formato: conferencia.formato,
        previa: criarPrevia(arquivo),
      });
      return undefined;
    } catch (erro) {
      return erro instanceof Error
        ? erro.message
        : "Não foi possível conferir a foto recortada.";
    }
  }

  async function enviar() {
    if (escolhido === null) return;
    setOcupado(true);
    setProgresso(0);
    setMensagem(
      escolhido.tipo === "video" ? "Enviando o vídeo…" : "Enviando a foto…",
    );
    try {
      let endereco: string;
      if (escolhido.tipo === "video") {
        const consulta = new URLSearchParams();
        if (escolhido.duracaoSegundos !== null) {
          consulta.set(
            "duracaoSegundos",
            String(Math.round(escolhido.duracaoSegundos * 10) / 10),
          );
        }
        const texto = consulta.toString();
        endereco = `${baseDaMidia}/videos${texto === "" ? "" : `?${texto}`}`;
      } else {
        const consulta = new URLSearchParams({ principal: String(comoCapa) });
        if (altText.trim() !== "") consulta.set("texto", altText.trim());
        endereco = `${baseDasFotos}/arquivo?${consulta.toString()}`;
      }
      const resposta = await enviarComProgresso(
        endereco,
        escolhido.arquivo,
        setProgresso,
      );
      if (resposta.status < 200 || resposta.status >= 300) {
        setMensagem(explicarRecusaDoEnvio(resposta, limites));
        return;
      }
      const tipo = escolhido.tipo;
      limparEscolha();
      // Se havia mais fotos na fila, abre a próxima para recortar.
      recorteDaGaleria.retomar();
      await carregar(tipo === "video" ? "Vídeo enviado." : "Foto enviada.");
    } catch {
      setMensagem("A conexão caiu durante o envio. Tente de novo.");
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  async function adicionarPorUrl(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setOcupado(true);
    setMensagem("Salvando foto…");
    try {
      const resposta = await fetch(baseDasFotos, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          altText: altText.trim() || null,
          principal: fotos.length === 0,
        }),
      });
      if (!resposta.ok) throw new Error();
      setUrl("");
      await carregar("Foto adicionada.");
    } catch {
      setMensagem("Informe uma URL HTTPS válida e tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  async function usarComoCapa(midia: MidiaDoProduto) {
    const resposta = await fetch(`${baseDasFotos}/${midia.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principal: true }),
    });
    if (resposta.ok) await carregar("Capa do produto trocada.");
    else setMensagem("Não foi possível trocar a capa do produto.");
  }

  async function trocarCapaDoVideo(
    midia: MidiaDoProduto,
    arquivo: File,
  ): Promise<string | undefined> {
    setOcupado(true);
    setProgresso(0);
    setMensagem("Enviando a capa do vídeo…");
    try {
      const resposta = await enviarComProgresso(
        `${baseDaMidia}/videos/${midia.id}/capa`,
        arquivo,
        setProgresso,
      );
      if (resposta.status < 200 || resposta.status >= 300) {
        const frase = explicarRecusaDoEnvio(resposta, limites);
        setMensagem(frase);
        return frase;
      }
      await carregar("Capa do vídeo trocada.");
      return undefined;
    } catch {
      const frase = "A conexão caiu durante o envio. Tente de novo.";
      setMensagem(frase);
      return frase;
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  /** Troca o arquivo de uma foto que já está no produto (mesmo lugar e mesma capa). */
  async function trocarFoto(
    midia: MidiaDoProduto,
    arquivo: File,
  ): Promise<string | undefined> {
    const provisoria = criarPrevia(arquivo);
    setPreviaDaTroca({ id: midia.id, url: provisoria });
    setOcupado(true);
    setProgresso(0);
    setMensagem("Trocando a foto…");
    try {
      const resposta = await enviarComProgresso(
        `${baseDasFotos}/${midia.id}/arquivo`,
        arquivo,
        setProgresso,
        "PUT",
      );
      if (resposta.status < 200 || resposta.status >= 300) {
        const frase = `${explicarRecusaDoEnvio(resposta, limites)} A foto anterior continua no produto.`;
        setMensagem(frase);
        return frase;
      }
      await carregar("Foto trocada. A nova já aparece na loja.");
      return undefined;
    } catch {
      const frase =
        "A conexão caiu durante o envio. A foto anterior continua no produto. Tente de novo.";
      setMensagem(frase);
      return frase;
    } finally {
      setPreviaDaTroca(null);
      soltarPrevia(provisoria);
      setOcupado(false);
      setProgresso(null);
    }
  }

  async function remover(midia: MidiaDoProduto) {
    setRemovendoId(null);
    const endereco =
      midia.tipo === "video"
        ? `${baseDaMidia}/videos/${midia.id}`
        : `${baseDasFotos}/${midia.id}`;
    const resposta = await fetch(endereco, { method: "DELETE" });
    if (resposta.ok) await carregar("Removido da galeria.");
    else setMensagem("Não foi possível remover.");
  }

  async function gravarOrdem(nova: MidiaDoProduto[]) {
    const anterior = midias;
    setMidias(nova);
    const resposta = await fetch(`${baseDaMidia}/midias/ordem`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ordem: nova.map((midia) => ({ tipo: midia.tipo, id: midia.id })),
      }),
    }).catch(() => null);
    if (resposta?.ok) {
      const dados = (await resposta.json()) as { midias: MidiaDoProduto[] };
      setMidias(dados.midias);
      setMensagem("Ordem salva.");
    } else {
      setMidias(anterior);
      setMensagem("Não foi possível salvar a ordem.");
    }
  }

  function mover(indice: number, destino: number) {
    if (destino < 0 || destino >= midias.length || destino === indice) return;
    const nova = [...midias];
    const [tirada] = nova.splice(indice, 1);
    if (tirada === undefined) return;
    nova.splice(destino, 0, tirada);
    void gravarOrdem(nova);
  }

  const aceita = [FORMATOS_DO_INPUT_DE_FOTO, ...limites.formatosDeVideo].join(",");

  return (
    <section
      className="mt-8 max-w-3xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="imagens-do-produto"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="imagens-do-produto" className="text-2xl font-semibold">
            Fotos e vídeos do produto
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            A capa aparece no cartão da vitrine e no feed; a página do produto
            mostra tudo, na ordem abaixo. Use as setas ou arraste para
            reordenar.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      <ul
        className="mt-4 grid gap-2 text-xs text-[var(--cor-tinta-suave)] sm:grid-cols-2"
        aria-label="Limites de envio"
      >
        <li className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] px-3 py-2">
          <strong className="text-[var(--cor-tinta)]">Fotos:</strong> até{" "}
          {LIMITE_DE_FOTOS}, JPG, PNG, WebP ou HEIC de até{" "}
          {formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES)}; a foto sai
          quadrada e leve.
        </li>
        <li className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] px-3 py-2">
          <strong className="text-[var(--cor-tinta)]">Vídeos:</strong> até{" "}
          {limites.videosPorProduto}, MP4 ou WebM de até{" "}
          {formatarTamanho(limites.videoTamanhoMaximoBytes)} e{" "}
          {formatarDuracao(limites.videoDuracaoMaximaSegundos)}.
        </li>
      </ul>

      {carregado && midias.length > 0 ? (
        <ol className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Galeria">
          {midias.map((midia, indice) => {
            const capaDoProduto = midia.tipo === "imagem" && midia.principal;
            return (
              <li
                key={midia.id}
                draggable={!ocupado}
                onDragStart={() => setArrastandoId(midia.id)}
                onDragEnd={() => setArrastandoId(null)}
                onDragOver={(evento) => evento.preventDefault()}
                onDrop={(evento) => {
                  evento.preventDefault();
                  const de = midias.findIndex((m) => m.id === arrastandoId);
                  setArrastandoId(null);
                  if (de >= 0) mover(de, indice);
                }}
                data-midia={midia.tipo}
                className={`overflow-hidden rounded-[var(--raio-botao)] border ${
                  capaDoProduto
                    ? "border-[var(--cor-primaria)]"
                    : "border-[var(--cor-borda)]"
                } ${arrastandoId === midia.id ? "opacity-50" : ""}`}
              >
                <div className="relative aspect-[4/3] bg-[var(--cor-papel)]">
                  {midia.tipo === "video" ? (
                    <video
                      className="h-full w-full object-cover"
                      src={`${midia.url}#t=0.1`}
                      poster={midia.capa ?? undefined}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      // A chave é o endereço: foto trocada monta uma imagem nova.
                      key={midia.url}
                      className="h-full w-full object-cover"
                      src={previaDaTroca?.id === midia.id ? previaDaTroca.url : midia.url}
                      alt={midia.texto ?? "Foto do produto"}
                    />
                  )}
                  <span className="absolute left-2 top-2 flex gap-1">
                    <span className="sc-selo sc-selo--neutro">
                      {indice + 1}º
                    </span>
                    {midia.tipo === "video" ? (
                      <span className="sc-selo sc-selo--info">
                        Vídeo
                        {midia.duracaoSegundos === null
                          ? ""
                          : ` · ${formatarDuracao(midia.duracaoSegundos)}`}
                      </span>
                    ) : null}
                    {capaDoProduto ? (
                      <span className="sc-selo sc-selo--sucesso">
                        Capa do produto
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    className="sc-botao sc-botao--secundaria sc-botao--pequeno"
                    type="button"
                    aria-label={`Mover o ${indice + 1}º item para antes`}
                    disabled={ocupado || indice === 0}
                    onClick={() => mover(indice, indice - 1)}
                  >
                    ←
                  </button>
                  <button
                    className="sc-botao sc-botao--secundaria sc-botao--pequeno"
                    type="button"
                    aria-label={`Mover o ${indice + 1}º item para depois`}
                    disabled={ocupado || indice === midias.length - 1}
                    onClick={() => mover(indice, indice + 1)}
                  >
                    →
                  </button>
                  {midia.tipo === "imagem" && !midia.principal ? (
                    <button
                      className="sc-botao sc-botao--secundaria sc-botao--pequeno"
                      type="button"
                      disabled={ocupado}
                      onClick={() => void usarComoCapa(midia)}
                    >
                      Usar como capa
                    </button>
                  ) : null}
                  {midia.tipo === "imagem" ? (
                    <label className="sc-botao sc-botao--secundaria sc-botao--pequeno cursor-pointer">
                      Trocar foto
                      <input
                        className="sr-only"
                        type="file"
                        accept={FORMATOS_DO_INPUT_DE_FOTO}
                        disabled={ocupado}
                        aria-label={`Trocar a foto do ${indice + 1}º item`}
                        onChange={(evento) => {
                          const arquivo = evento.target.files?.[0];
                          evento.target.value = "";
                          if (arquivo === undefined) return;
                          setAlvoDoRecorte({ tipo: "troca", midia });
                          recorteDoAlvo.escolher([arquivo]);
                        }}
                      />
                    </label>
                  ) : null}
                  {midia.tipo === "video" ? (
                    <label className="sc-botao sc-botao--secundaria sc-botao--pequeno cursor-pointer">
                      {midia.capa === null ? "Escolher capa" : "Trocar capa"}
                      <input
                        className="sr-only"
                        type="file"
                        accept={FORMATOS_DO_INPUT_DE_FOTO}
                        disabled={ocupado}
                        aria-label="Foto de capa do vídeo"
                        onChange={(evento) => {
                          const arquivo = evento.target.files?.[0];
                          evento.target.value = "";
                          if (arquivo === undefined) return;
                          setAlvoDoRecorte({ tipo: "capa-do-video", midia });
                          recorteDoAlvo.escolher([arquivo]);
                        }}
                      />
                    </label>
                  ) : null}
                  {removendoId === midia.id ? (
                    <>
                      <button
                        className="sc-botao sc-botao--perigo sc-botao--pequeno"
                        type="button"
                        onClick={() => void remover(midia)}
                      >
                        Confirmar remoção
                      </button>
                      <button
                        className="sc-botao sc-botao--discreta sc-botao--pequeno"
                        type="button"
                        onClick={() => setRemovendoId(null)}
                      >
                        Manter
                      </button>
                    </>
                  ) : (
                    <button
                      className="sc-botao sc-botao--discreta sc-botao--pequeno"
                      type="button"
                      disabled={ocupado}
                      onClick={() => setRemovendoId(midia.id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {progresso !== null ? (
        <div className="mt-6" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span>Enviando…</span>
            <span>{Math.round(progresso * 100)}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--cor-papel)]"
            role="progressbar"
            aria-label="Progresso do envio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso * 100)}
          >
            <div
              className="h-full rounded-full bg-[var(--cor-primaria)] transition-[width]"
              style={{ width: `${Math.round(progresso * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {cabeFoto || cabeVideo ? (
        <div
          className="mt-6 grid gap-4 border-t border-[var(--cor-borda)] pt-6"
          onDragOver={(evento) => {
            if (evento.dataTransfer.types.includes("Files")) evento.preventDefault();
          }}
          onDrop={(evento) => {
            if (evento.dataTransfer.files.length === 0) return;
            evento.preventDefault();
            if (!ocupado) escolherArquivos(evento.dataTransfer.files);
          }}
        >
          <label>
            <span className="text-sm font-medium">
              {cabeFoto && cabeVideo
                ? "Adicionar foto ou vídeo"
                : cabeFoto
                  ? "Adicionar foto"
                  : "Adicionar vídeo"}
            </span>
            <input
              key={campoDoArquivo}
              className="sc-campo__controle mt-2 w-full"
              type="file"
              accept={aceita}
              multiple
              disabled={ocupado}
              onChange={(evento) => escolherArquivos(evento.target.files)}
            />
            <span className="mt-2 block text-xs text-[var(--cor-tinta-suave)]">
              {textoRecomendado("produto")} Pode escolher várias fotos de uma
              vez (ou arrastar para cá): cada uma abre para você enquadrar. A
              conferência olha o conteúdo do arquivo, e não o nome.
            </span>
            {conferindo ? (
              <span className="mt-2 block text-sm" role="status">
                Conferindo o arquivo…
              </span>
            ) : null}
            {erroDoArquivo ? (
              <span className="mt-2 block text-sm" role="alert">
                {erroDoArquivo}
              </span>
            ) : null}
          </label>

          {escolhido !== null ? (
            <div className="grid gap-4 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4 sm:grid-cols-[10rem_1fr]">
              <div className="aspect-square overflow-hidden rounded-[var(--raio-botao)] bg-[var(--cor-papel)]">
                {escolhido.previa === "" ? null : escolhido.tipo === "video" ? (
                  <video
                    className="h-full w-full object-cover"
                    src={escolhido.previa}
                    muted
                    playsInline
                    controls
                  />
                ) : (
                  <img
                    className="h-full w-full object-cover"
                    src={escolhido.previa}
                    alt="Prévia da foto escolhida"
                  />
                )}
              </div>
              <div className="grid content-start gap-3">
                <p
                  className="text-sm text-[var(--cor-primaria-texto)]"
                  role="status"
                >
                  {escolhido.tipo === "video"
                    ? `Vídeo pronto para enviar (${formatarTamanho(escolhido.arquivo.size)}${
                        escolhido.duracaoSegundos === null
                          ? ""
                          : `, ${formatarDuracao(escolhido.duracaoSegundos)}`
                      }).`
                    : `Arquivo válido (${escolhido.formato}, ${formatarTamanho(escolhido.arquivo.size)}).`}
                </p>
                {escolhido.tipo === "imagem" ? (
                  <>
                    <CampoComRotulo
                      id={`${idDoEnvio}-alt`}
                      rotulo="Descrição da foto (texto alternativo)"
                      info={EXPLICACOES.textoAlternativo}
                    >
                      <input
                        id={`${idDoEnvio}-alt`}
                        aria-describedby={descritoDoInfo(
                          `${idDoEnvio}-alt`,
                          EXPLICACOES.textoAlternativo,
                        )}
                        className="sc-campo__controle w-full"
                        value={altText}
                        onChange={(evento) => setAltText(evento.target.value)}
                        maxLength={160}
                        placeholder="Ex.: Pastel de queijo aberto"
                      />
                    </CampoComRotulo>
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        className="h-5 w-5"
                        type="checkbox"
                        checked={comoCapa}
                        onChange={(evento) =>
                          setComoCapa(evento.target.checked)
                        }
                      />
                      Usar como capa do produto
                    </label>
                  </>
                ) : (
                  <p className="text-xs text-[var(--cor-tinta-suave)]">
                    O vídeo entra no fim da galeria. Depois de enviado, você
                    pode mudar a posição e escolher a capa dele.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="sc-botao sc-botao--primaria w-fit"
                    type="button"
                    disabled={ocupado}
                    onClick={() => void enviar()}
                  >
                    {ocupado
                      ? "Enviando…"
                      : escolhido.tipo === "video"
                        ? "Enviar vídeo"
                        : "Enviar foto"}
                  </button>
                  <button
                    className="sc-botao sc-botao--discreta w-fit"
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      limparEscolha();
                      recorteDaGaleria.cancelarFila();
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {cabeFoto ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--cor-tinta-suave)]">
                Já tem a foto hospedada? Informe a URL
              </summary>
              <form
                onSubmit={(evento) => void adicionarPorUrl(evento)}
                className="mt-3 grid gap-3"
              >
                <CampoComRotulo
                  id={`${idDoEnvio}-url`}
                  rotulo="Endereço da foto (link com https://)"
                  info={EXPLICACOES.urlDaFoto}
                >
                  <input
                    id={`${idDoEnvio}-url`}
                    aria-describedby={descritoDoInfo(
                      `${idDoEnvio}-url`,
                      EXPLICACOES.urlDaFoto,
                    )}
                    className="sc-campo__controle w-full"
                    type="url"
                    value={url}
                    onChange={(evento) => setUrl(evento.target.value)}
                    placeholder="https://..."
                    required
                  />
                </CampoComRotulo>
                <button
                  className="sc-botao sc-botao--secundaria w-fit"
                  type="submit"
                  disabled={ocupado}
                >
                  Adicionar pela URL
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 border-t border-[var(--cor-borda)] pt-6 text-sm text-[var(--cor-tinta-suave)]">
          A galeria está cheia. Remova uma foto ou um vídeo para enviar outro.
        </p>
      )}
      {recorteDaGaleria.janela}
      {recorteDoAlvo.janela}
    </section>
  );
}

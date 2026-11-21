"use client";
/**
 * Uma foto da loja (fundo da vitrine ou topo do cardápio): escolher, enquadrar
 * na janela de recorte, enviar e remover.
 *
 * CADA FOTO TEM A SUA MOLDURA, e duas versões. O fundo da vitrine é o cartão de
 * apresentação (deitado no computador, em pé no celular) e o topo do cardápio
 * é uma faixa (larga no computador, mais alta no celular): a janela de recorte
 * (`RecortadorDeImagem`, cards #82 e #36) tem as abas "Computador | Celular",
 * cada uma com a sua moldura, o seu zoom e a sua posição, e a prévia "como vai
 * aparecer" mostra o lugar real (cartão ou faixa, com nome, logo e selo). O
 * celular segue o ajuste do computador até o dono mexer nele.
 *
 * O arquivo que sai de cada aba já é um WebP leve nas medidas dela, e é
 * enviado pelo fluxo de imagens da loja (`/api/loja/imagem/<tipo>` e
 * `<tipo>Celular`), que devolve o endereço. A foto só entra no ar quando o
 * dono salva a aparência; a vitrine usa a versão do celular em telas
 * estreitas.
 *
 * Remover volta à capa padrão do tipo de negócio.
 */
import { useId, useMemo, useRef, useState } from "react";
import { IconeRecortar, PALETA_OFICIAL } from "@simpleclick/ui";
import type {
  AjusteDoRecorte,
  EspacoDoRecorte,
  ResultadoDoRecorte,
} from "@simpleclick/ui";
import type { AjusteDaFoto } from "@simpleclick/contracts";

import {
  ESPACOS_DE_IMAGEM,
  espacoDeImagem,
  type IdDoEspacoDeImagem,
} from "../../lib/espacos-de-imagem.ts";
import {
  DicaDoEspaco,
  FORMATOS_DO_INPUT_DE_FOTO,
  useRecorteDeImagem,
} from "../recorte/RecorteDeImagem.tsx";
import {
  sobreposicaoDoContexto,
  type DadosDoContexto,
  type LugarDaFoto,
} from "./ContextoDaFoto.tsx";
import type { NomeDaExplicacao } from "./explicacoes-do-painel.ts";
import { InfoDoPainel } from "./RotuloComInfo.tsx";

export type TipoDeFoto = "fundo" | "topo";

const ESPACO_DE_CADA_FOTO: Record<TipoDeFoto, IdDoEspacoDeImagem> = {
  fundo: "fundo-da-vitrine",
  topo: "topo-do-cardapio",
};

const LUGAR_DE_CADA_FOTO: Record<TipoDeFoto, LugarDaFoto> = {
  fundo: "vitrine",
  topo: "cardapio",
};

/** A saída do computador: a primeira moldura do fundo da vitrine. */
export const LARGURA_DA_FOTO = ESPACOS_DE_IMAGEM["fundo-da-vitrine"].largura;
export const ALTURA_DA_FOTO = ESPACOS_DE_IMAGEM["fundo-da-vitrine"].altura;

/** A proporção (largura ÷ altura) de cada moldura, para as caixas da tela. */
function proporcaoDa(tipo: TipoDeFoto, tela: "computador" | "celular"): number {
  const variantes = espacoDeImagem(ESPACO_DE_CADA_FOTO[tipo]).variantes ?? [];
  const variante = variantes.find((candidata) => candidata.id === tela);
  return variante === undefined ? 1 : variante.largura / variante.altura;
}

export interface EnvioDeImagemProps {
  readonly tipo: TipoDeFoto;
  readonly titulo: string;
  readonly ajuda: string;
  /** O endereço da foto do computador; vazio quando vale a capa padrão. */
  readonly valor: string;
  /** O endereço da foto do celular; vazio quando o celular usa a do computador. */
  readonly valorCelular: string;
  /** Troca as duas fotos de uma vez (a janela gera as duas versões juntas). */
  readonly aoMudar: (
    computador: string,
    celular: string,
    ajuste: AjusteDaFoto | null,
  ) => void;
  /** O ajuste guardado: o original sem corte e como foi enquadrado. */
  readonly ajuste?: AjusteDaFoto | undefined;
  /** Troca só o endereço do computador (campo manual). */
  readonly aoMudarEndereco?: ((computador: string) => void) | undefined;
  /** Troca só o endereço do celular (campo manual). */
  readonly aoMudarEnderecoCelular?: ((celular: string) => void) | undefined;
  /** O que a prévia "como vai aparecer" mostra por cima da foto. */
  readonly contexto: DadosDoContexto;
  /** Erro do campo vindo do salvamento. */
  readonly erro?: string | undefined;
  /** O "i" ao lado do título, quando o título não basta. */
  readonly explicacao?: NomeDaExplicacao | undefined;
}

/**
 * Busca a foto atual da loja pelo site (a janela de recorte só desenha foto da
 * mesma origem). Falha com erro quando a foto não abre.
 */
export async function buscarFotoDaLoja(
  endereco: string,
  nome: string,
): Promise<File> {
  const resposta = await fetch(
    `/api/loja/foto?u=${encodeURIComponent(endereco)}`,
    { cache: "no-store" },
  );
  if (!resposta.ok) throw new Error(String(resposta.status));
  const blob = await resposta.blob();
  return new File([blob], `${nome}.${blob.type.split("/")[1] ?? "webp"}`, {
    type: blob.type,
  });
}

/** O ajuste guardado no tema, no formato que a janela de recorte lê. */
export function ajusteParaORecorte(ajuste: AjusteDaFoto): AjusteDoRecorte {
  return {
    estados: ajuste.estados as AjusteDoRecorte["estados"],
    iguais: ajuste.iguais,
    fundo:
      ajuste.fundo.tipo === "cor"
        ? { tipo: "cor", cor: ajuste.fundo.cor ?? PALETA_OFICIAL.branco }
        : { tipo: ajuste.fundo.tipo },
  };
}

async function enviarArquivo(
  tipoDeEnvio: string,
  arquivo: File,
): Promise<{ readonly url: string } | { readonly erro: string }> {
  try {
    const resposta = await fetch(`/api/loja/imagem/${tipoDeEnvio}`, {
      method: "PUT",
      headers: { "content-type": arquivo.type },
      body: arquivo,
    });
    const corpo = (await resposta.json().catch(() => ({}))) as {
      url?: string;
      mensagem?: string;
    };
    if (resposta.ok && typeof corpo.url === "string") return { url: corpo.url };
    return {
      erro:
        corpo.mensagem ??
        "Não foi possível enviar a foto agora. A foto anterior continua no ar.",
    };
  } catch {
    return {
      erro: "Não foi possível enviar a foto agora: a conexão falhou. A foto anterior continua no ar.",
    };
  }
}

export function EnvioDeImagem({
  tipo,
  titulo,
  ajuda,
  valor,
  valorCelular,
  aoMudar,
  ajuste,
  aoMudarEndereco,
  aoMudarEnderecoCelular,
  contexto,
  erro,
  explicacao,
}: EnvioDeImagemProps) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  // O que já deu certo e o que falta: quem envia precisa saber que a foto
  // nova não está no ar até salvar (a vitrine só muda no "Salvar e publicar").
  const [aviso, setAviso] = useState<string | null>(null);
  // Reabrindo "Ajustar a foto": de onde veio a foto e como estava enquadrada.
  const [reedicao, setReedicao] = useState<{
    readonly ajuste: AjusteDoRecorte | undefined;
    readonly originalGuardado: string | null;
    readonly arquivo: File;
  } | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  /** Recebe as fotos já recortadas (WebP; uma por aba) e as envia. */
  async function enviar(
    arquivo: File,
    original: File,
    resultado: ResultadoDoRecorte,
  ): Promise<string | undefined> {
    setRecusa(null);
    setAviso(null);
    setEnviando(true);
    try {
      const porTela = resultado.variantes ?? [{ id: "computador", arquivo }];
      let computador = valor;
      let celular = valorCelular;
      for (const parte of porTela) {
        const doCelular = parte.id === "celular";
        const enviado = await enviarArquivo(
          doCelular ? `${tipo}Celular` : tipo,
          parte.arquivo,
        );
        if ("erro" in enviado) {
          setRecusa(enviado.erro);
          return enviado.erro;
        }
        if (doCelular) celular = enviado.url;
        else computador = enviado.url;
      }
      // O ORIGINAL fica guardado para reabrir o ajuste sem perda: se a foto
      // aberta já é o original guardado, o endereço continua o mesmo.
      const enderecoGuardado =
        reedicao?.arquivo === original ? reedicao.originalGuardado : null;
      const guardado =
        resultado.original === undefined
          ? null
          : enderecoGuardado === null
            ? await enviarArquivo("original", resultado.original)
            : { url: enderecoGuardado };
      if (guardado !== null && "erro" in guardado) {
        setRecusa(guardado.erro);
        return guardado.erro;
      }
      const ajusteNovo: AjusteDaFoto | null =
        guardado === null
          ? null
          : {
              original: guardado.url,
              computador,
              celular: celular === "" ? null : celular,
              iguais: resultado.ajuste.iguais,
              fundo:
                resultado.ajuste.fundo.tipo === "cor"
                  ? { tipo: "cor", cor: resultado.ajuste.fundo.cor }
                  : { tipo: resultado.ajuste.fundo.tipo },
              estados: resultado.ajuste.estados,
            };
      aoMudar(computador, celular, ajusteNovo);
      setReedicao(null);
      setAviso(
        "Foto adaptada para computador e celular. Os dois enquadramentos já aparecem na prévia; clique em Salvar e publicar para colocar no ar.",
      );
      return undefined;
    } finally {
      setEnviando(false);
    }
  }

  const espacoDaJanela: EspacoDoRecorte = useMemo(() => {
    const base = espacoDeImagem(ESPACO_DE_CADA_FOTO[tipo]);
    return {
      ...base,
      variantes: (base.variantes ?? []).map((variante) => ({
        ...variante,
        miniaturas: (variante.miniaturas ?? []).map((miniatura) => ({
          ...miniatura,
          sobreposicao: sobreposicaoDoContexto(
            LUGAR_DE_CADA_FOTO[tipo],
            variante.id,
            variante.larguraDaTela,
            contexto,
          ),
        })),
      })),
    };
  }, [tipo, contexto]);

  const recorte = useRecorteDeImagem({
    espaco: ESPACO_DE_CADA_FOTO[tipo],
    espacoDaJanela,
    ajusteInicial: reedicao?.ajuste,
    guardarOriginal: true,
    aoCancelar: () => setReedicao(null),
    aoRecortar: enviar,
    aoRecusar: (motivo) => {
      setAviso(null);
      setRecusa(
        motivo === null ? null : `${motivo} A foto anterior continua no ar.`,
      );
    },
  });

  /**
   * "Ajustar": reabre a janela com a foto atual e o enquadramento de agora. Com
   * o original guardado, o corte parte dele (sem perda); numa foto enviada antes
   * desta função, parte da foto que está no ar.
   */
  async function reabrir() {
    setRecusa(null);
    setAviso(null);
    setAbrindo(true);
    try {
      const guardado = ajuste !== undefined && ajuste.computador === valor;
      const origemDaFoto = guardado ? ajuste.original : valor;
      const arquivo = await buscarFotoDaLoja(origemDaFoto, tipo);
      setReedicao({
        arquivo,
        ajuste: guardado ? ajusteParaORecorte(ajuste) : undefined,
        originalGuardado: guardado ? ajuste.original : null,
      });
      recorte.escolher([arquivo]);
    } catch {
      setRecusa(
        "Não consegui abrir a foto atual para ajustar. Use “Trocar foto” e escolha o arquivo de novo.",
      );
    } finally {
      setAbrindo(false);
    }
  }

  const idDoErro = `${id}-erro`;
  const mensagem = recusa ?? erro;
  const proporcaoDoComputador = proporcaoDa(tipo, "computador");
  const proporcaoDoCelular = proporcaoDa(tipo, "celular");

  return (
    <fieldset
      className="space-y-3 rounded-3xl border border-[var(--cor-borda)] p-4"
      data-foto={tipo}
      {...recorte.soltar}
    >
      <legend className="flex items-center gap-1.5 px-2 font-medium">
        {titulo}
        {explicacao === undefined ? null : (
          <InfoDoPainel explicacao={explicacao} nome={titulo} />
        )}
      </legend>
      <p className="text-sm text-[var(--cor-tinta-suave)]">{ajuda}</p>
      <DicaDoEspaco espaco={ESPACO_DE_CADA_FOTO[tipo]} />
      <p className="text-sm text-[var(--cor-tinta-suave)]">
        Escolha uma única foto: ela será adaptada para computador e celular. Os
        ajustes de cada tela são opcionais.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <figure className="m-0 min-w-0 flex-1 basis-56 space-y-1.5">
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-dashed border-[var(--cor-borda-forte)] bg-[var(--cor-superficie)]"
            style={{ aspectRatio: String(proporcaoDoComputador) }}
            data-moldura="computador"
          >
            {valor ? (
              <img
                // A chave é o próprio endereço: foto nova monta uma imagem nova,
                // e o navegador nunca reaproveita o quadro da anterior.
                key={valor}
                src={valor}
                alt={`${titulo} atual no computador`}
                className="absolute inset-0 size-full object-cover"
                data-foto-atual=""
              />
            ) : (
              <p className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-[var(--cor-tinta-suave)]">
                Sem foto: vale a capa padrão do seu tipo de negócio.
              </p>
            )}
          </div>
          <figcaption className="text-xs text-[var(--cor-tinta-suave)]">
            Computador
          </figcaption>
        </figure>

        <figure className="m-0 shrink-0 space-y-1.5">
          <div
            className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--cor-borda-forte)] bg-[var(--cor-superficie)]"
            style={{
              aspectRatio: String(proporcaoDoCelular),
              width: proporcaoDoCelular < 1 ? "5.5rem" : "11rem",
            }}
            data-moldura="celular"
          >
            {valorCelular ? (
              <img
                key={valorCelular}
                src={valorCelular}
                alt={`${titulo} atual no celular`}
                className="absolute inset-0 size-full object-cover"
                data-foto-atual-celular=""
              />
            ) : (
              <p className="absolute inset-0 grid place-items-center px-2 text-center text-[11px] leading-tight text-[var(--cor-tinta-suave)]">
                {valor ? "Usa a foto do computador." : "Capa padrão."}
              </p>
            )}
          </div>
          <figcaption className="text-xs text-[var(--cor-tinta-suave)]">
            Celular
          </figcaption>
        </figure>
      </div>

      <div className="flex flex-wrap gap-2">
        {valor ? (
          <button
            type="button"
            className="sc-botao sc-botao--secundaria"
            disabled={enviando || abrindo}
            onClick={() => void reabrir()}
            data-ajustar={tipo}
          >
            <IconeRecortar size={18} />
            {abrindo ? "Abrindo…" : "Ajustar"}
          </button>
        ) : null}
        <button
          type="button"
          className="sc-botao sc-botao--secundaria"
          disabled={enviando}
          onClick={() => {
            setReedicao(null);
            entrada.current?.click();
          }}
        >
          {enviando ? "Enviando…" : valor ? "Trocar foto" : "Escolher foto"}
        </button>
        {valor || valorCelular ? (
          <button
            type="button"
            className="sc-botao sc-botao--discreta"
            disabled={enviando}
            onClick={() => {
              setRecusa(null);
              setAviso(
                "Foto removida. Clique em Salvar e publicar para voltar à capa padrão.",
              );
              aoMudar("", "", null);
            }}
          >
            Remover e voltar à capa padrão
          </button>
        ) : null}
      </div>

      <input
        ref={entrada}
        type="file"
        className="sr-only"
        tabIndex={-1}
        name={`arquivo-${tipo}`}
        aria-label={`Escolher arquivo de ${titulo}`}
        accept={FORMATOS_DO_INPUT_DE_FOTO}
        onChange={(evento) => {
          recorte.escolher(evento.target.files);
          evento.target.value = "";
        }}
      />

      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--cor-tinta-suave)]">
          Já tenho a foto hospedada (endereço https://)
        </summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-xs text-[var(--cor-tinta-suave)]">
              Computador
            </span>
            <input
              className="sc-campo w-full"
              type="url"
              name={`endereco-${tipo}`}
              aria-label={`Endereço da foto de ${titulo} no computador`}
              value={valor}
              placeholder="https://…"
              onChange={(evento) => {
                setAviso(null);
                if (aoMudarEndereco === undefined) {
                  aoMudar(evento.target.value, valorCelular, null);
                } else aoMudarEndereco(evento.target.value);
              }}
              aria-describedby={mensagem ? idDoErro : undefined}
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--cor-tinta-suave)]">
              Celular (vazio: usa a do computador)
            </span>
            <input
              className="sc-campo w-full"
              type="url"
              name={`endereco-${tipo}-celular`}
              aria-label={`Endereço da foto de ${titulo} no celular`}
              value={valorCelular}
              placeholder="https://…"
              onChange={(evento) => {
                setAviso(null);
                if (aoMudarEnderecoCelular === undefined) {
                  aoMudar(valor, evento.target.value, null);
                } else aoMudarEnderecoCelular(evento.target.value);
              }}
            />
          </label>
        </div>
      </details>

      {aviso !== null && !mensagem ? (
        <p
          className="text-sm font-medium text-[var(--cor-primaria)]"
          role="status"
        >
          {aviso}
        </p>
      ) : null}

      {mensagem ? (
        <p
          id={idDoErro}
          className="text-sm font-medium text-[var(--cor-erro)]"
          role="alert"
        >
          {mensagem}
        </p>
      ) : null}

      {recorte.janela}
    </fieldset>
  );
}

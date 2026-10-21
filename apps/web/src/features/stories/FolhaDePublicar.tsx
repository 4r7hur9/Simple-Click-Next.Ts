"use client";

import { IconeConfirmar, IconeEnviar } from "@simpleclick/ui";
import { useEffect, useId, useRef } from "react";

import { MAXIMO_DA_LEGENDA, type DestinoDoBotao } from "./publicar.ts";
import type { ProdutoMarcado } from "./documento.ts";

export type EstadoDoEnvio =
  | { readonly fase: "pronto" }
  | { readonly fase: "compondo"; readonly fracao: number | null }
  | { readonly fase: "enviando"; readonly fracao: number }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "sucesso" };

interface Props {
  readonly estado: EstadoDoEnvio;
  readonly tipo: "imagem" | "video";
  readonly nomeDaLoja: string;
  readonly legenda: string;
  readonly destino: DestinoDoBotao;
  readonly produto: ProdutoMarcado | null;
  readonly aoMudarLegenda: (legenda: string) => void;
  readonly aoMudarDestino: (destino: DestinoDoBotao) => void;
  readonly aoPublicar: () => void;
  readonly aoVoltar: () => void;
  readonly aoConcluir: () => void;
}

function Barra({ fracao, rotulo }: { fracao: number | null; rotulo: string }) {
  const porcento = fracao === null ? null : Math.round(fracao * 100);
  return (
    <div aria-live="polite">
      <div className="sc-story-progresso__texto">
        <span>{rotulo}</span>
        {porcento === null ? null : <span>{porcento}%</span>}
      </div>
      <div
        className="sc-story-progresso"
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(porcento === null ? {} : { "aria-valuenow": porcento })}
      >
        <div
          className="sc-story-progresso__barra"
          data-indeterminado={porcento === null || undefined}
          style={porcento === null ? undefined : { width: `${porcento}%` }}
        />
      </div>
    </div>
  );
}

/** A última etapa: legenda, botão do story e o envio com progresso, erro e sucesso. */
export function FolhaDePublicar({
  estado,
  tipo,
  nomeDaLoja,
  legenda,
  destino,
  produto,
  aoMudarLegenda,
  aoMudarDestino,
  aoPublicar,
  aoVoltar,
  aoConcluir,
}: Props) {
  const idDaLegenda = useId();
  const idDoDestino = useId();
  const principalRef = useRef<HTMLButtonElement>(null);
  const ocupado = estado.fase === "compondo" || estado.fase === "enviando";

  useEffect(() => {
    principalRef.current?.focus();
  }, [estado.fase]);

  return (
    <div className="sc-story-folha" role="group" aria-label="Publicar story">
      {estado.fase === "sucesso" ? (
        <div className="sc-story-folha__sucesso" role="status">
          <span className="sc-story-folha__ok" aria-hidden="true">
            <IconeConfirmar />
          </span>
          <p className="sc-story-folha__titulo">Story no ar!</p>
          <p>Ele aparece na bolinha de {nomeDaLoja} e some sozinho em 24 horas.</p>
          <button
            ref={principalRef}
            type="button"
            className="sc-story-botao sc-story-botao--destaque"
            onClick={aoConcluir}
          >
            Concluir
          </button>
        </div>
      ) : (
        <>
          <p className="sc-story-folha__titulo">Publicar story</p>

          <div className="sc-story-folha__campo">
            <label htmlFor={idDaLegenda}>
              Legenda (opcional){" "}
              <span className="sc-story-folha__contagem">
                {legenda.length}/{MAXIMO_DA_LEGENDA}
              </span>
            </label>
            <textarea
              id={idDaLegenda}
              className="sc-story-campo"
              rows={2}
              maxLength={MAXIMO_DA_LEGENDA}
              value={legenda}
              disabled={ocupado}
              placeholder="Ex.: Saiu fornada nova!"
              onChange={(evento) => aoMudarLegenda(evento.target.value)}
            />
          </div>

          <fieldset className="sc-story-folha__campo" disabled={ocupado}>
            <legend id={idDoDestino}>Botão do story</legend>
            <label className="sc-story-opcao">
              <input
                type="radio"
                name="destino-do-story"
                checked={destino === "loja"}
                onChange={() => aoMudarDestino("loja")}
              />
              Ver loja
            </label>
            {produto !== null ? (
              <label className="sc-story-opcao">
                <input
                  type="radio"
                  name="destino-do-story"
                  checked={destino === "produto"}
                  onChange={() => aoMudarDestino("produto")}
                />
                Ver produto: {produto.nome}
              </label>
            ) : null}
            <label className="sc-story-opcao">
              <input
                type="radio"
                name="destino-do-story"
                checked={destino === "nenhum"}
                onChange={() => aoMudarDestino("nenhum")}
              />
              Sem botão
            </label>
          </fieldset>

          {tipo === "video" ? (
            <p className="sc-story-folha__nota" role="note">
              Texto, desenho e adesivos são gravados dentro do vídeo. Isso leva o tempo do
              próprio vídeo: deixe esta aba aberta até terminar.
            </p>
          ) : null}

          {estado.fase === "compondo" ? (
            <Barra
              fracao={estado.fracao}
              rotulo={tipo === "video" ? "Montando o vídeo…" : "Montando a imagem…"}
            />
          ) : null}
          {estado.fase === "enviando" ? (
            <Barra fracao={estado.fracao} rotulo="Enviando…" />
          ) : null}
          {estado.fase === "erro" ? (
            <p className="sc-story-folha__erro" role="alert">
              {estado.mensagem}
            </p>
          ) : null}

          <div className="sc-story-folha__acoes">
            <button
              type="button"
              className="sc-story-botao"
              disabled={ocupado}
              onClick={aoVoltar}
            >
              Voltar
            </button>
            <button
              ref={principalRef}
              type="button"
              className="sc-story-botao sc-story-botao--destaque"
              disabled={ocupado}
              onClick={aoPublicar}
            >
              <IconeEnviar aria-hidden="true" />
              {estado.fase === "erro"
                ? "Tentar de novo"
                : ocupado
                  ? "Publicando…"
                  : "Publicar agora"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

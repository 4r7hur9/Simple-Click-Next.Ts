"use client";

import { IconeBorracha, IconeConfirmar, IconeDesenhar } from "@simpleclick/ui";

import { ESPESSURAS_DO_PINCEL, type EspessuraId } from "./documento.ts";

interface Props {
  readonly cores: readonly string[];
  readonly cor: string;
  readonly espessura: EspessuraId;
  readonly borracha: boolean;
  readonly aoMudarCor: (cor: string) => void;
  readonly aoMudarEspessura: (espessura: EspessuraId) => void;
  readonly aoAlternarBorracha: () => void;
  readonly aoConcluir: () => void;
}

/** Cores, três espessuras e borracha — a faixa que aparece quando se desenha. */
export function FerramentasDeDesenho({
  cores,
  cor,
  espessura,
  borracha,
  aoMudarCor,
  aoMudarEspessura,
  aoAlternarBorracha,
  aoConcluir,
}: Props) {
  return (
    <div className="sc-story-desenho-ferramentas" role="group" aria-label="Ferramentas de desenho">
      <div className="sc-story-linha" role="group" aria-label="Cor do pincel">
        {cores.map((opcao) => (
          <button
            key={opcao}
            type="button"
            className="sc-story-cor"
            aria-label={`Cor ${opcao}`}
            aria-pressed={!borracha && cor === opcao}
            style={{ background: opcao }}
            onClick={() => aoMudarCor(opcao)}
          />
        ))}
      </div>
      <div className="sc-story-linha">
        <div className="sc-story-linha" role="group" aria-label="Espessura do pincel">
          {ESPESSURAS_DO_PINCEL.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              className="sc-story-espessura"
              aria-label={`Pincel ${opcao.rotulo.toLowerCase()}`}
              aria-pressed={espessura === opcao.id}
              onClick={() => aoMudarEspessura(opcao.id)}
            >
              <span
                aria-hidden="true"
                style={{
                  width: Math.max(6, opcao.valor / 2.4),
                  height: Math.max(6, opcao.valor / 2.4),
                }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sc-story-chip"
          aria-pressed={borracha}
          onClick={aoAlternarBorracha}
        >
          {borracha ? (
            <IconeBorracha aria-hidden="true" />
          ) : (
            <IconeDesenhar aria-hidden="true" />
          )}
          {borracha ? "Borracha" : "Pincel"}
        </button>
        <button
          type="button"
          className="sc-story-botao sc-story-botao--destaque"
          onClick={aoConcluir}
        >
          <IconeConfirmar aria-hidden="true" />
          Concluir
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import {
  ESPACOS_DE_IMAGEM,
  medidasDoEspaco,
  textoRecomendado,
  type IdDoEspacoDeImagem,
} from "../../../../lib/espacos-de-imagem.ts";
import {
  FORMATOS_DO_INPUT_DE_FOTO,
  useRecorteDeImagem,
} from "../../../../features/recorte/RecorteDeImagem.tsx";

interface Resultado {
  readonly endereco: string;
  readonly nome: string;
  readonly bytes: number;
  readonly medidas: string;
}

export function PreviaDoRecortador() {
  const [espaco, setEspaco] = useState<IdDoEspacoDeImagem>("fundo-da-vitrine");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (resultado !== null) URL.revokeObjectURL(resultado.endereco);
    },
    [resultado],
  );

  const recorte = useRecorteDeImagem({
    espaco,
    aoRecortar: (arquivo) => {
      setResultado({
        endereco: URL.createObjectURL(arquivo),
        nome: arquivo.name,
        bytes: arquivo.size,
        medidas: medidasDoEspaco(ESPACOS_DE_IMAGEM[espaco]),
      });
      return undefined;
    },
    aoRecusar: setRecusa,
  });

  return (
    <section className="space-y-4" {...recorte.soltar}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Espaço">
        {Object.values(ESPACOS_DE_IMAGEM).map((item) => (
          <button
            key={item.id}
            type="button"
            className="sc-botao sc-botao--secundaria"
            aria-pressed={espaco === item.id}
            onClick={() => setEspaco(item.id)}
          >
            {item.rotulo}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--cor-tinta-suave)]">
        {ESPACOS_DE_IMAGEM[espaco].uso} {textoRecomendado(espaco)}
      </p>
      <label className="block">
        <span className="text-sm font-medium">Escolher foto (ou arrastar para cá)</span>
        <input
          type="file"
          multiple
          className="sc-campo__controle mt-2 block w-full text-sm"
          accept={FORMATOS_DO_INPUT_DE_FOTO}
          onChange={(evento) => {
            recorte.escolher(evento.target.files);
            evento.target.value = "";
          }}
        />
      </label>
      {recusa === null ? null : (
        <p role="alert" className="text-sm font-medium text-[var(--cor-erro)]">
          {recusa}
        </p>
      )}
      {resultado === null ? null : (
        <figure className="space-y-2">
          <img
            src={resultado.endereco}
            alt="Foto recortada"
            className="max-h-80 rounded-2xl border border-[var(--cor-borda)]"
          />
          <figcaption className="text-sm text-[var(--cor-tinta-suave)]">
            {resultado.nome} · {resultado.medidas} ·{" "}
            {Math.max(1, Math.round(resultado.bytes / 1024))} KB
          </figcaption>
        </figure>
      )}
      {recorte.janela}
    </section>
  );
}

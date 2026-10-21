"use client";

import {
  IconeAlinharCentro,
  IconeAlinharDireita,
  IconeAlinharEsquerda,
  IconeConfirmar,
  IconeTexto,
} from "@simpleclick/ui";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { FamiliasDoEditor } from "./composicao.ts";
import {
  BRANCO,
  FONTES_DO_TEXTO,
  fonteDoTexto,
  tintaSobre,
  type AlinhamentoDoTexto,
  type FonteDoTexto,
  type Texto,
} from "./documento.ts";

export interface ParteDoTexto {
  readonly texto: string;
  readonly fonte: FonteDoTexto;
  readonly cor: string;
  readonly alinhamento: AlinhamentoDoTexto;
  readonly comFundo: boolean;
}

interface Props {
  readonly inicial: Texto | null;
  /** A paleta (a cor da loja vem primeiro). */
  readonly cores: readonly string[];
  readonly familias: FamiliasDoEditor;
  /** Termina: texto vazio apaga (se já existia) ou não cria. */
  readonly aoConcluir: (parte: ParteDoTexto) => void;
}

const PROXIMO_ALINHAMENTO: Record<AlinhamentoDoTexto, AlinhamentoDoTexto> = {
  centro: "esquerda",
  esquerda: "direita",
  direita: "centro",
};

const ROTULO_DO_ALINHAMENTO: Record<AlinhamentoDoTexto, string> = {
  centro: "Alinhado ao centro. Tocar para alinhar à esquerda",
  esquerda: "Alinhado à esquerda. Tocar para alinhar à direita",
  direita: "Alinhado à direita. Tocar para centralizar",
};

export function EditorDeTexto({ inicial, cores, familias, aoConcluir }: Props) {
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [fonte, setFonte] = useState<FonteDoTexto>(inicial?.fonte ?? "moderno");
  const [cor, setCor] = useState(inicial?.cor ?? BRANCO);
  const [alinhamento, setAlinhamento] = useState<AlinhamentoDoTexto>(
    inicial?.alinhamento ?? "centro",
  );
  const [comFundo, setComFundo] = useState(inicial?.comFundo ?? false);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const campo = campoRef.current;
    if (campo === null) return;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }, []);

  const estilo = fonteDoTexto(fonte);
  const campoEstilo: CSSProperties = {
    fontFamily: familias[fonte],
    fontWeight: estilo.peso,
    fontStyle: estilo.italico ? "italic" : "normal",
    textAlign: alinhamento === "esquerda" ? "left" : alinhamento === "direita" ? "right" : "center",
    color: comFundo ? tintaSobre(cor) : cor,
    background: comFundo ? cor : "transparent",
  };

  function concluir() {
    aoConcluir({ texto, fonte, cor, alinhamento, comFundo });
  }

  const Alinhar =
    alinhamento === "esquerda"
      ? IconeAlinharEsquerda
      : alinhamento === "direita"
        ? IconeAlinharDireita
        : IconeAlinharCentro;

  return (
    <div
      className="sc-story-texto-editor"
      role="group"
      aria-label="Escrever texto"
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          evento.stopPropagation();
          evento.preventDefault();
          concluir();
        }
      }}
    >
      <div className="sc-story-texto-editor__topo">
        <span className="sc-story-texto-editor__titulo">
          <IconeTexto aria-hidden="true" /> Texto
        </span>
        <button
          type="button"
          className="sc-story-botao sc-story-botao--destaque"
          onClick={concluir}
        >
          <IconeConfirmar aria-hidden="true" />
          Concluído
        </button>
      </div>

      <div className="sc-story-texto-editor__centro">
        <textarea
          ref={campoRef}
          className="sc-story-texto-editor__campo"
          style={campoEstilo}
          value={texto}
          rows={3}
          maxLength={280}
          aria-label="Texto do story"
          placeholder="Digite aqui…"
          onChange={(evento) => setTexto(evento.target.value)}
        />
      </div>

      <div className="sc-story-texto-editor__opcoes">
        <div className="sc-story-linha" role="group" aria-label="Estilo da letra">
          {FONTES_DO_TEXTO.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              className="sc-story-chip"
              aria-pressed={fonte === opcao.id}
              style={{
                fontFamily: familias[opcao.id],
                fontWeight: opcao.peso,
                fontStyle: opcao.italico ? "italic" : "normal",
              }}
              onClick={() => setFonte(opcao.id)}
            >
              {opcao.rotulo}
            </button>
          ))}
          <button
            type="button"
            className="sc-story-icone"
            aria-label={ROTULO_DO_ALINHAMENTO[alinhamento]}
            onClick={() => setAlinhamento(PROXIMO_ALINHAMENTO[alinhamento])}
          >
            <Alinhar aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sc-story-chip"
            aria-pressed={comFundo}
            aria-label="Fundo na cor do texto"
            onClick={() => setComFundo((valor) => !valor)}
          >
            Fundo
          </button>
        </div>
        <div className="sc-story-linha" role="group" aria-label="Cor do texto">
          {cores.map((opcao) => (
            <button
              key={opcao}
              type="button"
              className="sc-story-cor"
              aria-label={`Cor ${opcao}`}
              aria-pressed={cor === opcao}
              style={{ background: opcao }}
              onClick={() => setCor(opcao)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

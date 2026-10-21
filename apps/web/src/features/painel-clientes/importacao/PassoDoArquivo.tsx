"use client";

/**
 * Passo 1 do importador: escolher o arquivo (card #61).
 *
 * Arrastar e soltar é ATALHO, não o caminho: o botão "Escolher arquivo" abre o
 * seletor do sistema e é o que o teclado e o leitor de tela usam. A conferência
 * do que dá para recusar aqui (tipo, vazio, tamanho) acontece antes de ir à
 * API; o resto (linhas demais, arquivo ilegível) volta com a frase da API.
 */
import { useId, useRef, useState, type DragEvent } from "react";
import { Aviso, Botao, Carregando } from "@simpleclick/ui";

import {
  ENDERECO_DO_MODELO,
  EXTENSOES_ACEITAS,
  MAXIMO_DE_LINHAS,
  TAMANHO_MAXIMO_EM_MB,
} from "../../../lib/importacao-de-clientes.ts";

export interface PassoDoArquivoProps {
  /** Lendo o arquivo na API. */
  readonly lendo: boolean;
  readonly nomeLendo: string | null;
  /** A frase do problema da última tentativa. */
  readonly erro: string | null;
  readonly aoEscolher: (arquivo: File) => void;
}

export function PassoDoArquivo({
  lendo,
  nomeLendo,
  erro,
  aoEscolher,
}: PassoDoArquivoProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const idDosLimites = useId();

  function escolher(lista: FileList | null) {
    const arquivo = lista?.[0];
    if (arquivo !== undefined) aoEscolher(arquivo);
  }

  function aoSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setSobre(false);
    if (!lendo) escolher(evento.dataTransfer.files);
  }

  return (
    <div className="grid gap-4">
      <div
        data-area-de-soltar
        className={[
          "grid justify-items-center gap-3 rounded-[var(--raio-janela)] border-2 border-dashed px-4 py-10 text-center",
          sobre
            ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria-suave)]"
            : "border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)]",
        ].join(" ")}
        onDragOver={(evento) => {
          evento.preventDefault();
          if (!sobre) setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={aoSoltar}
      >
        {lendo ? (
          <Carregando
            rotulo={
              nomeLendo === null ? "Lendo o arquivo…" : `Lendo ${nomeLendo}…`
            }
          />
        ) : (
          <>
            <p className="m-0 font-semibold">
              Arraste a planilha para cá ou escolha no seu computador
            </p>
            <Botao
              aria-describedby={idDosLimites}
              onClick={() => entrada.current?.click()}
            >
              Escolher arquivo
            </Botao>
          </>
        )}
        <input
          ref={entrada}
          className="sr-only"
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept={EXTENSOES_ACEITAS.join(",")}
          onChange={(evento) => {
            escolher(evento.target.files);
            // Escolher o MESMO arquivo de novo (depois de corrigir) tem de
            // disparar a leitura outra vez.
            evento.target.value = "";
          }}
        />
        <p
          id={idDosLimites}
          className="m-0 text-sm text-[var(--cor-tinta-suave)]"
        >
          Aceita .csv, .tsv, .xlsx e .json · até {TAMANHO_MAXIMO_EM_MB} MB e{" "}
          {MAXIMO_DE_LINHAS.toLocaleString("pt-BR")} clientes por arquivo
        </p>
      </div>

      {erro === null ? null : (
        <Aviso tom="erro" titulo="Não foi possível usar este arquivo">
          {erro}
        </Aviso>
      )}

      <div className="grid gap-1 text-sm">
        <p className="m-0">
          A primeira linha precisa ter o nome das colunas. Nome e telefone são
          obrigatórios; e-mail, endereço e observação são opcionais.
        </p>
        <p className="m-0">
          <a
            className="font-semibold text-[var(--cor-primaria-texto)] underline"
            href={ENDERECO_DO_MODELO}
            download
          >
            Baixar planilha de exemplo (CSV)
          </a>
        </p>
      </div>
    </div>
  );
}

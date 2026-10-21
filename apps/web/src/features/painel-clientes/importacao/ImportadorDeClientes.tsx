"use client";

/**
 * O importador de clientes do painel (card #61): leads de uma planilha viram
 * clientes da loja, em quatro passos — arquivo, colunas, revisão, resultado.
 *
 * O ARQUIVO FICA NA TELA. A API não guarda nada entre a prévia e a
 * confirmação: o mesmo `File` vai de novo a cada passo, com o mapeamento e a
 * regra dos repetidos na consulta.
 *
 * Teclado e leitor de tela: a cada passo o foco vai para o título dele, e a
 * lista de passos marca o atual com `aria-current="step"`. Sem animação: é o
 * painel, a superfície mais sóbria (skill design-de-front).
 */
import { useEffect, useRef, useState } from "react";
import { Botao } from "@simpleclick/ui";

import {
  confirmarImportacao,
  escreverTamanho,
  pedirPrevia,
  problemaDoArquivo,
  type Buscar,
  type CampoDaImportacao,
  type Mapeamento,
  type PreviaDaImportacao,
  type RegraDeRepetidos,
  type ResultadoDaImportacao,
  type baixarRelatorio,
} from "../../../lib/importacao-de-clientes.ts";
import { PassoDaRevisao } from "./PassoDaRevisao.tsx";
import { PassoDoArquivo } from "./PassoDoArquivo.tsx";
import {
  PassoDoMapeamento,
  type EscolhaPorColuna,
} from "./PassoDoMapeamento.tsx";
import { PassoDoResultado } from "./PassoDoResultado.tsx";

const PASSOS = [
  "Enviar arquivo",
  "Mapear colunas",
  "Revisar",
  "Resultado",
] as const;

type Passo = 0 | 1 | 2 | 3;

export interface ImportadorDeClientesProps {
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
  /** O download do relatório. A prova troca para não abrir janela. */
  readonly baixar?: typeof baixarRelatorio | undefined;
}

/** O mapeamento da API (campo → coluna) virado de lado (coluna → campo). */
function escolhasDaPrevia(previa: PreviaDaImportacao): EscolhaPorColuna {
  const escolhas: Record<string, CampoDaImportacao | ""> = {};
  for (const coluna of previa.colunas) escolhas[coluna.nome] = "";
  for (const [campo, coluna] of Object.entries(previa.mapeamento)) {
    if (coluna !== null && coluna in escolhas) {
      escolhas[coluna] = campo as CampoDaImportacao;
    }
  }
  return escolhas;
}

/** De volta ao formato da consulta: todo campo, com a coluna ou nulo. */
function mapeamentoDasEscolhas(
  previa: PreviaDaImportacao,
  escolhas: EscolhaPorColuna,
): Mapeamento {
  const mapa: Partial<Record<CampoDaImportacao, string | null>> = {};
  for (const campo of previa.campos) mapa[campo.campo] = null;
  for (const [coluna, campo] of Object.entries(escolhas)) {
    if (campo !== "") mapa[campo] = coluna;
  }
  return mapa;
}

export function ImportadorDeClientes({
  buscar = fetch,
  baixar,
}: ImportadorDeClientesProps) {
  const [passo, setPasso] = useState<Passo>(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);

  const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null);
  const [escolhas, setEscolhas] = useState<EscolhaPorColuna>({});
  const [recado, setRecado] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [erroDoMapeamento, setErroDoMapeamento] = useState<string | null>(null);

  const [revisao, setRevisao] = useState<PreviaDaImportacao | null>(null);
  const [regra, setRegra] = useState<RegraDeRepetidos>("ignorar");
  const [importando, setImportando] = useState(false);
  const [erroDaImportacao, setErroDaImportacao] = useState<string | null>(null);

  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(
    null,
  );

  const titulo = useRef<HTMLHeadingElement>(null);
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    titulo.current?.focus();
  }, [passo]);

  async function aoEscolherArquivo(escolhido: File) {
    setErroDoArquivo(null);
    const problema = problemaDoArquivo(escolhido);
    if (problema !== null) {
      setErroDoArquivo(problema);
      return;
    }
    setLendo(escolhido.name);
    const leitura = await pedirPrevia(escolhido, null, buscar);
    setLendo(null);
    if (leitura.estado === "erro") {
      setErroDoArquivo(leitura.mensagem);
      return;
    }
    if (
      leitura.previa.colunas.length === 0 ||
      leitura.previa.previsao.total === 0
    ) {
      setErroDoArquivo(
        "Não achamos nenhum cliente no arquivo. Confira se a primeira linha tem o nome das colunas e se há linhas preenchidas abaixo dela.",
      );
      return;
    }
    setArquivo(escolhido);
    setPrevia(leitura.previa);
    setEscolhas(escolhasDaPrevia(leitura.previa));
    setRecado(null);
    setErroDoMapeamento(null);
    setPasso(1);
  }

  function aoEscolherCampo(coluna: string, campo: CampoDaImportacao | "") {
    // Cada campo vem de uma coluna só: a que já o tinha volta a "não importar".
    const depois: Record<string, CampoDaImportacao | ""> = { ...escolhas };
    let tirada: string | null = null;
    if (campo !== "") {
      for (const [outra, escolhido] of Object.entries(depois)) {
        if (outra !== coluna && escolhido === campo) {
          depois[outra] = "";
          tirada = outra;
        }
      }
    }
    depois[coluna] = campo;
    const rotulo = previa?.campos.find((c) => c.campo === campo)?.rotulo;
    setEscolhas(depois);
    setRecado(
      tirada === null || rotulo === undefined
        ? null
        : `“${rotulo}” saiu da coluna “${tirada}” e agora vem de “${coluna}”.`,
    );
  }

  async function aoConferir() {
    if (arquivo === null || previa === null) return;
    setConferindo(true);
    setErroDoMapeamento(null);
    const leitura = await pedirPrevia(
      arquivo,
      mapeamentoDasEscolhas(previa, escolhas),
      buscar,
    );
    setConferindo(false);
    if (leitura.estado === "erro") {
      setErroDoMapeamento(leitura.mensagem);
      return;
    }
    setRevisao(leitura.previa);
    setRegra("ignorar");
    setErroDaImportacao(null);
    setPasso(2);
  }

  async function aoImportar() {
    if (arquivo === null || previa === null) return;
    setImportando(true);
    setErroDaImportacao(null);
    const leitura = await confirmarImportacao(
      arquivo,
      mapeamentoDasEscolhas(previa, escolhas),
      regra,
      buscar,
    );
    setImportando(false);
    if (leitura.estado === "erro") {
      setErroDaImportacao(leitura.mensagem);
      return;
    }
    setResultado(leitura.resultado);
    setPasso(3);
  }

  function recomecar() {
    setArquivo(null);
    setPrevia(null);
    setRevisao(null);
    setResultado(null);
    setErroDoArquivo(null);
    setPasso(0);
  }

  return (
    <section aria-labelledby="titulo-do-passo" className="grid gap-6">
      <nav aria-label="Passos da importação">
        <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
          {PASSOS.map((nome, indice) => {
            const atual = indice === passo;
            const feito = indice < passo;
            return (
              <li
                key={nome}
                aria-current={atual ? "step" : undefined}
                className={[
                  "flex items-center gap-2 rounded-[var(--raio-3)] border px-3 py-2 text-sm",
                  atual
                    ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria-suave)] font-semibold"
                    : "border-[var(--cor-borda)] text-[var(--cor-tinta-suave)]",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                    atual || feito
                      ? "bg-[var(--cor-primaria)] text-[var(--cor-em-primaria)]"
                      : "bg-[var(--cor-superficie-alta)] text-[var(--cor-tinta-suave)]",
                  ].join(" ")}
                >
                  {feito ? "✓" : indice + 1}
                </span>
                <span>
                  <span className="sr-only">
                    Passo {indice + 1}
                    {feito ? " (concluído)" : ""}:{" "}
                  </span>
                  {nome}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-4">
        <div className="grid gap-1">
          <h2
            id="titulo-do-passo"
            ref={titulo}
            tabIndex={-1}
            className="m-0 text-xl font-semibold outline-none"
          >
            {PASSOS[passo]}
          </h2>
          {arquivo !== null && passo > 0 && passo < 3 ? (
            <p className="m-0 text-sm text-[var(--cor-tinta-suave)]">
              {arquivo.name} · {escreverTamanho(arquivo.size)} ·{" "}
              {(previa?.arquivo.linhas ?? 0).toLocaleString("pt-BR")} linhas
            </p>
          ) : null}
        </div>

        {passo === 0 ? (
          <PassoDoArquivo
            lendo={lendo !== null}
            nomeLendo={lendo}
            erro={erroDoArquivo}
            aoEscolher={(escolhido) => void aoEscolherArquivo(escolhido)}
          />
        ) : passo === 1 && previa !== null ? (
          <PassoDoMapeamento
            previa={previa}
            escolhas={escolhas}
            aoEscolher={aoEscolherCampo}
            recado={recado}
            conferindo={conferindo}
            erro={erroDoMapeamento}
            aoVoltar={recomecar}
            aoContinuar={() => void aoConferir()}
          />
        ) : passo === 2 && revisao !== null ? (
          <PassoDaRevisao
            previa={revisao}
            regra={regra}
            aoTrocarRegra={setRegra}
            importando={importando}
            erro={erroDaImportacao}
            aoVoltar={() => setPasso(1)}
            aoImportar={() => void aoImportar()}
          />
        ) : passo === 3 && resultado !== null ? (
          <PassoDoResultado
            resultado={resultado}
            aoRecomecar={recomecar}
            baixar={baixar}
          />
        ) : (
          <Botao variante="secundaria" onClick={recomecar}>
            Começar de novo
          </Botao>
        )}
      </div>
    </section>
  );
}

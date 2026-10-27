import "@simpleclick/ui/styles/legal.css";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  DATA_DE_ATUALIZACAO,
  DATA_DE_ATUALIZACAO_ISO,
  ROTAS_LEGAIS,
  VERSAO_DOS_TEXTOS,
} from "./contato.ts";
import { RodapeDoSimpleClick } from "./RodapeDoSimpleClick.tsx";

export type Bloco = string | { readonly lista: readonly string[] };

export interface SecaoLegal {
  readonly id: string;
  readonly titulo: string;
  readonly blocos: readonly Bloco[];
}

interface PropriedadesDaPagina {
  readonly titulo: string;
  readonly resumo: string;
  readonly secoes: readonly SecaoLegal[];
  readonly rotaAtual: string;
  /** Conteúdo extra no fim (ex.: contato do encarregado). */
  readonly fim?: ReactNode;
}

/** Layout de leitura das páginas legais: índice lateral com âncoras, texto em coluna estreita. */
export function PaginaLegal({
  titulo,
  resumo,
  secoes,
  rotaAtual,
  fim,
}: PropriedadesDaPagina) {
  return (
    <div className="sc-legal" data-tema="escuro">
      <header className="sc-legal__topo">
        <Link
          className="sc-legal__marca"
          href="/"
          aria-label="SimpleClick, início"
        >
          simpleclick
        </Link>
        <nav aria-label="Documentos legais" className="sc-legal__abas">
          {ROTAS_LEGAIS.map((item) => (
            <Link
              key={item.rota}
              href={item.rota}
              aria-current={item.rota === rotaAtual ? "page" : undefined}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      <div className="sc-legal__corpo">
        <nav className="sc-legal__indice" aria-label="Nesta página">
          <p className="sc-legal__indice-titulo">Nesta página</p>
          <ol>
            {secoes.map((secao) => (
              <li key={secao.id}>
                <a href={`#${secao.id}`}>{secao.titulo}</a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="sc-legal__texto" id="conteudo">
          <h1>{titulo}</h1>
          <p className="sc-legal__resumo">{resumo}</p>
          <p className="sc-legal__data">
            Atualizado em{" "}
            <time dateTime={DATA_DE_ATUALIZACAO_ISO}>
              {DATA_DE_ATUALIZACAO}
            </time>{" "}
            · versão {VERSAO_DOS_TEXTOS}
          </p>

          {secoes.map((secao, indice) => (
            <section
              key={secao.id}
              id={secao.id}
              aria-labelledby={`${secao.id}-t`}
            >
              <h2 id={`${secao.id}-t`}>
                {indice + 1}. {secao.titulo}
              </h2>
              {secao.blocos.map((bloco, posicao) =>
                typeof bloco === "string" ? (
                  <p key={posicao}>{bloco}</p>
                ) : (
                  <ul key={posicao}>
                    {bloco.lista.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
          {fim}
        </main>
      </div>

      <RodapeDoSimpleClick />
    </div>
  );
}

"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Carregando, Erro, Vazio } from "./estados";
import type { EstadoDaTela } from "./estados";
import {
  IconeOrdemCrescente,
  IconeOrdemDecrescente,
  IconeOrdenar,
} from "./icones";

/**
 * Tabela de dados: pedidos, clientes, produtos no painel.
 *
 * `table` de verdade, com `caption` e `th`, porque é o que o leitor de tela
 * percorre por linha e coluna. A ordenação é um botão dentro do `th`, e a
 * coluna ordenada diz o sentido por `aria-sort` — o ícone de seta é só para
 * quem olha.
 *
 * Ordenar NUNCA mexe no array recebido: a tela pode estar usando a mesma
 * lista em outro lugar, e um `sort()` no lugar a reordenaria lá também.
 *
 * No celular há dois caminhos: a tabela rola de lado dentro da própria caixa
 * (`rolar`, o padrão, bom para muitas colunas curtas) ou cada linha vira um
 * cartão com o nome da coluna ao lado do valor (`cartoes`, bom para poucas
 * colunas de texto longo).
 */

export type DirecaoDaOrdem = "crescente" | "decrescente";

export type ValorOrdenavel = string | number | Date | null | undefined;

export type ColunaDaTabela<T> = {
  /** Identificador estável da coluna. */
  chave: string;
  titulo: string;
  /** O que a célula mostra. */
  celula: (linha: T) => ReactNode;
  /** Com esta função, a coluna ganha o botão de ordenar. */
  valorParaOrdenar?: ((linha: T) => ValorOrdenavel) | undefined;
  /** `fim` para número e dinheiro, que se comparam pela casa da unidade. */
  alinhamento?: "inicio" | "fim" | undefined;
};

export type OrdemDaTabela = {
  coluna: string;
  direcao: DirecaoDaOrdem;
};

export type TabelaProps<T> = {
  /** Título da tabela: vira `caption` e nomeia a área de rolagem. */
  legenda: string;
  /** Esconde a legenda da tela, mantendo-a para o leitor de tela. */
  legendaEscondida?: boolean | undefined;
  colunas: readonly ColunaDaTabela<T>[];
  linhas: readonly T[];
  chaveDaLinha: (linha: T) => string;
  ordemInicial?: OrdemDaTabela | undefined;
  /** Como a tabela se comporta em tela estreita. */
  noCelular?: "rolar" | "cartoes" | undefined;
  /** Altura máxima da caixa; com ela, o cabeçalho fica fixo ao rolar. */
  alturaMaxima?: string | undefined;
  estado?: EstadoDaTela | undefined;
  tituloVazio?: string | undefined;
  descricaoVazio?: string | undefined;
  acaoDoVazio?: ReactNode | undefined;
  mensagemDeErro?: string | undefined;
  referenciaDoErro?: string | undefined;
  rotuloDeEspera?: string | undefined;
  /** Nome do botão de ordenar, antes do título da coluna. */
  rotuloDeOrdenar?: string | undefined;
  className?: string | undefined;
};

const COMPARADOR_DE_TEXTO = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

function ehVazio(valor: ValorOrdenavel): boolean {
  return valor === null || valor === undefined || valor === "";
}

function comparar(a: ValorOrdenavel, b: ValorOrdenavel): number {
  if (typeof a === "string" && typeof b === "string") {
    return COMPARADOR_DE_TEXTO.compare(a, b);
  }
  const numeroA = a instanceof Date ? a.getTime() : Number(a);
  const numeroB = b instanceof Date ? b.getTime() : Number(b);
  return numeroA - numeroB;
}

/**
 * Devolve uma CÓPIA das linhas na ordem pedida. Empates mantêm a ordem
 * original (o `sort` do JavaScript é estável) e vazios vão para o fim.
 */
export function ordenarLinhas<T>(
  linhas: readonly T[],
  valor: (linha: T) => ValorOrdenavel,
  direcao: DirecaoDaOrdem,
): T[] {
  const sinal = direcao === "crescente" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    // Vazio vai sempre para o fim, nos dois sentidos: é a linha que menos
    // interessa a quem ordenou.
    if (ehVazio(va) || ehVazio(vb)) {
      return ehVazio(va) === ehVazio(vb) ? 0 : ehVazio(va) ? 1 : -1;
    }
    return comparar(va, vb) * sinal;
  });
}

/** Tabela com legenda, ordenação acessível e os estados de tela. */
export function Tabela<T>({
  legenda,
  legendaEscondida = false,
  colunas,
  linhas,
  chaveDaLinha,
  ordemInicial,
  noCelular = "rolar",
  alturaMaxima,
  estado = "pronto",
  tituloVazio = "Nada por aqui ainda",
  descricaoVazio,
  acaoDoVazio,
  mensagemDeErro = "Não foi possível carregar a tabela. Tente de novo em instantes.",
  referenciaDoErro,
  rotuloDeEspera = "Carregando…",
  rotuloDeOrdenar = "Ordenar por",
  className,
}: TabelaProps<T>) {
  const [ordem, setOrdem] = useState<OrdemDaTabela | undefined>(ordemInicial);
  const idLegenda = `${useId()}-legenda`;

  const ordenadas = useMemo(() => {
    const coluna = colunas.find((c) => c.chave === ordem?.coluna);
    if (ordem === undefined || coluna?.valorParaOrdenar === undefined) {
      return linhas;
    }
    return ordenarLinhas(linhas, coluna.valorParaOrdenar, ordem.direcao);
  }, [colunas, linhas, ordem]);

  if (estado === "carregando") return <Carregando rotulo={rotuloDeEspera} />;
  if (estado === "erro") {
    return <Erro mensagem={mensagemDeErro} referencia={referenciaDoErro} />;
  }
  if (estado === "vazio" || linhas.length === 0) {
    return (
      <Vazio
        acao={acaoDoVazio}
        descricao={descricaoVazio}
        titulo={tituloVazio}
      />
    );
  }

  function alternar(chave: string) {
    setOrdem((atual) =>
      atual?.coluna === chave && atual.direcao === "crescente"
        ? { coluna: chave, direcao: "decrescente" }
        : { coluna: chave, direcao: "crescente" },
    );
  }

  return (
    // A caixa que rola precisa de foco para quem usa teclado conseguir rolá-la,
    // e de nome para o leitor de tela dizer o que está ali dentro.
    <div
      className={[
        "sc-tabela",
        `sc-tabela--${noCelular}`,
        alturaMaxima !== undefined && "sc-tabela--cabecalho-fixo",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-labelledby={idLegenda}
      tabIndex={0}
      style={
        alturaMaxima !== undefined ? { maxHeight: alturaMaxima } : undefined
      }
    >
      <table className="sc-tabela__tabela">
        <caption
          className={legendaEscondida ? "sc-so-leitor" : "sc-tabela__legenda"}
          id={idLegenda}
        >
          {legenda}
        </caption>
        <thead>
          <tr>
            {colunas.map((coluna) => {
              const ordenada = ordem?.coluna === coluna.chave;
              const Seta = !ordenada
                ? IconeOrdenar
                : ordem.direcao === "crescente"
                  ? IconeOrdemCrescente
                  : IconeOrdemDecrescente;

              return (
                <th
                  key={coluna.chave}
                  scope="col"
                  className={
                    coluna.alinhamento === "fim" ? "sc-tabela__fim" : undefined
                  }
                  aria-sort={
                    ordenada
                      ? ordem.direcao === "crescente"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {coluna.valorParaOrdenar === undefined ? (
                    coluna.titulo
                  ) : (
                    <button
                      type="button"
                      className="sc-tabela__ordenar"
                      data-ordenada={ordenada || undefined}
                      onClick={() => alternar(coluna.chave)}
                    >
                      <span className="sc-so-leitor">{rotuloDeOrdenar} </span>
                      {coluna.titulo}
                      <Seta size={16} />
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((linha) => (
            <tr key={chaveDaLinha(linha)}>
              {colunas.map((coluna) => (
                <td
                  key={coluna.chave}
                  data-rotulo={coluna.titulo}
                  className={
                    coluna.alinhamento === "fim" ? "sc-tabela__fim" : undefined
                  }
                >
                  {coluna.celula(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

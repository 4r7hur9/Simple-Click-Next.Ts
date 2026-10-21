"use client";

/**
 * As peças das listas paginadas do catálogo no painel (card #76): a consulta
 * mora no ENDEREÇO da página (`?busca=&categoria=&pagina=`), a busca espera a
 * pessoa parar de digitar e a paginação é numerada.
 *
 * O endereço é lido no navegador, depois de montar, e trocado com
 * `history.replaceState` (o Next sincroniza o roteador com ele): o primeiro
 * desenho é o mesmo no servidor e no navegador ("Carregando…"), e a lista só
 * pede a página quando já sabe qual é. Voltar e avançar do navegador releem.
 */
import { Botao } from "@simpleclick/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/** Os campos da consulta, todos texto; vazio = padrão (fica fora da URL). */
export type Consulta<C extends string> = Readonly<Record<C, string>>;

function lerDoEndereco<C extends string>(padrao: Consulta<C>): Consulta<C> {
  const parametros = new URLSearchParams(window.location.search);
  const lida = { ...padrao } as Record<C, string>;
  for (const chave of Object.keys(padrao) as C[]) {
    const valor = parametros.get(chave);
    if (valor !== null) lida[chave] = valor;
  }
  return lida;
}

/** A consulta como parâmetros: só o que difere do padrão. */
export function parametrosDaConsulta<C extends string>(
  consulta: Consulta<C>,
  padrao: Consulta<C>,
): URLSearchParams {
  const parametros = new URLSearchParams();
  for (const chave of Object.keys(padrao) as C[]) {
    const valor = consulta[chave];
    if (valor !== "" && valor !== padrao[chave]) parametros.set(chave, valor);
  }
  return parametros;
}

/**
 * A consulta da lista, guardada no endereço. `null` até ler o endereço.
 * Mudar qualquer filtro volta para a página 1, a menos que a mudança traga
 * a página.
 */
export function useConsultaNaUrl<C extends string>(
  padrao: Consulta<C>,
): readonly [
  Consulta<C> | null,
  (mudanca: Partial<Record<C, string>>) => void,
] {
  const [consulta, setConsulta] = useState<Consulta<C> | null>(null);
  const padraoRef = useRef(padrao);

  useEffect(() => {
    const reler = () => setConsulta(lerDoEndereco(padraoRef.current));
    reler();
    window.addEventListener("popstate", reler);
    return () => window.removeEventListener("popstate", reler);
  }, []);

  const mudar = useCallback((mudanca: Partial<Record<C, string>>) => {
    setConsulta((atual) => {
      const base = atual ?? padraoRef.current;
      const proxima = {
        ...base,
        ...("pagina" in padraoRef.current && !("pagina" in mudanca)
          ? { pagina: "1" }
          : {}),
        ...mudanca,
      } as Consulta<C>;
      // Parâmetros que não são da consulta (como o `dia` dos pedidos) ficam.
      const parametros = new URLSearchParams(window.location.search);
      for (const chave of Object.keys(padraoRef.current)) parametros.delete(chave);
      for (const [chave, valor] of parametrosDaConsulta(
        proxima,
        padraoRef.current,
      )) {
        parametros.set(chave, valor);
      }
      const busca = parametros.toString();
      const endereco = `${window.location.pathname}${busca === "" ? "" : `?${busca}`}`;
      window.history.replaceState(window.history.state, "", endereco);
      return proxima;
    });
  }, []);

  return [consulta, mudar] as const;
}

/** O campo de busca: espera a pessoa parar de digitar; Enter busca na hora. */
export function CampoDeBusca({
  valor,
  aoBuscar,
  placeholder,
  rotulo = "Buscar",
}: {
  readonly valor: string;
  readonly aoBuscar: (termo: string) => void;
  readonly placeholder: string;
  readonly rotulo?: string;
}) {
  const [texto, setTexto] = useState(valor);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca que veio de fora (voltar do navegador, "Limpar filtros").
  useEffect(() => {
    setTexto(valor);
  }, [valor]);
  useEffect(
    () => () => {
      if (espera.current !== null) clearTimeout(espera.current);
    },
    [],
  );

  function agendar(proximo: string) {
    if (espera.current !== null) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      espera.current = null;
      if (proximo.trim() !== valor.trim()) aoBuscar(proximo.trim());
    }, 350);
  }

  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{rotulo}</span>
      <input
        className="sc-campo__controle min-h-12"
        type="search"
        placeholder={placeholder}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          agendar(evento.target.value);
        }}
        onKeyDown={(evento) => {
          if (evento.key !== "Enter") return;
          evento.preventDefault();
          if (espera.current !== null) clearTimeout(espera.current);
          espera.current = null;
          aoBuscar(texto.trim());
        }}
      />
    </label>
  );
}

/** Os números de página a mostrar: as pontas, a vizinhança e reticências. */
export function paginasVisiveis(
  atual: number,
  total: number,
): readonly (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const vizinhas = new Set([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((n) => vizinhas.add(n));
  if (atual >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => vizinhas.add(n));
  const ordenadas = [...vizinhas]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const resultado: (number | "…")[] = [];
  for (const [indice, numero] of ordenadas.entries()) {
    const anterior = ordenadas[indice - 1];
    if (anterior !== undefined && numero - anterior > 1) resultado.push("…");
    resultado.push(numero);
  }
  return resultado;
}

export interface PaginacaoDaLista {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly totalDePaginas: number;
}

/** "Mostrando 51–100 de 10.140" e os botões das páginas. */
export function Paginacao({
  paginacao,
  item,
  aoIr,
}: {
  readonly paginacao: PaginacaoDaLista;
  /** O nome do que se conta, no plural ("produtos"). */
  readonly item: string;
  readonly aoIr: (pagina: number) => void;
}) {
  const { pagina, porPagina, total, totalDePaginas } = paginacao;
  if (total === 0) return null;
  const primeiro = (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);
  const numero = (n: number) => n.toLocaleString("pt-BR");
  return (
    <nav
      aria-label={`Páginas da lista de ${item}`}
      className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-[var(--cor-tinta-suave)]">
        Mostrando {numero(primeiro)}–{numero(ultimo)} de {numero(total)} {item}
      </p>
      {totalDePaginas > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Botao
            variante="discreta"
            tamanho="pequeno"
            desabilitado={pagina <= 1}
            onClick={() => aoIr(pagina - 1)}
          >
            Anterior
          </Botao>
          {paginasVisiveis(pagina, totalDePaginas).map((n, indice) =>
            n === "…" ? (
              <span
                key={`reticencias-${indice}`}
                aria-hidden="true"
                className="px-1 text-[var(--cor-tinta-suave)]"
              >
                …
              </span>
            ) : (
              <Botao
                key={n}
                variante={n === pagina ? "secundaria" : "discreta"}
                tamanho="pequeno"
                aria-label={`Página ${n}`}
                aria-current={n === pagina ? "page" : undefined}
                onClick={() => {
                  if (n !== pagina) aoIr(n);
                }}
              >
                {numero(n)}
              </Botao>
            ),
          )}
          <Botao
            variante="discreta"
            tamanho="pequeno"
            desabilitado={pagina >= totalDePaginas}
            onClick={() => aoIr(pagina + 1)}
          >
            Próxima
          </Botao>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * Lê uma página da API; a resposta mais nova vence (a pessoa que digita
 * rápido dispara várias, e a lenta não pode sobrescrever a última).
 */
export function useLeituraMaisRecente() {
  const contador = useRef(0);
  return useCallback(async <T,>(ler: () => Promise<T>) => {
    contador.current += 1;
    const minha = contador.current;
    const resultado = await ler();
    return { resultado, valeu: minha === contador.current };
  }, []);
}

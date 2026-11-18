"use client";

/**
 * A barra de filtros das listas do painel (card #77) — a MESMA em Produtos,
 * Pedidos e Clientes: busca com ícone e "limpar", filtros, ordenar, contador,
 * "Limpar filtros". Quem usa só diz quais filtros existem e o que cada um
 * faz; o desenho, o debounce da busca e a gaveta do celular são daqui.
 *
 * No computador os filtros ficam em linha. No celular viram um botão
 * "Filtros (n)" que abre uma gaveta de baixo com os mesmos campos (e a
 * ordem). A gaveta é um `<dialog>` modal nativo: Esc fecha e o foco volta.
 */
import {
  Botao,
  Chip,
  FaixaDeChips,
  Gaveta,
  IconeBuscar,
  IconeFechar,
  IconeFiltro,
  Seletor,
  type OpcaoDoSeletor,
} from "@simpleclick/ui";
import "@simpleclick/ui/styles/filtros.css";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface FiltroDeSelecao {
  readonly tipo: "selecao";
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly opcoes: readonly OpcaoDoSeletor[];
  readonly aoMudar: (valor: string) => void;
}

/** Dois campos de valor (mínimo e máximo), em reais. */
export interface FiltroDeFaixa {
  readonly tipo: "faixa";
  readonly id: string;
  readonly rotulo: string;
  readonly minimo: string;
  readonly maximo: string;
  readonly aoMudar: (minimo: string, maximo: string) => void;
}

export type Filtro = FiltroDeSelecao | FiltroDeFaixa;

export interface BarraDeFiltrosProps {
  /** O que a busca procura, para o rótulo acessível ("Buscar produtos"). */
  readonly rotuloDaBusca: string;
  readonly placeholder: string;
  readonly busca: string;
  readonly aoBuscar: (termo: string) => void;
  readonly filtros: readonly Filtro[];
  readonly ordem?: {
    readonly valor: string;
    readonly opcoes: readonly OpcaoDoSeletor[];
    readonly aoMudar: (valor: string) => void;
  };
  /** Atalhos de um clique (ex.: "Acabando"). */
  readonly atalhos?: ReactNode;
  /** "12 de 340 produtos". */
  readonly contagem: ReactNode;
  /** Quantos filtros estão ligados (a busca não conta): mostra o número no botão. */
  readonly ligados: number;
  /** Algo está filtrado ou buscado: aparece o "Limpar filtros". */
  readonly filtrado: boolean;
  readonly aoLimpar: () => void;
  /** Espera antes de buscar, em ms. */
  readonly esperaMs?: number;
}

/** A busca: ícone, "limpar" e espera curta; Enter busca na hora. */
export function CampoDeBuscaDoPainel({
  rotulo,
  placeholder,
  valor,
  aoBuscar,
  esperaMs = 300,
}: {
  readonly rotulo: string;
  readonly placeholder: string;
  readonly valor: string;
  readonly aoBuscar: (termo: string) => void;
  readonly esperaMs?: number;
}) {
  const id = useId();
  const [texto, setTexto] = useState(valor);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef(valor);

  // Mudou por fora (voltar do navegador, "Limpar filtros").
  useEffect(() => {
    setTexto(valor);
    ultimo.current = valor;
  }, [valor]);
  useEffect(
    () => () => {
      if (espera.current !== null) clearTimeout(espera.current);
    },
    [],
  );

  function enviar(proximo: string) {
    if (espera.current !== null) clearTimeout(espera.current);
    espera.current = null;
    const limpo = proximo.trim();
    if (limpo === ultimo.current.trim()) return;
    ultimo.current = limpo;
    aoBuscar(limpo);
  }

  return (
    <div className="sc-filtros__busca" role="search">
      <label className="sr-only" htmlFor={id}>
        {rotulo}
      </label>
      <span className="sc-filtros__busca-icone" aria-hidden="true">
        <IconeBuscar />
      </span>
      <input
        id={id}
        className="sc-campo__controle"
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
          if (espera.current !== null) clearTimeout(espera.current);
          const proximo = evento.target.value;
          espera.current = setTimeout(() => enviar(proximo), esperaMs);
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            enviar(texto);
          } else if (evento.key === "Escape" && texto !== "") {
            setTexto("");
            enviar("");
          }
        }}
      />
      {texto !== "" ? (
        <button
          type="button"
          className="sc-filtros__limpar-busca"
          aria-label="Limpar a busca"
          onClick={() => {
            setTexto("");
            enviar("");
          }}
        >
          <IconeFechar />
        </button>
      ) : null}
    </div>
  );
}

/** Um filtro (seleção ou faixa), igual na linha e na gaveta. */
function CampoDoFiltro({
  filtro,
  prefixo,
}: {
  readonly filtro: Filtro;
  readonly prefixo: string;
}) {
  const id = `${prefixo}-${filtro.id}`;
  if (filtro.tipo === "selecao") {
    return (
      <div className="sc-filtros__campo">
        <span id={`${id}-rotulo`}>{filtro.rotulo}</span>
        <Seletor
          id={id}
          aria-labelledby={`${id}-rotulo`}
          value={filtro.valor}
          opcoes={filtro.opcoes}
          onChange={filtro.aoMudar}
        />
      </div>
    );
  }
  return (
    <div className="sc-filtros__campo sc-filtros__campo--faixa">
      <span id={`${id}-rotulo`}>{filtro.rotulo}</span>
      <FaixaDeValor filtro={filtro} id={id} />
    </div>
  );
}

/** Mínimo e máximo: só confirma quando a pessoa sai do campo ou aperta Enter. */
function FaixaDeValor({
  filtro,
  id,
}: {
  readonly filtro: FiltroDeFaixa;
  readonly id: string;
}) {
  const [minimo, setMinimo] = useState(filtro.minimo);
  const [maximo, setMaximo] = useState(filtro.maximo);
  useEffect(() => setMinimo(filtro.minimo), [filtro.minimo]);
  useEffect(() => setMaximo(filtro.maximo), [filtro.maximo]);

  function confirmar() {
    if (minimo.trim() !== filtro.minimo || maximo.trim() !== filtro.maximo) {
      filtro.aoMudar(minimo.trim(), maximo.trim());
    }
  }
  const comum = {
    className: "sc-campo__controle",
    inputMode: "decimal" as const,
    onBlur: confirmar,
    onKeyDown: (evento: React.KeyboardEvent) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        confirmar();
      }
    },
  };
  return (
    <div className="sc-filtros__faixa">
      <input
        {...comum}
        id={`${id}-min`}
        aria-label={`${filtro.rotulo}: mínimo`}
        placeholder="De"
        value={minimo}
        onChange={(evento) => setMinimo(evento.target.value)}
      />
      <input
        {...comum}
        id={`${id}-max`}
        aria-label={`${filtro.rotulo}: máximo`}
        placeholder="Até"
        value={maximo}
        onChange={(evento) => setMaximo(evento.target.value)}
      />
    </div>
  );
}

export function BarraDeFiltros({
  rotuloDaBusca,
  placeholder,
  busca,
  aoBuscar,
  filtros,
  ordem,
  atalhos,
  contagem,
  ligados,
  filtrado,
  aoLimpar,
  esperaMs,
}: BarraDeFiltrosProps) {
  const [gaveta, setGaveta] = useState(false);
  const base = useId();

  // A gaveta é coisa de celular: ao alargar a janela os filtros já estão em
  // linha, então ela fecha (a do pacote não some sozinha no computador).
  useEffect(() => {
    if (!gaveta) return;
    const largura = window.matchMedia("(min-width: 48rem)");
    const aoMudar = () => {
      if (largura.matches) setGaveta(false);
    };
    aoMudar();
    largura.addEventListener("change", aoMudar);
    return () => largura.removeEventListener("change", aoMudar);
  }, [gaveta]);
  const temCampos = filtros.length > 0 || ordem !== undefined;

  const campos = (prefixo: string) => (
    <>
      {filtros.map((filtro) => (
        <CampoDoFiltro key={filtro.id} filtro={filtro} prefixo={prefixo} />
      ))}
    </>
  );
  const campoDeOrdem = (prefixo: string, classe?: string) =>
    ordem === undefined ? null : (
      <div className={classe ?? "sc-filtros__campo"}>
        <span id={`${prefixo}-ordem-rotulo`}>Ordenar por</span>
        <Seletor
          id={`${prefixo}-ordem`}
          aria-labelledby={`${prefixo}-ordem-rotulo`}
          value={ordem.valor}
          opcoes={ordem.opcoes}
          onChange={ordem.aoMudar}
        />
      </div>
    );

  return (
    <div className="sc-filtros" data-barra-de-filtros>
      <div className="sc-filtros__linha">
        <CampoDeBuscaDoPainel
          rotulo={rotuloDaBusca}
          placeholder={placeholder}
          valor={busca}
          aoBuscar={aoBuscar}
          {...(esperaMs === undefined ? {} : { esperaMs })}
        />
        {temCampos ? (
          <Botao
            variante="secundaria"
            className="sc-filtros__botao-filtros"
            aria-haspopup="dialog"
            icone={<IconeFiltro />}
            onClick={() => setGaveta(true)}
          >
            {ligados > 0 ? `Filtros (${ligados})` : "Filtros"}
          </Botao>
        ) : null}
        {campoDeOrdem(`${base}-barra`, "sc-filtros__ordem")}
      </div>

      {filtros.length > 0 ? (
        <div className="sc-filtros__campos">{campos(`${base}-barra`)}</div>
      ) : null}

      {atalhos !== undefined ? (
        <FaixaDeChips
          rotulo="Atalhos de filtro"
          className="sc-filtros__atalhos"
        >
          {atalhos}
        </FaixaDeChips>
      ) : null}

      <div className="sc-filtros__rodape">
        <p className="sc-filtros__contagem" role="status" aria-live="polite">
          {contagem}
        </p>
        {filtrado ? (
          <Botao variante="discreta" tamanho="pequeno" onClick={aoLimpar}>
            Limpar filtros
          </Botao>
        ) : null}
      </div>

      {temCampos ? (
        <Gaveta
          id={`${base}-gaveta`}
          rotuloDoFechar="Fechar os filtros"
          aberta={gaveta}
          aoFechar={() => setGaveta(false)}
          titulo="Filtros"
          rodape={
            <>
              <Botao
                variante="discreta"
                onClick={() => {
                  aoLimpar();
                  setGaveta(false);
                }}
              >
                Limpar filtros
              </Botao>
              <Botao onClick={() => setGaveta(false)}>Ver resultados</Botao>
            </>
          }
        >
          {campos(`${base}-gaveta`)}
          {campoDeOrdem(`${base}-gaveta`)}
        </Gaveta>
      ) : null}
    </div>
  );
}

/** Chip de atalho (um clique liga e desliga). */
export function Atalho({
  ativo,
  aoAlternar,
  children,
}: {
  readonly ativo: boolean;
  readonly aoAlternar: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Chip ativo={ativo} aoAlternar={aoAlternar}>
      {children}
    </Chip>
  );
}

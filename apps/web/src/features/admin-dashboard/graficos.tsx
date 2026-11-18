/**
 * Gráficos do painel de crescimento, feitos à mão em SVG e CSS (sem
 * biblioteca). Todos escrevem os valores por extenso para o leitor de tela e
 * aceitam série zerada: o zero vira um traço, nunca um buraco.
 */
import { useId } from "react";

import { maiorDe } from "./formatar.ts";

export interface PontoDeSerie {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: number;
  /** Valor por extenso: "R$ 80,00", "3 pedidos". */
  readonly texto: string;
  readonly destaque?: boolean | undefined;
}

const LARGURA = 600;
const ALTURA = 200;
const MARGEM = { topo: 12, base: 8, lados: 6 };

/** Linha com área para séries diárias (pedidos, faturamento). */
export function GraficoDeLinha({
  pontos,
  descricao,
  marcas,
  textoDoPico,
}: {
  readonly pontos: readonly PontoDeSerie[];
  readonly descricao: string;
  /** Posições do eixo que recebem rótulo. */
  readonly marcas: readonly number[];
  readonly textoDoPico: string;
}) {
  const id = useId();
  const maior = maiorDe(pontos.map((p) => p.valor));
  const n = pontos.length;
  const util = LARGURA - MARGEM.lados * 2;
  const alto = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (i: number) =>
    MARGEM.lados + (n <= 1 ? util / 2 : (i / (n - 1)) * util);
  const y = (v: number) => MARGEM.topo + alto - (v / maior) * alto;
  const coordenadas = pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`);
  const linha = `M${coordenadas.join(" L")}`;
  const area = `${linha} L${x(n - 1).toFixed(1)},${MARGEM.topo + alto} L${x(0).toFixed(1)},${MARGEM.topo + alto} Z`;
  const picoIndice = pontos.reduce(
    (melhor, p, i) => (p.valor > (pontos[melhor]?.valor ?? 0) ? i : melhor),
    0,
  );
  const pico = pontos[picoIndice];

  return (
    <figure className="m-0 min-w-0" data-grafico="linha">
      <svg
        role="img"
        aria-label={`${descricao}. ${textoDoPico}`}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        preserveAspectRatio="none"
        className="h-44 w-full overflow-visible min-[768px]:h-52"
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--cor-primaria)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--cor-primaria)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={MARGEM.lados}
            x2={LARGURA - MARGEM.lados}
            y1={MARGEM.topo + alto * (1 - f)}
            y2={MARGEM.topo + alto * (1 - f)}
            stroke="var(--cor-borda)"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={MARGEM.lados}
          x2={LARGURA - MARGEM.lados}
          y1={MARGEM.topo + alto}
          y2={MARGEM.topo + alto}
          stroke="var(--cor-borda-forte)"
          vectorEffect="non-scaling-stroke"
        />
        {n > 1 ? <path d={area} fill={`url(#${id}-g)`} /> : null}
        {n > 1 ? (
          <path
            d={linha}
            fill="none"
            stroke="var(--cor-primaria)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {pontos.map((p, i) => (
          <g key={p.chave} data-ponto={p.chave}>
            <title>{`${p.rotulo}: ${p.texto}`}</title>
            {n <= 31 || i === picoIndice ? (
              <circle
                cx={x(i)}
                cy={y(p.valor)}
                r={i === picoIndice && p.valor > 0 ? 4.5 : 0}
                fill="var(--cor-primaria)"
                stroke="var(--cor-superficie-alta)"
                strokeWidth="2"
              />
            ) : null}
            <rect
              x={x(i) - util / Math.max(1, n) / 2}
              y={MARGEM.topo}
              width={util / Math.max(1, n)}
              height={alto}
              fill="transparent"
            />
          </g>
        ))}
      </svg>
      <div className="relative mt-1 flex justify-between text-xs text-tinta-suave" aria-hidden="true">
        {marcas.map((i) => (
          <span key={i}>{pontos[i]?.rotulo}</span>
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-tinta-suave">
        {pico && pico.valor > 0 ? `Pico: ${pico.texto} em ${pico.rotulo}.` : "Sem movimento no período."}
      </figcaption>
    </figure>
  );
}

/** Colunas em CSS: semanas, horas. O maior valor ganha destaque. */
export function GraficoDeColunas({
  pontos,
  descricao,
  mostrarTodosOsRotulos = true,
  alturaDasColunas = "h-40",
}: {
  readonly pontos: readonly PontoDeSerie[];
  readonly descricao: string;
  readonly mostrarTodosOsRotulos?: boolean;
  readonly alturaDasColunas?: string;
}) {
  const maior = maiorDe(pontos.map((p) => p.valor));
  const topo = Math.max(...pontos.map((p) => p.valor));
  return (
    // RELATIVE prende aqui o texto só para leitor de tela de cada coluna (que é
    // absoluto): sem isso ele escapa do recorte e alarga a página em 344px.
    // A faixa rola sozinha quando as colunas não cabem, e por isso entra no Tab
    // (axe `scrollable-region-focusable`): quem usa teclado também a rola.
    <div
      className="relative min-w-0 overflow-x-auto overflow-y-hidden pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)]"
      data-grafico="colunas"
      role="group"
      aria-label={descricao}
      tabIndex={0}
    >
      <ol
        role="list"
        aria-label={descricao}
        className="m-0 grid list-none gap-1 p-0"
        style={{
          gridTemplateColumns: `repeat(${pontos.length}, minmax(${mostrarTodosOsRotulos ? "1.75rem" : "0.9rem"}, 1fr))`,
        }}
      >
        {pontos.map((p, i) => {
          const altura = p.valor <= 0 ? 2 : Math.max(5, (p.valor / maior) * 100);
          const pico = p.valor > 0 && p.valor === topo;
          const comRotulo = mostrarTodosOsRotulos || i % 3 === 0;
          return (
            <li
              key={p.chave}
              data-ponto={p.chave}
              data-valor={p.valor}
              data-destaque={pico || undefined}
              className="flex min-w-0 flex-col items-stretch gap-1"
            >
              <span className="sc-so-leitor">{`${p.rotulo}: ${p.texto}`}</span>
              <span aria-hidden="true" className="text-center text-[0.6875rem] font-semibold tabular-nums leading-4 text-tinta">
                {p.valor > 0 ? p.valor : ""}
              </span>
              <span aria-hidden="true" className={`relative flex items-end ${alturaDasColunas}`} title={`${p.rotulo}: ${p.texto}`}>
                <span
                  className="block w-full rounded-t-[var(--raio-1)]"
                  style={{
                    height: `${altura}%`,
                    background: p.valor <= 0 ? "var(--cor-borda-forte)" : pico ? "var(--cor-primaria)" : "var(--cor-serie-tres)",
                  }}
                />
              </span>
              <span aria-hidden="true" className="h-4 text-center text-[0.6875rem] text-tinta-suave">
                {comRotulo ? p.rotulo : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface LinhaDeBarra {
  readonly chave: string;
  readonly rotulo: string;
  readonly secundario?: string | undefined;
  readonly valor: number;
  readonly texto: string;
  readonly href?: string | undefined;
}

/** Barras horizontais: ranking e distribuição. */
export function BarrasHorizontais({
  linhas,
  descricao,
  renderizarRotulo,
}: {
  readonly linhas: readonly LinhaDeBarra[];
  readonly descricao: string;
  readonly renderizarRotulo?: (linha: LinhaDeBarra) => React.ReactNode;
}) {
  const maior = maiorDe(linhas.map((l) => l.valor));
  return (
    <ol role="list" aria-label={descricao} className="m-0 grid grid-cols-[minmax(0,1fr)] list-none gap-3 p-0" data-grafico="barras">
      {linhas.map((l, i) => (
        <li key={l.chave} data-linha={l.chave} className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span aria-hidden="true" className="w-4 shrink-0 text-xs font-semibold text-tinta-suave tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 truncate font-medium">
                {renderizarRotulo ? renderizarRotulo(l) : l.rotulo}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{l.texto}</span>
          </div>
          <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-[var(--raio-completo)] bg-superficie">
            <span
              className="block h-full rounded-[var(--raio-completo)]"
              style={{
                width: `${l.valor <= 0 ? 1 : Math.max(3, (l.valor / maior) * 100)}%`,
                background: i === 0 ? "var(--cor-primaria)" : "var(--cor-serie-tres)",
              }}
            />
          </span>
          {l.secundario ? <span className="pl-6 text-xs text-tinta-suave">{l.secundario}</span> : null}
        </li>
      ))}
    </ol>
  );
}

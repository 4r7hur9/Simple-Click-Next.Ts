/**
 * Gráfico de colunas em SVG próprio, sem biblioteca (T-805; AC-808, AC-809;
 * decisão de 03/10/2026).
 *
 * CADA PONTO TEM A SUA COLUNA, inclusive o zero: o ponto sem venda vira um
 * traço rente à base, e não um buraco — o dono vê que o dia (ou a hora)
 * existiu e ficou parado, em vez de achar que ele sumiu do gráfico.
 *
 * O desenho é legível no celular antes de ser bonito na tela grande: o SVG
 * estica na largura disponível (`preserveAspectRatio="none"`) e os rótulos do
 * eixo são texto da página, numa grade com uma coluna por ponto — texto
 * dentro de um SVG esticado sairia deformado.
 *
 * Para quem não vê o desenho, o SVG tem um texto alternativo com o resumo
 * (`role="img"`), e a tabela com todos os números fica logo abaixo, num
 * "ver os números" que abre pelo teclado.
 */
import type { ReactNode } from "react";

/** Uma coluna do gráfico. */
export interface PontoDoGrafico {
  /** Identifica o ponto na página e na prova: o dia, ou a hora. */
  readonly chave: string;
  /** O rótulo curto do eixo: "27/09", "18h". */
  readonly rotulo: string;
  /** O que a coluna mede, já na unidade em vigor. */
  readonly valor: number;
  /** Coluna em destaque (o pico do movimento). */
  readonly destaque?: boolean | undefined;
}

export interface GraficoDeBarrasProps {
  readonly pontos: readonly PontoDoGrafico[];
  /** O texto alternativo do desenho: o resumo que o olho tiraria dele. */
  readonly descricao: string;
  /** Em que posições o eixo escreve o rótulo (o resto fica sem). */
  readonly marcas: readonly number[];
  /** A tabela com todos os números, aberta pelo "ver os números". */
  readonly tabela: ReactNode;
}

/** Largura de cada coluna no desenho; a folga entre elas é o resto. */
const PASSO = 10;
const COLUNA = 7;
const ALTURA = 100;
/** O traço do zero: visível, mas claramente menor que qualquer venda. */
const TRACO_DO_ZERO = 1.5;

/** Posições do eixo que recebem rótulo, sem amontoar em período longo. */
export function marcasDoEixo(quantidade: number, maximo = 7): number[] {
  if (quantidade <= 0) return [];
  if (quantidade <= maximo) {
    return Array.from({ length: quantidade }, (_, indice) => indice);
  }
  const passo = Math.ceil((quantidade - 1) / (maximo - 1));
  const marcas: number[] = [];
  for (let indice = 0; indice < quantidade - passo / 2; indice += passo) {
    marcas.push(indice);
  }
  marcas.push(quantidade - 1);
  return marcas;
}

export function GraficoDeBarras({
  pontos,
  descricao,
  marcas,
  tabela,
}: GraficoDeBarrasProps) {
  const maior = Math.max(0, ...pontos.map((ponto) => ponto.valor));
  const largura = Math.max(1, pontos.length) * PASSO;
  const comRotulo = new Set(marcas);

  return (
    <div className="min-w-0">
      <svg
        role="img"
        aria-label={descricao}
        viewBox={`0 0 ${largura} ${ALTURA}`}
        preserveAspectRatio="none"
        className="block h-40 w-full min-[768px]:h-48"
      >
        <line
          x1={0}
          x2={largura}
          y1={ALTURA - 0.25}
          y2={ALTURA - 0.25}
          vectorEffect="non-scaling-stroke"
          className="stroke-[var(--cor-borda-forte)]"
          strokeWidth={1}
        />
        {pontos.map((ponto, indice) => {
          const zero = ponto.valor <= 0;
          const altura = zero
            ? TRACO_DO_ZERO
            : Math.max(TRACO_DO_ZERO * 2, (ponto.valor / maior) * ALTURA);
          return (
            <rect
              key={ponto.chave}
              data-ponto={ponto.chave}
              data-valor={ponto.valor}
              data-zero={zero || undefined}
              data-destaque={ponto.destaque === true || undefined}
              x={indice * PASSO + (PASSO - COLUNA) / 2}
              y={ALTURA - altura}
              width={COLUNA}
              height={altura}
              className={
                zero
                  ? "fill-[var(--cor-borda-forte)]"
                  : ponto.destaque === true
                    ? "fill-[var(--cor-serie-tres)]"
                    : "fill-[var(--cor-serie-dois)]"
              }
            />
          );
        })}
      </svg>

      <div
        aria-hidden="true"
        className="mt-1 grid text-xs text-tinta-suave tabular-nums"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, pontos.length)}, minmax(0, 1fr))`,
        }}
      >
        {pontos.map((ponto, indice) =>
          comRotulo.has(indice) ? (
            <span
              key={ponto.chave}
              className="justify-self-center whitespace-nowrap"
              style={{ gridColumn: indice + 1, gridRow: 1 }}
            >
              {ponto.rotulo}
            </span>
          ) : null,
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium underline-offset-2 hover:underline">
          Ver os números
        </summary>
        <div className="mt-2 overflow-x-auto">{tabela}</div>
      </details>
    </div>
  );
}

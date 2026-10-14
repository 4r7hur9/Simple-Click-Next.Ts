/**
 * Gráfico de colunas em CSS puro, sem biblioteca (T-805; AC-808, AC-809;
 * decisão de 03/10/2026).
 *
 * CADA PONTO TEM A SUA COLUNA, inclusive o zero: o ponto sem venda vira um
 * traço rente à base, e não um buraco — o dono vê que o dia (ou a hora)
 * existiu e ficou parado, em vez de achar que ele sumiu do gráfico.
 *
 * O VALOR ESTÁ ESCRITO, e não só desenhado: em cima de cada coluna vai o
 * número curto ("12", "1,5 mil"), legível sem passar o mouse — no celular não
 * há mouse. Cada coluna também diz, para o leitor de tela, o rótulo e o valor
 * por extenso ("18h às 19h: 5 pedidos"), numa lista de verdade.
 *
 * SEM LARGURA FIXA. As colunas dividem a largura disponível; cada uma tem um
 * mínimo do tamanho do número escrito nela. Quando a soma dos mínimos não
 * cabe (as 24 horas num celular), a área do desenho rola de lado, e pode
 * ser rolada pelo teclado. Período longo demais para escrever número por
 * coluna (um mês, um ano) desenha só as colunas, finas: o resumo em texto e
 * a tabela do "ver os números" levam os valores.
 */
import type { CSSProperties, ReactNode } from "react";

/** Uma coluna do gráfico. */
export interface PontoDoGrafico {
  /** Identifica o ponto na página e na prova: o dia, ou a hora. */
  readonly chave: string;
  /** O rótulo curto do eixo: "27/09", "18h". */
  readonly rotulo: string;
  /** O nome por extenso, para o leitor de tela: "18h às 19h". */
  readonly nome?: string | undefined;
  /** O que a coluna mede, já na unidade em vigor. */
  readonly valor: number;
  /** O valor por extenso: "R$ 80,00", "2 pedidos". */
  readonly texto: string;
  /** O valor curto escrito em cima da coluna: "80", "1,5 mil", "2". */
  readonly textoCurto: string;
  /** Coluna em destaque (o pico do movimento). */
  readonly destaque?: boolean | undefined;
}

export interface GraficoDeBarrasProps {
  readonly pontos: readonly PontoDoGrafico[];
  /** O resumo que o olho tiraria do desenho, para quem não o vê. */
  readonly descricao: string;
  /** Em que posições o eixo escreve o rótulo (o resto fica sem). */
  readonly marcas: readonly number[];
  /** A tabela com todos os números, aberta pelo "ver os números". */
  readonly tabela: ReactNode;
}

/**
 * Até quantas colunas o número vai escrito em cima de cada uma. As 24 horas
 * do dia cabem; um mês já não, e vira desenho só de colunas.
 */
export const LIMITE_DE_COLUNAS_ESCRITAS = 24;
/** O traço do zero, em % da altura: visível, mas menor que qualquer venda. */
export const TRACO_DO_ZERO = 2;
/** A menor coluna de quem vendeu alguma coisa, em % da altura. */
const MENOR_COLUNA = 4;

const NUMERO_CURTO = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** `150` vira "150"; `1500` vira "1,5 mil". Só escreve: não arredonda conta. */
export function escreverNumeroCurto(numero: number): string {
  return NUMERO_CURTO.format(numero);
}

/** Centavos no número curto, em reais: `8_050` vira "80,5". */
export function escreverDinheiroCurto(centavos: number): string {
  return escreverNumeroCurto(centavos / 100);
}

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

/** A altura da coluna, em % da área do desenho. */
export function alturaDaColuna(valor: number, maior: number): number {
  if (valor <= 0 || maior <= 0) return TRACO_DO_ZERO;
  return Math.max(MENOR_COLUNA, (valor / maior) * 100);
}

export function GraficoDeBarras({
  pontos,
  descricao,
  marcas,
  tabela,
}: GraficoDeBarrasProps) {
  const maior = Math.max(0, ...pontos.map((ponto) => ponto.valor));
  const quantidade = Math.max(1, pontos.length);
  const escrito = pontos.length <= LIMITE_DE_COLUNAS_ESCRITAS;
  const comRotulo = new Set(marcas);
  const maisLongo = Math.max(
    1,
    ...pontos.map((ponto) => ponto.textoCurto.length),
  );
  // O mínimo de cada coluna é o do número escrito nela; sem número, nenhum.
  const larguraMinima = escrito
    ? `max(1.5rem, calc(${maisLongo}ch + 0.25rem))`
    : "0px";
  const grade: CSSProperties = {
    gridTemplateColumns: `repeat(${quantidade}, minmax(var(--coluna-minima), 1fr))`,
  };
  const area = {
    "--coluna-minima": larguraMinima,
    minWidth: `calc(${quantidade} * var(--coluna-minima) + ${quantidade - 1} * 0.25rem)`,
  } as CSSProperties;

  return (
    <div className="min-w-0">
      <div
        role="group"
        aria-label={descricao}
        data-grafico
        data-escrito={escrito || undefined}
        tabIndex={0}
        className="overflow-x-auto rounded-[var(--raio-botao)] pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
      >
        <div style={area} className="text-[0.6875rem] tabular-nums">
          <ol style={grade} className="grid h-44 gap-1 min-[768px]:h-52">
            {pontos.map((ponto) => {
              const zero = ponto.valor <= 0;
              const destaque = ponto.destaque === true;
              const altura = alturaDaColuna(ponto.valor, maior);
              return (
                <li
                  key={ponto.chave}
                  data-ponto={ponto.chave}
                  data-valor={ponto.valor}
                  data-zero={zero || undefined}
                  data-destaque={destaque || undefined}
                  className="relative flex min-w-0 justify-center"
                >
                  <span className="sc-so-leitor">
                    {`${ponto.nome ?? ponto.rotulo}: ${ponto.texto}`}
                  </span>
                  {/* O trilho reserva em cima o espaço do número da coluna
                      mais alta, para ele nunca sair do desenho. */}
                  <span
                    aria-hidden="true"
                    className={[
                      "absolute inset-x-0 bottom-0 mx-auto max-w-12",
                      escrito ? "top-5" : "top-0",
                    ].join(" ")}
                  >
                    {escrito ? (
                      <span
                        data-valor-texto
                        className={[
                          "absolute inset-x-0 text-center leading-4 whitespace-nowrap",
                          zero
                            ? "text-tinta-suave"
                            : "font-semibold text-tinta",
                        ].join(" ")}
                        style={{ bottom: `calc(${altura}% + 0.125rem)` }}
                      >
                        {ponto.textoCurto}
                      </span>
                    ) : null}
                    <span
                      data-barra
                      className={[
                        "absolute inset-x-0 bottom-0",
                        escrito
                          ? "rounded-t-[var(--raio-2)]"
                          : "rounded-t-[var(--raio-1)]",
                        zero
                          ? "bg-[var(--cor-borda-forte)]"
                          : destaque
                            ? "bg-[var(--cor-serie-tres)]"
                            : "bg-[var(--cor-serie-dois)]",
                      ].join(" ")}
                      style={{ height: `${altura}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            aria-hidden="true"
            style={grade}
            className="mt-1 grid gap-1 border-t border-borda-forte pt-1 text-xs text-tinta-suave"
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
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-[var(--altura-toque)] cursor-pointer items-center font-medium underline-offset-2 hover:underline">
          Ver os números
        </summary>
        <div className="mt-2 overflow-x-auto">{tabela}</div>
      </details>
    </div>
  );
}

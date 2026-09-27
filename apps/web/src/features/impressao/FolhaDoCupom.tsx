import type { CSSProperties } from "react";

/**
 * O cupom no navegador: uma linha de HTML por linha do cupom (T-606 — AC-617,
 * AC-618).
 *
 * O componente NÃO decide conteúdo nem medida. As linhas chegam prontas de
 * `diagramarCupom` — as mesmas que a impressora recebe em bytes —, com o
 * alinhamento já feito em espaços. Aqui só se desenha: letra monoespaçada,
 * `white-space: pre`, e o tamanho da letra que põe exatamente as colunas do
 * papel na área que a cabeça de impressão alcança.
 */

/** Uma linha já diagramada (o mesmo formato de `LinhaDoCupom`, do núcleo). */
export type LinhaDaFolha =
  | {
      readonly tipo: "texto";
      readonly texto: string;
      readonly negrito: boolean;
      readonly tamanho: "normal" | "duplo";
    }
  | { readonly tipo: "corte" };

/** O cupom pronto para o papel, como a camada de servidor o entrega. */
export interface DadosDaFolha {
  readonly larguraMm: number;
  readonly areaImpressaMm: number;
  readonly colunas: number;
  readonly letraMm: number;
  readonly alturaMm: number;
  readonly via: number;
  readonly linhas: readonly LinhaDaFolha[];
}

/**
 * A página impressa tem o tamanho do PAPEL CONFIGURADO (AC-617): largura da
 * bobina e altura exata do cupom, sem margem. Uma página só — nem corte no
 * meio do pedido, nem metro de papel em branco no fim.
 */
export function regraDaPagina(folha: DadosDaFolha): string {
  return `@page { size: ${String(folha.larguraMm)}mm ${String(folha.alturaMm)}mm; margin: 0; }`;
}

/** As medidas do papel, como variáveis que `cupom.css` usa. */
function medidas(folha: DadosDaFolha): CSSProperties {
  return {
    "--cupom-papel": `${String(folha.larguraMm)}mm`,
    "--cupom-area": `${String(folha.areaImpressaMm)}mm`,
    "--cupom-letra": `${String(folha.letraMm)}mm`,
    "--cupom-colunas": String(folha.colunas),
  } as CSSProperties;
}

function classeDaLinha(
  linha: Extract<LinhaDaFolha, { tipo: "texto" }>,
): string {
  return [
    "sc-cupom__linha",
    linha.negrito ? "sc-cupom__linha--negrito" : "",
    linha.tamanho === "duplo" ? "sc-cupom__linha--duplo" : "",
  ]
    .filter((classe) => classe !== "")
    .join(" ");
}

export function FolhaDoCupom({ folha }: { readonly folha: DadosDaFolha }) {
  return (
    <>
      <style>{regraDaPagina(folha)}</style>
      <article
        className="sc-cupom"
        aria-label={`Cupom do pedido, ${String(folha.via)}ª via`}
        data-papel-mm={folha.larguraMm}
        data-colunas={folha.colunas}
        style={medidas(folha)}
      >
        {folha.linhas.map((linha, posicao) =>
          // O corte é da impressora; no navegador, o fim da página já é o fim
          // do cupom.
          linha.tipo === "corte" ? null : (
            <div
              key={`linha-${String(posicao)}`}
              className={classeDaLinha(linha)}
            >
              {linha.texto}
            </div>
          ),
        )}
      </article>
    </>
  );
}

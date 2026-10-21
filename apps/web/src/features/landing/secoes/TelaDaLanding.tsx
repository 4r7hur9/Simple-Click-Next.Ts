/**
 * As peças comuns das seções depois da narrativa (card #96): a moldura de uma
 * tela do tamanho da janela, a pílula, o título com palavras que sobem e
 * destaques coloridos, e o apoio. Estilo em landing-secoes.css.
 *
 * CADA SEÇÃO TEM A SUA CARA (`personalidade`): fundo, luz e desenho próprios;
 * a moldura é a mesma. A cor da seção (`acento`) pinta a pílula, os destaques
 * sem cor própria e os detalhes.
 *
 * A ENTRADA é CSS: o título já vem dividido em palavras (cada uma numa
 * máscara, com o número da ordem em `--i`) e os blocos marcados com
 * `data-surge`. O script (telas-em-encaixe.ts) só arma a seção e a solta
 * quando ela aparece. Sem script, com movimento reduzido ou antes de armar,
 * está tudo no lugar.
 */
import type { CSSProperties, ReactNode } from "react";

import type { CorDoDestaque, TrechoDaTela } from "../conteudo.ts";

import "./landing-secoes.css";

export type PersonalidadeDaTela = "regua" | "impacto" | "mosaico" | "vozes" | "duvidas";

/** A ordem de entrada de um bloco (`data-surge`). */
export const ordem = (i: number) => ({ "--i": i }) as CSSProperties;

export function TelaDaLanding({
  id,
  tituloId,
  personalidade,
  acento = "limao",
  children,
}: {
  readonly id: string;
  readonly tituloId: string;
  readonly personalidade: PersonalidadeDaTela;
  readonly acento?: CorDoDestaque;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={tituloId}
      className={`sc-tela sc-tela--${personalidade}`}
      data-acento={acento}
      data-tela={personalidade}
      data-tema="escuro"
      id={id}
    >
      <div aria-hidden="true" className="sc-tela__fundo" />
      <div className="sc-tela__dentro">{children}</div>
    </section>
  );
}

/** A pílula do alto da seção: ponto aceso e o nome curto. */
export function Pilula({ children, i = 0 }: { readonly children: ReactNode; readonly i?: number }) {
  return (
    <p className="sc-tela__pilula" data-surge style={ordem(i)}>
      <span aria-hidden="true" className="sc-tela__pilula-ponto" />
      {children}
    </p>
  );
}

/** Pontuação que nunca começa linha nem palavra solta. */
const COLA_NA_ANTERIOR = /^\S/;

/**
 * Divide os trechos em palavras (o que fica junto sobe junto): palavra solta,
 * destaque inteiro, e a pontuação grudada no que vem antes.
 */
export function palavrasDosTrechos(trechos: readonly TrechoDaTela[]): (string | Exclude<TrechoDaTela, string>)[][] {
  const grupos: (string | Exclude<TrechoDaTela, string>)[][] = [];
  let colar = false;
  for (const trecho of trechos) {
    if (typeof trecho !== "string") {
      if (colar && grupos.length > 0) grupos.at(-1)!.push(trecho);
      else grupos.push([trecho]);
      colar = true;
      continue;
    }
    if (!COLA_NA_ANTERIOR.test(trecho)) colar = false;
    for (const pedaco of trecho.split(/(\s+)/)) {
      if (pedaco === "") continue;
      if (/^\s+$/.test(pedaco)) {
        colar = false;
        continue;
      }
      if (colar && grupos.length > 0) grupos.at(-1)!.push(pedaco);
      else grupos.push([pedaco]);
      colar = true;
    }
  }
  return grupos;
}

export function DestaqueDaTela({
  efeito = "acende",
  cor,
  children,
}: {
  readonly efeito?: "acende" | "sublinhado" | "marcador" | undefined;
  readonly cor?: CorDoDestaque | undefined;
  readonly children: ReactNode;
}) {
  return (
    <em className="sc-tela__destaque" data-cor={cor} data-efeito={efeito}>
      {children}
    </em>
  );
}

/** Palavras numa máscara cada, numeradas a partir de `inicio`. */
function Palavras({ trechos, inicio = 0 }: { readonly trechos: readonly TrechoDaTela[]; readonly inicio?: number }) {
  return palavrasDosTrechos(trechos).map((grupo, indice) => (
    <span key={indice}>
      {indice > 0 ? " " : null}
      <span className="sc-tela__palavra" style={ordem(inicio + indice)}>
        <span>
          {grupo.map((pedaco, k) =>
            typeof pedaco === "string" ? (
              pedaco
            ) : (
              <DestaqueDaTela cor={pedaco.cor} efeito={pedaco.efeito} key={k}>
                {pedaco.destaque}
              </DestaqueDaTela>
            ),
          )}
        </span>
      </span>
    </span>
  ));
}

/** O título da seção: as palavras sobem uma a uma; os destaques acendem depois. */
export function TituloDaTela({
  id,
  trechos,
  className,
}: {
  readonly id: string;
  readonly trechos: readonly TrechoDaTela[];
  readonly className?: string;
}) {
  return (
    <h2 className={`sc-tela__titulo${className ? ` ${className}` : ""}`} id={id}>
      <Palavras trechos={trechos} />
    </h2>
  );
}

/** O título em linhas, cada uma com a sua cor (a seção de impacto). */
export function TituloEmLinhas({
  id,
  linhas,
  className,
}: {
  readonly id: string;
  readonly linhas: readonly { readonly texto: string; readonly cor: CorDoDestaque }[];
  readonly className?: string;
}) {
  return (
    <h2 className={`sc-tela__titulo${className ? ` ${className}` : ""}`} id={id}>
      {linhas.map((linha, indice) => (
        <span className="sc-tela__linha" data-cor={linha.cor} key={linha.texto}>
          {indice > 0 ? " " : null}
          <span className="sc-tela__palavra" style={ordem(indice * 2)}>
            <span>
              <DestaqueDaTela cor={linha.cor}>{linha.texto}</DestaqueDaTela>
            </span>
          </span>
        </span>
      ))}
    </h2>
  );
}

/** O apoio: o destaque vira negrito claro. */
export function ApoioDaTela({
  trechos,
  i = 2,
  className,
}: {
  readonly trechos: readonly TrechoDaTela[];
  readonly i?: number;
  readonly className?: string;
}) {
  return (
    <p className={`sc-tela__apoio${className ? ` ${className}` : ""}`} data-surge style={ordem(i)}>
      {trechos.map((trecho, indice) =>
        typeof trecho === "string" ? (
          trecho
        ) : (
          <strong key={indice}>{trecho.destaque}</strong>
        ),
      )}
    </p>
  );
}

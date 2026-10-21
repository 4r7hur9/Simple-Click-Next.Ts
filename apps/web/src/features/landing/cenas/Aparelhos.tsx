/**
 * Os aparelhos da landing, desenhados em CSS (aparelhos.css) com as TELAS
 * REAIS do app dentro: um celular da linha Pro Max mais recente e um notebook
 * de alumínio. Sem logotipo de marca nenhuma.
 *
 * O celular segue as medidas de verdade: tela de 440×956 pt (as capturas de
 * scripts/telas-da-landing/gerar.mjs saem nesse tamanho, em 3x), bordas de
 * tela mínimas, moldura de titânio, ilha dinâmica, botões de ação, volume,
 * lateral e de câmera, barra de status e indicador de início. Tudo é medido
 * em frações da largura do aparelho (`--l`), então ele escala inteiro.
 * `inclinacao` gira o corpo em 3D para as cenas; a raiz fica livre para as
 * transformações da narrativa (GSAP).
 *
 * Várias telas podem morar no mesmo aparelho: a primeira aparece; as outras
 * ficam empilhadas e transparentes, e a narrativa troca entre elas conforme a
 * rolagem. Sem script, fica a primeira — a página não quebra.
 */
import type { ReactNode } from "react";

import { TELAS_DO_APP } from "../telas-do-app.ts";

import "./aparelhos.css";

export type NomeDaTela = keyof typeof TELAS_DO_APP;

export interface Tela {
  readonly nome: NomeDaTela;
  /** O que a tela mostra, para quem não vê a imagem. */
  readonly descricao: string;
}

/** Reto, de frente; ou girado em 3D com a tela virada para um dos lados. */
export type Inclinacao = "reto" | "esquerda" | "direita";

function srcSet(base: string, larguras: readonly number[], padrao: number, formato: "avif" | "webp") {
  return larguras
    .map((largura) => `${base}${largura === padrao ? "" : `-${largura}`}.${formato} ${largura}w`)
    .join(", ");
}

function ImagemDaTela({
  tela,
  indice,
  prioridade,
}: {
  readonly tela: Tela;
  readonly indice: number;
  readonly prioridade: boolean;
}) {
  const medidas = TELAS_DO_APP[tela.nome];
  const larga = medidas.largura > medidas.altura;
  const base = `/landing/app/${tela.nome}`;
  // A tela ocupa 94% da largura do celular; o notebook, ~96% da tampa.
  const sizes = larga ? "(min-width: 900px) 52rem, 92vw" : "(min-width: 900px) 19.5rem, min(60vw, 17.75rem)";
  return (
    <picture className="sc-lp-tela__quadro">
      <source type="image/avif" srcSet={srcSet(base, medidas.larguras, medidas.padrao, "avif")} sizes={sizes} />
      <img
        className="sc-lp-tela__imagem"
        data-tela={tela.nome}
        data-indice={indice}
        src={`${base}.webp`}
        srcSet={srcSet(base, medidas.larguras, medidas.padrao, "webp")}
        sizes={sizes}
        alt={indice === 0 ? tela.descricao : ""}
        width={medidas.largura}
        height={medidas.altura}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
        {...(prioridade ? { fetchPriority: "high" as const } : {})}
      />
    </picture>
  );
}

/** Sinal, wi-fi e bateria da barra de status, no desenho do iOS. */
function IconesDeStatus() {
  return (
    <span className="sc-lp-iphone__icones">
      <svg viewBox="0 0 18 12" className="sc-lp-iphone__sinal">
        <rect x="0" y="7.5" width="3.2" height="4.5" rx="1" />
        <rect x="4.9" y="5.2" width="3.2" height="6.8" rx="1" />
        <rect x="9.8" y="2.7" width="3.2" height="9.3" rx="1" />
        <rect x="14.7" y="0" width="3.2" height="12" rx="1" />
      </svg>
      <svg viewBox="0 0 16 12" className="sc-lp-iphone__wifi">
        <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.1-1.2A10.3 10.3 0 0 0 8 .8 10.3 10.3 0 0 0 .9 3.6L2 4.8a8.6 8.6 0 0 1 6-2.4Z" />
        <path d="M8 5.7c1.4 0 2.6.5 3.6 1.4l1.1-1.2A7 7 0 0 0 8 4.1a7 7 0 0 0-4.7 1.8l1.1 1.2c1-.9 2.2-1.4 3.6-1.4Z" />
        <path d="M8 8.9c.6 0 1.1.2 1.5.6L8 11.2 6.5 9.5c.4-.4.9-.6 1.5-.6Z" />
      </svg>
      <svg viewBox="0 0 28 13" className="sc-lp-iphone__bateria">
        <rect x="0.6" y="0.6" width="23.8" height="11.8" rx="3.6" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.1" />
        <rect x="2.4" y="2.4" width="20.2" height="8.2" rx="2.1" />
        <path d="M25.9 4.4v4.2c.9-.3 1.5-1.1 1.5-2.1s-.6-1.8-1.5-2.1Z" fillOpacity="0.45" />
      </svg>
    </span>
  );
}

/** Um iPhone da linha Pro Max mais recente com uma ou mais telas reais do app. */
export function Celular({
  telas,
  prioridade = false,
  inclinacao = "reto",
  className = "",
  children,
}: {
  readonly telas: readonly Tela[];
  readonly prioridade?: boolean;
  readonly inclinacao?: Inclinacao;
  readonly className?: string;
  /** Camadas por cima da tela (ex.: a foto que encaixa no cartão). */
  readonly children?: ReactNode;
}) {
  const classes = ["sc-lp-celular", "sc-lp-iphone"];
  if (inclinacao !== "reto") classes.push(`sc-lp-iphone--${inclinacao}`);
  if (className) classes.push(className);
  return (
    <div className={classes.join(" ")}>
      <div className="sc-lp-iphone__corpo">
        <span className="sc-lp-iphone__botao sc-lp-iphone__botao--acao" aria-hidden="true" />
        <span className="sc-lp-iphone__botao sc-lp-iphone__botao--volume-mais" aria-hidden="true" />
        <span className="sc-lp-iphone__botao sc-lp-iphone__botao--volume-menos" aria-hidden="true" />
        <span className="sc-lp-iphone__botao sc-lp-iphone__botao--lateral" aria-hidden="true" />
        <span className="sc-lp-iphone__botao sc-lp-iphone__botao--camera" aria-hidden="true" />
        <div className="sc-lp-iphone__moldura">
          <div className="sc-lp-iphone__vidro">
            <div className="sc-lp-tela" data-telas={telas.length}>
              {telas.map((tela, indice) => (
                <ImagemDaTela
                  key={tela.nome}
                  tela={tela}
                  indice={indice}
                  prioridade={prioridade && indice === 0}
                />
              ))}
              {children}
              <div className="sc-lp-iphone__status" aria-hidden="true">
                <span className="sc-lp-iphone__hora">9:41</span>
                <IconesDeStatus />
              </div>
              <span className="sc-lp-iphone__ilha" aria-hidden="true">
                <span className="sc-lp-iphone__lente" />
              </span>
              <span className="sc-lp-iphone__indicador" aria-hidden="true" />
              <span className="sc-lp-aparelho__reflexo" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Um notebook de alumínio, de tela fina, com uma ou mais telas reais do painel. */
export function Notebook({
  telas,
  className = "",
}: {
  readonly telas: readonly Tela[];
  readonly className?: string;
}) {
  return (
    <div className={`sc-lp-notebook sc-lp-mac ${className}`.trim()}>
      <div className="sc-lp-notebook__tampa">
        <div className="sc-lp-mac__moldura">
          <span className="sc-lp-mac__camera" aria-hidden="true" />
          <div className="sc-lp-tela sc-lp-tela--larga" data-telas={telas.length}>
            {telas.map((tela, indice) => (
              <ImagemDaTela key={tela.nome} tela={tela} indice={indice} prioridade={false} />
            ))}
            <span className="sc-lp-aparelho__reflexo" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="sc-lp-notebook__base" aria-hidden="true">
        <span className="sc-lp-mac__dobradica" />
      </div>
    </div>
  );
}

/**
 * Um produto de verdade, recortado (fotos do card #86): a foto, a sombra de
 * contato embaixo e uma luz verde quase imperceptível por trás.
 */
export function FotoDoProduto({
  produto,
  className = "",
  prioridade = false,
}: {
  readonly produto: "hamburguer" | "peca";
  readonly className?: string;
  readonly prioridade?: boolean;
}) {
  const medidas = produto === "hamburguer" ? [800, 653] : [800, 636];
  return (
    <div className={`sc-lp-produto sc-lp-produto--${produto} ${className}`.trim()} aria-hidden="true">
      <img className="sc-lp-produto__sombra" src="/landing/produtos/sombra.webp" alt="" width={1600} height={360} loading="lazy" decoding="async" />
      <img
        className="sc-lp-produto__foto"
        src={`/landing/produtos/${produto}-800.webp`}
        srcSet={`/landing/produtos/${produto}-480.webp 480w, /landing/produtos/${produto}-800.webp 800w, /landing/produtos/${produto}.webp 1600w`}
        sizes="(min-width: 900px) 20.5rem, min(32vw, 10rem)"
        alt=""
        width={medidas[0]}
        height={medidas[1]}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
}

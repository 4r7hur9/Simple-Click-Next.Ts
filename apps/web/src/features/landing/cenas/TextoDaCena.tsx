/**
 * As peças de texto das cenas (estilo em cenas/tipografia.css): etiqueta com
 * número, título com palavras-chave que acendem, apoio, benefícios e a trilha
 * do pedido. O texto vem de conteudo.ts.
 *
 * A HIERARQUIA, de cima para baixo: etiqueta (número grande em contorno +
 * rótulo em pílula), título (peso médio, palavra-chave em peso forte e na cor
 * da cena), apoio (claro e legível, com o benefício em negrito) e um detalhe
 * curto (checks ou trilha).
 *
 * A MECÂNICA DAS CENAS (cenas-em-slide.ts) depende de três coisas daqui: o
 * título é `.sc-lp-momento__titulo` e o apoio `.sc-lp-momento__texto-corrido`
 * (o SplitText os divide em linhas); o resto entra e sai como bloco. A cena
 * ativa ganha `data-atual`, e é isso que dispara a animação dos destaques.
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import type { EfeitoDoDestaque, Trecho } from "../conteudo.ts";

/** Palavra-chave na cor da cena. `em`: é ênfase de verdade, para o leitor de tela também. */
export function Destaque({
  efeito = "acende",
  children,
}: {
  readonly efeito?: EfeitoDoDestaque;
  readonly children: ReactNode;
}) {
  return (
    <em className="sc-lp-destaque" data-efeito={efeito}>
      {children}
    </em>
  );
}

/** Pontuação que nunca começa linha: fica grudada no destaque que vem antes. */
const PONTUACAO_NO_INICIO = /^[.,…:;!?]+/;

/**
 * Uma frase com trechos destacados: no título acendem, no apoio viram negrito.
 * A pontuação logo depois de um destaque vai junto com ele (o SplitText
 * quebraria a linha entre a palavra e o ponto).
 */
export function Trechos({ trechos, como }: { readonly trechos: readonly Trecho[]; readonly como: "destaque" | "negrito" }) {
  return trechos.map((trecho, indice) => {
    if (typeof trecho === "string") {
      const anterior = trechos[indice - 1];
      return anterior !== undefined && typeof anterior !== "string" ? trecho.replace(PONTUACAO_NO_INICIO, "") : trecho;
    }
    const seguinte = trechos[indice + 1];
    const pontuacao = typeof seguinte === "string" ? (PONTUACAO_NO_INICIO.exec(seguinte)?.[0] ?? "") : "";
    if (como === "negrito") {
      return (
        <strong key={indice} className="sc-lp-apoio__forte">
          {trecho.destaque}
          {pontuacao}
        </strong>
      );
    }
    const destaque = (
      <Destaque key={indice} {...(trecho.efeito ? { efeito: trecho.efeito } : {})}>
        {trecho.destaque}
      </Destaque>
    );
    return pontuacao ? (
      <span key={indice} className="sc-lp-junto">
        {destaque}
        {pontuacao}
      </span>
    ) : (
      destaque
    );
  });
}

/** A etiqueta da cena: número grande em contorno, que sobe, e o rótulo em pílula. */
export function Etiqueta({ numero, children }: { readonly numero?: string; readonly children: ReactNode }) {
  return (
    <p className="sc-lp-etiqueta">
      {numero ? (
        <span className="sc-lp-etiqueta__numero" aria-hidden="true">
          <span>{numero}</span>
        </span>
      ) : null}
      <span className="sc-lp-etiqueta__rotulo">{children}</span>
    </p>
  );
}

export function TituloDaCena({
  id,
  trechos,
  grande = false,
}: {
  readonly id: string;
  readonly trechos: readonly Trecho[];
  /** Os dois ramos: uma palavra só, maior. */
  readonly grande?: boolean;
}) {
  return (
    <h2 className={`sc-lp-momento__titulo${grande ? " sc-lp-momento__titulo--grande" : ""}`} id={id}>
      <Trechos trechos={trechos} como="destaque" />
    </h2>
  );
}

export function ApoioDaCena({ trechos }: { readonly trechos: readonly Trecho[] }) {
  return (
    <p className="sc-lp-momento__texto-corrido">
      <Trechos trechos={trechos} como="negrito" />
    </p>
  );
}

/** Benefícios curtos, com check na cor da cena. */
export function Beneficios({ itens }: { readonly itens: readonly string[] }) {
  return (
    <ul className="sc-lp-beneficios">
      {itens.map((item) => (
        <li key={item}>
          <Check aria-hidden="true" size={14} strokeWidth={3} />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** O caminho do pedido no painel, da esquerda para a direita. */
export function Trilha({ etapas, rotulo }: { readonly etapas: readonly string[]; readonly rotulo: string }) {
  return (
    <ol className="sc-lp-trilha" aria-label={rotulo}>
      {etapas.map((etapa) => (
        <li key={etapa}>{etapa}</li>
      ))}
    </ol>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Girando } from "./estados";

/**
 * Botão base.
 *
 * Dos quatro estados de tela, o botão vive dois: **carregando**, enquanto a
 * ação que ele disparou não voltou, e **desabilitado**, quando a ação não está
 * disponível. Vazio e erro não são dele — pertencem a quem mostra o resultado.
 * Forçar os quatro em todo componente é o tipo de simetria que deixa a interface
 * pior (AC-013 pede os estados "onde faz sentido").
 *
 * O clique duplo em botão de "Finalizar pedido" era um defeito real do v1: aqui
 * `carregando` desabilita o botão de verdade, e não só troca o rótulo.
 */

export type VarianteDeBotao = "primaria" | "secundaria" | "perigo" | "discreta";

/** `pilula` é a do botão principal da vitrine; o resto do produto usa `padrao`. */
export type FormaDeBotao = "padrao" | "pilula";

export type TamanhoDeBotao = "normal" | "pequeno" | "grande";

export type BotaoProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "className"
> & {
  children: ReactNode;
  variante?: VarianteDeBotao | undefined;
  tamanho?: TamanhoDeBotao | undefined;
  forma?: FormaDeBotao | undefined;
  /** Ícone desenhado antes do rótulo (use os de `icones.ts`). */
  icone?: ReactNode | undefined;
  /**
   * Botão só com o ícone. O `children` continua obrigatório e vira o NOME do
   * botão para o leitor de tela — ícone sozinho não diz o que faz.
   */
  soIcone?: boolean | undefined;
  /** Ação em andamento: desabilita o clique e anuncia a espera. */
  carregando?: boolean | undefined;
  /** Texto que o leitor de tela ouve enquanto a ação corre. */
  rotuloDeEspera?: string | undefined;
  desabilitado?: boolean | undefined;
  className?: string | undefined;
};

/** Botão que, carregando, bloqueia o clique de verdade e anuncia a espera. */
export function Botao({
  children,
  variante = "primaria",
  tamanho = "normal",
  forma = "padrao",
  icone,
  soIcone = false,
  carregando = false,
  rotuloDeEspera = "Enviando…",
  desabilitado = false,
  className,
  type = "button",
  ...resto
}: BotaoProps) {
  const bloqueado = carregando || desabilitado;

  return (
    <button
      {...resto}
      type={type}
      // Sem `disabled` de verdade o clique duplo passa: o segundo evento chega
      // antes de a primeira resposta voltar, e o pedido nasce duplicado.
      disabled={bloqueado}
      aria-busy={carregando || undefined}
      className={[
        "sc-botao",
        `sc-botao--${variante}`,
        tamanho !== "normal" && `sc-botao--${tamanho}`,
        forma === "pilula" && "sc-botao--pilula",
        soIcone && "sc-botao--so-icone",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {carregando ? <Girando /> : icone}
      <span className={soIcone ? "sc-so-leitor" : undefined}>{children}</span>
      {carregando && <span className="sc-so-leitor">{rotuloDeEspera}</span>}
    </button>
  );
}

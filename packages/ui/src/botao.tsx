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

export type BotaoProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "className"
> & {
  children: ReactNode;
  variante?: VarianteDeBotao | undefined;
  tamanho?: "normal" | "pequeno" | undefined;
  /** Ação em andamento: desabilita o clique e anuncia a espera. */
  carregando?: boolean | undefined;
  /** Texto que o leitor de tela ouve enquanto a ação corre. */
  rotuloDeEspera?: string | undefined;
  desabilitado?: boolean | undefined;
  className?: string | undefined;
};

export function Botao({
  children,
  variante = "primaria",
  tamanho = "normal",
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
        tamanho === "pequeno" && "sc-botao--pequeno",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {carregando && <Girando />}
      <span>{children}</span>
      {carregando && <span className="sc-so-leitor">{rotuloDeEspera}</span>}
    </button>
  );
}

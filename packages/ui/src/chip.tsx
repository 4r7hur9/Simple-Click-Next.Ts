import type { ReactNode } from "react";
import type { ComponenteDeLink } from "./componente-de-link";

/**
 * Chip de filtro e de categoria (card #104).
 *
 * Dois comportamentos, escolhidos pela prop que vem:
 *
 * - `aoAlternar` → botão que liga e desliga um FILTRO. O estado é anunciado por
 *   `aria-pressed`.
 * - `href` → link de CATEGORIA, que navega. O chip da página atual é anunciado
 *   por `aria-current="true"`. Categoria é navegação, e não aba.
 *
 * Ativo é verde com texto escuro, e dentro da loja segue a cor do dono (a peça
 * só lê `--cor-primaria*`). Não tem `"use client"`: pode ser usado em tela de
 * servidor. Só `aoAlternar` exige um pai de navegador, porque é uma função.
 */

export type ChipProps = {
  children: ReactNode;
  ativo?: boolean | undefined;
  /** Quantidade ao lado do rótulo (itens da categoria). */
  contagem?: number | string | undefined;
  desabilitado?: boolean | undefined;
  icone?: ReactNode | undefined;
  /** Filtro: vira botão com `aria-pressed`. */
  aoAlternar?: (() => void) | undefined;
  /** Categoria: vira link com `aria-current`. */
  href?: string | undefined;
  /** O `Link` do Next, para navegar sem recarregar. Sem ele, um `<a>`. */
  componenteDeLink?: ComponenteDeLink | undefined;
  className?: string | undefined;
};

export function Chip({
  children,
  ativo = false,
  contagem,
  desabilitado = false,
  icone,
  aoAlternar,
  href,
  componenteDeLink: Link,
  className,
}: ChipProps) {
  const classes = [
    "sc-chip",
    ativo && "sc-chip--ativo",
    desabilitado && "sc-chip--desabilitado",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const conteudo = (
    <>
      {icone}
      <span className="sc-chip__rotulo">{children}</span>
      {contagem !== undefined && (
        <span className="sc-chip__contagem">{contagem}</span>
      )}
    </>
  );

  if (href !== undefined) {
    // Link desabilitado não navega nem entra na ordem do Tab: sem `href`.
    if (desabilitado) {
      return (
        <span className={classes} aria-disabled="true">
          {conteudo}
        </span>
      );
    }
    const atual = ativo ? ("true" as const) : undefined;
    return Link !== undefined ? (
      <Link href={href} className={classes} aria-current={atual}>
        {conteudo}
      </Link>
    ) : (
      <a href={href} className={classes} aria-current={atual}>
        {conteudo}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={ativo}
      disabled={desabilitado}
      onClick={aoAlternar}
    >
      {conteudo}
    </button>
  );
}

export type FaixaDeChipsProps = {
  /** Nome da faixa para o leitor de tela ("Categorias", "Filtros"). */
  rotulo: string;
  /** Faixa de categorias (links) é uma `nav`; faixa de filtros é um grupo. */
  navegacao?: boolean | undefined;
  children: ReactNode;
  className?: string | undefined;
};

/**
 * Faixa de chips que rola na horizontal sem barra visível. Todo chip continua
 * alcançável pelo Tab: o navegador rola a faixa até o chip que recebe o foco.
 */
export function FaixaDeChips({
  rotulo,
  navegacao = false,
  children,
  className,
}: FaixaDeChipsProps) {
  const classes = ["sc-chips", className].filter(Boolean).join(" ");
  return navegacao ? (
    <nav className={classes} aria-label={rotulo}>
      {children}
    </nav>
  ) : (
    <div className={classes} role="group" aria-label={rotulo}>
      {children}
    </div>
  );
}

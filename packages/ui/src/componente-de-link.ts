import type { ComponentType, ReactNode } from "react";

/**
 * O que uma peça do pacote espera de um componente de link injetado.
 *
 * O `packages/ui` não depende do `next/link`: quem usa passa o `Link` do Next
 * (ou qualquer outro) em `componenteDeLink`, e a navegação deixa de recarregar
 * a página. Sem ele, a peça desenha um `<a>` comum. Atributos `data-*` extras
 * (por exemplo `data-abre-acesso`) também chegam ao componente.
 */
export type ComponenteDeLinkProps = {
  href: string;
  className?: string | undefined;
  children?: ReactNode;
  "aria-current"?: "page" | "true" | undefined;
  "aria-disabled"?: boolean | undefined;
};

export type ComponenteDeLink = ComponentType<ComponenteDeLinkProps>;

import type { ReactNode } from "react";
import type { ComponenteDeLink } from "./componente-de-link";

/**
 * Barra de navegação inferior do celular (card #104).
 *
 * - É uma `<nav>` com NOME obrigatório (`rotulo`): sem padrão, para que uma tela
 *   não herde por engano um nome que outra regra já usa. O painel usa
 *   "Atalhos", e o aviso de cookies sobe por esse nome.
 * - A página atual é anunciada por `aria-current="page"` e aparece em destaque.
 * - Todo item tem rótulo VISÍVEL: o ícone sozinho não diz para onde vai.
 * - O fim da barra respeita a área segura do aparelho (`env(safe-area-inset-bottom)`),
 *   o que depende de `viewportFit: "cover"` no layout raiz.
 * - Cada item é um link (`href`, com `atributos` `data-*` se precisar, como
 *   `data-abre-acesso`) ou uma ação (`aoAcionar`, que vira `<button>`, para
 *   abrir um menu ou a janela de acesso sem navegar).
 * - `oculta` tira a barra da tela e da ordem do Tab (`inert`), para quando o
 *   teclado virtual sobe.
 *
 * Sem `"use client"`: pode ser usada num layout de servidor, passando o `Link`
 * do Next em `componenteDeLink`. Só `aoAcionar` exige um pai de navegador.
 */

type DadosComuns = {
  id: string;
  rotulo: string;
  icone: ReactNode;
  /** A página atual (link) ou o item aberto (ação). */
  ativo?: boolean | undefined;
};

export type ItemDeLinkDaBarra = DadosComuns & {
  href: string;
  /** Atributos `data-*` extras do link (por exemplo `data-abre-acesso`). */
  atributos?: Readonly<Record<`data-${string}`, string>> | undefined;
  aoAcionar?: undefined;
};

export type ItemDeAcaoDaBarra = DadosComuns & {
  aoAcionar: () => void;
  href?: undefined;
  atributos?: undefined;
};

export type ItemDaBarraInferior = ItemDeLinkDaBarra | ItemDeAcaoDaBarra;

export type BarraInferiorProps = {
  /** Nome da navegação para o leitor de tela ("Navegação principal"). */
  rotulo: string;
  itens: readonly ItemDaBarraInferior[];
  /** O `Link` do Next, para navegar sem recarregar. Sem ele, um `<a>`. */
  componenteDeLink?: ComponenteDeLink | undefined;
  /** Some da tela e do Tab (teclado virtual aberto). */
  oculta?: boolean | undefined;
  /** Parada na página, sem `position: fixed`. Só para o catálogo `/ui`. */
  embutida?: boolean | undefined;
  className?: string | undefined;
};

export function BarraInferior({
  rotulo,
  itens,
  componenteDeLink: Link,
  oculta = false,
  embutida = false,
  className,
}: BarraInferiorProps) {
  return (
    <nav
      className={[
        "sc-barra-inferior",
        embutida && "sc-barra-inferior--embutida",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={rotulo}
      inert={oculta || undefined}
      data-oculta={oculta ? "" : undefined}
    >
      <ul className="sc-barra-inferior__lista">
        {itens.map((item) => {
          const classes = [
            "sc-barra-inferior__item",
            item.ativo && "sc-barra-inferior__item--ativo",
          ]
            .filter(Boolean)
            .join(" ");
          const conteudo = (
            <>
              <span className="sc-barra-inferior__icone" aria-hidden="true">
                {item.icone}
              </span>
              <span className="sc-barra-inferior__rotulo">{item.rotulo}</span>
            </>
          );

          if (item.href === undefined) {
            return (
              <li key={item.id} className="sc-barra-inferior__celula">
                <button
                  type="button"
                  className={classes}
                  onClick={item.aoAcionar}
                >
                  {conteudo}
                </button>
              </li>
            );
          }

          const atual = item.ativo ? ("page" as const) : undefined;
          return (
            <li key={item.id} className="sc-barra-inferior__celula">
              {Link !== undefined ? (
                <Link
                  href={item.href}
                  className={classes}
                  aria-current={atual}
                  {...item.atributos}
                >
                  {conteudo}
                </Link>
              ) : (
                <a
                  href={item.href}
                  className={classes}
                  aria-current={atual}
                  {...item.atributos}
                >
                  {conteudo}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

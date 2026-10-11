// Seções da marca na vitrine do design system: vetores oficiais, paleta, tipografia
// e tokens de espaço, raio e sombra (AC-013).
import Image from "next/image";

import { CORES_OFICIAIS } from "./dados-da-vitrine.ts";
import { Secao } from "./SecaoDaVitrine.tsx";

/** Marca, paleta, tipografia e tokens, na ordem em que a página os apresenta. */
export function SecoesDaMarca() {
  return (
    <>
      <Secao
        descricao="Vetores oficiais sem sombra, giro, contorno ou alteração de proporção."
        id="secao-marca"
        titulo="Marca oficial"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="flex min-h-40 flex-col items-center justify-center gap-3 border border-borda bg-superficie-alta p-6 shadow-sm">
            <Image
              alt="Monograma SimpleClick positivo"
              height={96}
              src="/brand/logo-primary.svg"
              width={96}
            />
            <figcaption className="text-sm">Versão positiva</figcaption>
          </figure>
          <figure
            className="flex min-h-40 flex-col items-center justify-center gap-3 p-6"
            style={{ backgroundColor: "var(--marca-grafite)" }}
          >
            <Image
              alt="Monograma SimpleClick negativo"
              height={96}
              src="/brand/logo-reverse.svg"
              width={96}
            />
            <figcaption
              className="text-sm"
              style={{ color: "var(--marca-branco)" }}
            >
              Versão negativa
            </figcaption>
          </figure>
        </div>
      </Secao>

      <Secao
        descricao="Valores brutos do manual; os papéis de interface derivam deles com contraste testado."
        id="secao-paleta"
        titulo="Paleta oficial"
      >
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
          {CORES_OFICIAIS.map(([nome, cor]) => (
            <li
              className="flex items-center gap-3 border-b border-borda pb-3"
              data-cor-oficial={nome}
              key={nome}
            >
              <span
                aria-hidden="true"
                className="size-10 shrink-0 border border-borda-forte"
                style={{ backgroundColor: cor }}
              />
              <span>{nome}</span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        descricao="Space Grotesk cria a voz dos títulos; Inter sustenta leitura e controles."
        id="secao-tipografia"
        titulo="Tipografia"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm">Space Grotesk · títulos e destaques</p>
            <p className="font-display text-2xl font-semibold">
              Sua loja, simples de verdade.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm">Inter · texto e interface</p>
            <p className="font-sans">
              Organize o catálogo, receba pedidos e acompanhe cada etapa sem
              ruído visual.
            </p>
          </div>
        </div>
      </Secao>

      <Secao
        descricao="Amostras usam a mesma fonte semântica das telas: módulo de 8px, raio controlado e sombras discretas."
        id="secao-tokens"
        titulo="Espaço, raios e sombras"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="border border-borda bg-superficie-alta p-2">
            Módulo · 8px
          </div>
          <div className="rounded-button border border-borda bg-superficie-alta p-4">
            Botão · 6px
          </div>
          <div className="rounded-lg border border-borda bg-superficie-alta p-4 shadow-md">
            Superfície elevada
          </div>
        </div>
      </Secao>
    </>
  );
}

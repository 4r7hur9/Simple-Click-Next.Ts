import type { CSSProperties } from "react";
import {
  capaPadraoDe,
  RAMOS_COM_CAPA_PADRAO,
} from "../../../../lib/capa-padrao.ts";

/**
 * Página `/ui/capas`: as capas padrão dos 8 tipos de negócio lado a lado, mais
 * a genérica, para conferir sem criar loja nenhuma.
 */

const NOME_DO_RAMO: Record<string, string> = {
  FOOD_SNACK: "Lanchonete",
  FOOD_RESTAURANT: "Restaurante",
  FOOD_ACAI: "Açaiteria",
  RETAIL_GENERIC: "Loja",
  APPAREL: "Roupas",
  AUTO_PARTS: "Autopeças",
  ELECTRONICS: "Eletrônicos",
  BEVERAGES: "Bebidas",
  DESCONHECIDO: "Genérica (código desconhecido)",
};

export default function CapasPadrao() {
  return (
    <main className="sc-raiz mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">
          Capas padrão por tipo de negócio
        </h1>
        <p>
          O fundo da capa do cardápio e da janela do Sobre quando o dono não
          envia capa. (A vitrine da loja usa um degradê neutro, card #129.)
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...RAMOS_COM_CAPA_PADRAO, "DESCONHECIDO"].map((codigo) => (
          <li key={codigo} className="flex flex-col gap-2">
            <div className="relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-neutral-900 p-4 text-white">
              <span
                className="sc-capa-padrao absolute inset-0"
                style={
                  {
                    "--capa-url": `url(${capaPadraoDe(codigo)})`,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
              <span className="relative z-[1] font-semibold">
                {NOME_DO_RAMO[codigo]}
              </span>
            </div>
            <code className="text-sm">{codigo}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}

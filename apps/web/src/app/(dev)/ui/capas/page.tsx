import type { CSSProperties } from "react";
import { ApresentacaoDaLoja } from "../../../../features/loja/ApresentacaoDaLoja.tsx";
import {
  capaPadraoDe,
  RAMOS_COM_CAPA_PADRAO,
} from "../../../../lib/capa-padrao.ts";

/**
 * Página `/ui/capas`: as capas padrão dos 8 tipos de negócio lado a lado, mais
 * a genérica, para conferir sem criar loja nenhuma.
 *
 * Com `?ramo=FOOD_SNACK` (ou outro código), desenha a apresentação da loja
 * inteira, de verdade e sem capa, para ver a capa padrão atrás do texto.
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

export default async function CapasPadrao({
  searchParams,
}: {
  readonly searchParams: Promise<{ ramo?: string }>;
}) {
  const { ramo } = await searchParams;

  if (ramo) {
    return (
      <ApresentacaoDaLoja
        loja={{
          apelido: "previa",
          nome: NOME_DO_RAMO[ramo] ?? "Loja de exemplo",
          ramo,
          boasVindas: "Boas-vindas da loja, para ver a letra sobre a capa.",
          sobre: "Um texto curto sobre a loja, como o dono escreveria.",
          logo: null,
          capa: null,
          formasDeEntrega: ["DELIVERY", "PICKUP"],
          enderecoParaRetirada: {
            logradouro: "Rua das Flores",
            numero: "123",
            complemento: null,
            bairro: "Centro",
            cidade: "São Paulo",
            uf: "SP",
          },
        }}
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
        linkDoCardapio="/ui/capas"
        rotuloDoCatalogo="Catálogo"
      />
    );
  }

  return (
    <main className="sc-raiz mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">
          Capas padrão por tipo de negócio
        </h1>
        <p>
          O fundo do card da loja quando o dono não envia capa. Clique numa
          delas para ver a apresentação inteira.
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...RAMOS_COM_CAPA_PADRAO, "DESCONHECIDO"].map((codigo) => (
          <li key={codigo} className="flex flex-col gap-2">
            <a
              href={`/ui/capas?ramo=${codigo}`}
              className="sc-loja__painel block aspect-[4/3]"
            >
              <span
                className="sc-loja__padrao"
                style={{ "--capa-url": `url(${capaPadraoDe(codigo)})` } as CSSProperties}
                aria-hidden="true"
              />
              <span className="sc-loja__trama" aria-hidden="true" />
              <span className="relative z-[1] font-semibold">
                {NOME_DO_RAMO[codigo]}
              </span>
            </a>
            <code className="text-sm">{codigo}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}

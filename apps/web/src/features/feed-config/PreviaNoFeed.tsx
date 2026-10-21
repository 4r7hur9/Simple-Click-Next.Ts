/**
 * Como a loja aparece para os clientes em /explorar: o cartão da loja e os
 * primeiros produtos marcados "publicar no feed". É desenhado com o tema da
 * loja (`TemaDaMarca`), como o cliente vê. Fora do feed, o cartão fica
 * apagado e diz por quê — a prévia nunca promete o que não vai acontecer.
 */
import { TemaDaMarca } from "@simpleclick/ui";

import { escreverDinheiro } from "../../lib/dinheiro.ts";

/** O que a prévia sabe da loja (vem da vitrine; nulo quando ela está fora do ar). */
export interface LojaDaPrevia {
  readonly nome: string;
  readonly ramo: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly corDestaque: string;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly formasDeEntrega: readonly string[];
}

export interface ProdutoDaPrevia {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
}

const NOMES_DAS_FORMAS: Readonly<Record<string, string>> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada",
};

export function PreviaNoFeed({
  loja,
  produtos,
  totalNoFeed,
  noFeed,
  motivoFora,
}: {
  readonly loja: LojaDaPrevia;
  /** Os primeiros produtos que vão para o feed. */
  readonly produtos: readonly ProdutoDaPrevia[];
  readonly totalNoFeed: number;
  /** A loja aparece de fato no feed (configuração ligada e loja ativa). */
  readonly noFeed: boolean;
  /** Por que não aparece, quando não aparece. */
  readonly motivoFora: string | null;
}) {
  const lugar = [loja.bairro, loja.cidade].filter(Boolean).join(", ");
  const formas = loja.formasDeEntrega
    .map((forma) => NOMES_DAS_FORMAS[forma])
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="titulo-previa-feed" data-previa-feed>
      <h2
        id="titulo-previa-feed"
        className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cor-tinta-suave)]"
      >
        Prévia em Explorar
      </h2>
      <TemaDaMarca corDestaque={loja.corDestaque} className="mt-3">
        <article
          aria-label={`Cartão da loja ${loja.nome}`}
          data-no-feed={noFeed ? "sim" : "nao"}
          className={`overflow-hidden rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-black text-white transition-opacity ${noFeed ? "" : "opacity-50 grayscale"}`}
        >
          <div
            className="relative h-28 bg-[var(--cor-marca)] bg-cover bg-center"
            style={
              loja.capa === null
                ? undefined
                : { backgroundImage: `url(${JSON.stringify(loja.capa)})` }
            }
          >
            {loja.logo === null ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-6 left-4 grid h-14 w-14 place-items-center rounded-full border-2 border-black bg-[var(--cor-marca)] text-xl font-bold text-[var(--cor-sobre-marca)]"
              >
                {loja.nome.trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              <img
                src={loja.logo}
                alt=""
                className="absolute -bottom-6 left-4 h-14 w-14 rounded-full border-2 border-black object-cover"
              />
            )}
          </div>
          <div className="px-4 pb-4 pt-8">
            <p className="text-lg font-semibold">{loja.nome}</p>
            <p className="text-sm text-white/70">
              {[loja.ramo, lugar].filter(Boolean).join(" · ") ||
                "Endereço não informado"}
            </p>
            {formas === "" ? null : (
              <p className="mt-1 text-xs text-white/70">{formas}</p>
            )}
            <p className="mt-3 inline-block rounded-full bg-[var(--cor-marca)] px-3 py-1 text-xs font-semibold text-[var(--cor-sobre-marca)]">
              {totalNoFeed === 1
                ? "1 produto no feed"
                : `${totalNoFeed} produtos no feed`}
            </p>
            {produtos.length === 0 ? null : (
              <ul className="mt-4 grid gap-2" aria-label="Produtos no feed">
                {produtos.map((produto) => (
                  <li
                    key={produto.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{produto.nome}</span>
                    {produto.precoCentavos === null ? null : (
                      <span className="shrink-0 font-semibold text-[var(--cor-marca-texto)]">
                        {escreverDinheiro(produto.precoCentavos)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </TemaDaMarca>
      <p role="status" className="mt-3 text-sm text-[var(--cor-tinta-suave)]">
        {noFeed
          ? "É assim que os clientes encontram a sua loja em Explorar."
          : (motivoFora ?? "A sua loja não aparece no feed.")}
      </p>
    </section>
  );
}

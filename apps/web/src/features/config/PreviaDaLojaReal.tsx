"use client";
/**
 * A prévia da Aparência: a LOJA DE VERDADE, aberta numa moldura (card #36).
 *
 * Nada aqui é um desenho à parte. As duas áreas — a página inicial da loja e o
 * topo do cardápio — são as mesmas telas da loja pública (`TelaDaLoja` e
 * `TelaDoCatalogo`, com os produtos de verdade da loja), carregadas de
 * `/loja/<loja>/previa/vitrine` e `/loja/<loja>/previa/cardapio`. Cada
 * uma abre num `iframe` com a largura REAL do aparelho — 1280 px no
 * computador, 390 px no celular — e é encolhida com `transform: scale()` para
 * caber na coluna, sem mexer nas proporções: o tamanho da letra, o selo, as
 * fotos e a cor são exatamente os da loja. Como a moldura tem a largura do
 * aparelho, o CSS responsivo da loja responde como responde no telefone do
 * cliente (inclusive a troca da foto para a versão do celular).
 *
 * O rascunho (cor, fotos, nome, descrição, logo, selo) vai num cookie curto
 * que só as rotas da prévia leem; a cada mudança as molduras recarregam por
 * trás e trocam quando a nova versão termina de carregar, sem piscar. É só
 * para olhar: a moldura não recebe clique.
 */
import { useEffect, useRef, useState } from "react";

import {
  caminhoDaPrevia,
  COOKIE_DA_PREVIA,
  VALIDADE_DO_RASCUNHO_EM_SEGUNDOS,
  codificarRascunho,
  type RascunhoDaVitrine,
} from "../../lib/rascunho-da-vitrine.ts";

export type AparelhoDaPrevia = "computador" | "celular";

/** O aparelho que cada moldura imita: a largura é a real; a altura, a da primeira tela. */
export const APARELHOS_DA_PREVIA: Record<
  AparelhoDaPrevia,
  {
    readonly rotulo: string;
    readonly largura: number;
    readonly alturaDaVitrine: number;
    readonly alturaDoCardapio: number;
  }
> = {
  computador: {
    rotulo: "Computador",
    largura: 1280,
    alturaDaVitrine: 800,
    alturaDoCardapio: 760,
  },
  celular: {
    rotulo: "Celular",
    largura: 390,
    alturaDaVitrine: 844,
    alturaDoCardapio: 700,
  },
};

/** A escala que leva a largura do aparelho até a da coluna, sem nunca ampliar. */
export function escalaDaPrevia(
  larguraDaColuna: number,
  larguraDoAparelho: number,
) {
  if (larguraDaColuna <= 0) return 1;
  return Math.min(1, larguraDaColuna / larguraDoAparelho);
}

function QuadroDaPrevia({
  titulo,
  base,
  versao,
  largura,
  altura,
  escala,
}: {
  readonly titulo: string;
  /** O endereço da rota da prévia, sem consulta. */
  readonly base: string;
  /** Muda a cada rascunho novo: manda recarregar. */
  readonly versao: number;
  readonly largura: number;
  readonly altura: number;
  readonly escala: number;
}) {
  // Duas molduras por cima uma da outra: a nova carrega escondida e só toma o
  // lugar quando termina, para a prévia nunca piscar em branco.
  const [enderecos, setEnderecos] = useState<readonly [string, string]>([
    `${base}?v=${String(versao)}`,
    "",
  ]);
  const [visivel, setVisivel] = useState<0 | 1>(0);
  const ultima = useRef(versao);

  useEffect(() => {
    if (ultima.current === versao) return;
    ultima.current = versao;
    const escondida = visivel === 0 ? 1 : 0;
    setEnderecos((atuais) => {
      const proximos: [string, string] = [atuais[0], atuais[1]];
      proximos[escondida] = `${base}?v=${String(versao)}`;
      return proximos;
    });
  }, [versao, base, visivel]);

  return (
    <figure className="m-0 space-y-2" data-quadro-da-previa={titulo}>
      <figcaption className="text-sm font-medium">{titulo}</figcaption>
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--cor-borda)] bg-black"
        style={{ width: largura * escala, height: altura * escala }}
      >
        {([0, 1] as const).map((indice) =>
          enderecos[indice] === "" ? null : (
            <iframe
              key={indice}
              src={enderecos[indice]}
              title={`Prévia: ${titulo}`}
              aria-hidden={visivel === indice ? undefined : true}
              tabIndex={-1}
              scrolling="no"
              loading="eager"
              onLoad={() => {
                if (indice !== visivel) setVisivel(indice);
              }}
              className="absolute left-0 top-0 border-0 bg-black"
              style={{
                width: largura,
                height: altura,
                transform: `scale(${String(escala)})`,
                transformOrigin: "0 0",
                visibility: visivel === indice ? "visible" : "hidden",
                pointerEvents: "none",
              }}
              data-previa-iframe={indice}
            />
          ),
        )}
      </div>
    </figure>
  );
}

export function PreviaDaLojaReal({
  rascunho,
}: {
  readonly rascunho: RascunhoDaVitrine;
}) {
  const [aparelho, setAparelho] = useState<AparelhoDaPrevia>("computador");
  const [versao, setVersao] = useState(0);
  const [pronta, setPronta] = useState(false);
  const [larguraDaColuna, setLarguraDaColuna] = useState(0);
  const coluna = useRef<HTMLDivElement>(null);
  const cookie = codificarRascunho(rascunho);

  // O rascunho vai para o cookie; depois de uma pausa curta, as molduras
  // recarregam. A primeira vez abre as molduras (que só existem depois do cookie).
  useEffect(() => {
    const espera = window.setTimeout(() => {
      document.cookie = `${COOKIE_DA_PREVIA}=${cookie}; path=${caminhoDaPrevia(rascunho.apelido)}; max-age=${String(VALIDADE_DO_RASCUNHO_EM_SEGUNDOS)}; SameSite=Lax`;
      setPronta(true);
      setVersao((anterior) => anterior + 1);
    }, 300);
    return () => window.clearTimeout(espera);
  }, [cookie]);

  useEffect(() => {
    const elemento = coluna.current;
    if (elemento === null) return;
    const medir = () => setLarguraDaColuna(elemento.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const dados = APARELHOS_DA_PREVIA[aparelho];
  const escala = escalaDaPrevia(larguraDaColuna, dados.largura);
  const raiz = caminhoDaPrevia(rascunho.apelido);

  return (
    <div className="space-y-4" data-previa="loja-real">
      <div
        className="inline-flex rounded-full border border-[var(--cor-borda-forte)] p-1"
        role="group"
        aria-label="Tamanho da tela da prévia"
      >
        {(Object.keys(APARELHOS_DA_PREVIA) as AparelhoDaPrevia[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`min-h-[var(--altura-toque)] rounded-full px-4 text-sm font-medium ${
              aparelho === id
                ? "bg-[var(--cor-primaria)] text-[var(--cor-em-primaria)]"
                : "bg-transparent text-[var(--cor-tinta)]"
            }`}
            aria-pressed={aparelho === id}
            onClick={() => setAparelho(id)}
          >
            {APARELHOS_DA_PREVIA[id].rotulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--cor-tinta-suave)]">
        A loja de verdade em {dados.largura} px de largura
        {escala < 1 ? ", encolhida para caber aqui" : ""}.
      </p>

      <div ref={coluna} className="space-y-6">
        {pronta && larguraDaColuna > 0 ? (
          <>
            <QuadroDaPrevia
              titulo="Página inicial da loja"
              base={`${raiz}/vitrine`}
              versao={versao}
              largura={dados.largura}
              altura={dados.alturaDaVitrine}
              escala={escala}
            />
            <QuadroDaPrevia
              titulo="Topo do cardápio"
              base={`${raiz}/cardapio`}
              versao={versao}
              largura={dados.largura}
              altura={dados.alturaDoCardapio}
              escala={escala}
            />
          </>
        ) : (
          <p className="text-sm text-[var(--cor-tinta-suave)]" role="status">
            Abrindo a prévia…
          </p>
        )}
      </div>
    </div>
  );
}

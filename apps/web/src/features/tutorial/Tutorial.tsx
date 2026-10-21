"use client";

/**
 * O tutorial de primeiro acesso (card #39): passos curtos por cima da tela,
 * com o elemento de cada passo em destaque, como nos aplicativos comuns.
 *
 * - Abre sozinho só quando a conta ainda não viu o tutorial deste papel
 *   (`abrirSozinho`, lido do servidor por quem monta).
 * - "Pular" fica sempre à vista; Esc também pula. Pular ou concluir grava no
 *   servidor (`marcar`), e o tutorial não volta sozinho em nenhum aparelho.
 * - "Ver tutorial" (no menu) reabre: dispara o evento `sc:ver-tutorial` ou
 *   chega com `?tutorial=1` no endereço.
 * - O destaque é um recorte com sombra em volta do primeiro alvo visível do
 *   passo; sem alvo visível o cartão fica no meio da tela. No celular o
 *   cartão fica sempre embaixo, para não cobrir o que está em destaque.
 *
 * A camada de trás pega os cliques: durante o tutorial ninguém navega sem
 * querer. O foco fica no cartão, e as setas do teclado andam entre os passos.
 */
import "./tutorial.css";

import { Botao, IconeFechar } from "@simpleclick/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  EVENTO_VER_TUTORIAL,
  PARAMETRO_VER_TUTORIAL,
  PASSOS_DO_TUTORIAL,
  passosVisiveis,
  type PapelDoTutorial,
  type PassoDoTutorial,
} from "./passos.ts";

export type ComoTerminou = "concluiu" | "pulou";

export interface TutorialProps {
  readonly papel: PapelDoTutorial;
  /** A conta ainda não viu nem pulou o tutorial deste papel. */
  readonly abrirSozinho: boolean;
  /** Grava no servidor que a conta já viu; padrão: a rota da conta do site. */
  readonly marcar?: (papel: PapelDoTutorial, como: ComoTerminou) => Promise<void>;
}

/** Espera a tela assentar (menu, dados) antes de abrir sozinho. */
const ESPERA_PARA_ABRIR_EM_MS = 700;
/** Folga do recorte em volta do elemento. */
const FOLGA = 6;

async function marcarNoSite(papel: PapelDoTutorial, como: ComoTerminou): Promise<void> {
  try {
    await fetch("/api/conta/tutorial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ papel, como }),
    });
  } catch {
    // Sem rede: o tutorial só reaparece na próxima visita. Não vale um erro.
  }
}

function visivel(elemento: Element): boolean {
  const caixa = elemento.getBoundingClientRect();
  if (caixa.width === 0 || caixa.height === 0) return false;
  const estilo = window.getComputedStyle(elemento);
  return estilo.visibility !== "hidden" && estilo.display !== "none";
}

/** O primeiro elemento visível entre os alvos do passo. */
export function alvoDoPasso(passo: PassoDoTutorial | undefined): Element | null {
  for (const seletor of passo?.alvos ?? []) {
    for (const elemento of document.querySelectorAll(seletor)) {
      if (visivel(elemento)) return elemento;
    }
  }
  return null;
}

interface Recorte {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

function recorteDe(elemento: Element | null): Recorte | null {
  if (elemento === null) return null;
  const caixa = elemento.getBoundingClientRect();
  return {
    top: Math.max(caixa.top - FOLGA, 4),
    left: Math.max(caixa.left - FOLGA, 4),
    width: Math.min(caixa.width + FOLGA * 2, window.innerWidth - 8),
    height: Math.min(caixa.height + FOLGA * 2, window.innerHeight - 8),
  };
}

/** Onde o cartão fica: ao lado do destaque se couber, senão abaixo ou acima. */
function posicaoDoCartao(recorte: Recorte | null): CSSProperties | undefined {
  if (recorte === null) return undefined;
  const largura = 352;
  const margem = 16;
  const direita = recorte.left + recorte.width + margem;
  if (direita + largura <= window.innerWidth - margem) {
    const topo = Math.min(Math.max(recorte.top, margem), window.innerHeight - 320);
    return { top: Math.max(topo, margem), left: direita };
  }
  const left = Math.min(
    Math.max(recorte.left, margem),
    window.innerWidth - largura - margem,
  );
  const abaixo = recorte.top + recorte.height + margem;
  if (abaixo + 280 <= window.innerHeight) return { top: abaixo, left };
  return { bottom: window.innerHeight - recorte.top + margem, left };
}

function Demonstracao({ titulo, etapas }: { titulo: string; etapas: readonly string[] }) {
  return (
    <figure className="sc-tutorial__demo" aria-label={titulo}>
      <figcaption className="sc-tutorial__demo-titulo">{titulo}</figcaption>
      <ol
        className="sc-tutorial__demo-etapas"
        style={{ "--etapas": etapas.length } as CSSProperties}
      >
        {etapas.map((etapa, indice) => (
          <li
            key={etapa}
            className="sc-tutorial__demo-etapa"
            style={{ "--ordem": indice } as CSSProperties}
          >
            <span className="sc-tutorial__demo-ponto" aria-hidden="true" />
            {etapa}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Abre o tutorial quando o endereço chega com `?tutorial=1`. */
function AbrirPeloEndereco({ abrir }: { abrir: () => void }) {
  const parametros = useSearchParams();
  const caminho = usePathname();
  const roteador = useRouter();
  const pedido = parametros.get(PARAMETRO_VER_TUTORIAL) === "1";
  // Abre uma vez por chegada do parâmetro, e não a cada desenho da página.
  const atendido = useRef(false);
  useEffect(() => {
    if (!pedido) {
      atendido.current = false;
      return;
    }
    if (atendido.current) return;
    atendido.current = true;
    abrir();
    // Tira o parâmetro: recarregar a página não reabre o tutorial.
    const resto = new URLSearchParams(parametros.toString());
    resto.delete(PARAMETRO_VER_TUTORIAL);
    const busca = resto.toString();
    roteador.replace(busca === "" ? caminho : `${caminho}?${busca}`, { scroll: false });
  }, [pedido, abrir, parametros, caminho, roteador]);
  return null;
}

export function Tutorial({ papel, abrirSozinho, marcar = marcarNoSite }: TutorialProps) {
  const idDoTitulo = useId();
  const idDoTexto = useId();
  const cartao = useRef<HTMLDivElement>(null);
  const [passos, setPassos] = useState<readonly PassoDoTutorial[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [recorte, setRecorte] = useState<Recorte | null>(null);

  const abrir = useCallback(() => {
    setPassos(
      passosVisiveis(PASSOS_DO_TUTORIAL[papel], (seletor) =>
        document.querySelector(seletor) !== null,
      ),
    );
    setIndice(0);
  }, [papel]);

  const fechar = useCallback(
    (como: ComoTerminou) => {
      setPassos(null);
      setRecorte(null);
      void marcar(papel, como);
    },
    [marcar, papel],
  );

  // Primeiro acesso: abre sozinho, uma vez.
  useEffect(() => {
    if (!abrirSozinho) return;
    const espera = window.setTimeout(abrir, ESPERA_PARA_ABRIR_EM_MS);
    return () => window.clearTimeout(espera);
  }, [abrirSozinho, abrir]);

  // "Ver tutorial" em qualquer menu.
  useEffect(() => {
    window.addEventListener(EVENTO_VER_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_VER_TUTORIAL, abrir);
  }, [abrir]);

  const aberto = passos !== null;
  const passo = passos?.[indice];
  const ultimo = passos !== null && indice === passos.length - 1;

  // Acompanha o alvo do passo: rola até ele e segue a rolagem e o tamanho.
  useLayoutEffect(() => {
    if (!aberto) return;
    const alvo = alvoDoPasso(passo);
    alvo?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const medir = () => setRecorte(recorteDe(alvoDoPasso(passo)));
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [aberto, passo]);

  // O foco entra no cartão a cada passo; a página de trás não rola.
  useEffect(() => {
    if (!aberto) return;
    cartao.current?.focus();
  }, [aberto, indice]);

  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  const avancar = useCallback(() => {
    if (passos === null) return;
    if (indice >= passos.length - 1) fechar("concluiu");
    else setIndice(indice + 1);
  }, [fechar, indice, passos]);

  const voltar = useCallback(() => setIndice((atual) => Math.max(atual - 1, 0)), []);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fechar("pulou");
      } else if (evento.key === "ArrowRight") {
        avancar();
      } else if (evento.key === "ArrowLeft") {
        voltar();
      } else if (evento.key === "Tab" && cartao.current !== null) {
        // O foco não sai do cartão enquanto ele está aberto.
        const focaveis = cartao.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        const primeiro = focaveis[0];
        const derradeiro = focaveis[focaveis.length - 1];
        if (primeiro === undefined || derradeiro === undefined) return;
        const atual = document.activeElement;
        if (evento.shiftKey && (atual === primeiro || atual === cartao.current)) {
          evento.preventDefault();
          derradeiro.focus();
        } else if (!evento.shiftKey && atual === derradeiro) {
          evento.preventDefault();
          primeiro.focus();
        }
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, avancar, voltar, fechar]);

  return (
    <>
      <Suspense fallback={null}>
        <AbrirPeloEndereco abrir={abrir} />
      </Suspense>
      {aberto && passo !== undefined && (
        <div className="sc-tutorial" data-papel={papel}>
          {recorte === null ? (
            <div className="sc-tutorial__fundo" aria-hidden="true" />
          ) : (
            <>
              <div className="sc-tutorial__fundo sc-tutorial__fundo--transparente" aria-hidden="true" />
              <div className="sc-tutorial__recorte" aria-hidden="true" style={recorte} />
            </>
          )}
          <div
            ref={cartao}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idDoTitulo}
            aria-describedby={idDoTexto}
            tabIndex={-1}
            className="sc-tutorial__cartao"
            data-centro={recorte === null || undefined}
            style={posicaoDoCartao(recorte)}
          >
            <header className="sc-tutorial__topo">
              <span className="sc-tutorial__contagem" aria-live="polite">
                {indice + 1} de {passos.length}
              </span>
              <button
                type="button"
                className="sc-tutorial__pular"
                onClick={() => fechar("pulou")}
              >
                Pular
                <IconeFechar aria-hidden="true" />
              </button>
            </header>
            <h2 id={idDoTitulo} className="sc-tutorial__titulo">
              {passo.titulo}
            </h2>
            <p id={idDoTexto} className="sc-tutorial__texto">
              {passo.texto}
            </p>
            {passo.demonstracao !== undefined && (
              <Demonstracao {...passo.demonstracao} />
            )}
            <div className="sc-tutorial__progresso" aria-hidden="true">
              {passos.map((item, posicao) => (
                <span
                  key={item.id}
                  className="sc-tutorial__bolinha"
                  data-atual={posicao === indice || undefined}
                />
              ))}
            </div>
            <footer className="sc-tutorial__acoes">
              {indice > 0 && (
                <Botao variante="discreta" tamanho="pequeno" onClick={voltar}>
                  Voltar
                </Botao>
              )}
              <Botao tamanho="pequeno" onClick={avancar}>
                {ultimo ? "Concluir" : indice === 0 ? "Começar" : "Próximo"}
              </Botao>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

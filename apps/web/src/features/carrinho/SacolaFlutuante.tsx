"use client";

/**
 * A sacola flutuante: o botão redondo com a contagem e o total, que a pessoa
 * pode arrastar para onde ele não atrapalha.
 *
 * ARRASTAR NÃO É TOCAR. O dedo (ou o mouse) que anda mais que alguns pixels
 * está arrastando, e soltar não abre o carrinho; o toque curto abre. Sem essa
 * distinção, cada ajuste de posição abriria a gaveta por cima do cardápio.
 *
 * PRESA À TELA VISÍVEL. A área livre é um elemento fixo invisível com as
 * margens e a área segura do aparelho (`env(safe-area-inset-*)`) no CSS — o
 * componente só mede o retângulo dele. Assim a sacola nunca para embaixo da
 * barra do navegador nem do entalhe, e a regra de margem mora no CSS, onde
 * mora o resto do desenho.
 *
 * O ARRASTE É LIVRE, O POUSO ENCOSTA NA BORDA: ao soltar, a sacola desliza
 * para a borda esquerda ou direita mais próxima, na altura em que ficou — fora
 * do caminho do produto e à mão do polegar.
 *
 * PELO TECLADO, as setas movem e Enter abre, como qualquer botão: seta para o
 * lado leva à outra borda, para cima e para baixo sobe e desce (Shift anda
 * mais). A posição é lembrada entre visitas (`posicao-da-sacola.ts`).
 *
 * Eventos de ponteiro nativos, sem biblioteca: mouse, toque e caneta passam
 * pelo mesmo caminho.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { IconePedido } from "@simpleclick/ui";

import {
  CHAVE_DA_POSICAO,
  DISTANCIA_DO_ARRASTE,
  deFracao,
  encostarNaBorda,
  lerPosicaoGuardada,
  limitar,
  paraFracao,
  passoDaTecla,
  type Area,
  type Fracao,
  type Ponto,
} from "./posicao-da-sacola.ts";

export interface SacolaFlutuanteProps {
  readonly contagem: number;
  /** O total já escrito ("R$ 32,00"), ou nulo enquanto a API não respondeu. */
  readonly total: string | null;
  /** Muda a cada item novo, e o selo da contagem dá um pulo. */
  readonly pulso: number;
  /** Na página do produto, a área livre termina acima da barra de adicionar. */
  readonly acimaDaAcao?: boolean | undefined;
  readonly aoAbrir: () => void;
}

/** Lê a posição guardada sem quebrar no navegador que recusa `localStorage`. */
function lerGuardada(): Fracao {
  try {
    return lerPosicaoGuardada(window.localStorage.getItem(CHAVE_DA_POSICAO));
  } catch {
    return lerPosicaoGuardada(null);
  }
}

function guardar(fracao: Fracao) {
  try {
    window.localStorage.setItem(CHAVE_DA_POSICAO, JSON.stringify(fracao));
  } catch {
    // Navegação anônima com armazenamento cheio: a sacola só não lembra.
  }
}

function medirArea(elemento: HTMLElement): Area {
  const retangulo = elemento.getBoundingClientRect();
  return {
    esquerda: retangulo.left,
    topo: retangulo.top,
    largura: retangulo.width,
    altura: retangulo.height,
  };
}

interface Arraste {
  readonly ponteiro: number;
  readonly inicioX: number;
  readonly inicioY: number;
  readonly origem: Ponto;
  andou: boolean;
}

export function SacolaFlutuante({
  contagem,
  total,
  pulso,
  acimaDaAcao = false,
  aoAbrir,
}: SacolaFlutuanteProps) {
  const botao = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLSpanElement>(null);
  const arraste = useRef<Arraste | null>(null);
  const engolirClique = useRef(false);
  const fracao = useRef<Fracao | null>(null);
  const [ponto, setPontoNaTela] = useState<Ponto | null>(null);
  // A cópia em ref é a posição de AGORA: duas setas apertadas antes de a tela
  // redesenhar somam, em vez de a segunda partir da posição velha.
  const pontoAtual = useRef<Ponto | null>(null);
  const setPonto = useCallback((novo: Ponto) => {
    pontoAtual.current = novo;
    setPontoNaTela(novo);
  }, []);
  const [arrastando, setArrastando] = useState(false);

  const medir = useCallback(() => {
    const elemento = botao.current;
    const livre = area.current;
    if (elemento === null || livre === null) return null;
    return {
      area: medirArea(livre),
      tamanho: { largura: elemento.offsetWidth, altura: elemento.offsetHeight },
    };
  }, []);

  /** Recoloca a sacola a partir da fração — no começo e quando a tela muda. */
  const recolocar = useCallback(() => {
    const medida = medir();
    if (medida === null) return;
    fracao.current ??= lerGuardada();
    setPonto(deFracao(fracao.current, medida.tamanho, medida.area));
  }, [medir, setPonto]);

  // Antes da primeira pintura, para a sacola não aparecer no canto e pular.
  useLayoutEffect(() => {
    recolocar();
  }, [recolocar, total, acimaDaAcao]);

  useEffect(() => {
    window.addEventListener("resize", recolocar);
    window.visualViewport?.addEventListener("resize", recolocar);
    return () => {
      window.removeEventListener("resize", recolocar);
      window.visualViewport?.removeEventListener("resize", recolocar);
    };
  }, [recolocar]);

  /**
   * Move a sacola. `lembrar` é o pouso (soltou o arraste, apertou uma seta):
   * aí ela encosta na borda lateral mais próxima e a posição é guardada.
   */
  function mover(destino: Ponto, lembrar: boolean) {
    const medida = medir();
    if (medida === null) return;
    const preso = lembrar
      ? encostarNaBorda(destino, medida.tamanho, medida.area)
      : limitar(destino, medida.tamanho, medida.area);
    setPonto(preso);
    if (lembrar) {
      fracao.current = paraFracao(preso, medida.tamanho, medida.area);
      guardar(fracao.current);
    }
  }

  function aoApertar(evento: PointerEvent<HTMLButtonElement>) {
    // Só o botão principal do mouse arrasta; o direito abre o menu de sempre.
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    const origem = pontoAtual.current;
    if (origem === null) return;
    arraste.current = {
      ponteiro: evento.pointerId,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      origem,
      andou: false,
    };
    try {
      // Capturado, o arraste segue mesmo se o dedo sair de cima do botão.
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      // Ponteiro que o navegador já soltou: o arraste segue sem captura.
    }
  }

  function aoMover(evento: PointerEvent<HTMLButtonElement>) {
    const atual = arraste.current;
    if (atual === null || atual.ponteiro !== evento.pointerId) return;
    const dx = evento.clientX - atual.inicioX;
    const dy = evento.clientY - atual.inicioY;
    if (!atual.andou && Math.hypot(dx, dy) < DISTANCIA_DO_ARRASTE) return;
    if (!atual.andou) {
      atual.andou = true;
      setArrastando(true);
    }
    mover({ x: atual.origem.x + dx, y: atual.origem.y + dy }, false);
  }

  function aoSoltar(evento: PointerEvent<HTMLButtonElement>) {
    const atual = arraste.current;
    if (atual === null || atual.ponteiro !== evento.pointerId) return;
    arraste.current = null;
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }
    if (!atual.andou) return;
    setArrastando(false);
    // O clique que o navegador dispara ao soltar não abre o carrinho.
    engolirClique.current = evento.type === "pointerup";
    mover(
      {
        x: atual.origem.x + evento.clientX - atual.inicioX,
        y: atual.origem.y + evento.clientY - atual.inicioY,
      },
      true,
    );
  }

  function aoClicar() {
    if (engolirClique.current) {
      engolirClique.current = false;
      return;
    }
    aoAbrir();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    const passo = passoDaTecla(evento.key, evento.shiftKey);
    const atual = pontoAtual.current;
    if (passo === null || atual === null) return;
    // A seta move a sacola, e não a página por trás dela.
    evento.preventDefault();
    // Seta para o lado troca de borda de uma vez: andar 16px e encostar de
    // novo na mesma borda faria a tecla parecer quebrada.
    const x =
      passo.x === 0
        ? atual.x
        : passo.x < 0
          ? Number.MIN_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
    mover({ x, y: atual.y + passo.y }, true);
  }

  const itens = `${contagem} ${contagem === 1 ? "item" : "itens"}`;

  return (
    <>
      <span
        ref={area}
        className={`sc-sacola__area${acimaDaAcao ? " sc-sacola__area--acima-da-acao" : ""}`}
        aria-hidden="true"
      />
      <button
        ref={botao}
        type="button"
        className={`sc-sacola${arrastando ? " sc-sacola--arrastando" : ""}${
          ponto === null ? "" : " sc-sacola--posicionada"
        }`}
        style={ponto === null ? undefined : { left: ponto.x, top: ponto.y }}
        aria-haspopup="dialog"
        aria-label={`Abrir o carrinho: ${itens}${total ? `, total ${total}` : ""}`}
        aria-describedby="dica-da-sacola"
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClick={aoClicar}
        onKeyDown={aoTeclar}
      >
        <span className="sc-sacola__icone" aria-hidden="true">
          <IconePedido />
          <span className="sc-sacola__contagem" key={pulso}>
            {contagem}
          </span>
        </span>
        {total ? (
          <span className="sc-sacola__total" aria-hidden="true">
            {total}
          </span>
        ) : null}
      </button>
      <span id="dica-da-sacola" className="sc-so-leitor">
        Arraste, ou use as setas do teclado, para mudar a sacola de lugar.
      </span>
    </>
  );
}

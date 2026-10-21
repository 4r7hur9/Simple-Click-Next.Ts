"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { IconeInfo } from "./icones";
import { calcularPosicaoDoBalao } from "./info-posicao";

/**
 * Info: o "i" que explica um campo que o rótulo sozinho não explica.
 *
 * O botão mora NA LINHA DO RÓTULO, logo depois do texto — nunca dentro do
 * controle nem posicionado por cima dele. O balão abre por clique/toque, por
 * Enter/Espaço e, só onde existe mouse de verdade, ao passar o ponteiro. Fecha
 * com Esc, clique fora, ao sair o foco e ao rolar a página (balão parado
 * enquanto a âncora anda acaba por cima de outra coisa).
 *
 * O balão vai para fora da árvore (portal no `<body>`, ou no `<dialog>` aberto
 * em volta, para não ficar inerte atrás do modal) e entra na camada de topo
 * como `popover` quando o navegador tem: assim não é cortado por `overflow` de
 * lista, gaveta ou janela. A posição sai de {@link calcularPosicaoDoBalao}:
 * acima do ícone, abaixo se em cima não cabe, e escorregando de lado para
 * nunca sair da tela.
 *
 * O texto também fica sempre no documento, escondido para a vista, no `id`
 * de {@link idDoTextoDoInfo}: é o que o campo liga em `aria-describedby`, para
 * o leitor de tela ler a explicação ao chegar no controle sem abrir nada.
 */

export type ConteudoDoInfo =
  | string
  | {
      titulo?: string | undefined;
      /** 1 a 3 frases: o que é, quando usar e o que acontece. */
      texto: string;
      /** Um caso do ramo da loja. Sai como "Ex.: …". */
      exemplo?: string | undefined;
    };

export type InfoProps = {
  /** Nome do que se explica: vira "Saiba mais sobre {rotulo}". */
  rotulo: string;
  conteudo: ConteudoDoInfo;
  /**
   * Base dos `id`. Com ela, o texto escondido ganha o `id`
   * `{id}-info` (o que o {@link Campo} liga no controle).
   */
  id?: string | undefined;
  className?: string | undefined;
};

/** `id` do texto escondido de um Info com `id` dado. */
export function idDoTextoDoInfo(id: string): string {
  return `${id}-info`;
}

/** Título, texto e exemplo de um conteúdo em qualquer das duas formas. */
export function lerConteudoDoInfo(conteudo: ConteudoDoInfo): {
  titulo: string | undefined;
  texto: string;
  exemplo: string | undefined;
} {
  if (typeof conteudo === "string") {
    return { titulo: undefined, texto: conteudo, exemplo: undefined };
  }
  const exemplo = conteudo.exemplo?.replace(/^\s*ex(\.|emplo)?\s*:?\s*/i, "");
  return {
    titulo: conteudo.titulo,
    texto: conteudo.texto,
    exemplo: exemplo === "" ? undefined : exemplo,
  };
}

/** Espera antes de fechar o balão aberto por hover (dá tempo de chegar nele). */
const ESPERA_PARA_FECHAR = 150;

/** Quanto o "i" pode andar numa rolagem (px) antes de o balão fechar. */
const TOLERANCIA_DA_ROLAGEM = 2;

type Modo = "fechado" | "hover" | "fixo";

function temMouse(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

/** Botão "i" com o balão de explicação. */
export function Info({ rotulo, conteudo, id, className }: InfoProps) {
  const base = useId();
  const idDoTexto = idDoTextoDoInfo(id ?? base);
  const idDoBalao = `${id ?? base}-balao`;
  const { titulo, texto, exemplo } = lerConteudoDoInfo(conteudo);

  const [modo, setModo] = useState<Modo>("fechado");
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const aberto = modo !== "fechado";

  const botao = useRef<HTMLButtonElement>(null);
  const balao = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  /** Onde o "i" estava quando o balão foi posicionado. */
  const ondeEstava = useRef({ top: 0, left: 0 });
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelarEspera = useCallback(() => {
    if (espera.current !== undefined) clearTimeout(espera.current);
    espera.current = undefined;
  }, []);

  const abrir = useCallback(
    (novo: Exclude<Modo, "fechado">) => {
      cancelarEspera();
      // Dentro de um `<dialog>` modal, o resto da página fica inerte: o balão
      // nasce dentro dele para continuar visível ao leitor de tela.
      setAlvo(
        botao.current?.closest<HTMLElement>("dialog[open]") ?? document.body,
      );
      setModo(novo);
    },
    [cancelarEspera],
  );

  const fechar = useCallback(() => {
    cancelarEspera();
    setModo("fechado");
  }, [cancelarEspera]);

  const fecharDepois = useCallback(() => {
    cancelarEspera();
    espera.current = setTimeout(() => {
      setModo((atual) => (atual === "hover" ? "fechado" : atual));
    }, ESPERA_PARA_FECHAR);
  }, [cancelarEspera]);

  const posicionar = useCallback(() => {
    const ancora = botao.current;
    const caixa = balao.current;
    const miolo = corpo.current;
    if (ancora === null || caixa === null || miolo === null) return;

    // Mede no tamanho natural (o CSS já limita a largura) e só então posiciona.
    miolo.style.maxHeight = "";
    const medida = caixa.getBoundingClientRect();
    const borda = medida.height - miolo.offsetHeight;
    const retangulo = ancora.getBoundingClientRect();
    ondeEstava.current = { top: retangulo.top, left: retangulo.left };
    const posicao = calcularPosicaoDoBalao({
      ancora: retangulo,
      balao: { largura: medida.width, altura: medida.height },
      tela: {
        largura: document.documentElement.clientWidth || window.innerWidth,
        altura: window.innerHeight,
      },
    });
    caixa.style.top = `${posicao.top}px`;
    caixa.style.left = `${posicao.left}px`;
    caixa.style.width = `${posicao.largura}px`;
    miolo.style.maxHeight = `${Math.max(0, posicao.alturaMaxima - borda)}px`;
    caixa.style.setProperty("--sc-info-seta-x", `${posicao.setaX}px`);
    caixa.dataset["lado"] = posicao.lado;
  }, []);

  // Mostra na camada de topo e posiciona antes da pintura (sem piscar no canto).
  useLayoutEffect(() => {
    const caixa = balao.current;
    if (!aberto || caixa === null) return;
    if (
      typeof caixa.showPopover === "function" &&
      !caixa.matches(":popover-open")
    ) {
      caixa.showPopover();
    }
    caixa.style.width = "";
    posicionar();
  }, [aberto, alvo, posicionar]);

  // Enquanto aberto: Esc, clique fora, rolagem e mudança de tamanho da tela.
  useEffect(() => {
    if (!aberto) return;

    function dentro(no: EventTarget | null): boolean {
      return (
        no instanceof Node &&
        (botao.current?.contains(no) === true ||
          balao.current?.contains(no) === true)
      );
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      // Fecha só o balão, e não o `<dialog>` em volta.
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
      if (document.activeElement === document.body) botao.current?.focus();
    }
    function aoTocar(evento: PointerEvent) {
      if (!dentro(evento.target)) fechar();
    }
    function aoRolar(evento: Event) {
      // Rolar o próprio balão (texto longo em tela baixa) não fecha. E só
      // fecha se o "i" saiu do lugar: evento de rolagem que não mexe em nada
      // (o navegador ajustando a página ao foco) não derruba o balão.
      if (dentro(evento.target)) return;
      const agora = botao.current?.getBoundingClientRect();
      if (
        agora === undefined ||
        Math.abs(agora.top - ondeEstava.current.top) > TOLERANCIA_DA_ROLAGEM ||
        Math.abs(agora.left - ondeEstava.current.left) > TOLERANCIA_DA_ROLAGEM
      ) {
        fechar();
      }
    }

    window.addEventListener("keydown", aoTeclar, true);
    document.addEventListener("pointerdown", aoTocar, true);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      document.removeEventListener("pointerdown", aoTocar, true);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto, fechar, posicionar]);

  useEffect(() => cancelarEspera, [cancelarEspera]);

  return (
    <span className={["sc-info", className].filter(Boolean).join(" ")}>
      <button
        ref={botao}
        type="button"
        className="sc-info__botao"
        aria-label={`Saiba mais sobre ${rotulo}`}
        aria-expanded={aberto}
        aria-controls={aberto ? idDoBalao : undefined}
        aria-describedby={idDoTexto}
        data-aberto={aberto || undefined}
        onClick={() => (modo === "fixo" ? fechar() : abrir("fixo"))}
        onPointerEnter={(evento) => {
          if (evento.pointerType !== "mouse" || !temMouse()) return;
          if (modo === "fechado") abrir("hover");
          else cancelarEspera();
        }}
        onPointerLeave={(evento) => {
          if (evento.pointerType === "mouse" && modo === "hover") fecharDepois();
        }}
        onBlur={(evento) => {
          if (modo === "fixo" && !balao.current?.contains(evento.relatedTarget))
            fechar();
        }}
      >
        <IconeInfo className="sc-info__icone" aria-hidden="true" />
      </button>

      <span className="sc-so-leitor" id={idDoTexto}>
        {titulo !== undefined && `${titulo}. `}
        {texto}
        {exemplo !== undefined && ` Ex.: ${exemplo}`}
      </span>

      {aberto &&
        alvo !== null &&
        createPortal(
          <div
            ref={balao}
            id={idDoBalao}
            role="tooltip"
            className="sc-info__balao"
            popover="manual"
            data-lado="cima"
            onPointerEnter={cancelarEspera}
            onPointerLeave={(evento) => {
              if (evento.pointerType === "mouse" && modo === "hover")
                fecharDepois();
            }}
          >
            <div ref={corpo} className="sc-info__corpo">
              {titulo !== undefined && (
                <p className="sc-info__titulo">{titulo}</p>
              )}
              <p className="sc-info__texto">{texto}</p>
              {exemplo !== undefined && (
                <p className="sc-info__exemplo">
                  <span className="sc-info__ex">Ex.:</span> {exemplo}
                </p>
              )}
            </div>
            <span className="sc-info__seta" aria-hidden="true" />
          </div>,
          alvo,
        )}
    </span>
  );
}

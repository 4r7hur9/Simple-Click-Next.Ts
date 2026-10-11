"use client";

/**
 * A narrativa por rolagem da landing (AC-936, AC-937, AC-938).
 *
 * ESTE COMPONENTE NÃO DESENHA CONTEÚDO. Ele acha os capítulos que a página já
 * colocou e os anima. Se nunca rodar — script bloqueado, erro de carregamento,
 * rede que caiu no meio — a página continua inteira e legível (AC-934).
 *
 * É ele também quem decide se o mundo em três dimensões chega a ser BAIXADO. A
 * decisão vem antes da importação: num celular, num aparelho sem aceleração de
 * vídeo ou para quem pediu menos movimento, o pacote nem sai do servidor.
 */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  ancoraDaVaga,
  passoDaSequencia,
  querMovimentoReduzido,
} from "../../lib/narrativa.ts";
import { lerAparelho, podeRodar3D } from "./podeRodar3D.ts";

/**
 * O registro do plugin acontece UMA VEZ, e dentro do efeito.
 *
 * "Uma vez" porque registrar a cada montagem acumula instâncias e deixa a página
 * lenta depois de alguns minutos, sem erro nenhum aparecer. E "dentro do efeito"
 * porque o registro toca o navegador: no escopo do módulo ele rodaria na
 * importação, antes de haver janela — o que estoura na renderização do servidor.
 */
let jaRegistrou = false;

/** Registra o ScrollTrigger no gsap na primeira chamada; as seguintes não fazem nada. */
function registrarUmaVez(): void {
  if (jaRegistrou) return;
  gsap.registerPlugin(ScrollTrigger);
  jaRegistrou = true;
}

export interface NarrativaDaLandingProps {
  readonly raiz?: string;
}

/** Anima a entrada dos capítulos que a página já desenhou e libera o mundo 3D se o aparelho aguentar. */
export function NarrativaDaLanding({
  raiz = '[data-narrativa="landing"]',
}: NarrativaDaLandingProps) {
  const jaRodou = useRef(false);
  const [mundoLiberado, setMundoLiberado] = useState(false);

  useEffect(() => {
    const elemento = document.querySelector<HTMLElement>(raiz);
    if (elemento === null || jaRodou.current) return;
    jaRodou.current = true;

    // QUEM PEDIU PARA PARAR DE MEXER recebe o estado final, e não a ausência
    // (AC-936). Como nada é escondido em CSS, sair agora deixa a página inteira
    // visível — que é o comportamento certo, e não um efeito colateral.
    if (querMovimentoReduzido()) return;

    registrarUmaVez();

    // A decisão sobre o mundo vem ANTES de qualquer importação dele.
    if (podeRodar3D(lerAparelho())) setMundoLiberado(true);

    const contexto = gsap.context(() => {
      const capitulos = gsap.utils.toArray<HTMLElement>("[data-capitulo]");
      if (capitulos.length === 0) return;

      // A ÂNCORA É A VAGA, e não a janela. Numa tela comprida com duas ou três
      // seções visíveis, as de baixo já estão na tela desde o começo: com a
      // âncora da janela elas disparam junto com a primeira, tudo anima de uma
      // vez, e o efeito de revelação some (AC-938).
      const ancora = ancoraDaVaga();

      for (const capitulo of capitulos) {
        const conteudo = capitulo.querySelector(".sc-lp__conteudo");
        if (conteudo === null) continue;

        gsap.from(conteudo, {
          opacity: 0,
          y: 36,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: {
            // A âncora é o próprio capítulo, que sempre tem altura: gatilho de
            // altura zero nunca dispara, e aparece como narrativa que trava.
            trigger: capitulo,
            start: ancora,
            // Uma vez só. Reanimar a cada passagem transforma a rolagem de volta
            // num piscar de conteúdo.
            once: true,
          },
        });

        const pontos =
          capitulo.querySelectorAll<HTMLElement>(".sc-lp__pontos li");
        if (pontos.length > 1) {
          gsap.from(pontos, {
            opacity: 0,
            x: -12,
            duration: 0.4,
            stagger: passoDaSequencia(pontos.length),
            scrollTrigger: { trigger: capitulo, start: ancora, once: true },
          });
        }
      }

      // As medidas são tiradas na montagem. Fonte ou imagem que carregue depois
      // desloca tudo, e o pedido de recálculo é o que impede a narrativa de
      // disparar no lugar errado.
      ScrollTrigger.refresh();
    }, elemento);

    // A limpeza é obrigatória, e não higiene: no App Router o componente monta e
    // desmonta a cada navegação, e um ScrollTrigger não destruído continua
    // escutando a rolagem de uma página que já não existe.
    return () => {
      contexto.revert();
      jaRodou.current = false;
    };
  }, [raiz]);

  // O mundo é montado só depois de liberado, e ele mesmo importa o pacote sob
  // demanda. Enquanto não for, este componente não devolve nada.
  if (!mundoLiberado) return null;
  return <MundoSobDemanda />;
}

/**
 * O mundo, carregado sob demanda.
 *
 * A importação acontece aqui dentro, e não no topo do arquivo: no topo, o pacote
 * entraria no primeiro carregamento de TODO mundo — inclusive de quem a decisão
 * acabou de recusar.
 */
function MundoSobDemanda() {
  const alvo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elemento = alvo.current;
    if (elemento === null) return;

    let desmontar: (() => void) | undefined;
    let cancelado = false;

    void (async () => {
      try {
        const { montarMundo } = await import("./mundo.ts");
        if (cancelado) return;
        desmontar = montarMundo(elemento);
      } catch {
        // Mundo que não carregou é um enfeite a menos, e não uma página a
        // menos. A história continua inteira sem ele.
      }
    })();

    return () => {
      cancelado = true;
      desmontar?.();
    };
  }, []);

  // Decoração para quem ouve a página: a história é contada pelo texto.
  return <div className="sc-lp__mundo" aria-hidden="true" ref={alvo} />;
}

"use client";

/**
 * A narrativa da landing, com GSAP (ScrollTrigger e SplitText), carregado sob
 * demanda.
 *
 * NÃO DESENHA NADA: acha na página o que o servidor já entregou e anima. Sem
 * script a página está inteira (as cenas viram blocos comuns); com movimento
 * reduzido, este componente não faz nada e a rolagem é a do navegador.
 *
 * - as cenas (cenas-em-slide.ts): uma rolada leva à cena seguinte, como um
 *   slide, com a troca animada; depois da última, a rolagem volta a ser livre;
 * - o resto da página: cabeçalhos e cartões sobem, números contam, a barra de
 *   progresso anda (scaleX, nunca width).
 *
 * Tudo é desfeito ao sair da página (`gsap.context` e a limpeza das cenas).
 */
import { useEffect } from "react";

import { montarCenasEmSlide } from "./cenas-em-slide.ts";
import { detectarCapacidadeDaLanding } from "./capacidade-da-landing.ts";

const formatar = (valor: number, casas: number) =>
  valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

export function NarrativaDaLanding() {
  useEffect(() => {
    let desfazer: (() => void) | undefined;
    let cancelado = false;

    void (async () => {
      const nivel = await detectarCapacidadeDaLanding();
      // No toque, a página fica no fluxo e o navegador encaixa as cenas.
      if (cancelado || nivel !== "completo" || window.matchMedia("(pointer: coarse)").matches) return;
      const [{ default: gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (cancelado) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      const raiz = document.querySelector<HTMLElement>(".sc-lp");
      if (!raiz) return;

      const narrativa = raiz.querySelector<HTMLElement>(".sc-lp-narrativa");
      const desfazerCenas = narrativa ? montarCenasEmSlide({ gsap, SplitText, narrativa }) : undefined;

      // As cenas (o que está na tela) primeiro; as entradas das seções de
      // baixo numa tarefa separada, para o celular não travar num bloco só.
      await new Promise<void>((pronto) => {
        setTimeout(pronto, 0);
      });
      if (cancelado) {
        desfazerCenas?.();
        return;
      }

      const contexto = gsap.context(() => {
        // --- entrada das seções comuns ------------------------------------------
        for (const cabecalho of gsap.utils.toArray<HTMLElement>(".sc-lp-secao .sc-lp-cabecalho")) {
          gsap.from(cabecalho.children, {
            opacity: 0,
            y: 28,
            duration: 0.7,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: cabecalho, start: "top 85%", once: true },
          });
        }

        for (const grupo of gsap.utils.toArray<HTMLElement>("[data-revelar]")) {
          gsap.from(grupo.children, {
            opacity: 0,
            y: 36,
            duration: 0.6,
            stagger: 0.07,
            ease: "power2.out",
            scrollTrigger: { trigger: grupo, start: "top 85%", once: true },
          });
        }

        // --- contadores ---------------------------------------------------------
        for (const numero of gsap.utils.toArray<HTMLElement>("[data-contador]")) {
          const alvo = Number(numero.dataset["contador"]);
          const casas = Number(numero.dataset["casas"] ?? 0);
          const antes = numero.dataset["antes"] ?? "";
          const depois = numero.dataset["depois"] ?? "";
          const estado = { valor: 0 };
          gsap.to(estado, {
            valor: alvo,
            duration: 1.4,
            ease: "power2.out",
            scrollTrigger: { trigger: numero, start: "top 90%", once: true },
            onUpdate: () => {
              numero.textContent = `${antes}${formatar(estado.valor, casas)}${depois}`;
            },
          });
        }

        // --- barra de progresso -------------------------------------------------
        const barra = raiz.querySelector(".sc-lp-progresso");
        if (barra) {
          gsap.to(barra, {
            scaleX: 1,
            ease: "none",
            scrollTrigger: { trigger: raiz, start: "top top", end: "bottom bottom", scrub: 0.3 },
          });
        }
      }, raiz);

      // Fontes e imagens mudam alturas depois da montagem.
      const recalcular = () => ScrollTrigger.refresh();
      window.addEventListener("load", recalcular);
      void document.fonts?.ready.then(recalcular);

      // Foco do teclado num bloco que ainda não entrou: ele chega pronto na
      // hora (quem navega por Tab não fica com um link invisível em foco).
      // Vale para as entradas daqui e as de secoes/ (o ScrollTrigger é um só).
      const aoFocar = (evento: FocusEvent) => {
        const alvo = evento.target;
        if (!(alvo instanceof Element)) return;
        for (const gatilho of ScrollTrigger.getAll()) {
          const elemento = gatilho.trigger;
          if (elemento instanceof Element && elemento.contains(alvo)) gatilho.animation?.progress(1);
        }
      };
      raiz.addEventListener("focusin", aoFocar);

      desfazer = () => {
        raiz.removeEventListener("focusin", aoFocar);
        window.removeEventListener("load", recalcular);
        desfazerCenas?.();
        contexto.revert();
      };
    })();

    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return null;
}

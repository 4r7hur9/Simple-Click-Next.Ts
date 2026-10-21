"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Moldura dos gráficos da seção de mercado: desenha as marcas quando o gráfico
 * entra na tela. As barras crescem da linha de base, as fatias da rosca se
 * traçam em sequência e as células do quadriculado acendem uma a uma.
 *
 * O SERVIDOR JÁ ENTREGA O GRÁFICO PRONTO: sem script, ou com "reduzir
 * movimento", é ele que fica. GSAP só é carregado no navegador, na hora, e só
 * mexe em transform, opacidade e no traço do SVG.
 */
export function GraficoAnimado({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const no = ref.current;
    if (!no) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let desfazer: (() => void) | undefined;
    let cancelado = false;
    void (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelado) return;
      gsap.registerPlugin(ScrollTrigger);
      const contexto = gsap.context(() => {
        const linha = gsap.timeline({
          defaults: { ease: "power3.out" },
          scrollTrigger: { trigger: no, start: "top 80%", once: true },
        });

        const barras = no.querySelectorAll("[data-barra]");
        if (barras.length) {
          linha.from(barras, {
            scaleX: 0,
            transformOrigin: "left center",
            duration: 0.9,
            stagger: 0.12,
          });
        }

        // Cada fatia leva o tempo da sua parte, uma depois da outra.
        for (const fatia of no.querySelectorAll<SVGElement>("[data-fatia]")) {
          const traco = fatia.getAttribute("stroke-dasharray") ?? "0 100";
          const parte = Number(traco.split(" ")[0]) || 0;
          linha.fromTo(
            fatia,
            { attr: { "stroke-dasharray": "0 100" } },
            {
              attr: { "stroke-dasharray": traco },
              duration: Math.max(0.15, parte / 60),
              ease: "none",
            },
          );
        }

        const celulas = no.querySelectorAll("[data-celula]");
        if (celulas.length) {
          linha.from(
            celulas,
            { opacity: 0, scale: 0.4, duration: 0.3, stagger: 0.008 },
            0,
          );
        }

        const rotulos = no.querySelectorAll("[data-rotulo-do-grafico]");
        if (rotulos.length) {
          // Opacidade, não visibility: o leitor de tela lê o rótulo desde o começo.
          linha.from(rotulos, { opacity: 0, y: 6, duration: 0.4, stagger: 0.08 }, "-=0.4");
        }
      }, no);
      desfazer = () => contexto.revert();
    })();
    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return (
    <figure className={className} ref={ref as React.Ref<HTMLElement>}>
      {children}
    </figure>
  );
}

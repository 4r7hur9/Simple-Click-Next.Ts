"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { detectarCapacidadeDaLanding } from "../capacidade-da-landing.ts";

/**
 * Entrada discreta: o bloco sobe 16px e aparece quando entra na tela.
 * Sem script, ou com "reduzir movimento", fica no estado final. GSAP só é
 * carregado no navegador, na hora.
 */
export function Entrada({
  children,
  className,
  como: Tag = "div",
}: {
  children: ReactNode;
  className?: string | undefined;
  como?: "div" | "section" | "ul" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const no = ref.current;
    if (!no) return;
    let desfazer: (() => void) | undefined;
    let cancelado = false;
    void (async () => {
      const nivel = await detectarCapacidadeDaLanding();
      if (cancelado || nivel !== "completo" || window.matchMedia("(pointer: coarse)").matches) return;
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelado) return;
      gsap.registerPlugin(ScrollTrigger);
      const contexto = gsap.context(() => {
        // Só opacidade (nunca visibility): o que ainda não entrou continua
        // focável pelo Tab e lido pelo leitor de tela.
        gsap.from(no.querySelectorAll("[data-entra]"), {
          opacity: 0,
          y: 16,
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: no, start: "top 85%", once: true },
        });
      }, no);
      desfazer = () => contexto.revert();
    })();
    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  const Elemento = Tag as "div";
  return (
    <Elemento
      className={className}
      ref={ref as React.Ref<HTMLDivElement>}
    >
      {children}
    </Elemento>
  );
}

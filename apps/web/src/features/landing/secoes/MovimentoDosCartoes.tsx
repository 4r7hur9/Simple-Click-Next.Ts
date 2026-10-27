"use client";

/**
 * O movimento dos cartões 3D da seção de mercado. NÃO DESENHA NADA: acha o
 * palco que o servidor entregou (`[data-cartoes-3d]`) e passa ao CSS
 * (landing-dados.css), uma vez por quadro:
 *
 * - `--px` e `--py` (-1 a 1) e `--luz-x`/`--luz-y` (0 a 1) no cartão sob o
 *   mouse: a inclinação (até 12°, no CSS) e o brilho seguem o ponteiro. No celular, o toque
 *   inclina o cartão tocado e, onde o navegador libera sem pedir permissão
 *   (Android), o giroscópio inclina todos de leve. No iPhone o giroscópio
 *   exige uma janela de permissão do sistema, e ela não vale o susto: lá fica
 *   só o toque;
 * - a entrada (os cartões vêm do fundo, em leque) e a contagem dos números,
 *   quando a tela aparece. GSAP só chega aqui, por import(), e só mexe em
 *   transform e opacidade (nunca em visibility: o Tab não pode pular a fonte).
 *
 * Com movimento reduzido nada liga: o CSS já deixa o cartão plano.
 */
import { detectarCapacidadeDaLanding } from "../capacidade-da-landing.ts";
import { useEffect, useRef } from "react";

/** Quanto da inclinação máxima (12°, no CSS) cada entrada usa. */
const FORCA = { mouse: 1, toque: 0.75, giro: 0.5 } as const;

const limitar = (valor: number, minimo = -1, maximo = 1) => Math.max(minimo, Math.min(maximo, valor));

function formatar(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function MovimentoDosCartoes() {
  const ancora = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const palco = ancora.current?.closest<HTMLElement>("[data-cartoes-3d]");
    if (!palco) return;
    let cancelado = false;
    let desfazer: (() => void) | undefined;
    void detectarCapacidadeDaLanding().then((nivel) => {
      if (cancelado || nivel === "estatico") return;
      desfazer = ligarMovimento(palco, nivel === "leve");
    });
    return () => {
      cancelado = true;
      desfazer?.();
    };
  }, []);

  return <span hidden ref={ancora} />;
}

function ligarMovimento(palco: HTMLElement, leve: boolean): () => void {

    const cartoes = [...palco.querySelectorAll<HTMLElement>(".sc-dado3d")];
    const pendentes = new Map<HTMLElement, { px: number; py: number; x: number; y: number }>();
    let quadro = 0;

    const desenhar = () => {
      quadro = 0;
      for (const [cartao, v] of pendentes) {
        cartao.style.setProperty("--px", v.px.toFixed(3));
        cartao.style.setProperty("--py", v.py.toFixed(3));
        cartao.style.setProperty("--luz-x", v.x.toFixed(3));
        cartao.style.setProperty("--luz-y", v.y.toFixed(3));
      }
      pendentes.clear();
    };
    const pedir = (cartao: HTMLElement, x: number, y: number, forca: number) => {
      // x e y de 0 a 1 dentro do cartão; o lado apontado afunda, como um toque.
      pendentes.set(cartao, { px: (x - 0.5) * 2 * forca, py: (y - 0.5) * 2 * forca, x, y });
      if (!quadro) quadro = requestAnimationFrame(desenhar);
    };
    const soltar = (cartao: HTMLElement) => {
      delete cartao.dataset["inclinado"];
      pendentes.set(cartao, { px: 0, py: 0, x: 0.5, y: 0.3 });
      if (!quadro) quadro = requestAnimationFrame(desenhar);
    };

    const aoMover = (evento: PointerEvent) => {
      const cartao = evento.currentTarget as HTMLElement;
      if (evento.pointerType === "touch" && cartao.dataset["inclinado"] === undefined) return;
      // A caixa da vaga (sem a inclinação) dá a posição real do ponteiro.
      const caixa = (cartao.parentElement ?? cartao).getBoundingClientRect();
      const x = limitar((evento.clientX - caixa.left) / caixa.width, 0, 1);
      const y = limitar((evento.clientY - caixa.top) / caixa.height, 0, 1);
      cartao.dataset["inclinado"] = "";
      pedir(cartao, x, y, evento.pointerType === "touch" ? FORCA.toque : FORCA.mouse);
    };
    const aoTocar = (evento: PointerEvent) => {
      if (evento.pointerType !== "touch") return;
      (evento.currentTarget as HTMLElement).dataset["inclinado"] = "";
      aoMover(evento);
    };
    const aoSair = (evento: PointerEvent) => soltar(evento.currentTarget as HTMLElement);

    for (const cartao of cartoes) {
      cartao.addEventListener("pointermove", aoMover, { passive: true });
      cartao.addEventListener("pointerdown", aoTocar, { passive: true });
      cartao.addEventListener("pointerleave", aoSair);
      cartao.addEventListener("pointerup", aoSair);
      cartao.addEventListener("pointercancel", aoSair);
    }

    // Giroscópio: só toque, só com o palco na tela, só sem pedir permissão.
    let visivel = false;
    const observador = new IntersectionObserver(([registro]) => {
      visivel = Boolean(registro?.isIntersecting);
    });
    observador.observe(palco);
    let base: number | null = null;
    const aoGirar = (evento: DeviceOrientationEvent) => {
      if (!visivel || evento.beta === null || evento.gamma === null) return;
      base ??= evento.beta;
      const x = 0.5 + limitar(evento.gamma / 30) / 2;
      const y = 0.5 + limitar((evento.beta - base) / 30) / 2;
      for (const cartao of cartoes) {
        if (cartao.dataset["inclinado"] === undefined) pedir(cartao, x, y, FORCA.giro);
      }
    };
    const orientacao = typeof DeviceOrientationEvent === "undefined" ? undefined : DeviceOrientationEvent;
    const pedePermissao =
      orientacao !== undefined &&
      typeof (orientacao as unknown as { requestPermission?: unknown }).requestPermission === "function";
    const comGiro =
      orientacao !== undefined && !pedePermissao && window.matchMedia("(pointer: coarse)").matches;
    if (comGiro) window.addEventListener("deviceorientation", aoGirar, { passive: true });

    // Entrada e contagem ficam só no desktop; no celular o tilt é uma resposta ao toque.
    let desfazer: (() => void) | undefined;
    let cancelado = false;
    if (!leve) void (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelado) return;
      gsap.registerPlugin(ScrollTrigger);
      const contexto = gsap.context(() => {
        const linha = gsap.timeline({
          defaults: { ease: "power3.out" },
          scrollTrigger: { trigger: palco, start: "top 82%", once: true },
        });
        linha.from(palco.querySelectorAll("[data-entra-3d]"), {
          opacity: 0,
          y: 48,
          z: -260,
          rotateX: 16,
          duration: 1,
          stagger: 0.1,
          clearProps: "transform,opacity",
        });
        for (const digitos of palco.querySelectorAll<HTMLElement>("[data-conta-ate]")) {
          const final = digitos.textContent ?? "";
          const alvo = Number(digitos.dataset["contaAte"]);
          const casas = Number(digitos.dataset["casas"] ?? 0);
          if (!Number.isFinite(alvo)) continue;
          const estado = { valor: 0 };
          digitos.textContent = formatar(0, casas);
          linha.to(
            estado,
            {
              valor: alvo,
              duration: 1.5,
              ease: "power2.out",
              onUpdate: () => {
                digitos.textContent = formatar(estado.valor, casas);
              },
              onComplete: () => {
                digitos.textContent = final;
              },
            },
            0.25,
          );
        }
      }, palco);
      desfazer = () => contexto.revert();
    })();

    return () => {
      cancelado = true;
      desfazer?.();
      observador.disconnect();
      if (comGiro) window.removeEventListener("deviceorientation", aoGirar);
      for (const cartao of cartoes) {
        cartao.removeEventListener("pointermove", aoMover);
        cartao.removeEventListener("pointerdown", aoTocar);
        cartao.removeEventListener("pointerleave", aoSair);
        cartao.removeEventListener("pointerup", aoSair);
        cartao.removeEventListener("pointercancel", aoSair);
      }
      if (quadro) cancelAnimationFrame(quadro);
    };
}

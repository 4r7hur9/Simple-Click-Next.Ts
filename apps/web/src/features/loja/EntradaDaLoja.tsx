"use client";

/**
 * A entrada da página da loja.
 *
 * ERA UMA NARRATIVA POR ROLAGEM, e virou uma entrada. O motivo não foi estética:
 * a página passou a caber em uma tela, e animação disparada por rolagem numa
 * página que não rola nunca dispara. Manter o nome antigo teria deixado no
 * código uma promessa que ele não cumpre mais.
 *
 * ESTE COMPONENTE NÃO DESENHA CONTEÚDO. Ele acha o que a página já colocou e
 * anima a entrada. Se nunca rodar — script bloqueado, erro de carregamento, rede
 * que caiu no meio — a página continua inteira e legível. É essa separação que
 * faz a animação ser melhoria, e não requisito.
 *
 * Só o GSAP entra aqui; o ScrollTrigger fica de fora porque não há rolagem para
 * ele observar. O plugin continua instalado para a landing da plataforma, onde a
 * narrativa por rolagem se paga.
 */
import { useEffect, useRef } from "react";
import gsap from "gsap";

import { querMovimentoReduzido } from "../../lib/narrativa.ts";

/** Os blocos da tela, na ordem em que aparecem. */
const BLOCOS = [
  ".sc-loja__identidade",
  ".sc-loja__tela > .sc-aviso",
  ".sc-loja__chamada",
  ".sc-loja__detalhes",
] as const;

export interface EntradaDaLojaProps {
  /** Onde a entrada procura os blocos. Sem raiz, ela não sai do lugar. */
  readonly raiz?: string;
}

export function EntradaDaLoja({
  raiz = '[data-narrativa="apresentacao"]',
}: EntradaDaLojaProps) {
  const jaRodou = useRef(false);

  useEffect(() => {
    const elemento = document.querySelector<HTMLElement>(raiz);
    if (elemento === null || jaRodou.current) return;
    jaRodou.current = true;

    // QUEM PEDIU PARA PARAR DE MEXER recebe o estado final, e não a ausência. O
    // erro comum é sair cedo daqui deixando o elemento invisível: a pessoa fica
    // sem o conteúdo, não sem a animação. Como nada é escondido em CSS, sair
    // agora é seguro E correto.
    if (querMovimentoReduzido()) return;

    const contexto = gsap.context(() => {
      const alvos = BLOCOS.map((seletor) =>
        elemento.querySelector<HTMLElement>(seletor),
      ).filter((alvo): alvo is HTMLElement => alvo !== null);

      if (alvos.length === 0) return;

      // Curta de propósito. Esta página é uma porta: quem chegou quer passar por
      // ela, e meio segundo de entrada é o limite entre "a tela acordou" e "a
      // tela está me fazendo esperar".
      gsap.from(alvos, {
        opacity: 0,
        y: 16,
        duration: 0.4,
        stagger: 0.06,
        ease: "power2.out",
        // `clearProps` devolve o controle ao CSS quando a animação termina.
        // Sem isso, o estilo em linha que o GSAP deixa vence a folha, e a
        // primeira consulta de mídia que mudar depois não pega mais nada.
        clearProps: "opacity,transform",
      });
    }, elemento);

    // A limpeza é obrigatória, e não higiene: no App Router o componente monta e
    // desmonta a cada navegação, e o que não for destruído continua segurando o
    // elemento antigo na memória.
    return () => {
      contexto.revert();
      jaRodou.current = false;
    };
  }, [raiz]);

  return null;
}

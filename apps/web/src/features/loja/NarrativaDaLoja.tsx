"use client";

/**
 * A narrativa por rolagem da apresentação da loja.
 *
 * ESTE COMPONENTE NÃO DESENHA CONTEÚDO. Ele acha as seções que
 * `ApresentacaoDaLoja` já colocou na página e as anima. Se ele nunca rodar — por
 * script bloqueado, por erro de carregamento, por rede que caiu no meio — a
 * página continua inteira e legível. É essa separação que faz a animação ser
 * melhoria, e não requisito.
 *
 * A regra do peso da skill `design-de-front` autoriza GSAP na apresentação da
 * loja. Não autoriza na vitrine, no carrinho nem no fechamento: ali o AC-415
 * cobra o conteúdo em dois segundos e meio, e quem está com fome não paga por
 * narrativa.
 */
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  ancoraDaVaga,
  passoDaSequencia,
  querMovimentoReduzido,
} from "../../lib/narrativa.ts";

/**
 * O registro acontece UMA VEZ, e dentro do efeito.
 *
 * "Uma vez" porque registrar a cada montagem acumula instâncias e faz a página
 * ficar lenta depois de alguns minutos de uso, sem erro nenhum aparecer. E
 * "dentro do efeito" porque o registro toca o navegador: no escopo do módulo ele
 * roda na importação, antes de haver janela pronta — o que estoura na
 * renderização do servidor e em teste, com uma mensagem que fala de uma função
 * do navegador em vez de falar deste componente.
 */
let jaRegistrou = false;

function registrarUmaVez(): void {
  if (jaRegistrou) return;
  gsap.registerPlugin(ScrollTrigger);
  jaRegistrou = true;
}

export interface NarrativaDaLojaProps {
  /** Onde a narrativa procura as seções. Sem raiz, ela não sai do lugar. */
  readonly raiz?: string;
}

export function NarrativaDaLoja({
  raiz = '[data-narrativa="apresentacao"]',
}: NarrativaDaLojaProps) {
  const jaRodou = useRef(false);

  useEffect(() => {
    const elemento = document.querySelector<HTMLElement>(raiz);
    if (elemento === null || jaRodou.current) return;
    jaRodou.current = true;

    // QUEM PEDIU PARA PARAR DE MEXER recebe o estado final, e não a ausência. O
    // erro comum é sair cedo daqui deixando o elemento invisível: a pessoa fica
    // sem o conteúdo, não sem a animação. Como o conteúdo já nasce visível
    // (nada é escondido em CSS), sair agora é seguro E correto.
    if (querMovimentoReduzido()) return;

    registrarUmaVez();

    const contexto = gsap.context(() => {
      const secoes = gsap.utils.toArray<HTMLElement>("[data-secao]");
      if (secoes.length === 0) return;

      // A ÂNCORA É A VAGA, e não a janela. Numa tela comprida com duas seções
      // visíveis, a segunda já está na tela desde o começo: com a âncora da
      // janela ela dispara junto com a primeira, tudo anima de uma vez, e o
      // efeito de revelação some.
      const ancora = ancoraDaVaga();

      for (const secao of secoes) {
        const conteudo = secao.querySelector(".sc-secao__conteudo");
        if (conteudo === null) continue;

        gsap.from(conteudo, {
          opacity: 0,
          y: 32,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            // A âncora é a própria seção, que sempre tem altura: gatilho de
            // altura zero nunca dispara, e aparece como narrativa que trava.
            trigger: secao,
            start: ancora,
            // Uma vez só. Reanimar a cada passagem transforma a rolagem de volta
            // num piscar de conteúdo.
            once: true,
          },
        });
      }

      // Revelação em sequência das formas de entrega, onde houver.
      const formas = gsap.utils.toArray<HTMLElement>(".sc-loja__formas li");
      if (formas.length > 1) {
        gsap.from(formas, {
          opacity: 0,
          y: 12,
          duration: 0.4,
          stagger: passoDaSequencia(formas.length),
          scrollTrigger: {
            trigger: ".sc-loja__formas",
            start: ancora,
            once: true,
          },
        });
      }

      // As medidas são tiradas na montagem. Imagem sem altura reservada que
      // carrega depois desloca tudo — a logo já tem dimensão na marcação, e
      // este pedido cobre fonte e o que mais vier.
      ScrollTrigger.refresh();
    }, elemento);

    // A LIMPEZA É OBRIGATÓRIA, e não higiene. No App Router o componente monta e
    // desmonta a cada navegação; um ScrollTrigger não destruído continua
    // escutando a rolagem de uma página que já não existe, segurando na memória
    // o elemento antigo. Depois de cinco navegações a página engasga, e o
    // culpado não aparece em lugar nenhum.
    return () => {
      contexto.revert();
      jaRodou.current = false;
    };
  }, [raiz]);

  return null;
}

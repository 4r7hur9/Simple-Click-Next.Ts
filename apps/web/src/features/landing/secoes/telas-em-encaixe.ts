/**
 * As seções depois da narrativa, uma tela por gesto (contas em
 * encaixe-das-telas.ts). Chamado pelo EncaixeDasTelas, só para quem não pediu
 * menos movimento.
 *
 * É O MESMO JEITO DAS CENAS (cenas-em-slide.ts): o mesmo detector de gesto
 * (que engole a inércia do trackpad), as mesmas teclas, o mesmo arrasto do
 * dedo e o mesmo deslize de 1 s com a curva lenta nas pontas. A diferença: aqui
 * nada gruda. A página desliza de verdade de uma seção para a outra, e uma
 * seção mais alta que a janela rola por dentro, solta, até a borda; só então o
 * gesto seguinte troca de seção. Ninguém fica preso.
 *
 * Telas: as três de Dados de mercado (`data-tela-de-dados`, card #95), as
 * seções de baixo (`section[data-tela]`; as imagens dos aparelhos também têm
 * `data-tela`, com o nome da tela do app, e não contam), o convite final e,
 * por último, o rodapé: o gesto depois do convite desliza até o fim da
 * página (o rodapé inteiro), e o de volta, até o convite. O encaixe só liga
 * com a janela de pelo menos 560 px de altura (como o modo slide das cenas).
 *
 * As ENTRADAS (montarEntradasDasTelas): cada seção chega no estado final; o
 * script só a "arma" (`data-armado`, o CSS esconde as palavras atrás da
 * máscara) se ela ainda não está na tela, e a solta (`data-chegou`) quando ela
 * aparece. O foco do teclado entrando numa seção armada a mostra pronta
 * (`data-direto`), sem esperar a animação.
 */
import {
  ancoraDaMesmaPagina,
  criarDetectorDeGesto,
  direcaoDaTecla,
  direcaoDoToque,
  type Direcao,
} from "../navegacao-por-cenas.ts";
import {
  ajusteDaPosicao,
  cabeNaJanela,
  curvaDoDeslize,
  passoDoGesto,
  rolagemLimitada,
  telaDaPosicao,
  type MedidasDasTelas,
} from "./encaixe-das-telas.ts";

export const SELETOR_DAS_TELAS = "[data-tela-de-dados], section[data-tela], .sc-lp-convite";
/** O rodapé fica fora da landing (page.tsx), logo depois dela. */
const SELETOR_DO_RODAPE = "footer.sc-rodape";

/** O deslize entre telas: o tempo da troca de cena. */
const DURACAO = 1000;
/** O acerto depois de uma rolagem solta que parou entre duas telas. */
const DURACAO_DO_ACERTO = 600;

export function montarTelasEmEncaixe(raiz: HTMLElement): () => void {
  const topoDaPagina = raiz.querySelector<HTMLElement>(".sc-lp-topo");
  const alturaQueLiga = window.matchMedia("(min-height: 560px)");

  let telas: HTMLElement[] = [];
  let medidas: MedidasDasTelas = { telas: [], janela: window.innerHeight };
  let ativo = false;
  let deslize: number | null = null;
  /** Até quando (performance.now) um deslize está correndo. */
  let ocupadoAte = 0;
  let tocando = false;
  const detector = criarDetectorDeGesto();

  // --- medidas --------------------------------------------------------------------

  const medir = () => {
    const rodape = document.querySelector<HTMLElement>(SELETOR_DO_RODAPE);
    telas = [...raiz.querySelectorAll<HTMLElement>(SELETOR_DAS_TELAS), ...(rodape ? [rodape] : [])];
    const topo = topoDaPagina ? Math.round(topoDaPagina.getBoundingClientRect().height) : 0;
    const fimDaPagina = document.documentElement.scrollHeight - window.innerHeight;
    medidas = {
      janela: window.innerHeight - topo,
      telas: telas.map((tela) => {
        const caixa = tela.getBoundingClientRect();
        const alto = Math.round(caixa.top + window.scrollY - topo);
        // O rodapé mais baixo que a janela para no fim da página (não dá para
        // o alto dele encostar no topo): o convite aparece em cima dele.
        if (tela === rodape) {
          const parada = Math.min(alto, Math.max(0, Math.round(fimDaPagina)));
          return { topo: parada, altura: Math.max(0, alto + Math.round(caixa.height) - parada) };
        }
        return { topo: alto, altura: Math.round(caixa.height) };
      }),
    };
  };

  // --- o deslize --------------------------------------------------------------------

  const pularPara = (y: number) => {
    window.scrollTo({ top: y, behavior: "instant" });
  };

  const pararDeslize = () => {
    if (deslize !== null) window.cancelAnimationFrame(deslize);
    deslize = null;
  };

  const deslizarPara = (y: number, duracao = DURACAO) => {
    pararDeslize();
    const de = window.scrollY;
    if (Math.abs(y - de) < 1) return;
    const inicio = performance.now();
    ocupadoAte = inicio + duracao;
    detector.travarAte(ocupadoAte - 100);
    const quadro = (agora: number) => {
      const t = (agora - inicio) / duracao;
      pularPara(de + (y - de) * curvaDoDeslize(t));
      deslize = t < 1 ? window.requestAnimationFrame(quadro) : null;
    };
    deslize = window.requestAnimationFrame(quadro);
  };

  const livre = () => deslize === null && performance.now() >= ocupadoAte - 150;

  // --- roda e trackpad ---------------------------------------------------------------

  const aoRodar = (evento: WheelEvent) => {
    if (!ativo || evento.ctrlKey) return;
    if (Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;
    const escala = evento.deltaMode === 1 ? 32 : evento.deltaMode === 2 ? window.innerHeight : 1;
    const delta = evento.deltaY * escala;
    if (delta === 0) return;
    const direcao: Direcao = delta > 0 ? 1 : -1;
    const y = window.scrollY;
    // Todo evento conta: um gesto dispara uma vez só, onde quer que tenha
    // começado. Se ele já rolou solto dentro de uma tela alta (ou veio da
    // narrativa), ao chegar na borda não pula de tela; o próximo gesto pula.
    const { disparo, novo } = detector.registrar(evento.timeStamp, delta);
    if (novo) medir();
    if (telaDaPosicao(medidas, y) === null) return;
    if (deslize !== null) {
      evento.preventDefault();
      return;
    }
    const passo = passoDoGesto(medidas, y, direcao);
    if (passo.tipo === "fora" || evento.defaultPrevented) return;
    if (passo.tipo === "livre") {
      // Rolagem do navegador, mas sem passar da borda da tela.
      if (rolagemLimitada(y, delta, passo.limite) === passo.limite && y + delta !== passo.limite) {
        evento.preventDefault();
        pularPara(passo.limite);
      }
      return;
    }
    evento.preventDefault();
    if (disparo !== 0) deslizarPara(passo.y);
  };

  // --- toque -------------------------------------------------------------------------

  let toque: { readonly x: number; readonly y: number; decidido: boolean; segura: boolean } | null = null;

  const aoTocar = (evento: TouchEvent) => {
    tocando = true;
    const ponto = evento.touches[0];
    toque = ativo && evento.touches.length === 1 && ponto ? { x: ponto.clientX, y: ponto.clientY, decidido: false, segura: false } : null;
    if (toque) medir();
  };

  const aoArrastar = (evento: TouchEvent) => {
    if (!ativo || !toque || evento.touches.length !== 1) return;
    const ponto = evento.touches[0]!;
    const dy = toque.y - ponto.clientY;
    const dx = toque.x - ponto.clientX;
    if (!toque.decidido) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      toque.decidido = true;
      // Arrasto de lado (o carrossel da comparação) não é com o encaixe.
      if (Math.abs(dx) > Math.abs(dy)) return;
      const y = window.scrollY;
      toque.segura =
        telaDaPosicao(medidas, y) !== null &&
        (deslize !== null || passoDoGesto(medidas, y, dy > 0 ? 1 : -1).tipo === "ir");
    }
    if (toque.segura && evento.cancelable) evento.preventDefault();
  };

  const aoSoltar = (evento: TouchEvent) => {
    tocando = evento.touches.length > 0;
    const solto = toque;
    toque = null;
    if (!ativo || !solto?.segura) return;
    const sentido = direcaoDoToque(solto.y, evento.changedTouches[0]?.clientY ?? solto.y);
    if (sentido === 0 || !livre()) return;
    const passo = passoDoGesto(medidas, window.scrollY, sentido);
    if (passo.tipo === "ir") deslizarPara(passo.y);
  };

  // --- teclado -----------------------------------------------------------------------

  const aoTeclar = (evento: KeyboardEvent) => {
    if (!ativo || evento.defaultPrevented || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const alvo = evento.target instanceof HTMLElement ? evento.target : null;
    const tipo = alvo?.closest("input, textarea, select, [contenteditable='true']")
      ? "texto"
      : alvo?.closest("button, summary, [role='button'], [role='slider']")
        ? "controle"
        : "outro";
    const sentido = direcaoDaTecla(evento.key, { shift: evento.shiftKey, alvo: tipo });
    if (sentido === 0) return;
    medir();
    const y = window.scrollY;
    if (telaDaPosicao(medidas, y) === null) return;
    if (deslize !== null) {
      evento.preventDefault();
      return;
    }
    const passo = passoDoGesto(medidas, y, sentido);
    if (passo.tipo === "fora") return;
    evento.preventDefault();
    if (passo.tipo === "livre") {
      // Dentro da tela alta: a seta anda um pouco, a página anda quase uma tela.
      const pagina = evento.key !== "ArrowDown" && evento.key !== "ArrowUp";
      const destino = rolagemLimitada(y, (pagina ? medidas.janela * 0.85 : 56) * sentido, passo.limite);
      if (pagina) deslizarPara(destino, 450);
      else pularPara(destino);
      return;
    }
    if (evento.repeat || !livre()) return;
    deslizarPara(passo.y);
  };

  // --- âncoras e foco ----------------------------------------------------------------

  /** Links para uma seção (menu do topo, "Fazer a minha conta ↓", rodapé): ela desliza inteira. */
  const aoClicar = (evento: MouseEvent) => {
    if (!ativo || evento.defaultPrevented || evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    const link = evento.target instanceof Element ? evento.target.closest<HTMLAnchorElement>("a[href*='#']") : null;
    const id = ancoraDaMesmaPagina(link?.getAttribute("href"), window.location.href);
    const alvo = id ? document.getElementById(id) : null;
    if (!alvo) return;
    const tela = alvo.closest<HTMLElement>(SELETOR_DAS_TELAS) ?? alvo.querySelector<HTMLElement>(SELETOR_DAS_TELAS);
    if (!tela) return;
    medir();
    const indice = telas.indexOf(tela);
    const destino = medidas.telas[indice];
    if (!destino) return;
    evento.preventDefault();
    // Vindo da narrativa, pula direto: deslizar por ela trocaria cena por cena.
    if (telaDaPosicao(medidas, window.scrollY) === null) pularPara(destino.topo);
    else deslizarPara(destino.topo);
    window.history.replaceState(null, "", `#${id}`);
    const foco = alvo.matches("a[href], button, input, select, textarea, summary, [tabindex]") ? alvo : tela;
    if (!foco.hasAttribute("tabindex") && foco === tela) foco.tabIndex = -1;
    foco.focus({ preventScroll: true });
  };

  /** Tab para dentro de uma tela que cabe na janela: ela encaixa inteira. */
  const aoFocar = (evento: FocusEvent) => {
    if (!ativo || deslize !== null) return;
    const tela = evento.target instanceof Element ? evento.target.closest<HTMLElement>(SELETOR_DAS_TELAS) : null;
    if (!tela) return;
    window.requestAnimationFrame(() => {
      medir();
      const indice = telas.indexOf(tela);
      if (indice < 0 || !cabeNaJanela(medidas, indice)) return;
      const topo = medidas.telas[indice]!.topo;
      if (Math.abs(window.scrollY - topo) > 2) pularPara(topo);
    });
  };

  /** Rolagem solta que parou no meio de duas telas (inércia do dedo, barra): encaixa. */
  let espera: number | undefined;
  const aoRolar = () => {
    if (!ativo || deslize !== null) return;
    window.clearTimeout(espera);
    espera = window.setTimeout(() => {
      if (!ativo || deslize !== null || tocando) return;
      medir();
      const destino = ajusteDaPosicao(medidas, window.scrollY);
      if (destino !== null) deslizarPara(destino, DURACAO_DO_ACERTO);
    }, 180);
  };

  // --- ligar, medir de novo, desligar ---------------------------------------------------

  const decidir = () => {
    ativo = alturaQueLiga.matches;
    if (ativo) medir();
    else pararDeslize();
  };

  let quadroDeMedida: number | null = null;
  const remedir = () => {
    if (quadroDeMedida !== null) return;
    quadroDeMedida = window.requestAnimationFrame(() => {
      quadroDeMedida = null;
      if (ativo) medir();
    });
  };
  // Seção que muda de altura (resposta aberta, a conta da seção de mercado).
  const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remedir);
  decidir();
  for (const tela of raiz.querySelectorAll<HTMLElement>(SELETOR_DAS_TELAS)) observador?.observe(tela);
  const rodape = document.querySelector<HTMLElement>(SELETOR_DO_RODAPE);
  if (rodape) observador?.observe(rodape);
  void document.fonts?.ready.then(remedir);

  window.addEventListener("wheel", aoRodar, { passive: false });
  window.addEventListener("touchstart", aoTocar, { passive: true });
  window.addEventListener("touchmove", aoArrastar, { passive: false });
  window.addEventListener("touchend", aoSoltar, { passive: true });
  window.addEventListener("touchcancel", aoSoltar, { passive: true });
  window.addEventListener("keydown", aoTeclar);
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", decidir);
  window.addEventListener("load", remedir);
  document.addEventListener("click", aoClicar);
  raiz.addEventListener("focusin", aoFocar);

  return () => {
    pararDeslize();
    window.clearTimeout(espera);
    if (quadroDeMedida !== null) window.cancelAnimationFrame(quadroDeMedida);
    observador?.disconnect();
    window.removeEventListener("wheel", aoRodar);
    window.removeEventListener("touchstart", aoTocar);
    window.removeEventListener("touchmove", aoArrastar);
    window.removeEventListener("touchend", aoSoltar);
    window.removeEventListener("touchcancel", aoSoltar);
    window.removeEventListener("keydown", aoTeclar);
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", decidir);
    window.removeEventListener("load", remedir);
    document.removeEventListener("click", aoClicar);
    raiz.removeEventListener("focusin", aoFocar);
  };
}

/** As entradas das seções de baixo (só as `section[data-tela]`; as outras têm as suas). */
export function montarEntradasDasTelas(raiz: HTMLElement): () => void {
  const telas = [...raiz.querySelectorAll<HTMLElement>("section[data-tela]")];
  if (telas.length === 0 || typeof IntersectionObserver === "undefined") return () => {};

  const chegar = (tela: HTMLElement, direto: boolean) => {
    if (tela.hasAttribute("data-chegou")) return;
    if (direto) tela.setAttribute("data-direto", "");
    tela.setAttribute("data-chegou", "");
    observador.unobserve(tela);
  };

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (entrada.isIntersecting) chegar(entrada.target as HTMLElement, false);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -12% 0px" },
  );

  for (const tela of telas) {
    const caixa = tela.getBoundingClientRect();
    // Já na tela ao carregar (recarga no meio da página): fica como está.
    if (caixa.top < window.innerHeight * 0.8 && caixa.bottom > 0) continue;
    tela.setAttribute("data-armado", "");
    observador.observe(tela);
  }

  const aoFocar = (evento: FocusEvent) => {
    const tela = evento.target instanceof Element ? evento.target.closest<HTMLElement>("section[data-tela][data-armado]") : null;
    if (tela) chegar(tela, true);
  };
  raiz.addEventListener("focusin", aoFocar);

  return () => {
    observador.disconnect();
    raiz.removeEventListener("focusin", aoFocar);
    for (const tela of telas) {
      tela.removeAttribute("data-armado");
      tela.removeAttribute("data-chegou");
      tela.removeAttribute("data-direto");
    }
  };
}

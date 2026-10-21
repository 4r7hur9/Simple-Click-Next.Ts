/**
 * O modo slide da narrativa (cenas/Cenas.tsx + cenas.css): uma rolada, uma
 * cena. Chamado pela NarrativaDaLanding depois que o GSAP chega (import()).
 *
 * O palco gruda na tela por CSS; aqui:
 *
 * 1. A ENTRADA: roda do mouse e trackpad (com o detector de gesto, que
 *    engole a inércia do Mac), toque (arrasto vertical), teclado (setas,
 *    PageUp/PageDown, Espaço), bolinhas do indicador e âncoras do menu. Cada
 *    gesto vira "cena seguinte" ou "cena anterior"; a página pula para a
 *    posição exata da cena (o palco grudado não se mexe, então o pulo não se
 *    vê) e a coreografia anda. A barra de rolagem e a busca do navegador
 *    também funcionam: a cena acompanha a posição.
 * 2. A COREOGRAFIA: o texto sai por linha (atrás de máscara) e o da cena nova
 *    sobe; o celular troca de tela, sai de lado para o notebook entrar e
 *    volta inclinado nos ramos; o hambúrguer encaixa na foto do cardápio; a
 *    luz do fundo muda de lugar. Só transform e opacity.
 * 3. A SAÍDA: depois da última cena a página DESLIZA (1 s, mesma curva) até a
 *    seção seguinte, e dali a rolagem é a do navegador. Rolando de volta, o
 *    primeiro gesto que toca o palco o traz inteiro de volta.
 *
 * Se o texto de alguma cena não cabe no palco (tela baixa), a narrativa passa
 * para o modo comum (`data-modo="fluxo"`): blocos empilhados, sem segurar a
 * rolagem.
 */
import type gsapPadrao from "gsap";
import type { SplitText as SplitTextPadrao } from "gsap/SplitText";

import {
  cenaDaPosicao,
  criarDetectorDeGesto,
  destinoDoGesto,
  direcaoDaTecla,
  direcaoDoToque,
  posicaoDaCena,
  seguraOGesto,
  zonaDaPosicao,
  type Direcao,
  type MedidasDaNarrativa,
} from "./navegacao-por-cenas.ts";
import { TELAS_DO_APP } from "./telas-do-app.ts";

type Gsap = typeof gsapPadrao;
type Linha = gsap.core.Timeline;

/** A troca de cena: ~1 s, com a curva de entrada e saída lenta. */
const DURACAO = 1;
const CURVA = "power3.inOut";

/** Onde está o celular em cada cena: de frente, fora (notebook) ou inclinado. */
type Pose = "heroi" | "fora" | "ramo";
const POSE: readonly Pose[] = ["heroi", "heroi", "heroi", "fora", "fora", "ramo", "ramo"];
/** A tela do celular em cada cena (no pedido, a primeira da sequência). */
const TELA_DO_CELULAR = ["loja", "cardapio", "produto", null, null, "produto", "produto-autopecas"] as const;
const TELA_DO_NOTEBOOK = [null, null, null, "painel-pedidos", "painel-metricas", null, null] as const;
/** As duas luzes do fundo (centro, em fração do palco) em cada cena. */
const LUZES: readonly (readonly [number, number, number, number])[] = [
  [0.72, 0.28, 0.12, 0.92],
  [0.8, 0.5, 0.2, 0.2],
  [0.7, 0.72, 0.08, 0.4],
  [0.56, 0.38, 0.9, 0.9],
  [0.42, 0.6, 0.96, 0.18],
  [0.82, 0.42, 0.1, 0.86],
  [0.66, 0.3, 0.18, 0.8],
];

const CENA_DO_PEDIDO = 2;

/** No celular, o menor tamanho do aparelho para caber embaixo do texto. */
const ESCALA_MINIMA_NO_CELULAR = 0.72;

export function montarCenasEmSlide({
  gsap,
  SplitText,
  narrativa,
}: {
  readonly gsap: Gsap;
  readonly SplitText: typeof SplitTextPadrao;
  readonly narrativa: HTMLElement;
}): () => void {
  const palco = narrativa.querySelector<HTMLElement>(".sc-lp-narrativa__palco");
  const cenas = [...narrativa.querySelectorAll<HTMLElement>(".sc-lp-momento")];
  if (!palco || cenas.length === 0) return () => {};
  const total = cenas.length;

  const pontos = [...narrativa.querySelectorAll<HTMLAnchorElement>(".sc-lp-indicador__ponto")];
  const progresso = narrativa.querySelector<HTMLElement>(".sc-lp-indicador__progresso");
  const contagem = narrativa.querySelector<HTMLElement>("[data-contagem]");
  const aparelhos = narrativa.querySelector<HTMLElement>(".sc-lp-narrativa__aparelhos");
  const composicao = narrativa.querySelector<HTMLElement>(".sc-lp-composicao--palco");
  const celular = composicao?.querySelector<HTMLElement>(".sc-lp-celular") ?? null;
  const visor = celular?.querySelector<HTMLElement>(".sc-lp-tela") ?? null;
  const voa = composicao?.querySelector<HTMLElement>(".sc-lp-produto--voa") ?? null;
  const [ramoComida, ramoPeca] = composicao
    ? [...composicao.querySelectorAll<HTMLElement>(".sc-lp-produto--ramo")]
    : [];
  const vagaDoNotebook = narrativa.querySelector<HTMLElement>(".sc-lp-narrativa__vaga--notebook");
  const notebook = vagaDoNotebook?.querySelector<HTMLElement>(".sc-lp-notebook") ?? null;
  const tampa = notebook?.querySelector<HTMLElement>(".sc-lp-notebook__tampa") ?? null;
  const luzes = [...narrativa.querySelectorAll<HTMLElement>(".sc-lp-narrativa__luz")];
  const linhasDoFundo = narrativa.querySelector<HTMLElement>(".sc-lp-narrativa__linhas");
  const etapas = [...cenas[CENA_DO_PEDIDO]!.querySelectorAll<HTMLElement>("[data-etapa]")];

  let ativo = false;
  let atual = 0;
  let medidas: MedidasDaNarrativa = { inicio: 0, passo: 1, total };
  let contexto: gsap.Context | null = null;
  let transicao: Linha | null = null;
  let sequencia: Linha | null = null;
  let deslize: gsap.core.Tween | null = null;
  /** Até quando (performance.now) uma troca está correndo. */
  let ocupadoAte = 0;
  /** A tela visível de cada aparelho. */
  const telaAtual = new Map<HTMLElement, string>();
  let animacoesCssSoltas = false;
  /** Depois de sair do palco, o resto do mesmo gesto (a inércia) é engolido. */
  let engolirOResto = false;
  const detector = criarDetectorDeGesto();

  // --- medidas e modo -----------------------------------------------------------

  const medir = () => {
    const topo = Number.parseFloat(getComputedStyle(palco).top) || 0;
    const inicio = narrativa.getBoundingClientRect().top + window.scrollY - topo;
    medidas = { inicio: Math.max(0, Math.round(inicio)), passo: palco.offsetHeight, total };
  };

  /** O CSS liga o palco (sticky); aqui confere se o texto de cada cena cabe nele. */
  const decidirModo = (): boolean => {
    narrativa.removeAttribute("data-modo");
    if (getComputedStyle(palco).position !== "sticky") return false;
    const altura = palco.clientHeight;
    const cabe = cenas.every((cena) => {
      const texto = cena.querySelector<HTMLElement>(".sc-lp-momento__texto");
      const ultimo = texto?.lastElementChild;
      if (!texto || !(ultimo instanceof HTMLElement)) return true;
      // offsetTop/offsetHeight ignoram transformações (a entrada do herói
      // ainda pode estar correndo): é a altura do conteúdo parado.
      const conteudo = ultimo.offsetTop + ultimo.offsetHeight - texto.offsetTop;
      // No celular o CSS limita a altura do texto (o aparelho fica embaixo).
      const teto = Number.parseFloat(getComputedStyle(texto).maxBlockSize);
      return conteudo <= Math.min(Number.isNaN(teto) ? Infinity : teto + 4, altura - 16);
    });
    if (!cabe) narrativa.setAttribute("data-modo", "fluxo");
    return cabe;
  };

  // --- peças da coreografia -----------------------------------------------------

  /** O que entra e sai em cada cena, na ordem: linhas (com máscara) e blocos. */
  const partes = (cena: HTMLElement) => {
    const linhas: HTMLElement[] = [];
    const blocos: HTMLElement[] = [];
    const texto = cena.querySelector<HTMLElement>(".sc-lp-momento__texto");
    for (const filho of texto ? [...texto.children] : []) {
      if (!(filho instanceof HTMLElement)) continue;
      const mascaradas = filho.matches("h1")
        ? filho.querySelectorAll<HTMLElement>(".sc-lp-linha > span")
        : filho.querySelectorAll<HTMLElement>(".sc-lp-linha-dividida");
      if (mascaradas.length > 0) linhas.push(...mascaradas);
      else blocos.push(filho);
    }
    return { linhas, blocos };
  };

  /** A entrada do herói é CSS; antes da primeira troca, ela sai do caminho. */
  const soltarAnimacoesCss = () => {
    if (animacoesCssSoltas) return;
    animacoesCssSoltas = true;
    const animados = narrativa.querySelectorAll<HTMLElement>(
      '.sc-lp-momento[data-cena="0"] .sc-lp-momento__texto *, .sc-lp-produto--voa',
    );
    for (const elemento of animados) elemento.style.animation = "none";
  };

  const sairTexto = (linha: Linha, cena: HTMLElement, direcao: Direcao) => {
    const { linhas, blocos } = partes(cena);
    linha
      .to(linhas, { yPercent: -110 * direcao, duration: 0.4, ease: "power3.in", stagger: { amount: 0.08 } }, 0)
      .to(blocos, { y: -24 * direcao, autoAlpha: 0, duration: 0.34, ease: "power2.in", stagger: { amount: 0.08 } }, 0)
      // Só depois de tudo sair a cena nova entra: as duas nunca se cruzam.
      .set(cena, { opacity: 0, pointerEvents: "none" }, 0.49)
      .set([...linhas, ...blocos], { clearProps: "transform,opacity,visibility" }, 0.5);
  };

  const entrarTexto = (linha: Linha, cena: HTMLElement, direcao: Direcao, inicio: number) => {
    const { linhas, blocos } = partes(cena);
    linha
      .set(cena, { opacity: 1, pointerEvents: "auto" }, inicio)
      .fromTo(
        linhas,
        { yPercent: 110 * direcao },
        { yPercent: 0, duration: 0.7, ease: "power4.out", stagger: { amount: 0.18 } },
        inicio,
      )
      .fromTo(
        blocos,
        { y: 28 * direcao, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out", stagger: { amount: 0.16 } },
        inicio + 0.08,
      );
  };

  /** Troca a tela de um aparelho: "folha" sobe como no app; "fundir" funde. */
  const mostrarTela = (
    linha: Linha,
    aparelho: HTMLElement | null,
    nome: string,
    { quando, jeito }: { readonly quando: number; readonly jeito: "folha" | "fundir" | "ja" },
  ) => {
    if (!aparelho || telaAtual.get(aparelho) === nome) return;
    const imagens = [...aparelho.querySelectorAll<HTMLElement>(".sc-lp-tela__imagem")];
    const alvo = imagens.find((imagem) => imagem.dataset["tela"] === nome);
    if (!alvo) return;
    const outras = imagens.filter((imagem) => imagem !== alvo);
    telaAtual.set(aparelho, nome);
    linha.set(outras, { zIndex: 1 }, quando).set(alvo, { zIndex: 2 }, quando);
    if (jeito === "ja") {
      linha.set(alvo, { autoAlpha: 1, yPercent: 0, scale: 1 }, quando).set(outras, { autoAlpha: 0 }, quando);
      return;
    }
    const duracao = jeito === "folha" ? 0.55 : 0.6;
    linha
      .fromTo(
        alvo,
        jeito === "folha" ? { autoAlpha: 1, yPercent: 100, scale: 1 } : { autoAlpha: 0, yPercent: 0, scale: 1.04 },
        { autoAlpha: 1, yPercent: 0, scale: 1, duration: duracao, ease: jeito === "folha" ? "power3.inOut" : "power2.out" },
        quando,
      )
      .set(outras, { autoAlpha: 0 }, quando + duracao);
  };

  /** Para onde o hambúrguer voa: a foto do cartão do cardápio, medida no print. */
  const destinoDoHamburguer = () => {
    if (!composicao || !visor || !voa) return { x: 0, y: 0, escala: 1 };
    const foto = TELAS_DO_APP.cardapio.foto;
    const caixa = composicao.getBoundingClientRect();
    const vidro = visor.getBoundingClientRect();
    const larguraDoCartao = foto.largura * vidro.width;
    // Na foto do cartão, o hambúrguer ocupa ~102% da largura e começa a ~14%
    // do topo (foto quadrada recortada pelo cartão em pé).
    const largura = larguraDoCartao * 1.02;
    // As medidas da tela vêm em px da janela; o hambúrguer anda em px da
    // composição, que no celular pode estar encolhida (encostarAparelhos).
    const escalaDaCena = composicao.offsetWidth > 0 ? caixa.width / composicao.offsetWidth : 1;
    return {
      x: (vidro.left - caixa.left + foto.x * vidro.width + (larguraDoCartao - largura) / 2) / escalaDaCena - voa.offsetLeft,
      y: (vidro.top - caixa.top + foto.y * vidro.height + foto.altura * vidro.height * 0.145) / escalaDaCena - voa.offsetTop,
      escala: largura / escalaDaCena / voa.offsetWidth,
    };
  };

  const marcarEtapa = (indice: number) => {
    etapas.forEach((etapa, i) => etapa.toggleAttribute("data-ativa", i === indice));
  };

  /** No pedido, as telas andam sozinhas: produto → sacola → fechamento. */
  const comecarPedido = (atraso: number) => {
    marcarEtapa(0);
    const linha = gsap.timeline({ delay: atraso });
    linha.call(() => marcarEtapa(1), [], 0.05);
    mostrarTela(linha, celular, "sacola", { quando: 0, jeito: "folha" });
    linha.call(() => marcarEtapa(2), [], 1.45);
    mostrarTela(linha, celular, "fechamento", { quando: 1.4, jeito: "folha" });
    sequencia = linha;
  };

  const coreografarCelular = (linha: Linha, de: number, para: number, direcao: Direcao) => {
    if (!composicao || !celular) return;
    const antes = POSE[de]!;
    const depois = POSE[para]!;
    const tela = TELA_DO_CELULAR[para];
    const entrar = (quando: number) => {
      linha.call(() => celular.classList.toggle("sc-lp-iphone--esquerda", depois === "ramo"), [], quando);
      if (tela) mostrarTela(linha, celular, tela, { quando, jeito: "ja" });
      linha.fromTo(
        composicao,
        { xPercent: 22 * direcao, yPercent: 4, rotationY: -26 * direcao, scale: 0.86, autoAlpha: 0 },
        { xPercent: 0, yPercent: 0, rotationY: 0, scale: 1, autoAlpha: 1, duration: 0.9, ease: "power3.out" },
        quando,
      );
    };
    const sair = (duracao: number) => {
      linha.to(
        composicao,
        { xPercent: -24 * direcao, yPercent: 4, rotationY: 28 * direcao, scale: 0.84, autoAlpha: 0, duration: duracao, ease: "power2.in" },
        0,
      );
    };

    if (antes === depois) {
      // Avançando para a vitrine ou para o pedido, a tela sobe como no app.
      const folha = (para === 1 && de === 0) || para === CENA_DO_PEDIDO;
      if (tela) mostrarTela(linha, celular, tela, { quando: 0.2, jeito: folha ? "folha" : "fundir" });
    } else if (depois === "fora") {
      sair(0.45);
    } else if (antes === "fora") {
      entrar(0.4);
    } else {
      // De frente para inclinado (ou o contrário), pulando cenas: sai e volta.
      sair(0.45);
      entrar(0.45);
    }

    // O hambúrguer do herói: encaixa na foto do cardápio, ou volta dela.
    if (voa) {
      if (para === 0) {
        // Da vitrine, ele sai da foto do cartão e volta; de longe, reaparece.
        if (de === 1) linha.set(voa, { autoAlpha: 1 }, 0);
        else linha.fromTo(voa, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.3);
        linha
          .to(voa, { x: 0, y: 0, scale: 1, duration: 0.95, ease: CURVA }, de === 1 ? 0 : 0.3)
          .to(voa.querySelector(".sc-lp-produto__sombra"), { opacity: 0.95, duration: 0.4 }, 0.6);
      } else if (para === 1 && de === 0) {
        gsap.set(voa, { transformOrigin: "0 0" });
        linha
          .to(voa, { x: () => destinoDoHamburguer().x, y: () => destinoDoHamburguer().y, scale: () => destinoDoHamburguer().escala, duration: 0.95, ease: CURVA }, 0)
          .to(voa.querySelector(".sc-lp-produto__sombra"), { opacity: 0, duration: 0.35 }, 0)
          .to(voa, { autoAlpha: 0, duration: 0.15 }, 0.9);
      } else if (de === 0) {
        linha.to(voa, { autoAlpha: 0, y: 40, scale: 0.92, duration: 0.4, ease: "power2.in" }, 0);
      }
    }

    // Os produtos dos ramos: o hambúrguer sai, a autopeça entra.
    const produtoDaCena = para === 5 ? ramoComida : para === 6 ? ramoPeca : null;
    const produtoDeAntes = de === 5 ? ramoComida : de === 6 ? ramoPeca : null;
    if (produtoDeAntes && produtoDeAntes !== produtoDaCena) {
      linha.to(produtoDeAntes, { autoAlpha: 0, y: -48 * direcao, scale: 0.92, duration: 0.45, ease: "power2.in" }, 0);
    }
    if (produtoDaCena && produtoDaCena !== produtoDeAntes) {
      linha.fromTo(
        produtoDaCena,
        { autoAlpha: 0, y: 56 * direcao, scale: 0.9 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" },
        antes === depois ? 0.35 : 0.55,
      );
    }
  };

  const coreografarNotebook = (linha: Linha, de: number, para: number, direcao: Direcao) => {
    if (!vagaDoNotebook || !notebook) return;
    const estava = TELA_DO_NOTEBOOK[de] !== null;
    const tela = TELA_DO_NOTEBOOK[para];
    if (tela && !estava) {
      mostrarTela(linha, notebook, tela, { quando: 0, jeito: "ja" });
      linha
        .fromTo(
          vagaDoNotebook,
          { autoAlpha: 0, xPercent: 14 * direcao, yPercent: 6, rotationY: -12 * direcao, scale: 0.9, transformPerspective: 2400 },
          { autoAlpha: 1, xPercent: 0, yPercent: 0, rotationY: 0, scale: 1, duration: 0.95, ease: "power3.out" },
          0.4,
        )
        .fromTo(
          tampa,
          { rotationX: -78, transformPerspective: 2400, transformOrigin: "50% 100%" },
          { rotationX: 0, duration: 1.05, ease: "power3.out" },
          0.45,
        );
    } else if (tela) {
      mostrarTela(linha, notebook, tela, { quando: 0.2, jeito: "fundir" });
    } else if (estava) {
      linha
        .to(vagaDoNotebook, { autoAlpha: 0, xPercent: -14 * direcao, rotationY: 12 * direcao, scale: 0.9, duration: 0.45, ease: "power2.in" }, 0)
        .to(tampa, { rotationX: -50, duration: 0.45, ease: "power2.in" }, 0);
    }
  };

  const coreografarFundo = (linha: Linha, para: number) => {
    const [x, y, xFria, yFria] = LUZES[para] ?? LUZES[0]!;
    const largura = palco.clientWidth;
    const altura = palco.clientHeight;
    const [quente, fria] = luzes;
    // O CSS já põe as luzes no ponto do herói; aqui só o deslocamento.
    const [x0, y0, xFria0, yFria0] = LUZES[0]!;
    if (quente) linha.to(quente, { x: (x - x0) * largura, y: (y - y0) * altura, duration: 1.6, ease: "power2.inOut" }, 0);
    if (fria) linha.to(fria, { x: (xFria - xFria0) * largura, y: (yFria - yFria0) * altura, duration: 1.8, ease: "power2.inOut" }, 0);
    if (linhasDoFundo) linha.to(linhasDoFundo, { autoAlpha: para === 0 ? 1 : 0, duration: 0.8 }, 0);
  };

  /**
   * No celular o aparelho fica embaixo do texto: ele desliza até logo abaixo
   * do texto da cena (que muda de altura de uma cena para outra).
   */
  const noCelular = () => !window.matchMedia("(min-width: 900px)").matches;
  const encostarAparelhos = (linha: Linha, indice: number, quando: number) => {
    if (!aparelhos || !noCelular()) return;
    // A cena e a camada dos aparelhos começam no topo da mesma grade.
    const ultimo = cenas[indice]?.querySelector(".sc-lp-momento__texto")?.lastElementChild;
    if (!(ultimo instanceof HTMLElement)) return;
    const topo = ultimo.offsetTop + ultimo.offsetHeight + 24;
    const comNotebook = TELA_DO_NOTEBOOK[indice] !== null && notebook !== null;
    // O notebook é baixo: fica no meio do espaço que sobra, sem vazio embaixo.
    const sobra = comNotebook ? palco.clientHeight - topo - notebook.offsetHeight : 0;
    const y = topo + Math.max(0, sobra / 2) - aparelhos.offsetTop;
    // O celular encolhe para caber inteiro no que sobra embaixo do texto; só
    // abaixo de 72% (a tela ficaria pequena demais) ele passa a sair pela borda.
    const alturaDoCelular = composicao?.offsetHeight ?? 0;
    const livre = palco.clientHeight - topo - 16;
    const escala = comNotebook || alturaDoCelular === 0 ? 1 : Math.min(1, Math.max(ESCALA_MINIMA_NO_CELULAR, livre / alturaDoCelular));
    linha.to(aparelhos, { y, scale: escala, transformOrigin: "50% 0%", duration: 0.9, ease: CURVA }, quando);
  };

  const marcarIndicador = (indice: number) => {
    pontos.forEach((ponto, i) => {
      if (i === indice) ponto.setAttribute("aria-current", "step");
      else ponto.removeAttribute("aria-current");
    });
    // A cena ativa: só o gatilho do CSS que acende os destaques (cenas/tipografia.css).
    cenas.forEach((cena, i) => cena.toggleAttribute("data-atual", i === indice));
    if (progresso) progresso.style.transform = `scaleY(${total > 1 ? indice / (total - 1) : 1})`;
    if (contagem) contagem.textContent = String(indice + 1).padStart(2, "0");
  };

  // --- a troca de cena -----------------------------------------------------------

  const irPara = (destino: number, { instantaneo = false } = {}) => {
    const para = Math.min(Math.max(destino, 0), total - 1);
    if (para === atual && !instantaneo) return;
    if (para !== atual) soltarAnimacoesCss();
    const de = atual;
    atual = para;
    const direcao: Direcao = para >= de ? 1 : -1;

    // A troca anterior termina na hora: os estados ficam sempre coerentes.
    transicao?.progress(1, false);
    sequencia?.kill();
    sequencia = null;
    if (de === CENA_DO_PEDIDO) marcarEtapa(-1);

    contexto?.add(() => {
      const linha = gsap.timeline({ defaults: { immediateRender: false } });
      if (de !== para) {
        sairTexto(linha, cenas[de]!, direcao);
        entrarTexto(linha, cenas[para]!, direcao, 0.5);
        coreografarCelular(linha, de, para, direcao);
        coreografarNotebook(linha, de, para, direcao);
      }
      coreografarFundo(linha, para);
      encostarAparelhos(linha, para, de === para ? 0 : 0.3);
      transicao = linha;
    });
    marcarIndicador(para);
    if (para === CENA_DO_PEDIDO) contexto?.add(() => comecarPedido(instantaneo ? 0.4 : 1.1));
    if (instantaneo) transicao?.progress(1, false);
    ocupadoAte = performance.now() + (instantaneo ? 0 : DURACAO * 1000);
    detector.travarAte(ocupadoAte - 150);
  };

  /** A página no ponto exato da cena: o palco grudado não se mexe. */
  const pularPara = (y: number) => {
    window.scrollTo({ top: y, behavior: "instant" });
  };

  /** A saída e a volta: a página desliza de verdade, com a mesma curva. */
  const deslizarPara = (y: number) => {
    deslize?.kill();
    const estado = { y: window.scrollY };
    ocupadoAte = performance.now() + DURACAO * 1000;
    detector.travarAte(ocupadoAte - 100);
    deslize = gsap.to(estado, {
      y,
      duration: DURACAO,
      ease: CURVA,
      onUpdate: () => pularPara(estado.y),
      onComplete: () => {
        deslize = null;
      },
    });
  };

  const seguir = (direcao: Direcao) => {
    const destino = destinoDoGesto(medidas, window.scrollY, direcao, atual);
    if (!destino) return;
    if (destino.tipo === "cena") {
      irPara(destino.indice);
      pularPara(posicaoDaCena(medidas, destino.indice));
    } else if (destino.tipo === "sair") {
      engolirOResto = true;
      deslizarPara(destino.y);
    } else {
      irPara(destino.indice);
      deslizarPara(destino.y);
    }
  };

  const livre = () => deslize === null && performance.now() >= ocupadoAte - 150;

  // --- entradas ---------------------------------------------------------------------

  const aoRodar = (evento: WheelEvent) => {
    if (!ativo || evento.ctrlKey) return;
    if (Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;
    const escala = evento.deltaMode === 1 ? 32 : evento.deltaMode === 2 ? window.innerHeight : 1;
    const delta = evento.deltaY * escala;
    if (delta === 0) return;
    const segura = deslize !== null || seguraOGesto(medidas, window.scrollY, delta > 0 ? 1 : -1);
    const { disparo, novo } = detector.registrar(evento.timeStamp, delta, segura && deslize === null);
    if (novo) engolirOResto = false;
    if (!segura && !engolirOResto) return;
    evento.preventDefault();
    if (disparo !== 0 && deslize === null) seguir(disparo);
  };

  let toque: { readonly y: number } | null = null;
  const aoTocar = (evento: TouchEvent) => {
    toque = ativo && evento.touches.length === 1 ? { y: evento.touches[0]!.clientY } : null;
  };
  const aoArrastar = (evento: TouchEvent) => {
    if (!ativo || !toque || evento.touches.length !== 1) return;
    const distancia = toque.y - evento.touches[0]!.clientY;
    if (distancia === 0) return;
    if (deslize || seguraOGesto(medidas, window.scrollY, distancia > 0 ? 1 : -1)) {
      if (evento.cancelable) evento.preventDefault();
    }
  };
  const aoSoltar = (evento: TouchEvent) => {
    if (!ativo || !toque) return;
    const sentido = direcaoDoToque(toque.y, evento.changedTouches[0]?.clientY ?? toque.y);
    toque = null;
    if (sentido === 0 || !livre()) return;
    if (seguraOGesto(medidas, window.scrollY, sentido)) seguir(sentido);
  };

  const aoTeclar = (evento: KeyboardEvent) => {
    if (!ativo || evento.defaultPrevented || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const alvo = evento.target instanceof HTMLElement ? evento.target : null;
    const tipo = alvo?.closest("input, textarea, select, [contenteditable='true']")
      ? "texto"
      : alvo?.closest("button, summary, [role='button']")
        ? "controle"
        : "outro";
    const sentido = direcaoDaTecla(evento.key, { shift: evento.shiftKey, alvo: tipo });
    if (sentido === 0 || !seguraOGesto(medidas, window.scrollY, sentido)) return;
    evento.preventDefault();
    if (evento.repeat || !livre()) return;
    seguir(sentido);
  };

  /** Barra de rolagem, busca, Home/End: a cena acompanha a posição. */
  const aoRolar = () => {
    if (!ativo || deslize) return;
    const cena = cenaDaPosicao(medidas, window.scrollY);
    if (cena !== null && cena !== atual) irPara(cena);
  };

  /** Âncoras para as cenas (menu do topo, "Ver como funciona", bolinhas). */
  const aoClicar = (evento: MouseEvent) => {
    if (!ativo || evento.defaultPrevented || evento.button !== 0) return;
    const link = evento.target instanceof Element ? evento.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const id = link?.getAttribute("href")?.slice(1);
    const indice = id ? cenas.findIndex((cena) => cena.id === id) : -1;
    if (indice < 0) return;
    evento.preventDefault();
    deslize?.kill();
    deslize = null;
    irPara(indice);
    pularPara(posicaoDaCena(medidas, indice));
    // Quem veio do indicador continua nele; quem veio de outro link vai para a cena.
    if (!link?.closest(".sc-lp-indicador")) cenas[indice]!.focus({ preventScroll: true });
  };

  /** Tab para dentro de uma cena que não está na tela: ela vem. */
  const aoFocar = (evento: FocusEvent) => {
    if (!ativo) return;
    const cena = evento.target instanceof Element ? evento.target.closest<HTMLElement>(".sc-lp-momento") : null;
    const indice = cena ? cenas.indexOf(cena) : -1;
    if (indice < 0 || indice === atual) return;
    irPara(indice);
    pularPara(posicaoDaCena(medidas, indice));
  };

  // O ponteiro inclina os aparelhos de leve, como se estivessem na mão.
  const giros =
    aparelhos && window.matchMedia("(min-width: 900px)").matches
      ? {
          y: gsap.quickTo(aparelhos, "rotationY", { duration: 0.9, ease: "power3.out" }),
          x: gsap.quickTo(aparelhos, "rotationX", { duration: 0.9, ease: "power3.out" }),
        }
      : null;
  const aoMover = (evento: PointerEvent) => {
    if (!ativo || !giros || evento.pointerType !== "mouse") return;
    giros.y((evento.clientX / window.innerWidth - 0.5) * 6);
    giros.x(-(evento.clientY / window.innerHeight - 0.5) * 4);
  };

  // --- ligar e desligar o modo ------------------------------------------------------

  const ligar = () => {
    ativo = true;
    medir();
    contexto = gsap.context(() => {
      const linhas = { type: "lines", mask: "lines", linesClass: "sc-lp-linha-dividida", autoSplit: true } as const;
      for (const cena of cenas) {
        // Título: o SplitText põe a frase inteira no aria-label (o leitor não
        // lê linha por linha). Parágrafo não pode ter aria-label: ali as
        // linhas são só caixas em volta do mesmo texto, lido como sempre.
        const titulos = cena.querySelectorAll<HTMLElement>(".sc-lp-momento__titulo");
        const paragrafos = cena.querySelectorAll<HTMLElement>(".sc-lp-momento__texto-corrido, .sc-lp-heroi__texto");
        if (titulos.length > 0) SplitText.create(titulos, linhas);
        if (paragrafos.length > 0) SplitText.create(paragrafos, { ...linhas, aria: "none" });
      }
      if (aparelhos) gsap.set(aparelhos, { transformPerspective: 1600 });
    }, narrativa);
    for (const cena of cenas) cena.tabIndex = -1;
    telaAtual.clear();
    if (celular) telaAtual.set(celular, "loja");
    if (notebook) telaAtual.set(notebook, "painel-pedidos");

    // Chegou no meio da página (recarga, âncora): a cena certa, sem animação.
    const alvoDaAncora = cenas.findIndex((cena) => `#${cena.id}` === window.location.hash);
    const pelaPosicao =
      cenaDaPosicao(medidas, window.scrollY) ??
      (zonaDaPosicao(medidas, window.scrollY) === "antes" ? 0 : total - 1);
    const inicial = alvoDaAncora >= 0 ? alvoDaAncora : pelaPosicao;
    atual = 0;
    irPara(inicial, { instantaneo: true });
    if (alvoDaAncora >= 0) pularPara(posicaoDaCena(medidas, alvoDaAncora));
  };

  const desligar = () => {
    ativo = false;
    transicao?.kill();
    sequencia?.kill();
    deslize?.kill();
    transicao = sequencia = null;
    deslize = null;
    contexto?.revert();
    contexto = null;
    marcarEtapa(-1);
    marcarIndicador(0);
    celular?.classList.remove("sc-lp-iphone--esquerda");
    for (const cena of cenas) {
      cena.removeAttribute("tabindex");
      cena.removeAttribute("data-atual");
    }
  };

  let espera: number | undefined;
  const aoRedimensionar = () => {
    window.clearTimeout(espera);
    espera = window.setTimeout(() => {
      const deveLigar = decidirModo();
      if (deveLigar && !ativo) ligar();
      else if (!deveLigar && ativo) desligar();
      else if (ativo) {
        medir();
        const ajuste = gsap.timeline();
        coreografarFundo(ajuste, atual);
        encostarAparelhos(ajuste, atual, 0);
        if (aparelhos && !noCelular()) gsap.set(aparelhos, { y: 0, scale: 1 });
        ajuste.progress(1);
        if (zonaDaPosicao(medidas, window.scrollY) === "cenas") pularPara(posicaoDaCena(medidas, atual));
      }
    }, 150);
  };

  if (decidirModo()) ligar();
  // A fonte do título muda a altura do texto: confere de novo quando chega.
  let montado = true;
  void document.fonts?.ready.then(() => {
    if (montado) aoRedimensionar();
  });

  window.addEventListener("wheel", aoRodar, { passive: false });
  window.addEventListener("touchstart", aoTocar, { passive: true });
  window.addEventListener("touchmove", aoArrastar, { passive: false });
  window.addEventListener("touchend", aoSoltar, { passive: true });
  window.addEventListener("keydown", aoTeclar);
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", aoRedimensionar);
  window.addEventListener("pointermove", aoMover, { passive: true });
  document.addEventListener("click", aoClicar);
  narrativa.addEventListener("focusin", aoFocar);

  return () => {
    montado = false;
    window.clearTimeout(espera);
    window.removeEventListener("wheel", aoRodar);
    window.removeEventListener("touchstart", aoTocar);
    window.removeEventListener("touchmove", aoArrastar);
    window.removeEventListener("touchend", aoSoltar);
    window.removeEventListener("keydown", aoTeclar);
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", aoRedimensionar);
    window.removeEventListener("pointermove", aoMover);
    document.removeEventListener("click", aoClicar);
    narrativa.removeEventListener("focusin", aoFocar);
    if (ativo) desligar();
    narrativa.removeAttribute("data-modo");
  };
}

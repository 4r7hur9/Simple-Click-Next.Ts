/**
 * O mundo em três dimensões da landing: a receita subindo (AC-935). Linhas de
 * ramos diferentes crescem da esquerda para a direita conforme a página rola, com
 * um balão de pedidos no pico, como quem acompanha cotação. Peças em `mundo/`:
 * `series.ts` (dados e cor), `fita.ts` (malha com espessura), `etiquetas.ts` (HTML).
 *
 * DECISÕES QUE O DESENHO GUARDA:
 * - todas as linhas sobem, e a cor diz de QUEM é a linha, não se o número é bom:
 *   o fundo de uma página que vende não mostra negócio afundando;
 * - linhas, e não barras: área atrás do texto vira mancha, linha deixa ler por cima;
 * - um marcador só, no pico, e a legenda fixa à esquerda, casada pela cor;
 * - balões em HTML, e não no WebGL: texto em tela de desenho fica borrado e
 *   invisível para busca e leitor de tela;
 * - câmera ortográfica medindo em pixel: posição no mundo é posição na página, e
 *   "de ponta a ponta" é conta, não chute — em perspectiva, a largura visível
 *   dependeria da distância e as pontas sobrariam fora num celular deitado.
 *
 * NÃO É CONTEÚDO: a página conta a história sem ele, e na maioria dos aparelhos
 * ele nem é baixado — a decisão mora em `podeRodar3D.ts`, antes da importação.
 */
import * as THREE from "three";

import { querMovimentoReduzido } from "../../lib/narrativa.ts";
import {
  marcarPico,
  montarLegenda,
  type PicoMarcado,
} from "./mundo/etiquetas.ts";
import { construirFita } from "./mundo/fita.ts";
import {
  alturaDaSerie,
  corDoTema,
  PARADAS,
  SERIES,
  VALORES_DAS_CORES,
} from "./mundo/series.ts";

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/** A espessura da linha, em pixel. */
const ESPESSURA = 3;
/** A folga além da tela, para a linha entrar e sair cortada pela borda. */
const TRANSBORDO = 40;

export type DesmontarMundo = () => void;

/**
 * Monta o mundo dentro do elemento e devolve como desmontá-lo.
 *
 * O DESCARTE É OBRIGATÓRIO. O coletor de lixo do JavaScript não alcança memória
 * de vídeo: sem descartar geometria e material explicitamente, algumas
 * navegações enchem a placa e a aba morre — sem erro que aponte para cá.
 */
export function montarMundo(elemento: HTMLElement): DesmontarMundo {
  const cena = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

  const renderizador = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // o fundo é a luz da página; o mundo não pinta atrás de si
    powerPreference: "low-power",
  });
  renderizador.setPixelRatio(
    Math.min(window.devicePixelRatio, DENSIDADE_MAXIMA),
  );
  // Sem isto o plano de corte é ignorado em silêncio: o recorte por material
  // precisa ser ligado no renderizador.
  renderizador.localClippingEnabled = true;
  renderizador.domElement.className = "sc-lp__tela";
  elemento.append(renderizador.domElement);

  // A camada dos balões fica FORA da tela de desenho, para poder ter opacidade
  // própria: a tela é apagada de propósito, e um número apagado não se lê.
  const camadaDosBaloes = document.createElement("div");
  camadaDosBaloes.className = "sc-lp__baloes";
  elemento.append(camadaDosBaloes);

  /**
   * O CORTE QUE FAZ A LINHA CRESCER: um plano vertical, e o que está à direita
   * dele não é desenhado. Recortar por intervalo de índices só corta em vértice
   * inteiro, e a ponta andaria aos saltos; o plano corta no meio do traço.
   */
  const planoDaFrente = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

  const legenda = montarLegenda();
  elemento.append(legenda);

  const grupo = new THREE.Group();
  cena.add(grupo);

  const materiais = SERIES.map(
    (serie, indice) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(corDoTema(VALORES_DAS_CORES[indice] ?? "")),
        transparent: true,
        opacity: serie.opacidade,
        clippingPlanes: [planoDaFrente],
      }),
  );

  // As guias verticais, como as do papel milimetrado: elas dão ao olho as
  // paradas onde as linhas mudam de direção. Aqui `THREE.Line` serve, porque
  // guia FINA é o que se quer — o um pixel deixa de ser limitação e vira acerto.
  const materialDaGuia = new THREE.LineDashedMaterial({
    color: 0x8a8a8a,
    transparent: true,
    opacity: 0.28,
    dashSize: 5,
    gapSize: 7,
    clippingPlanes: [planoDaFrente],
  });

  let fitas: THREE.Mesh[] = [];
  let guias: THREE.LineSegments | null = null;
  /** Onde cada balão nasce, na horizontal, para saber quando revelá-lo. */
  let picos: PicoMarcado[] = [];

  const semMovimento = querMovimentoReduzido();

  /** Quanto da história já passou, de 0 a 1. */
  let progresso = 0;
  let avancoDesenhado = 0;

  /**
   * Refaz a geometria para o tamanho atual da tela.
   *
   * Em pixel, mudar de tamanho não é escalar: escalar engrossaria a linha junto,
   * e num monitor largo ela viraria uma faixa. Por isso a fita é reconstruída, e
   * a espessura continua a mesma em qualquer tela.
   */
  function remontar(): void {
    const largura = Math.max(elemento.clientWidth, 1);
    const altura = Math.max(elemento.clientHeight, 1);

    camera.left = 0;
    camera.right = largura;
    camera.top = altura;
    camera.bottom = 0;
    camera.updateProjectionMatrix();
    renderizador.setSize(largura, altura);

    for (const fita of fitas) {
      grupo.remove(fita);
      fita.geometry.dispose();
    }
    fitas = [];

    if (guias) {
      grupo.remove(guias);
      guias.geometry.dispose();
      guias = null;
    }

    camadaDosBaloes.replaceChildren();
    picos = [];

    // A faixa vertical que as linhas ocupam. Elas não vão até a borda de cima
    // nem de baixo: encostar no topo faz a linha parecer cortada pela janela em
    // vez de desenhada.
    const piso = altura * 0.16;
    const teto = altura * 0.84;
    const inicioX = -TRANSBORDO;
    const passo = (largura + TRANSBORDO * 2) / (PARADAS - 1);

    for (const [indice, serie] of SERIES.entries()) {
      const alturas = Array.from({ length: PARADAS }, (_, parada) =>
        alturaDaSerie(parada, serie.inicio, serie.fim, serie.fase),
      );
      const pontos = alturas.map(
        (altura01, parada) =>
          new THREE.Vector2(
            inicioX + parada * passo,
            piso + (teto - piso) * altura01,
          ),
      );

      const fita = new THREE.Mesh(
        construirFita(pontos, ESPESSURA),
        materiais[indice]!,
      );
      grupo.add(fita);
      fitas.push(fita);

      marcarPico({
        indice,
        alturas,
        pontos,
        alturaDaTela: altura,
        larguraDaTela: largura,
        camada: camadaDosBaloes,
        picos,
        semMovimento,
      });
    }

    const pontosDaGuia: number[] = [];
    for (let parada = 0; parada < PARADAS; parada += 1) {
      const x = inicioX + parada * passo;
      pontosDaGuia.push(x, altura * 0.06, -1, x, altura * 0.94, -1);
    }
    const geometriaDaGuia = new THREE.BufferGeometry();
    geometriaDaGuia.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pontosDaGuia, 3),
    );
    guias = new THREE.LineSegments(geometriaDaGuia, materialDaGuia);
    // Sem isto o tracejado não aparece: o material precisa da distância
    // acumulada de cada vértice para saber onde cortar o traço.
    guias.computeLineDistances();
    grupo.add(guias);
  }

  /** Guarda quanto da página já rolou; o desenho persegue esse número. */
  function aoRolar(): void {
    const rolavel = document.body.scrollHeight - window.innerHeight;
    progresso = rolavel > 0 ? Math.min(window.scrollY / rolavel, 1) : 0;
  }

  /** Um quadro: avança a frente das linhas, sobe o gráfico e revela os balões. */
  function desenhar(): void {
    // O avanço persegue o progresso da rolagem, em vez de saltar para ele: sem
    // a perseguição, uma rolagem rápida faria as linhas piscarem.
    avancoDesenhado += (progresso - avancoDesenhado) * 0.06;

    const largura = elemento.clientWidth;
    const altura = elemento.clientHeight;

    // A LINHA CRESCE DA ESQUERDA PARA A DIREITA conforme a página desce: é a
    // rolagem contando a passagem do tempo. Ela parte de perto do meio, para a
    // primeira tela, onde quase todo mundo fica, já ter gráfico e etiqueta.
    // Quem pediu menos movimento recebe o gráfico INTEIRO, que é o estado final.
    const partida = 0.42 * largura;
    const frente = semMovimento
      ? largura + TRANSBORDO
      : partida + avancoDesenhado * (largura + TRANSBORDO - partida);
    planoDaFrente.constant = frente;

    grupo.position.y = avancoDesenhado * altura * 0.12;

    // A CAMADA DAS ETIQUETAS ANDA JUNTO COM O GRÁFICO, senão o ponto que devia
    // estar no pico aparece pendurado abaixo dele. É um transform na camada
    // inteira, e não uma conta por marcador. O sinal é invertido porque o eixo
    // do mundo cresce para cima e o da página para baixo.
    camadaDosBaloes.style.transform = `translateY(${-grupo.position.y}px)`;

    // OS BALÕES SÓ NASCEM DEPOIS QUE A PONTA PASSA pelo seu pico, e é isso que
    // faz o número parecer resultado do crescimento. A folga o põe logo ATRÁS
    // da ponta: como numa cotação, o número fica onde o preço esteve.
    const folga = 70;
    for (const pico of picos) {
      pico.elemento.dataset["visivel"] =
        pico.x <= frente - folga ? "sim" : "nao";
    }

    renderizador.render(cena, camera);
  }

  /**
   * O laço PARA quando ninguém está vendo.
   *
   * Aba em segundo plano continua desenhando se ninguém mandar parar — e é onde
   * a bateria some sem explicação.
   */
  const observador = new IntersectionObserver(([entrada]) => {
    renderizador.setAnimationLoop(entrada?.isIntersecting ? desenhar : null);
  });
  observador.observe(elemento);

  // O tema pode virar com a pessoa na página — pelo sistema, ou pelo botão. Sem
  // isto, a cor do tema anterior ficaria pintada até a próxima navegação.
  const temaEscuro = window.matchMedia("(prefers-color-scheme: dark)");
  const repintar = (): void => {
    for (const [indice, material] of materiais.entries()) {
      material.color.set(corDoTema(VALORES_DAS_CORES[indice] ?? ""));
    }
  };
  temaEscuro.addEventListener("change", repintar);

  remontar();
  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", remontar);

  return () => {
    renderizador.setAnimationLoop(null);
    observador.disconnect();
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", remontar);
    temaEscuro.removeEventListener("change", repintar);

    for (const fita of fitas) fita.geometry.dispose();
    guias?.geometry.dispose();
    for (const material of materiais) material.dispose();
    materialDaGuia.dispose();
    renderizador.dispose();
    renderizador.domElement.remove();
    camadaDosBaloes.remove();
    legenda.remove();
  };
}

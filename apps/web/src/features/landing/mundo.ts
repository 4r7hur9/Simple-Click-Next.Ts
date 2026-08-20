/**
 * O mundo em três dimensões da landing: rotas de entrega (AC-935).
 *
 * O QUE ELE MOSTRA: a loja no centro, e entregas se abrindo para o bairro. As
 * rotas se desenham conforme a pessoa rola — e é isso que o produto faz com o
 * negócio de quem chega aqui: transforma um balcão numa loja que alcança gente.
 *
 * DUAS VERSÕES ANTERIORES FORAM DESCARTADAS, e o motivo é o mesmo. Primeiro
 * cubos: forma abstrata não fala com quem vende pastel. Depois comandas de
 * papel: coerentes com o negócio, mas em opacidade baixa e desfocadas por trás
 * do texto elas perdiam a proporção e liam como quadrados. Linha e ponto se
 * leem em qualquer opacidade — é a forma mais fina que ainda tem significado.
 *
 * O QUE ELE NÃO É: conteúdo. A página conta a história inteira sem ele, e na
 * maioria dos aparelhos ele nem é baixado — a decisão mora em `podeRodar3D.ts`
 * e acontece antes da importação. Quem chega pelo celular vê a luz de fundo, que
 * é de CSS e chega a todo mundo.
 *
 * ORÇAMENTO, do documento `mundo-3d.md` da skill: nada de textura, nada de
 * modelo externo. Duas chamadas de desenho no total — uma para os destinos, uma
 * para as rotas.
 */
import * as THREE from "three";

import { ouvirCor } from "../../lib/cor-da-landing.ts";

/** Quantos destinos a loja alcança. */
const DESTINOS = 22;

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/** Cor de reserva, até a pessoa escolher a dela. */
const COR_DE_RESERVA = 0x1a4fd6;

export type DesmontarMundo = () => void;

/**
 * Onde cada destino fica.
 *
 * Determinístico de propósito: o mesmo desenho a cada carregamento faz o fundo
 * ser composto, e não sorteado. O ângulo áureo distribui sem agrupar, que é o
 * que impede as rotas de virarem um leque.
 */
function posicaoDoDestino(indice: number): THREE.Vector3 {
  const angulo = indice * 2.39996;
  const raio = 2.2 + (indice % 7) * 0.95;
  return new THREE.Vector3(
    Math.cos(angulo) * raio,
    Math.sin(angulo) * raio * 0.62,
    ((indice % 5) - 2) * 0.55,
  );
}

/**
 * Monta o mundo dentro do elemento e devolve como desmontá-lo.
 *
 * O DESCARTE É OBRIGATÓRIO. O coletor de lixo do JavaScript não alcança memória
 * de vídeo: sem descartar geometria e material explicitamente, cinco navegações
 * enchem a placa e a aba morre — sem erro que aponte para cá.
 */
export function montarMundo(elemento: HTMLElement): DesmontarMundo {
  const cena = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    50,
    elemento.clientWidth / Math.max(elemento.clientHeight, 1),
    0.1,
    100,
  );
  camera.position.set(0, 0, 12);

  const renderizador = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // o fundo é a luz da página; o mundo não pinta atrás de si
    powerPreference: "low-power",
  });
  renderizador.setPixelRatio(
    Math.min(window.devicePixelRatio, DENSIDADE_MAXIMA),
  );
  renderizador.setSize(elemento.clientWidth, elemento.clientHeight);
  elemento.append(renderizador.domElement);

  const centro = new THREE.Vector3(0, 0, 0);
  const destinos = Array.from({ length: DESTINOS }, (_, i) =>
    posicaoDoDestino(i),
  );

  // --- as rotas ---
  //
  // UM objeto de linhas para todas as rotas. Uma linha por rota daria vinte e
  // duas chamadas de desenho para desenhar vinte e dois segmentos — o mesmo
  // resultado, vinte e duas vezes mais caro.
  const pontosDaRota = new Float32Array(DESTINOS * 2 * 3);
  const geometriaDasRotas = new THREE.BufferGeometry();
  geometriaDasRotas.setAttribute(
    "position",
    new THREE.BufferAttribute(pontosDaRota, 3),
  );
  const materialDasRotas = new THREE.LineBasicMaterial({
    color: COR_DE_RESERVA,
    transparent: true,
    opacity: 0.55,
  });
  const rotas = new THREE.LineSegments(geometriaDasRotas, materialDasRotas);
  cena.add(rotas);

  // --- os destinos ---
  const pontosDosDestinos = new Float32Array(DESTINOS * 3);
  const geometriaDosDestinos = new THREE.BufferGeometry();
  geometriaDosDestinos.setAttribute(
    "position",
    new THREE.BufferAttribute(pontosDosDestinos, 3),
  );
  const materialDosDestinos = new THREE.PointsMaterial({
    color: COR_DE_RESERVA,
    size: 0.16,
    transparent: true,
    opacity: 0.85,
    // Sem atenuação por distância: os pontos do fundo somem, e a malha fica
    // desequilibrada de um lado.
    sizeAttenuation: true,
  });
  const marcas = new THREE.Points(geometriaDosDestinos, materialDosDestinos);
  cena.add(marcas);

  /** Quanto da história já passou, de 0 a 1. */
  let progresso = 0;

  function aoRolar(): void {
    const rolavel = document.body.scrollHeight - window.innerHeight;
    progresso = rolavel > 0 ? Math.min(window.scrollY / rolavel, 1) : 0;
  }

  function aoRedimensionar(): void {
    const largura = elemento.clientWidth;
    const altura = Math.max(elemento.clientHeight, 1);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    renderizador.setSize(largura, altura);
  }

  // A COR SEGUE A ESCOLHA DA PESSOA. Sem isto, ela move a paleta e o fundo
  // continua azul — como se a escolha não valesse nada.
  const pararDeOuvirCor = ouvirCor((cor) => {
    materialDasRotas.color.set(cor);
    materialDosDestinos.color.set(cor);
  });

  const ponta = new THREE.Vector3();
  let avancoDesenhado = 0;

  function desenhar(): void {
    // O avanço persegue o progresso da rolagem, em vez de saltar para ele: sem
    // a perseguição, uma rolagem rápida faria as rotas piscarem de um extremo
    // ao outro.
    avancoDesenhado += (progresso - avancoDesenhado) * 0.06;

    for (let i = 0; i < DESTINOS; i += 1) {
      const destino = destinos[i];
      if (destino === undefined) continue;

      // Cada rota sai do centro e cresce até o destino. As de fora começam
      // depois: a loja alcança o vizinho antes de alcançar o bairro.
      const atrasoDaRota = (i / DESTINOS) * 0.45;
      const avancoDaRota = Math.max(
        0,
        Math.min((avancoDesenhado - atrasoDaRota) / (1 - atrasoDaRota), 1),
      );
      ponta.copy(centro).lerp(destino, avancoDaRota);

      const rota = i * 6;
      pontosDaRota[rota] = centro.x;
      pontosDaRota[rota + 1] = centro.y;
      pontosDaRota[rota + 2] = centro.z;
      pontosDaRota[rota + 3] = ponta.x;
      pontosDaRota[rota + 4] = ponta.y;
      pontosDaRota[rota + 5] = ponta.z;

      const marca = i * 3;
      pontosDosDestinos[marca] = ponta.x;
      pontosDosDestinos[marca + 1] = ponta.y;
      pontosDosDestinos[marca + 2] = ponta.z;
    }

    geometriaDasRotas.attributes["position"]!.needsUpdate = true;
    geometriaDosDestinos.attributes["position"]!.needsUpdate = true;

    // Um giro lento dá profundidade sem pedir atenção. Ele é o único movimento
    // que continua quando ninguém rola.
    cena.rotation.y = Math.sin(avancoDesenhado * Math.PI) * 0.28;
    cena.rotation.x = avancoDesenhado * 0.12;

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

  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", aoRedimensionar);

  return () => {
    renderizador.setAnimationLoop(null);
    observador.disconnect();
    pararDeOuvirCor();
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", aoRedimensionar);

    geometriaDasRotas.dispose();
    geometriaDosDestinos.dispose();
    materialDasRotas.dispose();
    materialDosDestinos.dispose();
    renderizador.dispose();
    renderizador.domElement.remove();
  };
}

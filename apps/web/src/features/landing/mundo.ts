/**
 * O mundo em três dimensões da landing (AC-935).
 *
 * O QUE ELE MOSTRA: comandas de pedido chegando e se organizando. Começam
 * espalhadas e giradas, como o papel que se acumula no balcão, e acabam
 * empilhadas e alinhadas conforme a pessoa rola. É a mesma coisa que o produto
 * faz com o dia do dono, e é por isso que o 3D se paga NESTA página: ele é o
 * argumento, e não enfeite.
 *
 * A PRIMEIRA VERSÃO ERAM CUBOS. Estavam corretos e não diziam nada: forma
 * abstrata não fala com quem vende pastel, e ainda disputava a leitura do texto
 * que passava por cima. Agora as peças são retangulares e finas, na proporção de
 * um papel — e a folha da landing as deixa em opacidade baixa, como atmosfera.
 *
 * O QUE ELE NÃO É: conteúdo. A página conta a história inteira sem ele, e na
 * maioria dos aparelhos ele nem é baixado — a decisão mora em `podeRodar3D.ts`
 * e acontece antes da importação.
 *
 * ORÇAMENTO, do documento `mundo-3d.md` da skill: nada de textura, nada de
 * modelo externo, geometria simples reaproveitada. O peso é o do próprio
 * Three.js, e nenhum recurso extra viaja pela rede.
 */
import * as THREE from "three";

/** Quantas comandas. Poucas, e todas com a mesma geometria. */
const PECAS = 16;

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/** O que devolve quem montou o mundo: a forma de desmontá-lo. */
export type DesmontarMundo = () => void;

/** Posição final de cada peça, formando um bloco organizado. */
function posicaoFinal(indice: number): THREE.Vector3 {
  const colunas = 4;
  const coluna = indice % colunas;
  const linha = Math.floor(indice / colunas);
  return new THREE.Vector3(
    (coluna - (colunas - 1) / 2) * 1.35,
    (linha - 1) * -1.35 + 0.6,
    0,
  );
}

/** Posição inicial: espalhada, como o papel que se acumula no balcão. */
function posicaoInicial(indice: number): THREE.Vector3 {
  // Determinística de propósito: o mesmo espalhamento a cada carregamento faz a
  // animação ser desenhada, e não sorteada.
  const angulo = indice * 2.39996; // ângulo áureo, distribui sem agrupar
  const raio = 5 + (indice % 5) * 1.1;
  return new THREE.Vector3(
    Math.cos(angulo) * raio,
    Math.sin(angulo) * raio * 0.6,
    -3 - (indice % 4) * 2,
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
    45,
    elemento.clientWidth / Math.max(elemento.clientHeight, 1),
    0.1,
    100,
  );
  camera.position.set(0, 0, 11);

  const renderizador = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // o fundo é o da página; o mundo não pinta atrás de si
    powerPreference: "low-power",
  });
  renderizador.setPixelRatio(
    Math.min(window.devicePixelRatio, DENSIDADE_MAXIMA),
  );
  renderizador.setSize(elemento.clientWidth, elemento.clientHeight);
  elemento.append(renderizador.domElement);

  // UMA geometria e UM material, reaproveitados por todas as peças. Criar um
  // par por peça multiplicaria as chamadas de desenho sem mudar nada do que se
  // vê.
  //
  // A proporção é a de uma comanda: alta, estreita e fina. É o que faz a forma
  // ser reconhecível mesmo em opacidade baixa e desfocada por trás do texto.
  const geometria = new THREE.BoxGeometry(1, 1.45, 0.05);
  const material = new THREE.MeshStandardMaterial({
    color: 0x1a4fd6,
    // Áspero e sem brilho: papel não reflete. Metal aqui leria como plástico, e
    // a metáfora se perderia.
    roughness: 0.85,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });

  const grupo = new THREE.Group();
  const pecas: THREE.Mesh[] = [];

  for (let i = 0; i < PECAS; i += 1) {
    const peca = new THREE.Mesh(geometria, material);
    const inicio = posicaoInicial(i);
    peca.position.copy(inicio);
    // Giro nos três eixos: papel caído não fica de frente para ninguém.
    peca.rotation.set(inicio.x * 0.2, inicio.y * 0.2, inicio.z * 0.15);
    peca.scale.setScalar(0.62 + (i % 3) * 0.1);
    grupo.add(peca);
    pecas.push(peca);
  }
  cena.add(grupo);

  cena.add(new THREE.AmbientLight(0xffffff, 0.65));
  const luz = new THREE.DirectionalLight(0xffffff, 1.1);
  luz.position.set(4, 6, 8);
  cena.add(luz);

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

  const alvo = new THREE.Vector3();

  function desenhar(): void {
    // A interpolação acontece no LAÇO DE DESENHO, e não no evento de rolagem: o
    // evento dispara mais vezes que o quadro, e mover as peças ali faria o
    // trabalho ser refeito e descartado várias vezes por quadro.
    for (let i = 0; i < pecas.length; i += 1) {
      const peca = pecas[i];
      if (peca === undefined) continue;
      alvo.copy(posicaoInicial(i)).lerp(posicaoFinal(i), progresso);
      peca.position.lerp(alvo, 0.08);
      // As comandas vão ficando de frente conforme a história avança.
      peca.rotation.x += (0 - peca.rotation.x) * 0.05 * progresso;
      peca.rotation.y += (0 - peca.rotation.y) * 0.05 * progresso;
      peca.rotation.z += (0 - peca.rotation.z) * 0.05 * progresso;
    }
    grupo.rotation.y = (1 - progresso) * 0.35;
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
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", aoRedimensionar);

    // Geometria e material são um só, compartilhados: descartar uma vez basta,
    // e percorrer a cena descartando por peça tentaria descartar catorze vezes
    // o mesmo recurso.
    geometria.dispose();
    material.dispose();
    renderizador.dispose();
    renderizador.domElement.remove();
  };
}

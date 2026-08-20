/**
 * O mundo em três dimensões da landing: a receita virando (AC-935).
 *
 * O QUE ELE MOSTRA: duas séries de barras. A vermelha cai — é o negócio que
 * anota pedido no papel, perde o cliente que não achou o preço e fecha o mês sem
 * saber quanto entrou. A verde sobe, e as barras dela ganham a marca no topo,
 * ligadas por uma linha: é a trajetória depois que o cardápio está no ar.
 *
 * É O RESULTADO, e não a metáfora do produto. Três versões anteriores foram
 * descartadas por isso. Cubos: forma abstrata não fala com quem vende pastel.
 * Comandas de papel: coerentes, mas em opacidade baixa perdiam a proporção e
 * liam como quadrados. Rotas de entrega: melhores, e ainda assim explicavam o
 * MEIO — o dono não quer rotas, quer faturamento. Barra é a forma que ele já lê
 * no extrato do banco.
 *
 * AS CORES DAS SÉRIES SÃO SEMÂNTICAS, e não a da marca. Vermelho é perda e verde
 * é ganho em qualquer lugar do mundo, e trocar isso pela cor escolhida faria a
 * série "boa" ficar vermelha na loja que escolheu vermelho — dizendo o contrário
 * do que a figura existe para dizer. Quem acompanha a cor da marca é o resto da
 * página.
 *
 * O QUE ELE NÃO É: conteúdo. A página conta a história inteira sem ele, e na
 * maioria dos aparelhos ele nem é baixado — a decisão mora em `podeRodar3D.ts` e
 * acontece antes da importação. Quem chega pelo celular vê a luz de fundo, que é
 * de CSS e chega a todo mundo.
 */
import * as THREE from "three";

/** Quantos meses o gráfico mostra. */
const COLUNAS = 11;

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/** Perda e ganho. Os mesmos valores declarados que o resto do produto usa. */
const COR_DA_QUEDA = 0xb3251c;
const COR_DA_SUBIDA = 0x136c3a;

const LARGURA_DA_BARRA = 0.46;
const PASSO = 1.05;

export type DesmontarMundo = () => void;

/**
 * A altura de cada barra, de 0 a 1.
 *
 * A queda e a subida NÃO são retas. Receita real oscila, e uma reta perfeita lê
 * como gráfico de apresentação de vendas — que é justamente a coisa em que o
 * dono de loja não acredita. A oscilação é determinística: o mesmo desenho a
 * cada carregamento faz o fundo ser composto, e não sorteado.
 */
function alturaDaQueda(coluna: number): number {
  const base = 1 - (coluna / (COLUNAS - 1)) * 0.72;
  return Math.max(0.12, base + Math.sin(coluna * 1.7) * 0.07);
}

function alturaDaSubida(coluna: number): number {
  const base = 0.14 + (coluna / (COLUNAS - 1)) * 0.82;
  return Math.max(0.1, base + Math.sin(coluna * 2.3 + 1) * 0.06);
}

/** Onde a coluna fica no eixo horizontal, centrada no conjunto. */
function posicaoDaColuna(coluna: number): number {
  return (coluna - (COLUNAS - 1) / 2) * PASSO;
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
    46,
    elemento.clientWidth / Math.max(elemento.clientHeight, 1),
    0.1,
    100,
  );
  camera.position.set(0, 1.2, 13);
  camera.lookAt(0, 0.6, 0);

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

  // UMA geometria para todas as barras, e um conjunto instanciado por série.
  // Uma malha por barra daria vinte e duas chamadas de desenho para o mesmo
  // resultado — aqui são duas.
  const geometriaDaBarra = new THREE.BoxGeometry(
    LARGURA_DA_BARRA,
    1,
    LARGURA_DA_BARRA,
  );

  const materialDaQueda = new THREE.MeshStandardMaterial({
    color: COR_DA_QUEDA,
    roughness: 0.75,
    metalness: 0,
    transparent: true,
    opacity: 0.75,
  });
  const materialDaSubida = new THREE.MeshStandardMaterial({
    color: COR_DA_SUBIDA,
    roughness: 0.7,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
  });

  const queda = new THREE.InstancedMesh(
    geometriaDaBarra,
    materialDaQueda,
    COLUNAS,
  );
  const subida = new THREE.InstancedMesh(
    geometriaDaBarra,
    materialDaSubida,
    COLUNAS,
  );
  cena.add(queda, subida);

  // Os NÓS no topo da série que sobe, e a linha que os liga: é a trajetória, e
  // é ela que transforma barras soltas em "isto está indo para algum lugar".
  // Esfera de poucos lados porque em opacidade baixa ninguém conta polígono —
  // e ela precisa ser REDONDA, ao contrário do ponto solto do Three, que é
  // desenhado como quadrado quando não recebe textura.
  const geometriaDoNo = new THREE.SphereGeometry(0.13, 12, 8);
  const materialDoNo = new THREE.MeshStandardMaterial({
    color: COR_DA_SUBIDA,
    roughness: 0.4,
    metalness: 0,
  });
  const nos = new THREE.InstancedMesh(geometriaDoNo, materialDoNo, COLUNAS);
  cena.add(nos);

  const pontosDaLinha = new Float32Array(COLUNAS * 3);
  const geometriaDaLinha = new THREE.BufferGeometry();
  geometriaDaLinha.setAttribute(
    "position",
    new THREE.BufferAttribute(pontosDaLinha, 3),
  );
  const materialDaLinha = new THREE.LineBasicMaterial({
    color: COR_DA_SUBIDA,
    transparent: true,
    opacity: 0.6,
  });
  const trajetoria = new THREE.Line(geometriaDaLinha, materialDaLinha);
  cena.add(trajetoria);

  cena.add(new THREE.AmbientLight(0xffffff, 0.7));
  const luz = new THREE.DirectionalLight(0xffffff, 0.9);
  luz.position.set(3, 8, 6);
  cena.add(luz);

  /** Quanto da história já passou, de 0 a 1. */
  let progresso = 0;
  let avancoDesenhado = 0;

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

  const molde = new THREE.Object3D();
  const ALTURA_MAXIMA = 4.2;

  function posicionar(
    conjunto: THREE.InstancedMesh,
    coluna: number,
    altura: number,
    profundidade: number,
  ): void {
    molde.position.set(posicaoDaColuna(coluna), altura / 2, profundidade);
    molde.scale.set(1, Math.max(altura, 0.001), 1);
    molde.rotation.set(0, 0, 0);
    molde.updateMatrix();
    conjunto.setMatrixAt(coluna, molde.matrix);
  }

  function desenhar(): void {
    // O avanço persegue o progresso da rolagem, em vez de saltar para ele: sem
    // a perseguição, uma rolagem rápida faria as barras piscarem.
    avancoDesenhado += (progresso - avancoDesenhado) * 0.06;

    for (let coluna = 0; coluna < COLUNAS; coluna += 1) {
      // Cada coluna entra um pouco depois da anterior: o gráfico se desenha da
      // esquerda para a direita, como quem lê. Todas crescendo juntas leriam
      // como uma cortina subindo.
      const atraso = (coluna / COLUNAS) * 0.5;
      const avanco = Math.max(
        0,
        Math.min((avancoDesenhado - atraso) / (1 - atraso), 1),
      );

      const alturaQueda = alturaDaQueda(coluna) * ALTURA_MAXIMA * avanco;
      const alturaSubida = alturaDaSubida(coluna) * ALTURA_MAXIMA * avanco;

      posicionar(queda, coluna, alturaQueda, -0.7);
      posicionar(subida, coluna, alturaSubida, 0.7);

      molde.position.set(posicaoDaColuna(coluna), alturaSubida, 0.7);
      molde.scale.setScalar(avanco);
      molde.updateMatrix();
      nos.setMatrixAt(coluna, molde.matrix);

      const ponto = coluna * 3;
      pontosDaLinha[ponto] = posicaoDaColuna(coluna);
      pontosDaLinha[ponto + 1] = alturaSubida;
      pontosDaLinha[ponto + 2] = 0.7;
    }

    queda.instanceMatrix.needsUpdate = true;
    subida.instanceMatrix.needsUpdate = true;
    nos.instanceMatrix.needsUpdate = true;
    geometriaDaLinha.attributes["position"]!.needsUpdate = true;

    // Um giro lento dá profundidade sem pedir atenção, e é o único movimento
    // que continua quando ninguém rola.
    cena.rotation.y = Math.sin(avancoDesenhado * Math.PI - 0.5) * 0.22;

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

    geometriaDaBarra.dispose();
    geometriaDoNo.dispose();
    geometriaDaLinha.dispose();
    materialDaQueda.dispose();
    materialDaSubida.dispose();
    materialDoNo.dispose();
    materialDaLinha.dispose();
    renderizador.dispose();
    renderizador.domElement.remove();
  };
}

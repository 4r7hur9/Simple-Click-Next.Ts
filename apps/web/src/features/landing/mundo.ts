/**
 * O mundo em três dimensões da landing: a receita virando (AC-935).
 *
 * O QUE ELE MOSTRA: três linhas que atravessam a tela de ponta a ponta. A
 * vermelha cai — é o negócio que anota pedido no papel, perde o cliente que não
 * achou o preço e fecha o mês sem saber quanto entrou. A verde sobe: é depois
 * que o cardápio está no ar. A terceira é a cor da loja, e vai no meio.
 *
 * SÃO LINHAS, E NÃO BARRAS NEM PONTOS. Barra ocupa área, e área atrás de texto
 * vira mancha — foi por isso que a versão anterior precisou de um chão opaco que
 * escondia justamente o que ele deveria deixar ver. Linha ocupa quase nada, e o
 * texto lê por cima dela sem nenhuma camada no meio. Ponto marcado em cada
 * vértice devolveria a mancha em miniatura, treze vezes por linha.
 *
 * É O RESULTADO, e não a metáfora do produto. Quatro versões foram descartadas
 * antes: cubos (forma abstrata não fala com quem vende pastel), comandas de
 * papel (perdiam a proporção em opacidade baixa e liam como quadrados), rotas de
 * entrega (explicavam o MEIO — o dono não quer rota, quer faturamento) e barras
 * (a mancha acima).
 *
 * AS CORES DAS SÉRIES SÃO SEMÂNTICAS, e não a da marca. Vermelho é perda e verde
 * é ganho em qualquer lugar do mundo, e trocar isso pela cor escolhida faria a
 * série "boa" ficar vermelha na loja que escolheu vermelho — dizendo o contrário
 * do que a figura existe para dizer.
 *
 * A CÂMERA É ORTOGRÁFICA E MEDE EM PIXEL. Com câmera em perspectiva, o que
 * atravessa a tela num monitor sobra fora dela num celular deitado, porque a
 * largura visível depende da distância. Aqui uma unidade é um pixel, e "de ponta
 * a ponta" é uma conta e não um chute.
 *
 * O QUE ELE NÃO É: conteúdo. A página conta a história inteira sem ele, e na
 * maioria dos aparelhos ele nem é baixado — a decisão mora em `podeRodar3D.ts` e
 * acontece antes da importação.
 */
import * as THREE from "three";

import { ouvirCor } from "../../lib/cor-da-landing.ts";

/** Quantos vértices cada linha tem. Ímpar, para haver um meio. */
const PARADAS = 13;

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/** Perda e ganho. Os mesmos valores declarados que o resto do produto usa. */
const COR_DA_QUEDA = 0xb3251c;
const COR_DA_SUBIDA = 0x136c3a;
/** A cor da marca, até a prévia anunciar a escolhida. */
const COR_DE_RESERVA = 0xb3261e;

/** A espessura da linha, em pixel. */
const ESPESSURA = 3;
/** A folga além da tela, para a linha entrar e sair cortada pela borda. */
const TRANSBORDO = 40;

export type DesmontarMundo = () => void;

/**
 * A altura de cada parada, de 0 a 1.
 *
 * A tendência é uma reta; a oscilação é o que a torna crível. Receita real
 * oscila, e uma reta perfeita lê como gráfico de apresentação de vendas — que é
 * justamente a coisa em que o dono de loja não acredita. A oscilação é
 * determinística: o mesmo desenho a cada carregamento faz o fundo ser composto,
 * e não sorteado.
 */
function alturaDaSerie(
  parada: number,
  inicio: number,
  fim: number,
  fase: number,
): number {
  const andamento = parada / (PARADAS - 1);
  const tendencia = inicio + (fim - inicio) * andamento;
  const oscilacao =
    Math.sin(parada * 1.9 + fase) * 0.06 + Math.sin(parada * 0.7 + fase) * 0.04;
  return Math.min(Math.max(tendencia + oscilacao, 0.04), 0.96);
}

/** As três séries, com onde começam, onde terminam e a cor de cada uma. */
const SERIES = [
  { inicio: 0.82, fim: 0.16, fase: 0, cor: COR_DA_QUEDA, opacidade: 0.85 },
  { inicio: 0.14, fim: 0.86, fase: 2.1, cor: COR_DA_SUBIDA, opacidade: 0.95 },
  { inicio: 0.4, fim: 0.58, fase: 4.2, cor: COR_DE_RESERVA, opacidade: 0.55 },
] as const;

/** Qual das séries segue a cor escolhida na prévia. */
const SERIE_DA_MARCA = 2;

/**
 * Transforma uma sequência de pontos numa fita com espessura.
 *
 * PRECISA SER FITA, e não `THREE.Line`. A linha do WebGL tem um pixel de
 * espessura e ponto final: `linewidth` existe na interface e é ignorada em todo
 * navegador de mesa. Um pixel some no fundo — e engrossar do lado de fora é a
 * única saída.
 */
function construirFita(
  pontos: readonly THREE.Vector2[],
  espessura: number,
): THREE.BufferGeometry {
  const metade = espessura / 2;
  const vertices = new Float32Array(pontos.length * 2 * 3);
  const indices: number[] = [];

  for (let i = 0; i < pontos.length; i += 1) {
    const anterior = pontos[Math.max(i - 1, 0)]!;
    const proximo = pontos[Math.min(i + 1, pontos.length - 1)]!;
    const atual = pontos[i]!;

    // A normal sai da direção entre o vizinho de trás e o da frente: usar só o
    // segmento seguinte deixaria a quina com espessura diferente dos dois lados.
    const dx = proximo.x - anterior.x;
    const dy = proximo.y - anterior.y;
    const tamanho = Math.hypot(dx, dy) || 1;
    const nx = (-dy / tamanho) * metade;
    const ny = (dx / tamanho) * metade;

    const v = i * 6;
    vertices[v] = atual.x + nx;
    vertices[v + 1] = atual.y + ny;
    vertices[v + 2] = 0;
    vertices[v + 3] = atual.x - nx;
    vertices[v + 4] = atual.y - ny;
    vertices[v + 5] = 0;

    if (i < pontos.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometria.setIndex(indices);
  return geometria;
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
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

  const renderizador = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // o fundo é a luz da página; o mundo não pinta atrás de si
    powerPreference: "low-power",
  });
  renderizador.setPixelRatio(
    Math.min(window.devicePixelRatio, DENSIDADE_MAXIMA),
  );
  elemento.append(renderizador.domElement);

  const grupo = new THREE.Group();
  cena.add(grupo);

  const materiais = SERIES.map(
    (serie) =>
      new THREE.MeshBasicMaterial({
        color: serie.cor,
        transparent: true,
        opacity: serie.opacidade,
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
  });

  let fitas: THREE.Mesh[] = [];
  let guias: THREE.LineSegments | null = null;

  /** Quanto da história já passou, de 0 a 1. */
  let progresso = 0;
  let avancoDesenhado = 0;

  /**
   * Refaz a geometria para o tamanho atual da tela.
   *
   * Em pixel, mudar de tamanho não é escalar: escalar engrossaria a linha junto,
   * e num monitor largo ela viraria uma faixa. Por isso a fita é reconstruída, e
   * a espessura continua sendo três pixels em qualquer tela.
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

    // A faixa vertical que as linhas ocupam. Elas não vão até a borda de cima
    // nem de baixo: encostar no topo faz a linha parecer cortada pela janela em
    // vez de desenhada.
    const piso = altura * 0.16;
    const teto = altura * 0.84;
    const inicioX = -TRANSBORDO;
    const passo = (largura + TRANSBORDO * 2) / (PARADAS - 1);

    for (const [indice, serie] of SERIES.entries()) {
      const pontos = Array.from({ length: PARADAS }, (_, parada) => {
        const altura01 = alturaDaSerie(
          parada,
          serie.inicio,
          serie.fim,
          serie.fase,
        );
        return new THREE.Vector2(
          inicioX + parada * passo,
          piso + (teto - piso) * altura01,
        );
      });

      const fita = new THREE.Mesh(
        construirFita(pontos, ESPESSURA),
        materiais[indice]!,
      );
      grupo.add(fita);
      fitas.push(fita);
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

  function aoRolar(): void {
    const rolavel = document.body.scrollHeight - window.innerHeight;
    progresso = rolavel > 0 ? Math.min(window.scrollY / rolavel, 1) : 0;
  }

  function desenhar(): void {
    // O avanço persegue o progresso da rolagem, em vez de saltar para ele: sem
    // a perseguição, uma rolagem rápida faria as linhas piscarem.
    avancoDesenhado += (progresso - avancoDesenhado) * 0.06;

    // As linhas se DESENHAM da esquerda para a direita conforme a página rola,
    // como quem acompanha o mês passando. Recortar o intervalo de desenho custa
    // nada: a geometria inteira já está na placa, e muda só onde ela para.
    const segmentos = PARADAS - 1;
    const visiveis = Math.max(
      1,
      Math.ceil(segmentos * (0.25 + avancoDesenhado * 0.75)),
    );
    for (const fita of fitas) fita.geometry.setDrawRange(0, visiveis * 6);

    // Um deslocamento pequeno para o lado dá vida sem pedir atenção. É o único
    // movimento que não depende de a pessoa continuar rolando.
    grupo.position.x = -avancoDesenhado * TRANSBORDO;

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

  const pararDeOuvirCor = ouvirCor((cor) => {
    materiais[SERIE_DA_MARCA]?.color.set(cor);
  });

  remontar();
  aoRolar();
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", remontar);

  return () => {
    renderizador.setAnimationLoop(null);
    observador.disconnect();
    pararDeOuvirCor();
    window.removeEventListener("scroll", aoRolar);
    window.removeEventListener("resize", remontar);

    for (const fita of fitas) fita.geometry.dispose();
    guias?.geometry.dispose();
    for (const material of materiais) material.dispose();
    materialDaGuia.dispose();
    renderizador.dispose();
    renderizador.domElement.remove();
  };
}

/**
 * O mundo em três dimensões da landing: a receita subindo (AC-935).
 *
 * O QUE ELE MOSTRA: três linhas que atravessam a tela crescendo da esquerda
 * para a direita conforme a página rola, cada uma de um ramo diferente — loja
 * de roupas, lanchonete, loja de peças. Em cada pico da linha marcada há um
 * marcador e uma etiqueta com o número de pedidos daquele dia, no formato de
 * quem acompanha cotação: é como o dono de loja gostaria de acompanhar o
 * próprio movimento.
 *
 * TODAS SOBEM, e a cor diz de QUEM é a linha — não se o número é bom. É por
 * isso que uma delas pode ser vermelha sem contradizer nada: aqui a cor é
 * identidade, e não veredito. Uma versão anterior tinha uma linha vermelha
 * DESPENCANDO ao lado, o "antes" da história, e foi descartada — o fundo de uma
 * página que vende não é lugar para mostrar o negócio afundando: quem passa o
 * olho lê a figura, e não a legenda, e o que ficava era a queda.
 *
 * SÃO LINHAS, E NÃO BARRAS. Barra ocupa área, e área atrás de texto vira mancha
 * — foi por isso que a versão de barras precisou de um chão opaco que escondia
 * justamente o que ele deveria deixar ver. Linha ocupa quase nada, e o texto lê
 * por cima dela sem nenhuma camada no meio.
 *
 * O MARCADOR VAI SÓ NO PICO. Marcar os treze vértices devolveria a mancha em
 * miniatura. O pico é o ponto que a pessoa procura num gráfico de cotação, e é o
 * único que merece número.
 *
 * A LEGENDA É FIXA, À ESQUERDA. Os nomes já viajaram na ponta de cada linha, e
 * foi pior: com as três do mesmo verde era a única forma de ligar nome a traço,
 * mas eles atropelavam o texto ao cruzar a coluna e se empilhavam onde as linhas
 * se cruzam. Cor própria por linha resolve o problema que a viagem existia para
 * resolver — a bolinha da legenda casa com o traço, e o nome pode ficar parado
 * num canto livre.
 *
 * OS BALÕES SÃO HTML, E NÃO WEBGL. Texto em tela de desenho exige gerar uma
 * imagem por rótulo, que fica borrada em tela retina e é invisível para busca e
 * para leitor de tela. Como a câmera é ortográfica e mede em pixel, a posição no
 * mundo é a posição na página — não há projeção a calcular.
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
import { PALETA_CLARA } from "@simpleclick/ui";

import { querMovimentoReduzido } from "../../lib/narrativa.ts";

/** Quantos vértices cada linha tem. Ímpar, para haver um meio. */
const PARADAS = 13;

/** O teto de densidade de pixel. Acima de 2 a diferença não se percebe, e o
 * custo cresce ao quadrado: densidade 3 desenha nove vezes mais pixels que 1. */
const DENSIDADE_MAXIMA = 2;

/**
 * O verde, caso a folha de estilo ainda não tenha sido aplicada.
 *
 * Vem do valor DECLARADO, e não de uma cópia dele escrita aqui: cópia de cor é
 * a que fica para trás quando a original muda, e o ESLint recusa justamente por
 * isso (AC-014).
 */
const VERDE_DE_RESERVA = PALETA_CLARA.sucesso;

/** A espessura da linha, em pixel. */
const ESPESSURA = 3;
/** A folga além da tela, para a linha entrar e sair cortada pela borda. */
const TRANSBORDO = 40;

/**
 * A largura da coluna de texto, em pixel — o `max-inline-size: 40rem` de
 * `.sc-lp__conteudo`.
 *
 * Repetida aqui porque o WebGL não lê CSS, e medir o elemento a cada quadro
 * forçaria o navegador a recalcular o desenho da página sessenta vezes por
 * segundo. Se aquela regra mudar, esta constante muda junto.
 */
const LARGURA_DO_TEXTO = 640;

/** O espaço que uma etiqueta ocupa, para saber se ela cabe onde vai. */
const LARGURA_DA_ETIQUETA = 130;
const ALTURA_DA_ETIQUETA = 46;

/** Os nomes dos valores declarados de cada linha, na ordem das séries. */
const VALORES_DAS_CORES = [
  "--cor-serie-um",
  "--cor-serie-dois",
  "--cor-serie-tres",
] as const;

export type DesmontarMundo = () => void;

/**
 * A cor vem da FOLHA DE ESTILO, e não do código.
 *
 * Cada cor do produto tem duas versões — uma para o tema claro, outra para o
 * escuro — e o WebGL não lê CSS. Fixar uma delas aqui faz a linha sumir em
 * metade dos aparelhos: uma foto de teste mostrou verde clareado sobre fundo
 * branco, quase invisível.
 */
function corDoTema(valor: string): string {
  if (typeof window === "undefined") return VERDE_DE_RESERVA;
  const lido = getComputedStyle(document.documentElement)
    .getPropertyValue(valor)
    .trim();
  return lido === "" ? VERDE_DE_RESERVA : lido;
}

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
  // Duas ondas de períodos diferentes: uma só produziria um zigue-zague regular,
  // que lê como enfeite. Somadas, o desenho nunca repete dentro da tela.
  const oscilacao =
    Math.sin(parada * 1.9 + fase) * 0.09 + Math.sin(parada * 0.7 + fase) * 0.05;
  return Math.min(Math.max(tendencia + oscilacao, 0.04), 0.96);
}

/**
 * As três séries. Todas sobem — o que muda é de onde partem, quanto avançam e a
 * fase da oscilação, que é o que as faz se cruzarem em vez de andarem juntas.
 *
 * O PESO É IGUAL NAS TRÊS. Ele era escalonado enquanto as três eram do mesmo
 * verde, porque a opacidade era a única coisa que as separava — e isso fazia a
 * terceira quase sumir. Com cor própria, escalonar o peso passaria a dizer que
 * um ramo importa menos que outro, o que não é a mensagem.
 */
const SERIES = [
  { inicio: 0.08, fim: 0.88, fase: 0, opacidade: 0.92 },
  { inicio: 0.38, fim: 0.62, fase: 2.4, opacidade: 0.92 },
  { inicio: 0.22, fim: 0.76, fase: 4.7, opacidade: 0.92 },
] as const;

/**
 * O que cada linha representa.
 *
 * O NOME É OBRIGATÓRIO AQUI, e não decoração. As três linhas são do mesmo verde,
 * distintas só pela opacidade — uma legenda de canto com três amostras quase
 * iguais não diria qual é qual. Por isso o nome anda junto da ponta da própria
 * linha: não há o que casar, o rótulo está em cima do traço que ele nomeia.
 *
 * E são três ramos deliberadamente distantes — comida, roupa e autopeças — para
 * a página responder de saída a pergunta que todo visitante faz: "isto serve
 * para o MEU negócio?".
 */
const NOMES_DAS_SERIES = [
  "Loja de roupas",
  "Lanchonete",
  "Loja de peças",
] as const;

/**
 * Quantos pedidos a etiqueta anuncia num pico daquela altura.
 *
 * SAI DA PRÓPRIA ALTURA, e não de uma sequência à parte. Um número inventado
 * poderia dizer "+40" no pico mais baixo do desenho, e quem olhasse o gráfico e
 * o número juntos veria os dois se contradizendo. Assim a etiqueta é a leitura
 * do traço, que é o que uma etiqueta de gráfico é.
 */
function pedidosNoPico(altura01: number): number {
  return Math.round(altura01 * 64) + 4;
}

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
   * O CORTE QUE FAZ A LINHA CRESCER.
   *
   * Um plano vertical: o que está à direita dele não é desenhado. Recortar por
   * intervalo de índices — que foi a primeira tentativa — só sabe cortar em
   * vértice inteiro, e a ponta andaria aos saltos de um pico para o outro. O
   * plano corta no meio do traço, e o crescimento fica contínuo.
   */
  const planoDaFrente = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

  /*
   * A LEGENDA, montada uma vez e parada.
   *
   * Ela não é refeita quando a tela muda de tamanho: as cores e os nomes não
   * dependem do tamanho, e recriar três elementos a cada arrasto de janela é
   * trabalho por nada.
   */
  const legenda = document.createElement("ul");
  legenda.className = "sc-lp__legenda";
  for (const [indice, nome] of NOMES_DAS_SERIES.entries()) {
    const item = document.createElement("li");
    item.className = "sc-lp__legenda-item";
    // A bolinha herda a cor pelo valor declarado, e não por cor escrita aqui:
    // assim ela acompanha o tema junto com a linha que representa, sem uma
    // segunda regra que possa ficar para trás.
    item.style.setProperty(
      "--cor-da-serie",
      `var(${VALORES_DAS_CORES[indice] ?? ""})`,
    );
    item.textContent = nome;
    legenda.append(item);
  }
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
  let picos: { elemento: HTMLElement; x: number; topo: number }[] = [];

  const semMovimento = querMovimentoReduzido();

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

  /**
   * Põe UMA etiqueta na linha, no melhor pico que ela tiver.
   *
   * UMA, e não uma por pico. Eram quatro na mesma linha, e o gráfico virava uma
   * parede de números — o que a etiqueta tem a dizer ("este ramo vende tanto")
   * ela diz uma vez. Com uma por linha, as três cores aparecem e cada uma fala
   * do seu negócio.
   *
   * PICO É MÁXIMO LOCAL: mais alto que o vizinho de trás E que o da frente. As
   * pontas ficam de fora — o primeiro e o último ponto têm um vizinho só, e
   * chamar de pico o que só tem meia comparação marcaria o começo da linha
   * quando ela apenas entra na tela pelo alto.
   */
  function marcarPico({
    indice,
    alturas,
    pontos,
    alturaDaTela,
    larguraDaTela,
  }: {
    readonly indice: number;
    readonly alturas: readonly number[];
    readonly pontos: readonly THREE.Vector2[];
    readonly alturaDaTela: number;
    readonly larguraDaTela: number;
  }): void {
    // AS FAIXAS LIVRES são o que sobra da tela fora da coluna de texto. A
    // etiqueta não pode cair atrás do parágrafo: ali ela não se lê, e ainda
    // atrapalha quem está lendo. Fora delas, nenhum pico serve — e ficar sem
    // etiqueta é melhor do que ter uma por cima do texto.
    const bordaEsquerda = Math.max((larguraDaTela - LARGURA_DO_TEXTO) / 2, 0);
    const bordaDireita = bordaEsquerda + LARGURA_DO_TEXTO;

    const cabeNaFaixa = (x: number): boolean =>
      x + LARGURA_DA_ETIQUETA < bordaEsquerda ||
      (x > bordaDireita && x + LARGURA_DA_ETIQUETA < larguraDaTela);

    for (let i = 1; i < alturas.length - 1; i += 1) {
      if (!(alturas[i]! > alturas[i - 1]! && alturas[i]! > alturas[i + 1]!)) {
        continue;
      }

      const ponto = pontos[i]!;
      if (!cabeNaFaixa(ponto.x)) continue;

      // O eixo do mundo cresce para cima e o da página para baixo. Esta linha é
      // toda a conversão que existe entre os dois — o resto é pixel dos dois
      // lados, porque a câmera é ortográfica.
      const topo = alturaDaTela - ponto.y;

      // Nem em cima de outra etiqueta. As linhas se cruzam de propósito, e no
      // cruzamento dois picos de séries diferentes caem quase no mesmo lugar.
      const colide = picos.some(
        (outro) =>
          Math.abs(outro.x - ponto.x) < LARGURA_DA_ETIQUETA &&
          Math.abs(outro.topo - topo) < ALTURA_DA_ETIQUETA,
      );
      if (colide) continue;

      const marcador = document.createElement("div");
      marcador.className = "sc-lp__pico";
      // Marcador e etiqueta na cor da PRÓPRIA linha: é o que liga um ao outro
      // quando há três deles na tela, e o que faz a bolinha da legenda valer.
      marcador.style.setProperty(
        "--cor-da-serie",
        `var(${VALORES_DAS_CORES[indice] ?? ""})`,
      );
      marcador.style.left = `${ponto.x}px`;
      marcador.style.top = `${topo}px`;

      // Duas linhas, como a etiqueta de resultado de uma operação: o que está
      // sendo medido em cima, pequeno, e o número embaixo, grande. Uma linha só
      // obriga o olho a ler a frase inteira para achar o valor — que é a única
      // coisa que ele foi ali buscar.
      const balao = document.createElement("div");
      balao.className = "sc-lp__balao";

      const rotuloDoBalao = document.createElement("span");
      rotuloDoBalao.className = "sc-lp__balao-rotulo";
      rotuloDoBalao.textContent = "PEDIDOS NO DIA";

      const valorDoBalao = document.createElement("span");
      valorDoBalao.className = "sc-lp__balao-valor";
      valorDoBalao.textContent = `+${pedidosNoPico(alturas[i]!)}`;

      balao.append(rotuloDoBalao, valorDoBalao);
      marcador.append(balao);

      camadaDosBaloes.append(marcador);
      picos.push({ elemento: marcador, x: ponto.x, topo });

      // Quem pediu menos movimento recebe o estado final, e não a ausência
      // dele: a etiqueta aparece na hora, sem esperar a linha crescer até ela.
      if (semMovimento) marcador.dataset["visivel"] = "sim";
      return;
    }
  }

  function aoRolar(): void {
    const rolavel = document.body.scrollHeight - window.innerHeight;
    progresso = rolavel > 0 ? Math.min(window.scrollY / rolavel, 1) : 0;
  }

  function desenhar(): void {
    // O avanço persegue o progresso da rolagem, em vez de saltar para ele: sem
    // a perseguição, uma rolagem rápida faria as linhas piscarem.
    avancoDesenhado += (progresso - avancoDesenhado) * 0.06;

    const largura = elemento.clientWidth;
    const altura = elemento.clientHeight;

    // A LINHA CRESCE DA ESQUERDA PARA A DIREITA conforme a página desce. É a
    // rolagem contando a passagem do tempo — o mês avançando, e não um efeito.
    //
    // ONDE ELA COMEÇA. Passou pela borda esquerda da coluna de texto enquanto os
    // nomes viajavam na ponta — era o que os mantinha fora do parágrafo. Com a
    // legenda parada num canto, essa amarra caiu, e o começo voltou a ser
    // escolhido pelo que importa: haver gráfico e ao menos uma etiqueta na
    // primeira tela, que é onde quase todo mundo fica.
    //
    // Quem pediu menos movimento recebe o gráfico INTEIRO, que é o estado final
    // — e não uma tela vazia, que seria receber a ausência do conteúdo.
    const partida = 0.42 * largura;
    const frente = semMovimento
      ? largura + TRANSBORDO
      : partida + avancoDesenhado * (largura + TRANSBORDO - partida);
    planoDaFrente.constant = frente;

    grupo.position.y = avancoDesenhado * altura * 0.12;

    // A CAMADA DAS ETIQUETAS ANDA JUNTO COM O GRÁFICO.
    //
    // Sem isto elas se descolam: as linhas sobem com a rolagem, os marcadores
    // ficam onde foram postos, e o ponto que devia estar no pico aparece
    // pendurado abaixo dele. É um transform na camada inteira, e não uma conta
    // por marcador — três elementos ou trinta custam o mesmo.
    //
    // O sinal é invertido porque o eixo do mundo cresce para cima e o da página
    // para baixo: o gráfico subindo é a camada indo para o negativo.
    camadaDosBaloes.style.transform = `translateY(${-grupo.position.y}px)`;

    // OS BALÕES SÓ NASCEM NA PONTA. Cada um espera a linha chegar ao seu pico —
    // e é isso que faz o número parecer resultado do crescimento, e não legenda
    // desenhada de antemão junto com o resto.
    // A folga é o que separa o balão do nome da linha: os dois disputariam o
    // mesmo ponto, porque o nome mora exatamente na ponta. Com ela, o balão
    // aparece logo ATRÁS da ponta — que é como cotação se comporta mesmo, o
    // número fica onde o preço esteve, não onde ele está.
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
  // isto, o verde do tema anterior ficaria pintado até a próxima navegação.
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

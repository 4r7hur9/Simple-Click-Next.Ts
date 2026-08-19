/**
 * A régua da narrativa, lida em tempo de execução.
 *
 * O PROBLEMA QUE ISTO RESOLVE não é de tamanho, é de tempo. Com uma seção por
 * tela, "dispare quando ela estiver a 80% da janela" significa "quando ela vai
 * entrar". Com DUAS seções por tela, a segunda já está visível desde o começo —
 * e dispara junto com a primeira. Tudo anima de uma vez, e o efeito de revelação
 * some. Numa TV em pé com três seções, some ainda mais.
 *
 * A correção é a âncora passar a ser a VAGA, e não a janela. Estas funções são
 * puras e só leem valores: quem monta a animação chama, quem testa não precisa
 * de navegador nem de biblioteca de animação.
 */

/** Quantas seções a folha manda mostrar quando nada responde. */
const SECOES_PADRAO = 1;

/** Onde a âncora fica quando só há uma seção por tela. */
const ANCORA_BASE_EM_PORCENTO = 80;

/**
 * Quantas seções cabem na tela agora, segundo a folha de estilo.
 *
 * O valor vem de `--secoes-visiveis`, declarado em `theme.css` e trocado por
 * consulta de mídia. Ler dali, e não recalcular aqui a partir da altura, é o
 * que impede a folha e o script de discordarem — se alguém mudar a escada num
 * lugar só, o outro acompanha.
 */
export function secoesVisiveis(
  raiz: Element | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): number {
  if (raiz === null || typeof getComputedStyle !== "function") {
    return SECOES_PADRAO;
  }

  const declarado = getComputedStyle(raiz)
    .getPropertyValue("--secoes-visiveis")
    .trim();

  const numero = Number.parseInt(declarado, 10);
  // Valor ausente, vazio ou absurdo cai no padrão: a narrativa continua
  // funcionando com uma seção por tela, que é o pior caso aceitável.
  return Number.isInteger(numero) && numero >= 1 && numero <= 6
    ? numero
    : SECOES_PADRAO;
}

/**
 * A âncora de disparo, ajustada ao número de seções visíveis.
 *
 * Com uma seção, 80% da janela. Com duas, 40% — que é 80% da VAGA de cada uma.
 * Com três, 26,67%. O efeito é o mesmo em qualquer tela: a seção anima quando
 * está prestes a ocupar o lugar dela, e não quando entrou na tela.
 */
export function ancoraDaVaga(visiveis = secoesVisiveis()): string {
  const porcento = ANCORA_BASE_EM_PORCENTO / visiveis;
  // Uma casa decimal basta e evita cadeia gigante em divisões inexatas.
  return `top ${Math.round(porcento * 10) / 10}%`;
}

/**
 * O passo entre itens de uma revelação em sequência.
 *
 * Numa tela que mostra mais seções, a pessoa percorre a narrativa mais rápido —
 * então o passo encurta na mesma proporção. Sem isso, o último cartão de uma
 * lista aparece depois de ela já ter rolado para a seção seguinte.
 */
export function passoDaSequencia(
  quantidade: number,
  visiveis = secoesVisiveis(),
): number {
  const PASSO_BASE = 0.08;
  const DURACAO_MAXIMA = 0.9;

  const passo = PASSO_BASE / visiveis;
  // Lista longa recebe passo ainda menor, para o conjunto caber num tempo que a
  // pessoa aceita esperar olhando.
  return quantidade > 1
    ? Math.min(passo, DURACAO_MAXIMA / (quantidade - 1))
    : 0;
}

/**
 * Quem pediu para parar de mexer.
 *
 * Chamada em vez de constante: a pessoa pode mudar a preferência no sistema com
 * a página aberta, e uma constante lida na carga ficaria desatualizada.
 */
export function querMovimentoReduzido(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    // No servidor não há movimento nenhum para reduzir; devolver verdadeiro
    // faria a marcação nascer com o estado final, que é exatamente o certo.
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

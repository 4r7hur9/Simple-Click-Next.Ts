// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";
import VitrineDoDesignSystem from "../src/app/(dev)/ui/page";

/**
 * AC-016: a página de demonstração dos componentes passa na verificação
 * automática de acessibilidade, sem violação de nível crítico ou sério.
 *
 * A verificação roda em teste de unidade, com o motor do axe sobre um documento
 * montado em memória. O navegador de verdade entra na T-020, com o Playwright
 * percorrendo as rotas do manifesto. O que este teste cobre é a parte que não
 * depende de pintura de tela: papéis, nomes acessíveis, rótulo ligado a
 * controle, hierarquia de títulos, marcos da página e atributos de estado.
 *
 * A metade que falta — o contraste das cores em si — é conferida por cálculo em
 * `packages/ui/tests/tokens.test.ts`, que mede cada par que o design system
 * empilha, nos dois temas. As duas juntas cobrem o critério; nenhuma delas
 * sozinha cobriria, e é por isso que a régua do que "rodou de verdade" está
 * escrita como asserção aqui embaixo.
 */

const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);

/**
 * Regras que precisam ter sido avaliadas para o resultado significar alguma
 * coisa. Sem esta lista, um erro de montagem faria o axe não avaliar nada e o
 * teste passaria com zero violação — a pior forma de um teste de acessibilidade
 * mentir.
 */
const REGRAS_QUE_PRECISAM_RODAR = [
  "button-name",
  "label",
  "aria-valid-attr-value",
  "aria-required-attr",
  "aria-allowed-attr",
  "heading-order",
  "empty-heading",
  "list",
  "listitem",
  "region",
  "landmark-one-main",
  "nested-interactive",
  "html-has-lang",
];

let resultado: axe.AxeResults;

/** Descreve a violação em uma linha, para o teste dizer o que consertar. */
const descrever = (violacao: Result): string =>
  `${violacao.impact}: ${violacao.id} — ${violacao.help} (${violacao.nodes
    .map((no) => no.target.join(" "))
    .slice(0, 3)
    .join(" · ")})`;

beforeAll(async () => {
  // O documento inteiro é responsabilidade do layout raiz, que não participa da
  // renderização de uma página isolada. Idioma e título são reproduzidos aqui
  // porque o axe cobra os dois e o leitor de tela depende deles.
  document.documentElement.lang = "pt-BR";
  document.title = "Design system do SimpleClick";
  document.body.className = "sc-raiz";
  document.body.innerHTML = renderToStaticMarkup(<VitrineDoDesignSystem />);

  // O ambiente em memória não implementa `elementFromPoint`, que o axe usa para
  // descobrir diálogo modal. Sem este atalho, o motor aborta a avaliação de
  // quase toda regra e devolve "não sei" no lugar de um veredito — o teste
  // passaria sem ter verificado nada.
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => null,
  });

  resultado = await axe.run(document, {
    // A regra de contraste compara pixels pintados, e não há pintura aqui: ela
    // só produziria resultado inconclusivo. O contraste é conferido por cálculo
    // nos testes do próprio design system.
    rules: { "color-contrast": { enabled: false } },
  });
});

describe("vitrine do design system", () => {
  it("@spec:AC-016 a verificação avaliou de fato os componentes da página", () => {
    const avaliadas = new Set([
      ...resultado.passes.map((regra) => regra.id),
      ...resultado.violations.map((regra) => regra.id),
    ]);
    const naoRodaram = REGRAS_QUE_PRECISAM_RODAR.filter(
      (regra) => !avaliadas.has(regra),
    );

    expect(naoRodaram).toEqual([]);
    expect(document.querySelectorAll("button").length).toBeGreaterThan(5);
    expect(document.querySelectorAll("input").length).toBeGreaterThan(3);
    expect(document.querySelectorAll("dialog").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("ul").length).toBeGreaterThan(0);
  });

  it("@spec:AC-016 não tem nenhuma violação de nível crítico ou sério", () => {
    const graves = resultado.violations.filter((violacao) =>
      NIVEIS_QUE_REPROVAM.has(violacao.impact ?? ""),
    );

    expect(graves.map(descrever)).toEqual([]);
  });

  it("@principle:P-012 não tem violação de nenhum nível na página de demonstração", () => {
    // O critério exige crítico e sério. Aqui a régua é mais dura de propósito:
    // esta página é escrita por nós, do zero, sem conteúdo de terceiro — se ela
    // não consegue ficar limpa, nenhuma tela do produto vai conseguir.
    expect(resultado.violations.map(descrever)).toEqual([]);
  });
});

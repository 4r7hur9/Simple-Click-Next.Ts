// @vitest-environment jsdom
/**
 * Prova das telas da disponibilidade do produto (AC-321, AC-322).
 *
 * A regra está provada contra o banco em
 * `apps/api/tests/disponibilidade-do-produto.int.test.ts`. Aqui se prova o
 * que só a tela mostra: o dono marca esgotado e cadastra a janela de venda no
 * formulário, e é isso que vai para a rota; o cartão da vitrine diz POR QUE o
 * produto não está à venda; e a página do produto barra o botão de adicionar.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProdutoNoContrato } from "@simpleclick/contracts";

const navegacao = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navegacao, back: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { priority: _priority, ...resto } = props;
    return <img {...(resto as Record<string, string>)} />;
  },
}));

import { FormularioProduto } from "../src/features/painel-catalogo/FormularioProduto";
import { BotaoAdicionar } from "../src/features/produto/BotaoAdicionar";
import { CartaoDeProduto } from "../src/features/vitrine/GradeDeProdutos";
import { prepararProduto } from "../src/server/produto";

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: unknown;
}

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
  navegacao.push.mockReset();
});

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Troca o `fetch` por respostas POR ENDEREÇO e registra o que a tela mandou.
 *
 * Por endereço, e não por ordem: na edição, o bloco de especificações (filho)
 * pede as suas antes de o formulário (pai) pedir as categorias — é a ordem em
 * que o React roda os efeitos —, e um roteiro por ordem provaria a ordem dos
 * efeitos, que não é o que interessa aqui.
 */
function respostas(porRota: Record<string, () => Response>): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      chamadas.push({
        url,
        metodo,
        corpo:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const resposta = porRota[`${metodo} ${url}`];
      if (resposta === undefined) {
        throw new Error(`chamada inesperada: ${metodo} ${url}`);
      }
      return resposta();
    }),
  );
  return chamadas;
}

/** A gravação que a tela fez, seja cadastro ou edição. */
function gravacao(chamadas: readonly Chamada[]): Chamada | undefined {
  return chamadas.find((chamada) => chamada.metodo !== "GET");
}

async function montar(elemento: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(elemento);
  });
  return container;
}

function botao(dentro: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) =>
      candidato.getAttribute("aria-label") === texto ||
      candidato.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

function campo<T extends HTMLElement>(dentro: HTMLElement, rotulo: string): T {
  const achado = dentro.querySelector<T>(`[aria-label="${rotulo}"]`);
  if (!achado) throw new Error(`nenhum campo "${rotulo}"`);
  return achado;
}

async function clicar(elemento: HTMLElement): Promise<void> {
  await act(async () => {
    elemento.click();
  });
}

/** Digita como o navegador: o React só ouve o valor que passa pelo setter nativo. */
async function digitar(
  alvo: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  valor: string,
): Promise<void> {
  const prototipo = Object.getPrototypeOf(alvo) as object;
  const setter = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  await act(async () => {
    setter?.call(alvo, valor);
    alvo.dispatchEvent(
      new Event(alvo instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function enviar(formulario: HTMLFormElement | null): Promise<void> {
  if (formulario === null) throw new Error("formulário ausente");
  await act(async () => {
    formulario.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

/** O produto do critério: a feijoada, que só sai no sábado. */
const FEIJOADA = {
  id: "p-feijoada",
  nome: "Feijoada completa",
  descricao: null,
  categoriaId: "c-pratos",
  precoCentavos: 4_990,
  status: "PUBLISHED",
  disponivel: true,
  janelas: [{ diaDaSemana: 6, abre: "11:00", fecha: "15:00" }],
};

async function formularioPronto(
  produto?: typeof FEIJOADA,
): Promise<{ tela: HTMLElement; chamadas: Chamada[] }> {
  const chamadas = respostas({
    "GET /api/catalogo/categorias": () =>
      json({ categorias: [{ id: "c-pratos", nome: "Pratos" }] }),
    "GET /api/catalogo/categorias/c-pratos/especificacoes": () =>
      json({ especificacoes: [] }),
    "GET /api/catalogo/produtos/p-feijoada/especificacoes": () =>
      json({ produtoId: "p-feijoada", campos: [], naoUsadas: [] }),
    "POST /api/catalogo/produtos": () => json({ id: "p-novo" }, 201),
    "PATCH /api/catalogo/produtos/p-feijoada": () => json({ id: "p-feijoada" }),
  });
  const tela = await montar(
    <FormularioProduto {...(produto === undefined ? {} : { produto })} />,
  );
  // As categorias e as especificações herdadas chegam antes de o dono mexer.
  expect(chamadas).toHaveLength(2);
  expect(gravacao(chamadas)).toBeUndefined();
  return { tela, chamadas };
}

describe("o dono marca o produto como esgotado sem apagar o cadastro (AC-321)", () => {
  it("@spec:AC-321 desmarcar 'Disponível para compra' manda esgotado para a rota, com o resto do cadastro intacto", async () => {
    const { tela, chamadas } = await formularioPronto();
    await digitar(
      tela.querySelector<HTMLInputElement>(
        'input[placeholder="Ex.: Pastel de queijo"]',
      )!,
      "Coxinha de frango",
    );
    await digitar(
      tela.querySelector<HTMLInputElement>('input[placeholder="19,90"]')!,
      "7,50",
    );
    const disponivel = tela.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!disponivel) throw new Error("sem o interruptor de disponibilidade");
    expect(disponivel.checked).toBe(true);
    expect(disponivel.closest("label")?.textContent).toContain(
      "aparece como esgotado na vitrine",
    );
    await clicar(disponivel);

    await enviar(tela.querySelector("form"));

    expect(gravacao(chamadas)).toMatchObject({
      url: "/api/catalogo/produtos",
      metodo: "POST",
      corpo: {
        nome: "Coxinha de frango",
        precoCentavos: 750,
        disponivel: false,
        janelas: [],
      },
    });
    expect(navegacao.push).toHaveBeenCalledWith("/painel/produtos");
  });

  it("@spec:AC-321 na edição, voltar a marcar como disponível vai para a rota do produto, e libera na hora", async () => {
    const { tela, chamadas } = await formularioPronto({
      ...FEIJOADA,
      disponivel: false,
    });
    const disponivel = tela.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(disponivel.checked).toBe(false);
    await clicar(disponivel);

    await enviar(tela.querySelector("form"));

    expect(gravacao(chamadas)).toMatchObject({
      url: "/api/catalogo/produtos/p-feijoada",
      metodo: "PATCH",
      corpo: { disponivel: true, janelas: FEIJOADA.janelas },
    });
  });

  it("@spec:AC-321 o cartão da vitrine diz que acabou, e o botão da página não adiciona", () => {
    const cartao = renderToStaticMarkup(
      <CartaoDeProduto
        produto={{
          id: "p-1",
          apelido: "coxinha",
          nome: "Coxinha",
          chamada: null,
          preco: "R$ 7,50",
          precoCentavos: 750,
          precoAnterior: null,
          imagem: null,
          disponivel: false,
          motivoIndisponivel: "ESGOTADO",
          link: "/l/loja/produto/p-1",
        }}
      />,
    );
    expect(cartao).toContain("sc-vitrine__cartao--esgotado");
    expect(cartao).toContain("Esgotado");
    expect(cartao).not.toContain("Fora do horário");

    const acao = renderToStaticMarkup(
      <BotaoAdicionar
        total="R$ 7,50"
        quantidade={1}
        aVenda={false}
        explicacao="Este item acabou. Ele volta assim que a loja repuser."
        aoMudarQuantidade={() => undefined}
        aoAdicionar={() => undefined}
      />,
    );
    expect(acao).toMatch(
      /<button[^>]*class="sc-produto__adicionar"[^>]*disabled/,
    );
    expect(acao).toContain("Indisponível");
    expect(acao).toContain("Este item acabou.");
  });
});

describe("o produto de fim de semana (AC-322)", () => {
  it("@spec:AC-322 o dono cadastra a janela de sábado no formulário, e ela vai para a rota no horário da loja", async () => {
    const { tela, chamadas } = await formularioPronto();
    await digitar(
      tela.querySelector<HTMLInputElement>(
        'input[placeholder="Ex.: Pastel de queijo"]',
      )!,
      "Feijoada completa",
    );
    await digitar(
      tela.querySelector<HTMLInputElement>('input[placeholder="19,90"]')!,
      "49,90",
    );
    expect(tela.textContent).toContain("Janela de venda");

    await clicar(botao(tela, "Adicionar dia e horário"));
    await digitar(campo<HTMLSelectElement>(tela, "Dia da janela 1"), "6");
    await digitar(campo<HTMLInputElement>(tela, "Abre na janela 1"), "11:00");
    await digitar(campo<HTMLInputElement>(tela, "Fecha na janela 1"), "15:00");
    // Uma segunda faixa, para o domingo — e removida: o que sai da tela não
    // pode ir para a rota.
    await clicar(botao(tela, "Adicionar dia e horário"));
    await digitar(campo<HTMLSelectElement>(tela, "Dia da janela 2"), "0");
    await clicar(botao(tela, "Remover janela 2"));

    await enviar(tela.querySelector("form"));

    expect(gravacao(chamadas)).toMatchObject({
      url: "/api/catalogo/produtos",
      metodo: "POST",
      corpo: {
        nome: "Feijoada completa",
        precoCentavos: 4_990,
        disponivel: true,
        janelas: [{ diaDaSemana: 6, abre: "11:00", fecha: "15:00" }],
      },
    });
  });

  it("@spec:AC-322 a faixa que fecha antes de abrir não é enviada: a tela explica e mantém o preenchimento", async () => {
    const { tela, chamadas } = await formularioPronto(FEIJOADA);
    // A janela gravada abre já preenchida na edição.
    expect(campo<HTMLSelectElement>(tela, "Dia da janela 1").value).toBe("6");
    expect(campo<HTMLInputElement>(tela, "Abre na janela 1").value).toBe(
      "11:00",
    );
    await digitar(campo<HTMLInputElement>(tela, "Fecha na janela 1"), "10:00");

    await enviar(tela.querySelector("form"));

    expect(gravacao(chamadas)).toBeUndefined();
    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "fechar precisa vir depois do de abrir",
    );
    expect(campo<HTMLInputElement>(tela, "Abre na janela 1").value).toBe(
      "11:00",
    );
  });

  it("@spec:AC-322 fora da janela, o cartão diz 'fora do horário' — e não 'esgotado' — e a página explica", () => {
    const cartao = renderToStaticMarkup(
      <CartaoDeProduto
        produto={{
          id: "p-2",
          apelido: "feijoada",
          nome: "Feijoada completa",
          chamada: null,
          preco: "R$ 49,90",
          precoCentavos: 4_990,
          precoAnterior: null,
          imagem: null,
          disponivel: false,
          motivoIndisponivel: "FORA_DO_HORARIO",
          link: "/l/loja/produto/p-2",
        }}
      />,
    );
    expect(cartao).toContain("Fora do horário");
    expect(cartao).not.toContain("Esgotado");

    const daApi: ProdutoNoContrato = {
      id: "22222222-2222-4222-8222-222222222222",
      apelido: "feijoada",
      nome: "Feijoada completa",
      chamada: null,
      descricao: null,
      imagens: [],
      precoCentavos: 4_990,
      precoAnteriorCentavos: null,
      grupos: [],
      variacoes: [],
      disponivel: false,
      motivoIndisponivel: "FORA_DO_HORARIO",
      aceitaObservacao: true,
      secao: null,
    };
    const naTela = prepararProduto(daApi, "loja", true);
    expect(naTela.disponivel).toBe(false);
    expect(naTela.explicacaoDaIndisponibilidade).toBe(
      "Este item não está sendo vendido agora.",
    );
    // No sábado a API devolve o mesmo produto comprável, e a tela o libera
    // sem nenhuma regra própria: ela só repete o que a API decidiu.
    const noSabado = prepararProduto(
      { ...daApi, disponivel: true, motivoIndisponivel: null },
      "loja",
      true,
    );
    expect(noSabado.disponivel).toBe(true);
    expect(noSabado.explicacaoDaIndisponibilidade).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * Moderação de comentários no painel (card #48), sobre o contrato do #47.
 *
 * A fila mostra autor, produto ou loja, texto e data; aprova, recusa (com
 * motivo) e apaga um a um ou em lote; as abas trocam a situação pedida à API;
 * só o dono liga "aprovar automaticamente"; e toda mudança avisa o selo do
 * menu.
 */
import type {
  ComentarioDaLoja,
  ContagemDeComentarios,
} from "@simpleclick/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  quandoFoi,
  TelaDeComentarios,
} from "../src/features/comentarios/TelaDeComentarios";
import { EVENTO_COMENTARIOS_MUDARAM } from "../src/features/comentarios/useComentariosPendentes";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function comentario(
  parte: Partial<ComentarioDaLoja> & { id: string },
): ComentarioDaLoja {
  return {
    texto: "Melhor pastel da cidade!",
    situacao: "PENDENTE",
    alvo: { tipo: "produto", produtoId: ID(9), produtoNome: "Pastel de queijo" },
    autor: { nome: "Ana R.", iniciais: "AR", bloqueado: false },
    criadoEm: "2026-10-17T12:00:00Z",
    moderadoEm: null,
    motivoDaRecusa: null,
    denuncias: 0,
    ...parte,
  };
}

interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly corpo: string | undefined;
}

/** A API de mentira: a lista muda conforme o que já foi moderado. */
function api(inicial: ComentarioDaLoja[], aprovarAutomaticamente = false) {
  const chamadas: Chamada[] = [];
  let lista = [...inicial];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      chamadas.push({
        url,
        metodo,
        corpo: typeof init?.body === "string" ? init.body : undefined,
      });
      const acao = /comentarios\/([0-9a-f-]{36})(?:\/(aprovar|recusar))?$/.exec(url);
      if (acao) {
        const [, id, verbo] = acao;
        if (metodo === "DELETE") lista = lista.filter((c) => c.id !== id);
        else
          lista = lista.map((c) =>
            c.id === id
              ? { ...c, situacao: verbo === "aprovar" ? "APROVADO" : "RECUSADO" }
              : c,
          );
        return new Response(metodo === "DELETE" ? null : "{}", {
          status: metodo === "DELETE" ? 204 : 200,
        });
      }
      if (url.includes("/configuracao")) {
        return new Response(init?.body as string, { status: 200 });
      }
      const situacao = new URL(url, "http://x").searchParams.get("situacao");
      const conta = (s: string) => lista.filter((c) => c.situacao === s).length;
      const contagem: ContagemDeComentarios = {
        pendentes: conta("PENDENTE"),
        aprovados: conta("APROVADO"),
        recusados: conta("RECUSADO"),
        denunciados: lista.filter((c) => c.denuncias > 0).length,
      };
      const daAba = lista.filter((c) => c.situacao === situacao);
      return new Response(
        JSON.stringify({
          comentarios: daAba,
          contagem,
          aprovarAutomaticamente,
          pagina: 1,
          porPagina: 20,
          total: daAba.length,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return chamadas;
}

async function esperar() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

async function montar(podeConfigurar = true): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<TelaDeComentarios podeConfigurar={podeConfigurar} />);
  });
  await esperar();
  return container;
}

function botao(dentro: Element, texto: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find(
    (candidato) => candidato.textContent?.trim().startsWith(texto),
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

async function clicar(elemento: HTMLElement) {
  await act(async () => {
    elemento.click();
  });
  await esperar();
}

function itens(tela: HTMLElement) {
  return [...tela.querySelectorAll("li[data-comentario]")];
}

describe("a moderação de comentários no painel", () => {
  it("mostra a fila de pendentes com autor, produto, texto, data e contagens", async () => {
    const chamadas = api([
      comentario({ id: ID(1), denuncias: 2 }),
      comentario({
        id: ID(2),
        alvo: { tipo: "loja", produtoId: null, produtoNome: null },
        texto: "Atendimento ótimo",
      }),
      comentario({ id: ID(3), situacao: "APROVADO" }),
    ]);
    const tela = await montar();

    expect(chamadas[0]?.url).toContain("situacao=PENDENTE");
    const fila = itens(tela);
    expect(fila).toHaveLength(2);
    expect(fila[0]?.textContent).toContain("Ana R.");
    expect(fila[0]?.textContent).toContain("Melhor pastel da cidade!");
    expect(fila[0]?.textContent).toContain("2 denúncias");
    expect(
      fila[0]?.querySelector(`a[href="/painel/produtos/${ID(9)}"]`)?.textContent,
    ).toBe("Pastel de queijo");
    expect(fila[1]?.textContent).toContain("Na página da loja");
    const abas = [...tela.querySelectorAll('[role="tab"]')].map((a) =>
      a.textContent?.replace(/\s+/g, " "),
    );
    expect(abas).toEqual(["Pendentes2", "Aprovados1", "Recusados0"]);
  });

  it("aprovar tira da fila, atualiza as contagens e avisa o selo do menu", async () => {
    const chamadas = api([comentario({ id: ID(1) })]);
    const avisos = vi.fn();
    window.addEventListener(EVENTO_COMENTARIOS_MUDARAM, avisos);
    const tela = await montar();

    await clicar(botao(itens(tela)[0]!, "Aprovar"));

    expect(chamadas).toContainEqual({
      url: `/api/loja/comentarios/${ID(1)}/aprovar`,
      metodo: "POST",
      corpo: "{}",
    });
    expect(itens(tela)).toHaveLength(0);
    expect(tela.textContent).toContain("1 comentário aprovado.");
    expect(tela.textContent).toContain("Tudo em dia!");
    expect(avisos).toHaveBeenCalled();
    window.removeEventListener(EVENTO_COMENTARIOS_MUDARAM, avisos);
  });

  it("recusar pede um motivo opcional e manda para a API", async () => {
    const chamadas = api([comentario({ id: ID(1) })]);
    const tela = await montar();

    await clicar(botao(itens(tela)[0]!, "Recusar"));
    const campo = tela.querySelector<HTMLInputElement>(
      'input[placeholder^="Ex.: ofensivo"]',
    );
    if (!campo) throw new Error("sem o campo do motivo");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(campo, "propaganda");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clicar(botao(tela, "Confirmar recusa"));

    expect(chamadas).toContainEqual({
      url: `/api/loja/comentarios/${ID(1)}/recusar`,
      metodo: "POST",
      corpo: JSON.stringify({ motivo: "propaganda" }),
    });
    expect(tela.textContent).toContain("1 comentário recusado.");
  });

  it("aprova vários de uma vez pela seleção", async () => {
    const chamadas = api([
      comentario({ id: ID(1) }),
      comentario({ id: ID(2) }),
      comentario({ id: ID(3) }),
    ]);
    const tela = await montar();

    const marcarTodos = [...tela.querySelectorAll("label")]
      .find((l) => l.textContent?.includes("Selecionar todos"))
      ?.querySelector("input");
    await clicar(marcarTodos as HTMLInputElement);
    expect(tela.textContent).toContain("3 selecionados");
    await clicar(botao(tela, "Aprovar selecionados"));

    expect(
      chamadas.filter((c) => c.url.endsWith("/aprovar")).map((c) => c.url),
    ).toHaveLength(3);
    expect(tela.textContent).toContain("3 comentários aprovados.");
    expect(itens(tela)).toHaveLength(0);
  });

  it("apagar em lote pede confirmação antes", async () => {
    const chamadas = api([comentario({ id: ID(1) }), comentario({ id: ID(2) })]);
    const tela = await montar();

    const caixa = itens(tela)[1]!.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await clicar(caixa);
    await clicar(botao(tela, "Apagar selecionados"));
    expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(false);
    await clicar(botao(tela, "Apagar 1 de vez"));

    expect(chamadas).toContainEqual({
      url: `/api/loja/comentarios/${ID(2)}`,
      metodo: "DELETE",
      corpo: undefined,
    });
    expect(itens(tela)).toHaveLength(1);
  });

  it("a aba Aprovados pede a situação certa e oferece recusar e apagar", async () => {
    const chamadas = api([comentario({ id: ID(1), situacao: "APROVADO" })]);
    const tela = await montar();

    const aba = [...tela.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (a) => a.textContent?.startsWith("Aprovados"),
    )!;
    await clicar(aba);

    expect(chamadas.at(-1)?.url).toContain("situacao=APROVADO");
    const botoes = [...itens(tela)[0]!.querySelectorAll("button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(botoes).toEqual(["Recusar", "Apagar"]);
  });

  it("o dono liga a aprovação automática; a equipe só vê o estado", async () => {
    const chamadas = api([], false);
    const tela = await montar(true);
    const chave = tela.querySelector<HTMLInputElement>('[role="switch"]')!;
    await clicar(chave);
    expect(chamadas).toContainEqual({
      url: "/api/loja/comentarios/configuracao",
      metodo: "PUT",
      corpo: JSON.stringify({ aprovarAutomaticamente: true }),
    });
    expect(tela.textContent).toContain("Ligado");

    act(() => raiz?.unmount());
    container?.remove();
    raiz = null;
    api([], true);
    const daEquipe = await montar(false);
    expect(daEquipe.querySelector('[role="switch"]')).toBeNull();
    expect(daEquipe.textContent).toContain("Ligado · só o dono muda");
  });

  it("a data sai em palavras curtas", () => {
    const agora = new Date(2026, 9, 17, 15, 0);
    expect(quandoFoi(new Date(2026, 9, 17, 14, 5).toISOString(), agora)).toBe(
      "hoje às 14:05",
    );
    expect(quandoFoi(new Date(2026, 9, 16, 9, 30).toISOString(), agora)).toBe(
      "ontem às 09:30",
    );
    expect(quandoFoi(new Date(2026, 9, 12, 18, 0).toISOString(), agora)).toBe(
      "12/10 às 18:00",
    );
  });
});

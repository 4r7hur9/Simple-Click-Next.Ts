// @vitest-environment jsdom
/**
 * Gaveta e aviso flutuante (card #104, T-10406).
 *
 * O jsdom não implementa a camada modal de verdade, então `showModal()` e
 * `close()` são dublês que registram a chamada e ligam o atributo `open`. O
 * que o jsdom não prova (foco preso, resto da página sem resposta) fica no
 * e2e `e2e/specs/base-visual.onp.spec.ts`, num navegador real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AvisoFlutuante,
  DURACAO_MINIMA_DO_AVISO_MS,
  Gaveta,
} from "@simpleclick/ui";

const CSS = readFileSync(
  join(process.cwd(), "packages", "ui", "styles", "componentes.css"),
  "utf8",
);

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;
const chamadas: string[] = [];

beforeEach(() => {
  chamadas.length = 0;
  HTMLDialogElement.prototype.showModal = function showModal() {
    chamadas.push("showModal");
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    chamadas.push("close");
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

function montar(arvore: ReactNode): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(arvore));
  return container;
}

/** Um botão que abre a gaveta, como a sacola abre a dela. */
function Cena({ aoFecharDoTeste }: { aoFecharDoTeste?: () => void }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button type="button" id="gatilho" onClick={() => setAberta(true)}>
        Abrir sacola
      </button>
      <Gaveta
        id="sacola"
        aberta={aberta}
        titulo="Sua sacola"
        rodape={<button type="button">Fechar pedido</button>}
        aoFechar={() => {
          aoFecharDoTeste?.();
          setAberta(false);
        }}
      >
        <p>2 itens</p>
      </Gaveta>
    </>
  );
}

const dialogo = (): HTMLDialogElement => {
  const achado = container?.querySelector("dialog");
  if (!achado) throw new Error("gaveta não renderizada");
  return achado;
};

describe("gaveta", () => {
  it("[CA-12] @spec:AC-10412 abre como modal de verdade, com nome vindo do título", () => {
    const tela = montar(<Cena />);
    expect(dialogo().open).toBe(false);

    act(() => tela.querySelector<HTMLButtonElement>("#gatilho")?.click());

    expect(chamadas).toEqual(["showModal"]);
    expect(dialogo().open).toBe(true);
    const titulo = tela.querySelector("#sacola-titulo");
    expect(titulo?.textContent).toBe("Sua sacola");
    expect(dialogo().getAttribute("aria-labelledby")).toBe("sacola-titulo");
    expect(dialogo().textContent).toContain("2 itens");
  });

  it("[CA-12] @spec:AC-10412 Esc (evento cancel) fecha, sem deixar o navegador fechar por conta própria", () => {
    const pedidos: string[] = [];
    montar(<Cena aoFecharDoTeste={() => pedidos.push("fechar")} />);
    act(() => container?.querySelector<HTMLButtonElement>("#gatilho")?.click());

    const cancelar = new Event("cancel", { cancelable: true });
    act(() => {
      dialogo().dispatchEvent(cancelar);
    });

    expect(cancelar.defaultPrevented).toBe(true);
    expect(pedidos).toEqual(["fechar"]);
    expect(chamadas).toEqual(["showModal", "close"]);
    expect(dialogo().open).toBe(false);
  });

  it("[CA-12] @spec:AC-10412 o botão de fechar também fecha, e tem nome para o leitor de tela", () => {
    montar(<Cena />);
    act(() => container?.querySelector<HTMLButtonElement>("#gatilho")?.click());

    const fechar = dialogo().querySelector<HTMLButtonElement>(
      ".sc-gaveta-modal__fechar",
    );
    expect(fechar?.textContent).toBe("Fechar");
    act(() => fechar?.click());
    expect(dialogo().open).toBe(false);
  });

  it("[CA-12] @spec:AC-10412 ao fechar, o foco volta ao botão que abriu a gaveta", () => {
    const tela = montar(<Cena />);
    const gatilho = tela.querySelector<HTMLButtonElement>("#gatilho");
    gatilho?.focus();
    expect(document.activeElement).toBe(gatilho);

    act(() => gatilho?.click());
    // Dentro da janela modal o foco vai para outro elemento.
    dialogo()
      .querySelector<HTMLButtonElement>(".sc-gaveta-modal__fechar")
      ?.focus();
    expect(document.activeElement).not.toBe(gatilho);

    act(() => {
      dialogo().dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(document.activeElement).toBe(gatilho);
  });

  it("[CA-12] @spec:AC-10412 se o navegador fechar sozinho, quem chama é avisado e o estado não fica fora de sincronia", () => {
    const pedidos: string[] = [];
    montar(<Cena aoFecharDoTeste={() => pedidos.push("fechar")} />);
    act(() => container?.querySelector<HTMLButtonElement>("#gatilho")?.click());

    // Fechamento nativo sem `cancel` cancelável (segundo Esc em alguns navegadores).
    act(() => {
      dialogo().removeAttribute("open");
      dialogo().dispatchEvent(new Event("close"));
    });
    expect(pedidos).toEqual(["fechar"]);
  });

  it("[CA-12] @spec:AC-10412 clicar no fundo escurecido fecha; clicar no conteúdo não", () => {
    const pedidos: string[] = [];
    montar(<Cena aoFecharDoTeste={() => pedidos.push("fechar")} />);
    act(() => container?.querySelector<HTMLButtonElement>("#gatilho")?.click());

    act(() => dialogo().querySelector<HTMLElement>("p")?.click());
    expect(pedidos).toEqual([]);

    act(() => dialogo().click());
    expect(pedidos).toEqual(["fechar"]);
  });

  it("[CA-12] @spec:AC-10412 declara o lado, a área segura e não depende do Dialogo nem da classe antiga", () => {
    expect(CSS).toMatch(/\.sc-gaveta-modal--baixo\s*\{/);
    expect(CSS).toMatch(/\.sc-gaveta-modal--direita\s*\{/);
    expect(CSS).toMatch(
      /\.sc-gaveta-modal__rodape\s*\{[^}]*env\(safe-area-inset-bottom/,
    );
    // `.sc-gaveta` (painel, filtros.css) some a partir de 48rem; a nova não colide.
    expect(CSS).not.toMatch(/\.sc-gaveta\s*\{/);
  });

  it("[CA-12] @spec:AC-10412 embutida aparece aberta sem showModal", () => {
    montar(
      <Gaveta id="demo" aberta embutida titulo="Filtros" aoFechar={() => {}}>
        <p>conteúdo</p>
      </Gaveta>,
    );
    expect(dialogo().open).toBe(true);
    expect(chamadas).toEqual([]);
  });
});

describe("aviso flutuante", () => {
  it("[CA-13] @spec:AC-10413 as duas regiões vivas existem desde o primeiro render, vazias", () => {
    const tela = montar(<AvisoFlutuante mensagem={null} aoFechar={() => {}} />);
    const status = tela.querySelector("[role=status]");
    const alerta = tela.querySelector("[role=alert]");

    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("");
    expect(alerta?.textContent).toBe("");
  });

  it("[CA-13] @spec:AC-10413 a mensagem entra na região certa e o foco não sai do lugar", () => {
    const tela = montar(
      <>
        <button type="button" id="antes">
          Adicionar
        </button>
        <AvisoFlutuante mensagem={null} aoFechar={() => {}} />
      </>,
    );
    tela.querySelector<HTMLButtonElement>("#antes")?.focus();

    act(() =>
      raiz?.render(
        <>
          <button type="button" id="antes">
            Adicionar
          </button>
          <AvisoFlutuante mensagem="Adicionado à sacola" aoFechar={() => {}} />
        </>,
      ),
    );
    expect(tela.querySelector("[role=status]")?.textContent).toContain(
      "Adicionado à sacola",
    );
    expect(tela.querySelector("[role=alert]")?.textContent).toBe("");
    expect(document.activeElement?.id).toBe("antes");

    act(() =>
      raiz?.render(
        <AvisoFlutuante
          tom="erro"
          mensagem="Sem estoque"
          aoFechar={() => {}}
        />,
      ),
    );
    expect(tela.querySelector("[role=alert]")?.textContent).toContain(
      "Sem estoque",
    );
    expect(tela.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("[CA-13] @spec:AC-10413 fica pelo menos 5 segundos, mesmo se pedirem menos", () => {
    vi.useFakeTimers();
    let fechou = 0;
    montar(
      <AvisoFlutuante
        mensagem="Oi"
        duracao={500}
        aoFechar={() => (fechou += 1)}
      />,
    );
    expect(DURACAO_MINIMA_DO_AVISO_MS).toBe(5000);

    act(() => vi.advanceTimersByTime(4999));
    expect(fechou).toBe(0);
    act(() => vi.advanceTimersByTime(2));
    expect(fechou).toBe(1);
  });

  it("[CA-13] @spec:AC-10413 pausa com o mouse em cima e retoma de onde parou", () => {
    vi.useFakeTimers();
    let fechou = 0;
    const tela = montar(
      <AvisoFlutuante
        mensagem="Oi"
        duracao={6000}
        aoFechar={() => (fechou += 1)}
      />,
    );
    const cartao = tela.querySelector(".sc-aviso-flutuante__cartao");

    act(() => vi.advanceTimersByTime(3000));
    act(() => {
      cartao?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(fechou).toBe(0);

    act(() => {
      cartao?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(2900));
    expect(fechou).toBe(0);
    act(() => vi.advanceTimersByTime(200));
    expect(fechou).toBe(1);
  });

  it("[CA-13] @spec:AC-10413 pausa também com o foco dentro", () => {
    vi.useFakeTimers();
    let fechou = 0;
    const tela = montar(
      <AvisoFlutuante mensagem="Oi" aoFechar={() => (fechou += 1)} />,
    );
    act(() => {
      tela
        .querySelector<HTMLButtonElement>(".sc-aviso-flutuante__fechar")
        ?.focus();
    });

    act(() => vi.advanceTimersByTime(60_000));
    expect(fechou).toBe(0);
  });

  it("[CA-13] @spec:AC-10413 pode ser fechado pelo botão, que entra na ordem do Tab, e a ação também", () => {
    let fechou = 0;
    let acionou = 0;
    const tela = montar(
      <AvisoFlutuante
        mensagem="Adicionado"
        acao={{ rotulo: "Ver sacola", aoAcionar: () => (acionou += 1) }}
        aoFechar={() => (fechou += 1)}
      />,
    );
    const botoes = [...tela.querySelectorAll<HTMLButtonElement>("button")];
    expect(botoes.map((b) => b.textContent)).toEqual([
      "Ver sacola",
      "Fechar aviso",
    ]);
    for (const botao of botoes) expect(botao.tabIndex).toBe(0);

    act(() => botoes[0]?.click());
    act(() => botoes[1]?.click());
    expect([acionou, fechou]).toEqual([1, 1]);
  });

  it("[CA-13] @spec:AC-10413 não rouba o foco ao aparecer: nada recebe autofoco", () => {
    const tela = montar(<AvisoFlutuante mensagem="Oi" aoFechar={() => {}} />);
    expect(tela.querySelector("[autofocus]")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

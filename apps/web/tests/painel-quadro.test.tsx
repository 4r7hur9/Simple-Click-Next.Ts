// @vitest-environment jsdom
/**
 * Prova do quadro de pedidos por dia (kanban do painel — card #33).
 *
 * O quadro é montado como o painel o monta, com três trocas: o leitor do dia,
 * a mudança de status e a leitura do detalhe respondem sem rede, e o relógio é
 * de mentira. A REGRA não é trocada: as seis etapas e o caminho de cada forma
 * de receber vêm do contrato compartilhado, e o aviso sonoro vem de
 * `packages/core`, pelo mesmo caminho que o painel de verdade usa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";

import { CHAVE_DO_SOM_SILENCIADO } from "../src/features/painel-pedidos/AvisoSonoro";
import { QuadroKanban } from "../src/features/painel-pedidos/QuadroKanban";
import type {
  LeituraDoQuadro,
  PedidoDoQuadro,
  ResultadoDaMudanca,
} from "../src/lib/quadro-de-pedidos";

const AGORA = new Date("2026-10-16T15:10:00.000Z");
const INTERVALO = 5_000;
const HOJE = "2026-10-16";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(AGORA);
  window.localStorage.clear();
  // O jsdom não traz `matchMedia` nem a janela modal; o calendário e as
  // janelas do painel precisam dos dois.
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
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
  window.history.replaceState(null, "", "/");
});

function pedido(
  id: string,
  status: string,
  sobrescrita: Partial<PedidoDoQuadro> = {},
): PedidoDoQuadro {
  return {
    id,
    numero: Number(id),
    codigo: `A-${id.padStart(4, "0")}`,
    status,
    canal: "ONLINE",
    entrega: "DELIVERY",
    cliente: `Cliente ${id}`,
    totalCentavos: 1_000 * Number(id),
    criadoEm: "2026-10-16T15:00:00.000Z",
    aguardandoConfirmacaoWhatsapp: false,
    pagamento: "PIX",
    itens: [{ quantidade: 2, nome: "Pastel de Carne" }],
    itensAMais: 0,
    motivoCancelamento: null,
    deOutroDia: false,
    ...sobrescrita,
  };
}

const ok = (
  pedidos: readonly PedidoDoQuadro[],
  dia: string = HOJE,
): LeituraDoQuadro => ({
  estado: "ok",
  quadro: { dia, hoje: HOJE, fuso: "America/Sao_Paulo", pedidos },
});
const QUEDA: LeituraDoQuadro = { estado: "erro", motivo: "falha de rede" };

/** Devolve as leituras na ordem dada e repete a última — o servidor parado. */
function leitor(...leituras: LeituraDoQuadro[]) {
  const fila = [...leituras];
  return vi.fn(async (_dia: string): Promise<LeituraDoQuadro> => {
    const proxima = fila.length > 1 ? fila.shift() : fila[0];
    if (proxima === undefined) throw new Error("cenário sem leitura");
    return proxima;
  });
}

interface Extras {
  readonly tocar?: () => void;
  readonly mudar?: (
    id: string,
    status: string,
    motivo: string | null,
  ) => Promise<ResultadoDaMudanca>;
  readonly buscarDetalhe?: typeof fetch;
  readonly diaInicial?: string;
}

async function montar(
  buscar: (dia: string) => Promise<LeituraDoQuadro>,
  extras: Extras = {},
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <QuadroKanban
        buscar={buscar}
        tocar={extras.tocar ?? vi.fn()}
        intervaloMs={INTERVALO}
        agora={() => new Date()}
        mudar={extras.mudar ?? (async () => ({ ok: true }))}
        {...(extras.buscarDetalhe
          ? { buscarDetalhe: extras.buscarDetalhe }
          : {})}
        {...(extras.diaInicial ? { diaInicial: extras.diaInicial } : {})}
      />,
    );
  });
  await avancar(0);
  return container;
}

async function avancar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function coluna(tela: HTMLElement, status: string): HTMLElement {
  const achada = tela.querySelector<HTMLElement>(`[data-coluna="${status}"]`);
  if (!achada) throw new Error(`o quadro não tem a coluna ${status}`);
  return achada;
}

function idsDaColuna(tela: HTMLElement, status: string): string[] {
  return [...coluna(tela, status).querySelectorAll("[data-pedido]")].map(
    (cartao) => cartao.getAttribute("data-pedido") ?? "",
  );
}

function contador(tela: HTMLElement, status: string): string {
  return tela.querySelector(`[data-contador="${status}"]`)?.textContent ?? "";
}

function cartao(tela: HTMLElement, id: string): HTMLElement {
  const achado = tela.querySelector<HTMLElement>(`[data-pedido="${id}"]`);
  if (!achado) throw new Error(`o pedido ${id} não está na tela`);
  return achado;
}

function botao(tela: ParentNode, trecho: string): HTMLButtonElement {
  const achado = [...tela.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`não existe botão com "${trecho}"`);
  return achado;
}

/** Um evento de arrastar com o `dataTransfer` mínimo que a tela usa. */
function evento(tipo: string): Event {
  const arrastar = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(arrastar, "dataTransfer", {
    value: { setData: () => undefined, effectAllowed: "", dropEffect: "" },
  });
  return arrastar;
}

async function arrastar(
  tela: HTMLElement,
  id: string,
  paraStatus: string,
  soltar = true,
): Promise<void> {
  await act(async () => {
    cartao(tela, id).dispatchEvent(evento("dragstart"));
  });
  await act(async () => {
    coluna(tela, paraStatus).dispatchEvent(evento("dragover"));
  });
  if (soltar) {
    await act(async () => {
      coluna(tela, paraStatus).dispatchEvent(evento("drop"));
    });
  }
}

describe("as seis colunas do dia", () => {
  it("mostra as seis etapas na ordem do trabalho, cada pedido na sua, com contador", async () => {
    const tela = await montar(
      leitor(
        ok([
          pedido("1", "PENDING"),
          pedido("2", "ACCEPTED"),
          pedido("3", "PREPARING"),
          pedido("4", "READY_FOR_PICKUP", { entrega: "PICKUP" }),
          pedido("5", "OUT_FOR_DELIVERY"),
          pedido("6", "COMPLETED"),
          pedido("7", "PENDING"),
        ]),
      ),
    );

    const nomes = [...tela.querySelectorAll(".sc-kanban__nome")].map(
      (titulo) => titulo.textContent,
    );
    expect(nomes).toEqual([
      "Pedido gerado",
      "Confirmado",
      "Em preparo",
      "Retirada",
      "Saiu para entrega",
      "Concluída",
    ]);
    expect(idsDaColuna(tela, "PENDING")).toEqual(["1", "7"]);
    expect(contador(tela, "PENDING")).toContain("2");
    expect(idsDaColuna(tela, "READY_FOR_PICKUP")).toEqual(["4"]);
    expect(idsDaColuna(tela, "OUT_FOR_DELIVERY")).toEqual(["5"]);
    expect(idsDaColuna(tela, "COMPLETED")).toEqual(["6"]);
  });

  it("o cartão mostra número, hora, cliente, itens, total, entrega, pagamento e tempo", async () => {
    const tela = await montar(
      leitor(
        ok([
          pedido("12", "PENDING", {
            entrega: "PICKUP",
            pagamento: "CASH",
            itens: [
              { quantidade: 2, nome: "Pastel de Carne" },
              { quantidade: 1, nome: "Suco" },
            ],
            itensAMais: 2,
          }),
        ]),
      ),
    );
    const texto = cartao(tela, "12").textContent ?? "";
    expect(texto).toContain("#12");
    expect(texto).toContain("Cliente 12");
    expect(texto).toContain("2× Pastel de Carne · 1× Suco e mais 2");
    expect(texto).toContain("R$");
    expect(texto).toContain("Retirada");
    expect(texto).toContain("Dinheiro");
    // O relógio é o das 15:10 e o pedido entrou às 15:00.
    expect(texto).toContain("há 10 min");
  });

  it("cancelado fica fora do quadro e aparece na visão Cancelados, com o motivo", async () => {
    const tela = await montar(
      leitor(
        ok([
          pedido("1", "PENDING"),
          pedido("2", "CANCELLED", { motivoCancelamento: "Acabou o produto" }),
        ]),
      ),
    );
    expect(tela.querySelector('[data-pedido="2"]')).toBeNull();
    expect(botao(tela, "Cancelados").textContent).toContain("(1)");

    await act(async () => {
      botao(tela, "Cancelados").click();
    });
    expect(cartao(tela, "2").textContent).toContain("Motivo: Acabou o produto");
    expect(tela.querySelector("[data-quadro]")).toBeNull();
  });

  it("dia sem pedido explica o que fazer, e o erro de rede avisa que continua tentando", async () => {
    const vazio = await montar(leitor(ok([])));
    expect(vazio.textContent).toContain("Nenhum pedido hoje ainda");
    act(() => raiz?.unmount());
    container?.remove();

    const caiu = await montar(leitor(QUEDA));
    expect(caiu.textContent).toContain("Não foi possível carregar os pedidos");
  });
});

describe("pedido novo avisa (AC-600, AC-603)", () => {
  it("o pedido que chega toca uma vez e fica destacado; abrir a tela não toca", async () => {
    const tocar = vi.fn();
    const tela = await montar(
      leitor(
        ok([pedido("1", "PENDING")]),
        ok([pedido("1", "PENDING"), pedido("2", "PENDING")]),
      ),
      { tocar },
    );
    expect(tocar).not.toHaveBeenCalled();

    await avancar(INTERVALO);

    expect(idsDaColuna(tela, "PENDING")).toEqual(["1", "2"]);
    expect(tocar).toHaveBeenCalledTimes(1);
    expect(tela.textContent).toContain("1 pedido novo");
    expect(cartao(tela, "2").textContent).toContain("Novo");
    expect(cartao(tela, "1").textContent).not.toContain("Novo");

    await act(async () => {
      botao(tela, "Marcar como vistos").click();
    });
    expect(cartao(tela, "2").textContent).not.toContain("Novo");
  });

  it("com o som silenciado não toca, mas o destaque continua", async () => {
    window.localStorage.setItem(CHAVE_DO_SOM_SILENCIADO, "true");
    const tocar = vi.fn();
    const tela = await montar(
      leitor(
        ok([pedido("1", "PENDING")]),
        ok([pedido("1", "PENDING"), pedido("2", "PENDING")]),
      ),
      { tocar },
    );
    await avancar(INTERVALO);
    expect(tocar).not.toHaveBeenCalled();
    expect(cartao(tela, "2").textContent).toContain("Novo");
  });

  it("olhar um dia que já passou não é pedido novo: nada toca", async () => {
    const tocar = vi.fn();
    await montar(
      leitor(
        ok([pedido("1", "COMPLETED")], "2026-10-15"),
        ok([pedido("1", "COMPLETED"), pedido("2", "PENDING")], "2026-10-15"),
      ),
      { tocar, diaInicial: "2026-10-15" },
    );
    await avancar(INTERVALO);
    expect(tocar).not.toHaveBeenCalled();
  });

  it("depois de uma queda, o quadro se recupera sozinho e avisa", async () => {
    const tela = await montar(
      leitor(ok([pedido("1", "PENDING")]), QUEDA, ok([pedido("1", "PENDING")])),
    );
    await avancar(INTERVALO);
    expect(tela.textContent).toContain("A conexão caiu");
    expect(idsDaColuna(tela, "PENDING")).toEqual(["1"]);
    await avancar(INTERVALO);
    expect(tela.textContent).toContain("Conexão recuperada");
  });
});

describe("o seletor do dia", () => {
  it("começa em hoje, volta um dia pelo botão e não passa de hoje", async () => {
    // O servidor devolve o dia pedido; "hoje" é o dia da loja.
    const buscar = vi.fn(async (dia: string) =>
      ok([pedido("1", "PENDING")], dia === "hoje" ? HOJE : dia),
    );
    const tela = await montar(buscar);
    expect(buscar).toHaveBeenLastCalledWith("hoje");
    expect(botao(tela, "Próximo dia").disabled).toBe(true);

    await act(async () => {
      botao(tela, "Dia anterior").click();
    });
    await avancar(0);
    expect(buscar).toHaveBeenLastCalledWith("2026-10-15");
    expect(window.location.search).toContain("dia=2026-10-15");
    expect(botao(tela, "Próximo dia").disabled).toBe(false);
  });
});

describe("avançar por botão", () => {
  it("o botão rápido manda o passo seguinte e o cartão já aparece na coluna nova", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(
      leitor(ok([pedido("1", "PENDING")]), ok([pedido("1", "ACCEPTED")])),
      { mudar },
    );

    await act(async () => {
      botao(cartao(tela, "1"), "Confirmar").click();
    });

    expect(mudar).toHaveBeenCalledWith("1", "ACCEPTED", null);
    expect(idsDaColuna(tela, "ACCEPTED")).toEqual(["1"]);
    expect(idsDaColuna(tela, "PENDING")).toEqual([]);
  });

  it("pedido de retirada vai de Em preparo para Retirada; o de entrega, para Saiu para entrega", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(
      leitor(
        ok([
          pedido("1", "PREPARING", { entrega: "PICKUP" }),
          pedido("2", "PREPARING", { entrega: "DELIVERY" }),
        ]),
      ),
      { mudar },
    );
    expect(cartao(tela, "1").textContent).toContain("Pronto para retirada");
    expect(cartao(tela, "2").textContent).toContain("Saiu para entrega");

    await act(async () => {
      botao(cartao(tela, "1"), "Pronto para retirada").click();
    });
    await act(async () => {
      botao(cartao(tela, "2"), "Saiu para entrega").click();
    });
    expect(mudar).toHaveBeenNthCalledWith(1, "1", "READY_FOR_PICKUP", null);
    expect(mudar).toHaveBeenNthCalledWith(2, "2", "OUT_FOR_DELIVERY", null);
  });

  it("se a API recusar, o cartão volta e a explicação aparece", async () => {
    const mudar = vi.fn(async (): Promise<ResultadoDaMudanca> => ({
      ok: false,
      explicacao: "Não é possível mudar de Pedido gerado para Confirmado.",
    }));
    const tela = await montar(leitor(ok([pedido("1", "PENDING")])), { mudar });

    await act(async () => {
      botao(cartao(tela, "1"), "Confirmar").click();
    });

    expect(idsDaColuna(tela, "PENDING")).toEqual(["1"]);
    expect(tela.textContent).toContain("Não foi possível mover o pedido");
    expect(tela.textContent).toContain("Não é possível mudar de Pedido gerado");
  });

  it("pedido concluído não oferece botão de avançar nem de cancelar", async () => {
    const tela = await montar(leitor(ok([pedido("1", "COMPLETED")])));
    expect(cartao(tela, "1").querySelectorAll("button").length).toBe(1);
  });
});

describe("arrastar entre colunas", () => {
  it("soltar na coluna seguinte move o pedido", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(leitor(ok([pedido("1", "PENDING")])), { mudar });

    await arrastar(tela, "1", "ACCEPTED");

    expect(mudar).toHaveBeenCalledWith("1", "ACCEPTED", null);
    expect(idsDaColuna(tela, "ACCEPTED")).toEqual(["1"]);
  });

  it("entrega não vai para Retirada: a coluna recusa com a explicação e nada é enviado", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(leitor(ok([pedido("1", "PREPARING")])), {
      mudar,
    });

    await arrastar(tela, "1", "READY_FOR_PICKUP", false);
    expect(coluna(tela, "READY_FOR_PICKUP").getAttribute("data-alvo")).toBe(
      "recusado",
    );
    expect(coluna(tela, "READY_FOR_PICKUP").textContent).toContain(
      "Pedido de entrega não passa por",
    );

    await act(async () => {
      coluna(tela, "READY_FOR_PICKUP").dispatchEvent(evento("drop"));
    });
    expect(mudar).not.toHaveBeenCalled();
    expect(tela.textContent).toContain("Não foi possível mover o pedido");
    expect(idsDaColuna(tela, "PREPARING")).toEqual(["1"]);
  });

  it("retirada não vai para Saiu para entrega", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(
      leitor(ok([pedido("1", "PREPARING", { entrega: "PICKUP" })])),
      { mudar },
    );
    await arrastar(tela, "1", "OUT_FOR_DELIVERY");
    expect(mudar).not.toHaveBeenCalled();
    expect(tela.textContent).toContain(
      "Pedido de retirada não passa por “Saiu para entrega”",
    );
  });

  it("não pula etapa nem volta atrás", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(
      leitor(ok([pedido("1", "ACCEPTED"), pedido("2", "PREPARING")])),
      { mudar },
    );
    await arrastar(tela, "1", "COMPLETED");
    expect(tela.textContent).toContain("Avance uma etapa por vez");
    await arrastar(tela, "2", "PENDING");
    expect(tela.textContent).toContain("não volta de etapa");
    expect(mudar).not.toHaveBeenCalled();
  });
});

describe("cancelar", () => {
  it("pede o motivo, só libera com texto e manda o cancelamento com ele", async () => {
    const mudar = vi.fn(async () => ({ ok: true }) as const);
    const tela = await montar(leitor(ok([pedido("1", "PREPARING")])), {
      mudar,
    });

    await act(async () => {
      botao(cartao(tela, "1"), "Cancelar").click();
    });
    const janela = [...tela.querySelectorAll("dialog")].find((d) =>
      d.textContent?.includes("motivo"),
    ) as HTMLDialogElement;
    expect(janela.hasAttribute("open")).toBe(true);
    const enviar = [...janela.querySelectorAll("button")].find(
      (b) => b.getAttribute("type") === "submit",
    ) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);

    const campo = janela.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      definir?.call(campo, "Acabou o produto");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(enviar.disabled).toBe(false);

    await act(async () => {
      enviar.click();
    });
    expect(mudar).toHaveBeenCalledWith("1", "CANCELLED", "Acabou o produto");
    // Saiu do quadro: vai para a visão Cancelados.
    expect(tela.querySelector('[data-pedido="1"]')).toBeNull();
  });

  it("pedido que ainda espera confirmação é recusado, não cancelado", async () => {
    const tela = await montar(leitor(ok([pedido("1", "PENDING")])));
    expect(cartao(tela, "1").textContent).toContain("Recusar");
  });
});

describe("abrir o pedido", () => {
  it("o cartão abre o detalhe em janela, com itens, histórico e imprimir", async () => {
    const detalhe = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pedido: {
              id: "1",
              numero: 1,
              codigo: "A-0001",
              status: "PENDING",
              canal: "ONLINE",
              entrega: "DELIVERY",
              pagamento: "PIX",
              totalCentavos: 1_000,
              criadoEm: "2026-10-16T15:00:00.000Z",
              observacao: "Sem cebola",
              motivoCancelamento: null,
              contato: {
                nome: "Maria",
                telefone: "+5585999990000",
                endereco: { logradouro: "Rua A", numero: "10" },
              },
              itens: [
                {
                  id: "i1",
                  nome: "Pastel de Carne",
                  variacao: null,
                  quantidade: 2,
                  totalCentavos: 1_000,
                  observacao: null,
                  opcoes: [],
                },
              ],
              historico: [
                {
                  id: "h1",
                  de: null,
                  para: "PENDING",
                  papel: null,
                  motivo: null,
                  ocorridoEm: "2026-10-16T15:00:00.000Z",
                },
              ],
              proximosStatus: [
                {
                  status: "ACCEPTED",
                  rotulo: "Aceito",
                  acao: "Aceitar pedido",
                },
              ],
            },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const tela = await montar(leitor(ok([pedido("1", "PENDING")])), {
      buscarDetalhe: detalhe,
    });

    await act(async () => {
      (
        cartao(tela, "1").querySelector(
          ".sc-cartao-pedido__abrir",
        ) as HTMLButtonElement
      ).click();
    });
    await avancar(0);

    const janela = tela.querySelector("dialog[open]") as HTMLDialogElement;
    expect(janela).not.toBeNull();
    expect(detalhe).toHaveBeenCalled();
    const texto = janela.textContent ?? "";
    expect(texto).toContain("Pedido #1");
    expect(texto).toContain("2× Pastel de Carne");
    expect(texto).toContain("Sem cebola");
    expect(texto).toContain("Rua A, 10");
    expect(texto).toContain("Linha do tempo");
    expect(texto).toContain("Pix");
    expect(texto).toContain("Imprimir cupom");
    expect(janela.querySelector('a[href="/imprimir/1"]')).not.toBeNull();
  });
});

describe("o quadro é acessível (P-012)", () => {
  it("o quadro com pedidos não tem violação crítica nem séria", async () => {
    const tela = await montar(
      leitor(
        ok([
          pedido("1", "PENDING", { aguardandoConfirmacaoWhatsapp: true }),
          pedido("2", "PREPARING"),
          pedido("3", "READY_FOR_PICKUP", { entrega: "PICKUP" }),
          pedido("4", "CANCELLED", { motivoCancelamento: "Sem estoque" }),
        ]),
      ),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    });
    vi.useRealTimers();
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(graves.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

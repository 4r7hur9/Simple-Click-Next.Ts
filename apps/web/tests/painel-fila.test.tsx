// @vitest-environment jsdom
/**
 * Prova da fila de pedidos do dono na tela (AC-600..AC-603, AC-609).
 *
 * A fila é montada como o painel a monta, com uma única troca: o leitor da
 * fila responde sem rede, na ordem que cada cenário precisa, e o relógio é
 * de mentira. Assim "o pedido aparece em poucos segundos sem recarregar" deixa
 * de ser impressão e vira conta: cinco segundos de relógio, uma leitura nova,
 * o cartão na tela.
 *
 * O que NÃO é trocado é a regra: onde cada pedido cai e o que é novidade vêm
 * de `packages/core`, pelo mesmo caminho que o painel de verdade usa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";

import { QuadroDePedidos } from "../src/features/painel-pedidos/QuadroDePedidos";
import { CHAVE_DO_SOM_SILENCIADO } from "../src/features/painel-pedidos/AvisoSonoro";
import {
  escreverDinheiroDaFila,
  escreverHorarioDaFila,
  type LeituraDaFila,
  type PedidoDaFila,
} from "../src/lib/fila-de-pedidos";

const AGORA = new Date("2026-09-22T12:10:00.000Z");
const INTERVALO = 5_000;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(AGORA);
  window.localStorage.clear();
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

function pedido(
  id: string,
  status: string,
  sobrescrita: Partial<PedidoDaFila> = {},
): PedidoDaFila {
  return {
    id,
    numero: Number(id),
    codigo: `A-${id.padStart(4, "0")}`,
    status,
    canal: "ONLINE",
    entrega: "DELIVERY",
    cliente: `Cliente ${id}`,
    totalCentavos: 1_000 * Number(id),
    criadoEm: "2026-09-22T12:00:00.000Z",
    aguardandoConfirmacaoWhatsapp: false,
    ...sobrescrita,
  };
}

const ok = (...pedidos: PedidoDaFila[]): LeituraDaFila => ({
  estado: "ok",
  pedidos,
});
const QUEDA: LeituraDaFila = { estado: "erro", motivo: "falha de rede" };

/**
 * Um leitor que devolve as leituras na ordem dada e repete a última — é o
 * servidor de verdade parado no último estado.
 */
function leitor(...leituras: LeituraDaFila[]) {
  const fila = [...leituras];
  return vi.fn(async (): Promise<LeituraDaFila> => {
    const proxima = fila.length > 1 ? fila.shift() : fila[0];
    if (proxima === undefined) throw new Error("cenário sem leitura");
    return proxima;
  });
}

async function montar(
  buscar: () => Promise<LeituraDaFila>,
  tocar: () => void = vi.fn(),
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <QuadroDePedidos
        buscar={buscar}
        tocar={tocar}
        intervaloMs={INTERVALO}
        agora={() => new Date()}
      />,
    );
  });
  // A primeira leitura sai na montagem; este passo deixa ela terminar.
  await avancar(0);
  return container;
}

async function avancar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function grupo(tela: HTMLElement, id: string): HTMLElement {
  const achado = tela.querySelector<HTMLElement>(`[data-grupo="${id}"]`);
  if (!achado) throw new Error(`a fila não tem o grupo ${id}`);
  return achado;
}

function contador(tela: HTMLElement, id: string): string {
  return tela.querySelector(`[data-contador="${id}"]`)?.textContent ?? "";
}

function pedidosDoGrupo(tela: HTMLElement, id: string): string[] {
  return [...grupo(tela, id).querySelectorAll("[data-pedido]")].map(
    (cartao) => cartao.getAttribute("data-pedido") ?? "",
  );
}

function cartao(tela: HTMLElement, id: string): HTMLElement {
  const achado = tela.querySelector<HTMLElement>(`[data-pedido="${id}"]`);
  if (!achado) throw new Error(`o pedido ${id} não está na tela`);
  return achado;
}

function botao(tela: HTMLElement, trecho: string): HTMLButtonElement {
  const achado = [...tela.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`não existe botão com "${trecho}"`);
  return achado;
}

describe("pedido novo aparece sozinho (AC-600)", () => {
  it("@spec:AC-600 o pedido que entra aparece na próxima leitura, sem recarregar, com som e contador atualizado", async () => {
    const tocar = vi.fn();
    const buscar = leitor(
      ok(pedido("1", "PENDING")),
      ok(pedido("1", "PENDING"), pedido("2", "PENDING")),
    );
    const tela = await montar(buscar, tocar);

    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual(["1"]);
    expect(contador(tela, "fila-aguardando-confirmacao")).toBe("1");
    // Abrir a tela não é chegada de pedido: nada toca.
    expect(tocar).not.toHaveBeenCalled();

    await avancar(INTERVALO);

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual([
      "1",
      "2",
    ]);
    expect(contador(tela, "fila-aguardando-confirmacao")).toBe("2");
    expect(tocar).toHaveBeenCalledTimes(1);
    expect(tela.textContent).toContain("1 pedido novo");
    expect(cartao(tela, "2").textContent).toContain("Novo");
    expect(cartao(tela, "1").textContent).not.toContain("Novo");
  });

  it("@spec:AC-600 leitura sem pedido novo não toca de novo", async () => {
    const tocar = vi.fn();
    const buscar = leitor(
      ok(pedido("1", "PENDING")),
      ok(pedido("1", "PENDING"), pedido("2", "PENDING")),
    );
    await montar(buscar, tocar);

    await avancar(INTERVALO);
    await avancar(INTERVALO);
    await avancar(INTERVALO);

    expect(buscar).toHaveBeenCalledTimes(4);
    expect(tocar).toHaveBeenCalledTimes(1);
  });
});

describe("a fila separa o que exige ação (AC-601)", () => {
  it("@spec:AC-601 o que aguarda confirmação vem primeiro, em destaque, e os demais agrupados por status", async () => {
    const tela = await montar(
      leitor(
        ok(
          pedido("1", "PREPARING"),
          pedido("2", "PENDING"),
          pedido("3", "OUT_FOR_DELIVERY"),
          pedido("4", "READY_FOR_PICKUP", { entrega: "PICKUP" }),
          pedido("5", "ACCEPTED"),
        ),
      ),
    );

    const ordem = [...tela.querySelectorAll("[data-grupo]")].map((secao) =>
      secao.getAttribute("data-grupo"),
    );
    expect(ordem[0]).toBe("fila-aguardando-confirmacao");
    expect(grupo(tela, "fila-aguardando-confirmacao").className).toContain(
      "border-2",
    );
    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual(["2"]);
    expect(pedidosDoGrupo(tela, "fila-em-preparo")).toEqual(["1", "5"]);
    expect(pedidosDoGrupo(tela, "fila-pronto-para-retirada")).toEqual(["4"]);
    expect(pedidosDoGrupo(tela, "fila-em-entrega")).toEqual(["3"]);
  });

  it("@spec:AC-601 cada pedido mostra número, horário, cliente, valor, canal e há quanto tempo espera", async () => {
    const tela = await montar(
      leitor(
        ok(
          pedido("7", "PENDING", {
            cliente: "Dona Zica",
            totalCentavos: 4_590,
            criadoEm: "2026-09-22T11:58:00.000Z",
          }),
          pedido("8", "PENDING", { canal: "MANUAL", entrega: "PICKUP" }),
        ),
      ),
    );

    const setimo = cartao(tela, "7");
    expect(setimo.textContent).toContain("Pedido #7");
    expect(setimo.textContent).toContain("Dona Zica");
    expect(setimo.textContent).toContain(escreverDinheiroDaFila(4_590));
    const horario = setimo.querySelector("time");
    expect(horario?.getAttribute("dateTime")).toBe("2026-09-22T11:58:00.000Z");
    expect(horario?.textContent).toBe(
      escreverHorarioDaFila("2026-09-22T11:58:00.000Z"),
    );
    expect(setimo.textContent).toContain("Site");
    expect(setimo.textContent).toContain("há 12 min");

    const oitavo = cartao(tela, "8");
    expect(oitavo.textContent).toContain("Balcão");
    expect(oitavo.textContent).toContain("Retirada");
  });

  it("@spec:AC-601 o tempo de espera anda junto com o relógio a cada leitura", async () => {
    const tela = await montar(leitor(ok(pedido("1", "PENDING"))));
    expect(cartao(tela, "1").textContent).toContain("há 10 min");

    await avancar(60_000);

    expect(cartao(tela, "1").textContent).toContain("há 11 min");
  });
});

describe("queda de conexão não perde pedido (AC-602)", () => {
  it("@spec:AC-602 a fila avisa a queda, mantém o que já mostrava e se recupera sozinha com o que entrou no intervalo", async () => {
    const tocar = vi.fn();
    const buscar = leitor(
      ok(pedido("1", "PENDING")),
      QUEDA,
      QUEDA,
      ok(
        pedido("1", "PENDING"),
        pedido("2", "PENDING"),
        pedido("3", "PENDING"),
      ),
    );
    const tela = await montar(buscar, tocar);

    await avancar(INTERVALO);
    expect(tela.textContent).toContain("A conexão caiu");
    // O que já estava na tela continua lá durante a queda.
    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual(["1"]);

    await avancar(INTERVALO);
    await avancar(INTERVALO);

    expect(tela.textContent).not.toContain("A conexão caiu");
    expect(tela.textContent).toContain("Conexão recuperada");
    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(tela.textContent).toContain("2 pedidos novos");
    expect(tocar).toHaveBeenCalledTimes(1);
  });
});

describe("silenciar tira o som, e não o alerta (AC-603)", () => {
  it("@spec:AC-603 com o som silenciado o pedido novo não toca, mas continua destacado na tela", async () => {
    window.localStorage.setItem(CHAVE_DO_SOM_SILENCIADO, "true");
    const tocar = vi.fn();
    const tela = await montar(
      leitor(
        ok(pedido("1", "PENDING")),
        ok(pedido("1", "PENDING"), pedido("2", "PENDING")),
      ),
      tocar,
    );

    await avancar(INTERVALO);

    expect(tocar).not.toHaveBeenCalled();
    expect(tela.textContent).toContain("1 pedido novo");
    expect(cartao(tela, "2").textContent).toContain("Novo");
    // O destaque continua nas leituras seguintes, até o dono marcar como visto.
    await avancar(INTERVALO);
    expect(cartao(tela, "2").textContent).toContain("Novo");

    await act(async () => {
      botao(tela, "Marcar como vistos").click();
    });
    expect(cartao(tela, "2").textContent).not.toContain("Novo");
  });

  it("@spec:AC-603 a escolha de silenciar continua valendo quando o dono volta depois", async () => {
    const tela = await montar(leitor(ok(pedido("1", "PENDING"))));
    const silenciar = botao(tela, "Silenciar som");
    expect(silenciar.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      silenciar.click();
    });
    expect(window.localStorage.getItem(CHAVE_DO_SOM_SILENCIADO)).toBe("true");

    // O dono fecha a tela e volta: a fila nasce de novo, com a mesma escolha.
    act(() => raiz?.unmount());
    container?.remove();
    const tocar = vi.fn();
    const deNovo = await montar(
      leitor(
        ok(pedido("1", "PENDING")),
        ok(pedido("1", "PENDING"), pedido("2", "PENDING")),
      ),
      tocar,
    );
    expect(botao(deNovo, "Silenciar som").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await avancar(INTERVALO);
    expect(tocar).not.toHaveBeenCalled();
    expect(deNovo.textContent).toContain("1 pedido novo");
  });
});

describe("pedido sem confirmação no WhatsApp fica à parte (AC-609)", () => {
  it("@spec:AC-609 o pedido que abriu o WhatsApp sem confirmar aparece marcado e separado dos confirmados", async () => {
    const tela = await montar(
      leitor(
        ok(
          pedido("1", "PENDING", { aguardandoConfirmacaoWhatsapp: true }),
          pedido("2", "PENDING"),
        ),
      ),
    );

    expect(pedidosDoGrupo(tela, "fila-aguardando-whatsapp")).toEqual(["1"]);
    expect(pedidosDoGrupo(tela, "fila-aguardando-confirmacao")).toEqual(["2"]);
    expect(cartao(tela, "1").textContent).toContain(
      "Aguardando confirmação no WhatsApp",
    );
    expect(cartao(tela, "2").textContent).not.toContain(
      "Aguardando confirmação no WhatsApp",
    );
  });
});

describe("os quatro estados da fila (P-011)", () => {
  it("@principle:P-011 enquanto a primeira leitura não volta, a espera é anunciada", async () => {
    const tela = await montar(() => new Promise<LeituraDaFila>(() => {}));

    const anuncio = tela.querySelector('[role="status"]');
    expect(anuncio?.textContent).toContain("Carregando pedidos");
  });

  it("@principle:P-011 sem conexão na primeira leitura, a tela diz o que houve e que continua tentando", async () => {
    const tela = await montar(leitor(QUEDA));

    const alerta = tela.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("Não foi possível carregar a fila");
    expect(alerta?.textContent).toContain("continua tentando");
  });

  it("@principle:P-011 fila vazia explica que o pedido novo aparece sozinho", async () => {
    const tela = await montar(leitor(ok()));

    expect(tela.textContent).toContain("Nenhum pedido em aberto agora");
    expect(tela.querySelectorAll("[data-pedido]")).toHaveLength(0);
  });

  it("@principle:P-011 a fila com pedidos mostra os grupos", async () => {
    const tela = await montar(leitor(ok(pedido("1", "PENDING"))));

    expect(tela.querySelectorAll("[data-grupo]").length).toBe(5);
  });
});

describe("a fila é acessível (P-012)", () => {
  it("@principle:P-012 a fila com pedidos não tem violação crítica nem séria", async () => {
    const tela = await montar(
      leitor(
        ok(
          pedido("1", "PENDING", { aguardandoConfirmacaoWhatsapp: true }),
          pedido("2", "PENDING"),
          pedido("3", "PREPARING"),
        ),
        ok(
          pedido("1", "PENDING", { aguardandoConfirmacaoWhatsapp: true }),
          pedido("2", "PENDING"),
          pedido("3", "PREPARING"),
          pedido("4", "PENDING"),
        ),
      ),
    );
    await avancar(INTERVALO);

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    });
    vi.useRealTimers();
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );

    expect(graves.map((violacao) => violacao.id)).toEqual([]);
    expect(resultado.passes.map((regra) => regra.id)).toContain("button-name");
    // O motor do axe percorre a árvore inteira: com a suíte completa rodando
    // em paralelo, ele passa dos 5 s padrão sem nada de errado na tela.
  }, 60_000);
});

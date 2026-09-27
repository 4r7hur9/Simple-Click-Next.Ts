// @vitest-environment jsdom
/**
 * Prova do catálogo que se atualiza sozinho e sobrevive à queda (AC-928, AC-929).
 *
 * Sem rede: quem busca é uma função de mentira que responde o que o cenário
 * manda. O relógio também é de mentira, porque esperar um minuto de verdade a
 * cada caso não é prova, é paciência.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import type { ResultadoDoCatalogoNoNavegador } from "../../lib/catalogo-do-navegador.ts";
import {
  SEGUNDOS_ENTRE_ATUALIZACOES,
  useCatalogoDaTv,
  type BuscadorDeCatalogo,
  type CatalogoDaTv,
} from "./useCatalogoDaTv.ts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const INTERVALO = 1000;

/**
 * O relógio é UMA função, criada uma vez: quem busca e quem mede o tempo são
 * dependências do efeito, e uma função nova a cada render reiniciaria o
 * relógio de verdade — que é o mesmo cuidado que a tela precisa ter.
 */
const AGORA = (): number => 1_700_000_000_000;

function catalogoComPreco(
  preco: number,
  versao: string,
): CatalogoDaVitrineNoContrato {
  return {
    secoes: [
      {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        apelido: "salgados",
        nome: "Salgados",
        produtos: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            apelido: "coxinha",
            nome: "Coxinha",
            chamada: null,
            precoCentavos: preco,
            precoAnteriorCentavos: null,
            imagem: null,
            destaque: false,
            disponivel: true,
          },
        ],
      },
    ],
    destaques: [],
    versao,
  };
}

const V1 = catalogoComPreco(750, "1");
const V2 = catalogoComPreco(850, "2");

const encontrado = (
  catalogo: CatalogoDaVitrineNoContrato,
): ResultadoDoCatalogoNoNavegador => ({
  estado: "encontrado",
  catalogo,
});
const semRede: ResultadoDoCatalogoNoNavegador = {
  estado: "falhou",
  motivo: "falha de rede",
};

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;
let ultimo: CatalogoDaTv | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  ultimo = null;
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

function Observador({
  inicial,
  buscar,
}: {
  readonly inicial: CatalogoDaVitrineNoContrato | null;
  readonly buscar: BuscadorDeCatalogo;
}) {
  ultimo = useCatalogoDaTv({
    apelido: "sabor-e-cia",
    catalogoInicial: inicial,
    intervaloEmMs: INTERVALO,
    buscar,
    agora: AGORA,
  });
  return null;
}

function montar(
  inicial: CatalogoDaVitrineNoContrato | null,
  buscar: BuscadorDeCatalogo,
): void {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(createElement(Observador, { inicial, buscar })));
}

/** Avança o relógio e deixa as promessas resolverem. */
async function passar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const estado = (): CatalogoDaTv => {
  if (ultimo === null) throw new Error("o gancho ainda não rodou");
  return ultimo;
};

describe("o catálogo se atualiza sem ninguém tocar na televisão (AC-928)", () => {
  it("@spec:AC-928 o preço novo chega no intervalo seguinte, sem recarregar a página", async () => {
    const respostas = [encontrado(V2)];
    const buscar = vi.fn(async () => respostas.shift() ?? encontrado(V2));
    montar(V1, buscar);

    expect(estado().catalogo?.secoes[0]?.produtos[0]?.precoCentavos).toBe(750);
    expect(buscar).not.toHaveBeenCalled();

    await passar(INTERVALO);

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(estado().catalogo?.versao).toBe("2");
    expect(estado().catalogo?.secoes[0]?.produtos[0]?.precoCentavos).toBe(850);
    expect(estado().situacao).toBe("pronto");
  });

  it("@spec:AC-928 a busca se repete a cada intervalo, o dia inteiro", async () => {
    const buscar = vi.fn(async () => encontrado(V1));
    montar(V1, buscar);

    await passar(INTERVALO * 5);

    expect(buscar).toHaveBeenCalledTimes(5);
  });

  it("@spec:AC-928 sem catálogo do servidor, a primeira busca é imediata", async () => {
    const buscar = vi.fn(async () => encontrado(V1));
    montar(null, buscar);

    expect(estado().situacao).toBe("carregando");
    await passar(0);

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(estado().situacao).toBe("pronto");
    expect(estado().catalogo?.versao).toBe("1");
  });

  it("@spec:AC-928 o prazo definido é de um minuto", () => {
    expect(SEGUNDOS_ENTRE_ATUALIZACOES).toBe(60);
  });
});

describe("internet caindo não apaga o cardápio (AC-929)", () => {
  it("@spec:AC-929 a busca que falha mantém o último catálogo no ar, sem virar erro", async () => {
    const buscar = vi.fn(async () => semRede);
    montar(V1, buscar);

    await passar(INTERVALO * 3);

    expect(buscar).toHaveBeenCalledTimes(3);
    expect(estado().situacao).toBe("pronto");
    expect(estado().catalogo?.versao).toBe("1");
    expect(estado().semRede).toBe(true);
  });

  it("@spec:AC-929 quando a rede volta, a atualização retoma sozinha no intervalo seguinte", async () => {
    let caiu = true;
    const buscar = vi.fn(async () => (caiu ? semRede : encontrado(V2)));
    montar(V1, buscar);

    await passar(INTERVALO * 2);
    expect(estado().catalogo?.versao).toBe("1");

    caiu = false;
    await passar(INTERVALO);

    expect(estado().catalogo?.versao).toBe("2");
    expect(estado().semRede).toBe(false);
  });

  it("@spec:AC-929 o aviso de rede de volta dispara uma busca na hora, sem esperar o intervalo", async () => {
    const buscar = vi.fn(async () => encontrado(V2));
    montar(V1, buscar);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(estado().catalogo?.versao).toBe("2");
  });

  it("@spec:AC-929 sem catálogo nenhum, a falha vira erro — e a próxima tentativa continua marcada", async () => {
    let caiu = true;
    const buscar = vi.fn(async () => (caiu ? semRede : encontrado(V1)));
    montar(null, buscar);

    await passar(0);
    expect(estado().situacao).toBe("erro");

    caiu = false;
    await passar(INTERVALO);

    expect(estado().situacao).toBe("pronto");
    expect(estado().catalogo?.versao).toBe("1");
  });

  it("@spec:AC-929 desmontar para o relógio e a escuta da rede", async () => {
    const buscar = vi.fn(async () => encontrado(V1));
    montar(V1, buscar);

    act(() => raiz?.unmount());
    raiz = null;

    await passar(INTERVALO * 2);
    window.dispatchEvent(new Event("online"));

    expect(buscar).not.toHaveBeenCalled();
  });
});

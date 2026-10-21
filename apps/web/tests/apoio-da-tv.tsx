/**
 * Apoio comum às provas do cardápio na televisão (AC-925 a AC-931): o catálogo de
 * exemplo, a folha de produção e as duas formas de desenhar — o HTML do servidor e
 * a televisão ligada com relógio de mentira. Cada arquivo põe `desligar` no `afterEach`.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";
import { PALETA_ESCURA } from "@simpleclick/ui";

import {
  ExibicaoDeCardapio,
  type ExibicaoDeCardapioProps,
  type LojaNaTv,
} from "../src/features/tv/ExibicaoDeCardapio";
import type { ResultadoDoCatalogoNoNavegador } from "../src/lib/catalogo-do-navegador";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// O Vitest roda da raiz do repositório; em ambiente jsdom `import.meta.url`
// não é um endereço de arquivo, então o caminho sai do diretório de trabalho.
export const FOLHA = readFileSync(
  join(process.cwd(), "packages/ui/styles/exibicao.css"),
  "utf8",
);

const LOJA: LojaNaTv = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  rotuloDoCatalogo: "Cardápio",
  // A cor da paleta, que já passa no contraste: a prova da cor escolhida pelo
  // dono é a de AC-926, e mora em `calcularTemaDaLoja`.
  corPrincipal: PALETA_ESCURA.primaria,
};

export const VITRINE = "https://simpleclick.app/loja/sabor-e-cia/cardapio";

/** Um produto disponível de Salgados, com o que o teste quiser trocar. */
export function produto(
  sobrescrita: Partial<CatalogoDaVitrineNoContrato["destaques"][number]> = {},
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    apelido: "coxinha",
    nome: "Coxinha",
    chamada: "Massa de batata, recheio de frango",
    precoCentavos: 750,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
    ...sobrescrita,
  };
}

export const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produto(),
        produto({
          id: "22222222-2222-4222-8222-222222222222",
          apelido: "empada",
          nome: "Empada",
          precoCentavos: 900,
        }),
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "kibe",
          nome: "Kibe",
          precoCentavos: 800,
          disponivel: false,
        }),
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [
        produto({
          id: "44444444-4444-4444-8444-444444444444",
          apelido: "guarana",
          nome: "Guaraná",
          chamada: null,
          precoCentavos: 600,
        }),
      ],
    },
  ],
  destaques: [],
  versao: "1",
};

/** O mesmo catálogo depois de o dono mexer: coxinha mais cara, kibe de volta. */
export const CATALOGO_NOVO: CatalogoDaVitrineNoContrato = {
  ...CATALOGO,
  secoes: [
    {
      ...CATALOGO.secoes[0]!,
      produtos: [
        produto({ precoCentavos: 850 }),
        produto({
          id: "22222222-2222-4222-8222-222222222222",
          apelido: "empada",
          nome: "Empada",
          precoCentavos: 900,
        }),
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "kibe",
          nome: "Kibe",
          precoCentavos: 800,
          disponivel: true,
        }),
      ],
    },
    CATALOGO.secoes[1]!,
  ],
  versao: "2",
};

export const SEGUNDOS_POR_TELA = 12;
export const SEGUNDOS_ENTRE_ATUALIZACOES = 60;

/**
 * Nos cenários de ATUALIZAÇÃO a tela fica parada na primeira seção: com o
 * rodízio girando a cada doze segundos, aos sessenta a parede já estaria em
 * "Bebidas", e o preço da coxinha não estaria à vista para ser conferido.
 */
export const TELA_PARADA = {
  segundosPorTela: SEGUNDOS_ENTRE_ATUALIZACOES * 10,
};

/** A busca que acha o catálogo dado. */
export const encontrado = (
  catalogo: CatalogoDaVitrineNoContrato,
): ResultadoDoCatalogoNoNavegador => ({ estado: "encontrado", catalogo });
export const semRede: ResultadoDoCatalogoNoNavegador = {
  estado: "falhou",
  motivo: "falha de rede",
};

/** Quem nunca responde: a rede está no meio de uma busca. */
export const pendente = (): Promise<ResultadoDoCatalogoNoNavegador> =>
  new Promise(() => {});

/** As propriedades da exibição com o catálogo de exemplo, e o que o teste trocar. */
function propriedades(
  sobrescrita: Partial<ExibicaoDeCardapioProps> = {},
): ExibicaoDeCardapioProps {
  return {
    loja: LOJA,
    catalogoInicial: CATALOGO,
    enderecoDaVitrine: VITRINE,
    segundosPorTela: SEGUNDOS_POR_TELA,
    segundosEntreAtualizacoes: SEGUNDOS_ENTRE_ATUALIZACOES,
    buscar: async () => encontrado(CATALOGO),
    ...sobrescrita,
  };
}

/** O que o servidor entrega, antes de qualquer script. */
export function desenhar(
  sobrescrita: Partial<ExibicaoDeCardapioProps> = {},
): string {
  return renderToStaticMarkup(
    <ExibicaoDeCardapio {...propriedades(sobrescrita)} />,
  );
}

/** Texto puro, como um leitor de tela ouviria. */
export function comoSeLe(html: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  const partes: string[] = [];
  const caminhante = document.createTreeWalker(caixa, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    const trecho = (caminhante.currentNode.textContent ?? "").trim();
    if (trecho !== "") partes.push(trecho);
  }
  return partes.join(" ").replace(/\s+/g, " ");
}

// --- a televisão ligada: montagem de verdade, com relógio de mentira --------

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

/** Desmonta a televisão e devolve o relógio de verdade. Vai no `afterEach`. */
export function desligar(): void {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
}

/** Fixa o tamanho da janela que o componente mede ao montar. */
export function comJanela(largura: number, altura: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: largura,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: altura,
  });
}

/** Monta a exibição no documento, já com o relógio de mentira. */
export function ligar(
  sobrescrita: Partial<ExibicaoDeCardapioProps> = {},
): HTMLElement {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(<ExibicaoDeCardapio {...propriedades(sobrescrita)} />),
  );
  return container;
}

/** Deixa o tempo passar na televisão. */
export async function esperar(segundos: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(segundos * 1000);
  });
}

/** Os nomes de produto que a tela mostra agora, na ordem. */
export const nomesNaTela = (tela: HTMLElement): string[] =>
  [...tela.querySelectorAll(".sc-exibicao__nome")].map(
    (nome) => nome.textContent ?? "",
  );

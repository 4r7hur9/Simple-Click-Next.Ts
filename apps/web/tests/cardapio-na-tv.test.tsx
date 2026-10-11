// @vitest-environment jsdom
/**
 * Prova da exibição do cardápio na televisão (AC-925 a AC-931).
 *
 * DUAS FORMAS DE DESENHAR, de propósito. `renderToStaticMarkup` é o que o
 * servidor entrega antes de qualquer script: prova que a televisão mostra
 * produto no primeiro instante. `createRoot` com relógio de mentira é a
 * televisão ligada o dia inteiro: prova que a tela avança, que o preço novo
 * chega e que a rede caindo não apaga nada.
 *
 * Os ganchos têm prova própria ao lado deles (`src/features/tv/*.test.ts`).
 * Aqui a pergunta é o que a PAREDE mostra. Este arquivo guarda o rodízio e a
 * atualização; as medidas e o código com os estados moram nos vizinhos
 * `cardapio-na-tv-*.test.tsx`, e o apoio comum em `apoio-da-tv.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import {
  CATALOGO_NOVO,
  comJanela,
  comoSeLe,
  desenhar,
  desligar,
  encontrado,
  esperar,
  FOLHA,
  ligar,
  nomesNaTela,
  SEGUNDOS_ENTRE_ATUALIZACOES,
  SEGUNDOS_POR_TELA,
  semRede,
  TELA_PARADA,
} from "./apoio-da-tv.tsx";

afterEach(desligar);

describe("a TV mostra o cardápio sem ninguém operar (AC-925)", () => {
  it("@spec:AC-925 o servidor entrega a primeira tela com produtos e preços, antes de qualquer script", () => {
    const lido = comoSeLe(desenhar());

    expect(lido).toContain("Sabor & Cia");
    expect(lido).toContain("Salgados");
    expect(lido).toContain("Coxinha");
    expect(lido).toContain("R$ 7,50");
    expect(lido).toContain("Empada");
    expect(lido).toContain("R$ 9,00");
  });

  it("@spec:AC-925 não há botão, link, campo nem nada que espere toque ou clique", () => {
    const html = desenhar();

    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("onclick");
  });

  it("@spec:AC-925 a folha esconde o cursor e a barra de rolagem, e ocupa a tela inteira", () => {
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*cursor:\s*none/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*overflow:\s*hidden/);
    expect(FOLHA).toMatch(/\.sc-exibicao\s*\{[^}]*position:\s*fixed/);
  });

  it("@spec:AC-925 as telas avançam sozinhas no relógio, e voltam ao início", async () => {
    comJanela(1920, 1080);
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Salgados",
    );
    expect(nomesNaTela(tela)).toEqual(["Coxinha", "Empada"]);

    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Bebidas",
    );
    expect(nomesNaTela(tela)).toEqual(["Guaraná"]);

    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).toBe(
      "Salgados",
    );
  });

  it("@spec:AC-925 a tela diz em que ponto do rodízio está, para quem confere de perto", async () => {
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__passo")?.textContent).toBe(
      "1 de 2",
    );
    await esperar(SEGUNDOS_POR_TELA);
    expect(tela.querySelector(".sc-exibicao__passo")?.textContent).toBe(
      "2 de 2",
    );
  });
});

describe("produto esgotado sai da TV (AC-930)", () => {
  it("@spec:AC-930 o produto indisponível não aparece em nenhuma tela do rodízio", async () => {
    const tela = ligar();
    const vistos = new Set<string>();

    for (let i = 0; i < 2; i++) {
      for (const nome of nomesNaTela(tela)) vistos.add(nome);
      await esperar(SEGUNDOS_POR_TELA);
    }

    expect(vistos.has("Coxinha")).toBe(true);
    expect(vistos.has("Kibe")).toBe(false);
    expect(desenhar()).not.toContain("esgotado");
  });

  it("@spec:AC-930 o produto que o dono libera de novo entra no rodízio na atualização seguinte", async () => {
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => encontrado(CATALOGO_NOVO),
    });
    expect(nomesNaTela(tela)).not.toContain("Kibe");

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);

    expect(nomesNaTela(tela)).toContain("Kibe");
  });
});

describe("preço mudado no painel aparece na TV (AC-928)", () => {
  it("@spec:AC-928 o preço novo aparece no intervalo seguinte, sem recarregar nem apertar nada", async () => {
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => encontrado(CATALOGO_NOVO),
    });
    expect(tela.textContent).toContain("R$ 7,50");

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);

    expect(tela.textContent).toContain("R$ 8,50");
    expect(tela.textContent).not.toContain("R$ 7,50");
  });

  it("@spec:AC-928 o rodapé diz quando foi a última atualização", () => {
    const tela = ligar();

    expect(tela.querySelector(".sc-exibicao__atualizado")?.textContent).toMatch(
      /Atualizado às \d{2}:\d{2}/,
    );
  });
});

describe("internet caindo não apaga o cardápio (AC-929)", () => {
  it("@spec:AC-929 com a rede fora, a televisão continua mostrando o último cardápio, sem tela de erro", async () => {
    const tela = ligar({ ...TELA_PARADA, buscar: async () => semRede });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES * 3);

    expect(nomesNaTela(tela).length).toBeGreaterThan(0);
    expect(tela.textContent).toContain("R$ 7,50");
    expect(tela.querySelector('[role="alert"]')).toBeNull();
    // Uma linha discreta no rodapé, e não uma tela: quem olhar de perto sabe.
    expect(tela.querySelector(".sc-exibicao__aviso")?.textContent).toContain(
      "Sem conexão",
    );
  });

  it("@spec:AC-929 a rede caindo não para o rodízio", async () => {
    const tela = ligar({ buscar: async () => semRede });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES);
    const antes = tela.querySelector(".sc-exibicao__secao")?.textContent;
    await esperar(SEGUNDOS_POR_TELA);

    expect(tela.querySelector(".sc-exibicao__secao")?.textContent).not.toBe(
      antes,
    );
  });

  it("@spec:AC-929 quando a conexão volta, a televisão volta a atualizar sozinha", async () => {
    let caiu = true;
    const tela = ligar({
      ...TELA_PARADA,
      buscar: async () => (caiu ? semRede : encontrado(CATALOGO_NOVO)),
    });

    await esperar(SEGUNDOS_ENTRE_ATUALIZACOES * 2);
    expect(tela.textContent).toContain("R$ 7,50");

    caiu = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(tela.textContent).toContain("R$ 8,50");
    expect(tela.querySelector(".sc-exibicao__aviso")).toBeNull();
  });
});
